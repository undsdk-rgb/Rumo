import dotenv from 'dotenv';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getNotionConfig,
  getNotionTransactions,
  createNotionTransaction,
  deleteNotionTransaction,
} from './backend/notionService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const DEFAULT_SHEET_ID = '1GJ_7J9J5sgeCMwVRB76jCbIkRSnRw75sbOSWOKHpSDk';

function getBackendConfig() {
  const spreadsheetId = (process.env.GOOGLE_SHEET_ID || DEFAULT_SHEET_ID).trim();
  const scriptUrl = (process.env.APPS_SCRIPT_URL || '').trim();
  const token = (process.env.APPS_SCRIPT_TOKEN || '').trim();
  const configured = Boolean(scriptUrl && token);
  return { spreadsheetId, scriptUrl, token, configured };
}

async function callAppsScriptGet(
  scriptUrl: string,
  params: Record<string, string>
): Promise<Record<string, unknown>> {
  const url = new URL(scriptUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`Google Apps Script retornou HTTP ${response.status}.`);
  }

  const text = await response.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(
      'Resposta inválida do Apps Script (esperado JSON). Verifique a implantação do App da Web.'
    );
  }
}

async function callAppsScriptPost(
  scriptUrl: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const response = await fetch(scriptUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify(payload),
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`Google Apps Script retornou HTTP ${response.status}.`);
  }

  const text = await response.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error('Resposta inválida do Apps Script ao gravar dados.');
  }
}

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  app.use(express.json());

  // Health & connection status for Google Sheets & Notion
  app.get('/api/status', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    const cfg = getBackendConfig();
    const notionCfg = getNotionConfig();

    let sheetsConnected = false;
    let sheetsName = 'Planilha Google';
    let sheetsError: string | undefined;

    if (cfg.configured) {
      try {
        const result = await callAppsScriptGet(cfg.scriptUrl, {
          action: 'ping',
          token: cfg.token,
        });
        if (result.status !== 'error') {
          sheetsConnected = true;
          sheetsName = String(result.spreadsheetName || 'Base de finanças');
        } else {
          sheetsError = String(result.message || 'Falha na autenticação com a planilha.');
        }
      } catch (err) {
        sheetsError = err instanceof Error ? err.message : 'Erro no Apps Script.';
      }
    }

    let notionConnected = false;
    let notionTotal = 0;
    let notionError: string | undefined;

    if (notionCfg.configured) {
      try {
        const txs = await getNotionTransactions();
        notionConnected = true;
        notionTotal = txs.length;
      } catch (err) {
        notionError = err instanceof Error ? err.message : 'Erro ao conectar ao Notion.';
      }
    }

    const mode = notionConnected
      ? (sheetsConnected ? 'notion+sheets' : 'notion')
      : (sheetsConnected ? 'sheets' : 'demo');

    res.json({
      configured: notionCfg.configured || cfg.configured,
      connected: notionConnected || sheetsConnected,
      mode,
      notion: {
        configured: notionCfg.configured,
        connected: notionConnected,
        databaseId: notionCfg.databaseId,
        databaseName: 'Database: Transações',
        totalItems: notionTotal,
        error: notionError,
      },
      sheets: {
        configured: cfg.configured,
        connected: sheetsConnected,
        spreadsheetId: cfg.spreadsheetId,
        spreadsheetName: sheetsName,
        error: sheetsError,
      },
      spreadsheetName: notionConnected ? 'Notion: Transações' : sheetsName,
      lastSyncedAt: new Date().toISOString(),
    });
  });

  // List transactions for a given YYYY-MM month (MERGES Google Sheets + Notion)
  app.get('/api/transactions', async (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    const cfg = getBackendConfig();
    const notionCfg = getNotionConfig();
    const mes = String(req.query.mes || '').trim();

    if (!notionCfg.configured && !cfg.configured) {
      res.json({
        configured: false,
        mode: 'demo',
        spreadsheetId: cfg.spreadsheetId,
        data: null,
      });
      return;
    }

    try {
      let notionItems: any[] = [];
      let sheetsItems: any[] = [];

      // 1. Fetch from Notion
      if (notionCfg.configured) {
        try {
          notionItems = await getNotionTransactions(mes);
        } catch (err) {
          console.error('Aviso: falha ao ler do Notion:', err);
        }
      }

      // 2. Fetch from Google Sheets
      if (cfg.configured) {
        try {
          const result = await callAppsScriptGet(cfg.scriptUrl, {
            token: cfg.token,
            mes,
          });

          if (result && result.status !== 'error') {
            sheetsItems = Array.isArray(result)
              ? result
              : Array.isArray(result.data)
                ? result.data
                : [];
          }
        } catch (err) {
          console.error('Aviso: falha ao ler da Planilha Google:', err);
        }
      }

      // 3. Merge both sources without duplicates
      const mergedMap = new Map<string, any>();

      // Insere primeiro os dados da Planilha
      for (const item of sheetsItems) {
        const id = String(item.id || `sheet-${item.estabelecimento}-${item.valor}-${item.data}`);
        mergedMap.set(id, { ...item, source: 'sheets' });
      }

      // Mescla com os dados do Notion (identifica duplicatas por ID ou por dados idênticos)
      for (const item of notionItems) {
        const normEst = String(item.estabelecimento || '').trim().toLowerCase();
        const normVal = Math.round(Number(item.valor || 0) * 100);
        const normDate = String(item.data || '').slice(0, 10);

        let duplicateKey: string | null = null;
        for (const [k, v] of mergedMap.entries()) {
          const vEst = String(v.estabelecimento || '').trim().toLowerCase();
          const vVal = Math.round(Number(v.valor || 0) * 100);
          const vDate = String(v.data || '').slice(0, 10);

          if (k === item.id || (vEst === normEst && vVal === normVal && vDate === normDate)) {
            duplicateKey = k;
            break;
          }
        }

        if (duplicateKey) {
          // Atualiza registro existente com categoria aprimorada do Notion
          const existing = mergedMap.get(duplicateKey);
          mergedMap.set(duplicateKey, {
            ...existing,
            categoria: item.categoria || existing.categoria,
            notionId: item.id,
            source: 'both',
          });
        } else {
          mergedMap.set(item.id, { ...item, source: 'notion' });
        }
      }

      const data = Array.from(mergedMap.values());
      // Ordena por data decrescente
      data.sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')));

      const activeMode =
        notionCfg.configured && cfg.configured
          ? 'notion+sheets'
          : notionCfg.configured
            ? 'notion'
            : 'sheets';

      const digest = crypto
        .createHash('sha1')
        .update(JSON.stringify(data))
        .digest('hex');
      res.setHeader('X-Rumo-Digest', digest);

      res.json({
        configured: true,
        mode: activeMode,
        databaseId: notionCfg.databaseId,
        spreadsheetName: 'Planilha + Notion',
        syncedAt: new Date().toISOString(),
        totalNotion: notionItems.length,
        totalSheets: sheetsItems.length,
        totalMerged: data.length,
        data,
      });
    } catch (err) {
      res.status(502).json({
        configured: true,
        mode: 'error',
        error:
          err instanceof Error
            ? err.message
            : 'Não foi possível sincronizar as transações.',
      });
    }
  });

  // Create a new manual transaction (Bidirectional: writes to Notion AND Google Sheets)
  app.post('/api/transactions', async (req, res) => {
    const cfg = getBackendConfig();
    const notionCfg = getNotionConfig();
    const { estabelecimento, valor, categoria, metodo, data } = req.body || {};

    if (!estabelecimento || !Number.isFinite(Number(valor)) || Number(valor) <= 0) {
      res.status(400).json({
        error: 'Estabelecimento e valor maior que zero são obrigatórios.',
      });
      return;
    }

    if (!notionCfg.configured && !cfg.configured) {
      res.status(503).json({
        configured: false,
        mode: 'demo',
        error: 'Nenhum backend (Notion ou Google Sheets) configurado no ambiente.',
      });
      return;
    }

    let createdNotion: any = null;
    let createdSheets: any = null;

    // 1. Write to Notion
    if (notionCfg.configured) {
      try {
        createdNotion = await createNotionTransaction({
          estabelecimento: String(estabelecimento).trim(),
          valor: Number(valor),
          categoria: categoria || 'Outros',
          metodo: String(metodo || 'Pix'),
          data: String(data || ''),
        });
      } catch (err) {
        console.error('Erro ao registrar no Notion:', err);
      }
    }

    // 2. Write to Google Sheets (redundancy / 2-way mirror)
    if (cfg.configured) {
      try {
        const result = await callAppsScriptPost(cfg.scriptUrl, {
          action: 'create',
          token: cfg.token,
          estabelecimento: String(estabelecimento).trim(),
          valor: Number(valor),
          categoria: String(categoria || 'Outros'),
          metodo: String(metodo || 'Pix'),
          data: String(data || ''),
        });
        if (result && result.status !== 'error') {
          createdSheets = result.data;
        }
      } catch (err) {
        console.error('Erro ao registrar na planilha Google:', err);
      }
    }

    const finalData = createdNotion || createdSheets || {
      id: `local-${Date.now()}`,
      estabelecimento,
      valor: Number(valor),
      categoria: categoria || 'Outros',
      metodo: metodo || 'Pix',
      data: data || new Date().toISOString().slice(0, 16),
    };

    res.status(201).json({
      status: 'ok',
      syncedAt: new Date().toISOString(),
      data: finalData,
      mirrored: {
        notion: Boolean(createdNotion),
        sheets: Boolean(createdSheets),
      },
    });
  });

  // Delete transaction (Archives in Notion AND deletes from Google Sheets)
  app.delete('/api/transactions/:id', async (req, res) => {
    const cfg = getBackendConfig();
    const notionCfg = getNotionConfig();
    const id = String(req.params.id || '').trim();

    if (!id) {
      res.status(400).json({ error: 'ID inválido.' });
      return;
    }

    let deletedNotion = false;
    let deletedSheets = false;

    if (notionCfg.configured) {
      try {
        deletedNotion = await deleteNotionTransaction(id);
      } catch (err) {
        console.warn('Exclusão no Notion falhou ou ID não pertence ao Notion:', err);
      }
    }

    if (cfg.configured) {
      try {
        const result = await callAppsScriptPost(cfg.scriptUrl, {
          action: 'delete',
          token: cfg.token,
          id,
        });
        if (result && result.status !== 'error') {
          deletedSheets = true;
        }
      } catch (err) {
        console.warn('Exclusão na Planilha falhou:', err);
      }
    }

    res.json({
      status: 'ok',
      deletedId: id,
      syncedAt: new Date().toISOString(),
      deleted: { notion: deletedNotion, sheets: deletedSheets },
    });
  });

  // Mount Vite middleware in development or serve built dist/ in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const enableHmr =
      process.env.ENABLE_HMR === 'true' && process.env.DISABLE_HMR !== 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: enableHmr ? { server: httpServer } : false,
        ws: enableHmr ? undefined : false,
      },
      appType: 'spa',
    });

    // When HMR is disabled, serve a clean no-WebSocket @vite/client shim
    // so Vite 8's client script never attempts a failing ws:// connection.
    if (!enableHmr) {
      app.get('/@vite/client', (_req, res) => {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.send(`
const sheetsMap = new Map();
export function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    document.head.appendChild(style);
    sheetsMap.set(id, style);
  }
  style.textContent = content;
}
export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style) {
    document.head.removeChild(style);
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  return {
    data: {},
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    decline() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
  };
}
export function injectQuery(url) {
  return url;
}
export class ErrorOverlay extends HTMLElement {}
`);
      });
    }

    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build não encontrado.');
      }
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Rumo server running on http://0.0.0.0:${PORT}`);
  });
}

process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server] Unhandled Rejection:', reason);
});

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
