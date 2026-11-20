import { CATEGORIES } from '../constants/categories';
import type {
  AppSettings,
  BackendMode,
  BackendSyncStatus,
  BudgetMonthHistoryItem,
  BudgetRecommendation,
  Category,
  CreateTransactionPayload,
  Transaction,
} from '../types';
import {
  formatMonthShortOnly,
  getCurrentYearMonth,
  shiftYearMonth,
} from '../utils/format';

const SETTINGS_STORAGE_KEY = 'rumo_settings_v1';
const DEMO_TX_STORAGE_KEY = 'rumo_demo_transactions_v1';

export const DEFAULT_SETTINGS: AppSettings = {
  monthlyBudget: 3500,
  theme: 'system',
  glassClarity: 'equilibrado',
  autoSyncSeconds: 30,
  privacyMode: false,
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    const validTheme =
      parsed.theme === 'dark' || parsed.theme === 'light' || parsed.theme === 'system'
        ? parsed.theme
        : 'system';
    const validClarity =
      parsed.glassClarity === 'sutil' ||
      parsed.glassClarity === 'equilibrado' ||
      parsed.glassClarity === 'cristal'
        ? parsed.glassClarity
        : DEFAULT_SETTINGS.glassClarity;
    const validSync =
      typeof parsed.autoSyncSeconds === 'number' &&
      [0, 15, 30, 60].includes(parsed.autoSyncSeconds)
        ? parsed.autoSyncSeconds
        : DEFAULT_SETTINGS.autoSyncSeconds;
    return {
      monthlyBudget:
        typeof parsed.monthlyBudget === 'number' && parsed.monthlyBudget >= 0
          ? parsed.monthlyBudget
          : DEFAULT_SETTINGS.monthlyBudget,
      theme: validTheme,
      glassClarity: validClarity,
      autoSyncSeconds: validSync,
      privacyMode: Boolean(parsed.privacyMode),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota issues
  }
}

function normalizeCategory(raw: unknown): Category {
  const value = String(raw || '').trim();
  const exact = CATEGORIES.find((c) => c.toLowerCase() === value.toLowerCase());
  if (exact) return exact;

  const noAccent = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  for (const cat of CATEGORIES) {
    const catNoAccent = cat
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    if (noAccent === catNoAccent) return cat;
  }

  if (noAccent.includes('luz') || noAccent.includes('agua') || noAccent.includes('água')) return 'Luz+Agua';
  if (noAccent.includes('cartao') || noAccent.includes('cartão') || noAccent.includes('nubank') || noAccent.includes('bradesco')) return 'Cartão';
  if (noAccent.includes('net') || noAccent.includes('wifi') || noAccent.includes('fibra')) return 'Internet';
  if (noAccent.includes('combust') || noAccent.includes('gasolina')) return 'Combustível';
  if (noAccent.includes('aluguel') || noAccent.includes('condominio')) return 'Aluguel';
  if (noAccent.includes('remedio') || noAccent.includes('farmacia')) return 'Remédio';
  if (noAccent.includes('aliment') || noAccent.includes('comida') || noAccent.includes('restaurante')) return 'Alimentação';
  if (noAccent.includes('mercad') || noAccent.includes('super')) return 'Mercado';
  if (noAccent.includes('invest')) return 'Investimento';
  if (noAccent.includes('transp') || noAccent.includes('uber')) return 'Transporte';
  if (noAccent.includes('lazer') || noAccent.includes('entret')) return 'Lazer';
  if (noAccent.includes('assinat') || noAccent.includes('stream')) return 'Assinaturas';
  if (noAccent.includes('geral')) return 'Geral';
  return 'Outros';
}

function buildSeedDemoTransactions(): Transaction[] {
  const currentYm = getCurrentYearMonth();
  const prevYm = shiftYearMonth(currentYm, -1);
  const today = new Date().getDate();

  const day = (ratio: number) => {
    const target = Math.max(1, Math.min(today, Math.round(ratio * today)));
    return String(target).padStart(2, '0');
  };

  const currentMonthItems: Transaction[] = [
    {
      id: 'demo-01',
      estabelecimento: 'Pão de Açúcar',
      valor: 418.9,
      categoria: 'Mercado',
      metodo: 'Apple Pay',
      data: `${currentYm}-${day(0.95)}T18:42`,
    },
    {
      id: 'demo-02',
      estabelecimento: 'Padaria Bella Paulista',
      valor: 46.5,
      categoria: 'Alimentação',
      metodo: 'Apple Pay',
      data: `${currentYm}-${day(0.92)}T08:15`,
    },
    {
      id: 'demo-03',
      estabelecimento: 'Uber Trip',
      valor: 38.4,
      categoria: 'Transporte',
      metodo: 'Apple Pay',
      data: `${currentYm}-${day(0.88)}T21:10`,
    },
    {
      id: 'demo-04',
      estabelecimento: 'Outback Steakhouse',
      valor: 194.0,
      categoria: 'Alimentação',
      metodo: 'Cartão de Crédito',
      data: `${currentYm}-${day(0.82)}T20:35`,
    },
    {
      id: 'demo-05',
      estabelecimento: 'Hortifruti Natural da Terra',
      valor: 152.3,
      categoria: 'Mercado',
      metodo: 'Pix',
      data: `${currentYm}-${day(0.76)}T11:20`,
    },
    {
      id: 'demo-06',
      estabelecimento: 'Posto Ipiranga',
      valor: 210.0,
      categoria: 'Transporte',
      metodo: 'Apple Pay',
      data: `${currentYm}-${day(0.7)}T17:05`,
    },
    {
      id: 'demo-07',
      estabelecimento: 'Cinemark Iguatemi',
      valor: 112.0,
      categoria: 'Lazer',
      metodo: 'Apple Pay',
      data: `${currentYm}-${day(0.64)}T19:45`,
    },
    {
      id: 'demo-08',
      estabelecimento: 'Drogaria Raia',
      valor: 89.7,
      categoria: 'Outros',
      metodo: 'Pix',
      data: `${currentYm}-${day(0.58)}T14:22`,
    },
    {
      id: 'demo-09',
      estabelecimento: 'Starbucks Coffee',
      valor: 34.8,
      categoria: 'Alimentação',
      metodo: 'Apple Pay',
      data: `${currentYm}-${day(0.52)}T15:50`,
    },
    {
      id: 'demo-10',
      estabelecimento: 'Carrefour Express',
      valor: 267.45,
      categoria: 'Mercado',
      metodo: 'Apple Pay',
      data: `${currentYm}-${day(0.45)}T18:10`,
    },
    {
      id: 'demo-11',
      estabelecimento: 'Netflix Padrão',
      valor: 44.9,
      categoria: 'Assinaturas',
      metodo: 'Cartão de Crédito',
      data: `${currentYm}-${day(0.38)}T09:00`,
    },
    {
      id: 'demo-12',
      estabelecimento: 'Spotify Duo',
      valor: 27.9,
      categoria: 'Assinaturas',
      metodo: 'Cartão de Crédito',
      data: `${currentYm}-${day(0.32)}T09:00`,
    },
    {
      id: 'demo-13',
      estabelecimento: 'Bar do Zé — Happy Hour',
      valor: 138.0,
      categoria: 'Lazer',
      metodo: 'Pix',
      data: `${currentYm}-${day(0.24)}T22:15`,
    },
    {
      id: 'demo-14',
      estabelecimento: 'iCloud+ 200GB',
      valor: 14.9,
      categoria: 'Assinaturas',
      metodo: 'Apple Pay',
      data: `${currentYm}-${day(0.16)}T07:30`,
    },
    {
      id: 'demo-15',
      estabelecimento: 'Restaurante Manioca',
      valor: 164.2,
      categoria: 'Alimentação',
      metodo: 'Apple Pay',
      data: `${currentYm}-${day(0.08)}T13:05`,
    },
  ];

  const prevMonthItems: Transaction[] = [
    {
      id: 'demo-prev-01',
      estabelecimento: 'Pão de Açúcar',
      valor: 486.2,
      categoria: 'Mercado',
      metodo: 'Apple Pay',
      data: `${prevYm}-26T18:20`,
    },
    {
      id: 'demo-prev-02',
      estabelecimento: 'Posto Shell',
      valor: 235.0,
      categoria: 'Transporte',
      metodo: 'Apple Pay',
      data: `${prevYm}-22T16:40`,
    },
    {
      id: 'demo-prev-03',
      estabelecimento: 'Coco Bambu',
      valor: 248.5,
      categoria: 'Alimentação',
      metodo: 'Cartão de Crédito',
      data: `${prevYm}-18T20:15`,
    },
    {
      id: 'demo-prev-04',
      estabelecimento: 'Teatro Renault',
      valor: 220.0,
      categoria: 'Lazer',
      metodo: 'Pix',
      data: `${prevYm}-14T19:30`,
    },
    {
      id: 'demo-prev-05',
      estabelecimento: 'Netflix + Spotify + iCloud+',
      valor: 87.7,
      categoria: 'Assinaturas',
      metodo: 'Cartão de Crédito',
      data: `${prevYm}-08T09:00`,
    },
    {
      id: 'demo-prev-06',
      estabelecimento: 'Livraria da Vila',
      valor: 118.9,
      categoria: 'Outros',
      metodo: 'Apple Pay',
      data: `${prevYm}-04T15:10`,
    },
  ];

  return [...currentMonthItems, ...prevMonthItems];
}

export interface AppsScriptConfig {
  scriptUrl: string;
  token: string;
  isConfigured: boolean;
  source: 'env' | 'localStorage' | 'none';
}

/**
 * Resolve as credenciais do backend Apps Script com prioridade:
 * 1. Variáveis de ambiente Vite (VITE_APPS_SCRIPT_URL e VITE_API_TOKEN) — Cloudflare Pages
 * 2. Fallback opcional no localStorage (rumo_apps_script_url e rumo_apps_script_token)
 */
export function getAppsScriptConfig(): AppsScriptConfig {
  const envUrl = (import.meta.env.VITE_APPS_SCRIPT_URL || '').trim();
  const envToken = (import.meta.env.VITE_API_TOKEN || '').trim();

  if (envUrl && envToken) {
    return { scriptUrl: envUrl, token: envToken, isConfigured: true, source: 'env' };
  }

  try {
    const localUrl = (localStorage.getItem('rumo_apps_script_url') || '').trim();
    const localToken = (localStorage.getItem('rumo_apps_script_token') || '').trim();
    if (localUrl && localToken) {
      return { scriptUrl: localUrl, token: localToken, isConfigured: true, source: 'localStorage' };
    }
  } catch {
    // Ignora restrições de localStorage
  }

  return {
    scriptUrl: envUrl || (typeof localStorage !== 'undefined' ? localStorage.getItem('rumo_apps_script_url') || '' : ''),
    token: envToken || (typeof localStorage !== 'undefined' ? localStorage.getItem('rumo_apps_script_token') || '' : ''),
    isConfigured: false,
    source: 'none',
  };
}

export function setCustomAppsScriptConfig(url: string, token: string): void {
  try {
    if (url.trim()) {
      localStorage.setItem('rumo_apps_script_url', url.trim());
    } else {
      localStorage.removeItem('rumo_apps_script_url');
    }
    if (token.trim()) {
      localStorage.setItem('rumo_apps_script_token', token.trim());
    } else {
      localStorage.removeItem('rumo_apps_script_token');
    }
  } catch {
    // Ignora restrições de localStorage
  }
}

function getDemoStore(): Transaction[] {
  try {
    const raw = localStorage.getItem(DEMO_TX_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Transaction[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // fallback to seed
  }
  const seed = buildSeedDemoTransactions();
  saveDemoStore(seed);
  return seed;
}

function saveDemoStore(items: Transaction[]): void {
  try {
    localStorage.setItem(DEMO_TX_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore storage errors
  }
}

function sortDescending(items: Transaction[]): Transaction[] {
  return [...items].sort((a, b) => b.data.localeCompare(a.data));
}

function parseRemoteTransaction(raw: Record<string, unknown>, idx: number): Transaction {
  const rawValor = raw.valor;
  const numericValor =
    typeof rawValor === 'number'
      ? rawValor
      : Number(String(rawValor ?? '0').replace(',', '.'));

  return {
    id: String(raw.id || `sheet-${idx}-${Date.now()}`),
    estabelecimento: String(raw.estabelecimento || 'Sem descrição').trim(),
    valor: Number.isFinite(numericValor) ? Math.abs(numericValor) : 0,
    categoria: normalizeCategory(raw.categoria),
    metodo: String(raw.metodo || 'Apple Pay').trim(),
    data: String(raw.data || '').trim(),
  };
}

export class NetworkOfflineError extends Error {
  readonly isNetworkError = true;
  constructor(message = 'Sem conexão com o servidor no momento.') {
    super(message);
    this.name = 'NetworkOfflineError';
  }
}

export function isNetworkError(err: unknown): boolean {
  if (err instanceof NetworkOfflineError) return true;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  if (err instanceof TypeError) return true;
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes('failed to fetch') ||
      msg.includes('networkerror') ||
      msg.includes('load failed') ||
      msg.includes('sem conexão') ||
      msg.includes('não foi possível alcançar')
    );
  }
  return false;
}

export interface FetchMonthResult {
  transactions: Transaction[];
  status: BackendSyncStatus;
}

export async function fetchTransactions(
  ym: string,
  options?: { bypassSwCache?: boolean }
): Promise<FetchMonthResult> {
  // 1. Prioridade: Proxy Express local (/api/transactions) que mescla Notion + Google Sheets
  try {
    const localRes = await fetch(`/api/transactions?mes=${encodeURIComponent(ym)}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: options?.bypassSwCache ? 'no-store' : 'default',
    });

    if (localRes.ok) {
      const json = await localRes.json();
      if (json?.configured && json.data) {
        const parsed = (json.data || []).map((item: Record<string, unknown>, i: number) =>
          parseRemoteTransaction(item, i)
        );
        return {
          transactions: sortDescending(parsed),
          status: {
            configured: true,
            connected: true,
            mode: (json.mode as BackendMode) || 'notion+sheets',
            spreadsheetName: json.spreadsheetName || (json.mode === 'notion' ? 'Notion: Transações' : 'Planilha + Notion'),
            lastSyncedAt: json.syncedAt || new Date().toISOString(),
          },
        };
      }
    }
  } catch {
    // Sem proxy Express ativo ou falha local, tenta fallback direto
  }

  // 2. Fallback: Chamada direta ao Google Apps Script (quando executado no Cloudflare Pages sem Express)
  const config = getAppsScriptConfig();
  if (config.isConfigured) {
    let response: Response;
    try {
      const url = new URL(config.scriptUrl);
      url.searchParams.set('token', config.token);
      url.searchParams.set('mes', ym);

      response = await fetch(url.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: options?.bypassSwCache ? 'no-store' : 'default',
        redirect: 'follow',
      });
    } catch {
      throw new NetworkOfflineError('Não foi possível alcançar o Google Apps Script.');
    }

    const json = (await response.json().catch(() => null)) as {
      status?: 'ok' | 'error';
      message?: string;
      spreadsheetName?: string;
      syncedAt?: string;
      data?: Record<string, unknown>[] | null;
      error?: string;
    } | null;

    if (!response.ok || json?.status === 'error' || json?.error) {
      throw new Error(
        json?.message || json?.error || `Erro HTTP ${response.status} ao sincronizar com a planilha.`
      );
    }

    const parsed = (json?.data || []).map((item, i) =>
      parseRemoteTransaction(item, i)
    );

    return {
      transactions: sortDescending(parsed),
      status: {
        configured: true,
        connected: true,
        mode: 'sheets',
        spreadsheetName: json?.spreadsheetName || 'Planilha Google',
        lastSyncedAt: json?.syncedAt || new Date().toISOString(),
      },
    };
  }

  // 3. Sem configuração: NÃO exibe dados demo por padrão, sinalizando conexão pendente
  return {
    transactions: [],
    status: {
      configured: false,
      connected: false,
      mode: 'sheets',
    },
  };
}

export async function createTransaction(
  payload: CreateTransactionPayload,
  mode?: BackendMode
): Promise<Transaction> {
  if (mode === 'demo') {
    const created: Transaction = {
      id: `demo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ...payload,
    };
    saveDemoStore([created, ...getDemoStore()]);
    return created;
  }

  // 1. Prioridade: Proxy Express local (grava bidirecionalmente no Notion E na Planilha Google)
  try {
    const response = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (response.ok) {
      const json = await response.json();
      if (json?.data) return parseRemoteTransaction(json.data, 0);
    }
  } catch {
    // Continua para o fallback direto
  }

  // 2. Fallback: Chamada direta ao Apps Script (quando executado no Cloudflare Pages sem Express)
  const config = getAppsScriptConfig();
  if (config.isConfigured) {
    let response: Response;
    try {
      response = await fetch(config.scriptUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify({
          token: config.token,
          ...payload,
        }),
        redirect: 'follow',
      });
    } catch {
      throw new NetworkOfflineError('Sem conexão ao enviar lançamento para o Apps Script.');
    }

    const json = (await response.json().catch(() => null)) as {
      status?: 'ok' | 'error';
      message?: string;
      data?: Record<string, unknown>;
      error?: string;
    } | null;

    if (!response.ok || json?.status === 'error' || json?.error) {
      throw new Error(
        json?.message || json?.error || `Erro HTTP ${response.status} ao gravar saída na planilha.`
      );
    }

    if (json?.data) {
      return parseRemoteTransaction(json.data, 0);
    }

    return {
      id: `sheet-${Date.now()}`,
      ...payload,
    };
  }

  throw new Error(
    'Configure a URL e o Token do Google Apps Script nas configurações para registrar despesas.'
  );
}

export async function deleteTransaction(
  id: string,
  mode?: BackendMode
): Promise<void> {
  if (mode === 'demo') {
    const next = getDemoStore().filter((item) => item.id !== id);
    saveDemoStore(next);
    return;
  }

  // 1. Prioridade: Proxy Express local (arquiva no Notion E remove da Planilha Google)
  try {
    const response = await fetch(`/api/transactions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (response.ok) return;
  } catch {
    // Continua para o fallback direto
  }

  // 2. Fallback: Chamada direta ao Apps Script (quando executado no Cloudflare Pages sem Express)
  const config = getAppsScriptConfig();
  if (config.isConfigured) {
    let response: Response;
    try {
      response = await fetch(config.scriptUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify({
          token: config.token,
          action: 'delete',
          id,
        }),
        redirect: 'follow',
      });
    } catch {
      throw new NetworkOfflineError('Sem conexão ao remover lançamento da planilha.');
    }

    const json = (await response.json().catch(() => null)) as {
      status?: 'ok' | 'error';
      message?: string;
      error?: string;
    } | null;

    if (!response.ok || json?.status === 'error' || json?.error) {
      throw new Error(
        json?.message || json?.error || `Erro HTTP ${response.status} ao remover registro da planilha.`
      );
    }
    return;
  }

  throw new Error('Configure o backend antes de excluir registros.');
}

function roundSuggestedBudget(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= 100) {
    return Math.ceil(value / 10) * 10;
  }
  return Math.round(value * 100) / 100;
}

export async function fetchBudgetRecommendation(options?: {
  currentMonthTotal?: number;
  currentMonthCount?: number;
  getCachedMonth?: (ym: string) => Transaction[] | null;
}): Promise<BudgetRecommendation> {
  const currentYm = getCurrentYearMonth();
  // Chronological order: 3 months ago -> 2 months ago -> last month
  const targetMonths = [
    shiftYearMonth(currentYm, -3),
    shiftYearMonth(currentYm, -2),
    shiftYearMonth(currentYm, -1),
  ];

  const results = await Promise.all(
    targetMonths.map(async (ym): Promise<BudgetMonthHistoryItem> => {
      let txs: Transaction[] = [];
      try {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          txs = options?.getCachedMonth?.(ym) ?? [];
        } else {
          const res = await fetchTransactions(ym);
          txs = res.transactions;
        }
      } catch {
        txs = options?.getCachedMonth?.(ym) ?? [];
      }

      const total = txs.reduce((sum, item) => sum + item.valor, 0);
      return {
        ym,
        label: formatMonthShortOnly(ym),
        total: Math.round(total * 100) / 100,
        count: txs.length,
      };
    })
  );

  const nonZeroMonths = results.filter((m) => m.total > 0);
  const sum3m = nonZeroMonths.reduce((acc, m) => acc + m.total, 0);

  if (nonZeroMonths.length > 0) {
    const average = Math.round((sum3m / nonZeroMonths.length) * 100) / 100;
    return {
      months: results,
      monthsWithData: nonZeroMonths.length,
      average,
      suggestedBudget: roundSuggestedBudget(average),
      source: 'last-3-months',
      updatedAt: new Date().toISOString(),
    };
  }

  // Fallback for brand-new spreadsheets with only current-month expenses
  const currentTotal = options?.currentMonthTotal ?? 0;
  if (currentTotal > 0) {
    return {
      months: results,
      monthsWithData: 0,
      average: Math.round(currentTotal * 100) / 100,
      suggestedBudget: roundSuggestedBudget(currentTotal),
      source: 'current-month',
      updatedAt: new Date().toISOString(),
    };
  }

  return {
    months: results,
    monthsWithData: 0,
    average: 0,
    suggestedBudget: 0,
    source: 'empty',
    updatedAt: new Date().toISOString(),
  };
}
