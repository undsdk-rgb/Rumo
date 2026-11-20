import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Category, Transaction } from '../src/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

const NOTION_API_VERSION = '2022-06-28';
const NOTION_API_BASE = 'https://api.notion.com/v1';

export function getNotionConfig() {
  const apiKey = (process.env.NOTION_API_KEY || '').trim();
  const databaseId = (process.env.NOTION_DATABASE_ID || '').trim();
  const configured = Boolean(apiKey && databaseId);
  return { apiKey, databaseId, configured };
}

function getHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Notion-Version': NOTION_API_VERSION,
    'Content-Type': 'application/json',
  };
}

/**
 * Maps Notion category string to Rumo's Category union
 */
export function mapNotionToRumoCategory(notionCat?: string): Category {
  if (!notionCat) return 'Outros';
  const clean = notionCat.trim();

  // 1. Direct match with exact Notion options
  const directMap: Record<string, Category> = {
    'Geral': 'Geral',
    'Cartão': 'Cartão',
    'Luz+Agua': 'Luz+Agua',
    'Internet': 'Internet',
    'Aluguel': 'Aluguel',
    'Combustível': 'Combustível',
    'Alimentação': 'Alimentação',
    'Mercado': 'Mercado',
    'Investimento': 'Investimento',
    'Salário': 'Salário',
    'Extra': 'Extra',
    'Remédio': 'Remédio',
    'Academia': 'Academia',
    'Netflix': 'Netflix',
    'Amazon Prime': 'Amazon Prime',
    'Google Drive': 'Google Drive',
    'Transporte': 'Transporte',
    'Lazer': 'Lazer',
    'Assinaturas': 'Assinaturas',
    'Outros': 'Outros',
  };

  if (directMap[clean]) {
    return directMap[clean];
  }

  // 2. Case-insensitive / normalized match
  const lower = clean.toLowerCase();
  for (const [key, value] of Object.entries(directMap)) {
    if (key.toLowerCase() === lower) return value;
  }

  if (lower.includes('luz') || lower.includes('agua') || lower.includes('água')) return 'Luz+Agua';
  if (lower.includes('cartao') || lower.includes('cartão') || lower.includes('nubank') || lower.includes('bradesco')) return 'Cartão';
  if (lower.includes('net') || lower.includes('wifi') || lower.includes('fibra')) return 'Internet';
  if (lower.includes('gasolina') || lower.includes('combustivel') || lower.includes('combustível')) return 'Combustível';
  if (lower.includes('aluguel') || lower.includes('condominio') || lower.includes('condomínio')) return 'Aluguel';
  if (lower.includes('farmacia') || lower.includes('farmácia') || lower.includes('remedio') || lower.includes('remédio')) return 'Remédio';
  if (lower.includes('mercado') || lower.includes('supermercado')) return 'Mercado';
  if (lower.includes('comida') || lower.includes('restaurante') || lower.includes('alimentacao') || lower.includes('alimentação')) return 'Alimentação';
  if (lower.includes('invest')) return 'Investimento';

  return 'Geral';
}

/**
 * Maps Rumo's Category to Notion's select options
 */
export function mapRumoToNotionCategory(rumoCat: Category): string {
  return rumoCat;
}

/**
 * Formats a date into YYYY-MM-DDTHH:mm
 */
function normalizeDate(dateStr?: string): string {
  if (!dateStr) {
    return new Date().toISOString().slice(0, 16);
  }
  if (dateStr.length === 10) {
    return `${dateStr}T12:00`;
  }
  return dateStr.slice(0, 16);
}

/**
 * Parses a Notion Page into a Rumo Transaction
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseNotionPageToTransaction(page: any): Transaction {
  const props = page.properties || {};

  // Nome (title)
  let estabelecimento = 'Sem descrição';
  if (Array.isArray(props.Nome?.title) && props.Nome.title.length > 0) {
    estabelecimento = props.Nome.title.map((t: any) => t.plain_text).join('');
  }

  // Valor (number)
  const valor = typeof props.Valor?.number === 'number' ? props.Valor.number : 0;

  // Categoria (select)
  const notionCategory = props['Categoria ']?.select?.name || props.Categoria?.select?.name || '';
  const categoria = mapNotionToRumoCategory(notionCategory);

  // Data programada ou realizada
  const dateRaw =
    props['Data programada ']?.date?.start ||
    props['Data Realizada']?.date?.start ||
    page.created_time;
  const data = normalizeDate(dateRaw);

  // Método
  let metodo = 'Pix';
  if (notionCategory.toLowerCase().includes('cartão')) {
    metodo = 'Cartão de Crédito';
  }

  return {
    id: page.id,
    estabelecimento,
    valor,
    categoria,
    metodo,
    data,
  };
}

/**
 * Fetches transactions from Notion with optional month filter (YYYY-MM)
 */
export async function getNotionTransactions(month?: string): Promise<Transaction[]> {
  const { apiKey, databaseId, configured } = getNotionConfig();
  if (!configured) {
    throw new Error('Notion não está configurado (.env ausente NOTION_API_KEY ou NOTION_DATABASE_ID).');
  }

  const transactions: Transaction[] = [];
  let hasMore = true;
  let startCursor: string | undefined = undefined;

  // Build filter if month is provided (e.g., 2026-11)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let filter: any = undefined;
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [year, m] = month.split('-').map(Number);
    const startDate = `${month}-01`;
    const nextMonthYear = m === 12 ? year + 1 : year;
    const nextMonthM = m === 12 ? 1 : m + 1;
    const endDate = `${nextMonthYear}-${String(nextMonthM).padStart(2, '0')}-01`;

    filter = {
      and: [
        {
          or: [
            { property: 'Data programada ', date: { on_or_after: startDate } },
            { property: 'Data Realizada', date: { on_or_after: startDate } },
          ],
        },
        {
          or: [
            { property: 'Data programada ', date: { before: endDate } },
            { property: 'Data Realizada', date: { before: endDate } },
          ],
        },
      ],
    };
  }

  while (hasMore) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: Record<string, any> = { page_size: 100 };
    if (filter) body.filter = filter;
    if (startCursor) body.start_cursor = startCursor;

    const res = await fetch(`${NOTION_API_BASE}/databases/${databaseId}/query`, {
      method: 'POST',
      headers: getHeaders(apiKey),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Erro na API do Notion (HTTP ${res.status}): ${errText}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    const results = Array.isArray(data.results) ? data.results : [];

    for (const page of results) {
      // Ignora arquivados
      if (page.archived) continue;
      // Filtra apenas Saídas se Tipo for especificado, ou inclui todos os gastos
      const tipo = page.properties?.Tipo?.select?.name;
      if (tipo && tipo === 'Entrada') {
        // Ignora entradas para o cálculo de despesas do Rumo
        continue;
      }
      transactions.push(parseNotionPageToTransaction(page));
    }

    hasMore = Boolean(data.has_more);
    startCursor = data.next_cursor || undefined;
  }

  // Ordena por data decrescente
  transactions.sort((a, b) => (a.data < b.data ? 1 : -1));

  return transactions;
}

/**
 * Creates a new transaction page in Notion
 */
export async function createNotionTransaction(payload: {
  estabelecimento: string;
  valor: number;
  categoria: Category;
  metodo: string;
  data: string;
}): Promise<Transaction> {
  const { apiKey, databaseId, configured } = getNotionConfig();
  if (!configured) {
    throw new Error('Notion não está configurado.');
  }

  const dateOnly = payload.data ? payload.data.slice(0, 10) : new Date().toISOString().slice(0, 10);
  const notionCategory = mapRumoToNotionCategory(payload.categoria);

  const body = {
    parent: { database_id: databaseId },
    properties: {
      Nome: {
        title: [{ text: { content: payload.estabelecimento } }],
      },
      Valor: {
        number: Number(payload.valor),
      },
      Tipo: {
        select: { name: 'Saída' },
      },
      'Categoria ': {
        select: { name: notionCategory },
      },
      'Data programada ': {
        date: { start: dateOnly },
      },
      'Data Realizada': {
        date: { start: dateOnly },
      },
      Realizado: {
        checkbox: true,
      },
      Observação: {
        rich_text: [{ text: { content: `Método: ${payload.metodo} (Lançado via Rumo)` } }],
      },
    },
  };

  const res = await fetch(`${NOTION_API_BASE}/pages`, {
    method: 'POST',
    headers: getHeaders(apiKey),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Erro ao criar lançamento no Notion (HTTP ${res.status}): ${errText}`);
  }

  const createdPage = await res.json();
  return parseNotionPageToTransaction(createdPage);
}

/**
 * Archives (deletes) a transaction page in Notion
 */
export async function deleteNotionTransaction(pageId: string): Promise<boolean> {
  const { apiKey, configured } = getNotionConfig();
  if (!configured) {
    throw new Error('Notion não está configurado.');
  }

  const res = await fetch(`${NOTION_API_BASE}/pages/${pageId}`, {
    method: 'PATCH',
    headers: getHeaders(apiKey),
    body: JSON.stringify({ archived: true }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Erro ao arquivar lançamento no Notion (HTTP ${res.status}): ${errText}`);
  }

  return true;
}
