export type Category =
  | 'Geral'
  | 'Cartão'
  | 'Luz+Agua'
  | 'Internet'
  | 'Aluguel'
  | 'Combustível'
  | 'Alimentação'
  | 'Mercado'
  | 'Investimento'
  | 'Salário'
  | 'Extra'
  | 'Remédio'
  | 'Academia'
  | 'Netflix'
  | 'Amazon Prime'
  | 'Google Drive'
  | 'Transporte'
  | 'Lazer'
  | 'Assinaturas'
  | 'Outros';

export type PaymentMethod =
  | 'Apple Pay'
  | 'Pix'
  | 'Cartão de Crédito'
  | 'Cartão de Débito'
  | 'Dinheiro';

export interface Transaction {
  id: string;
  estabelecimento: string;
  valor: number;
  categoria: Category;
  metodo: string;
  data: string; // ISO local format: YYYY-MM-DDTHH:mm
  pendingSync?: boolean;
  notionId?: string;
}

export interface CreateTransactionPayload {
  estabelecimento: string;
  valor: number;
  categoria: Category;
  metodo: string;
  data: string;
}

export type SyncQueueItem =
  | {
      queueId: string;
      type: 'create';
      localId: string;
      payload: CreateTransactionPayload;
      createdAt: string;
      attempts: number;
      lastError?: string;
    }
  | {
      queueId: string;
      type: 'update';
      targetId: string;
      payload: CreateTransactionPayload;
      original: Transaction;
      notionId?: string;
      createdAt: string;
      attempts: number;
      lastError?: string;
    }
  | {
      queueId: string;
      type: 'delete';
      targetId: string;
      notionId?: string;
      createdAt: string;
      attempts: number;
      lastError?: string;
    };

export interface SyncFlushResult {
  syncedCount: number;
  failedCount: number;
  remainingCount: number;
  lastError?: string;
}

export type BackendMode = 'sheets' | 'notion' | 'notion+sheets' | 'demo';
export type ThemeMode = 'system' | 'light' | 'dark';
export type GlassClarityMode = 'sutil' | 'equilibrado' | 'cristal';
export type ResolvedTheme = 'light' | 'dark';
export type ChartViewMode = 'donut' | 'bars';
export type NavTab = 'resumo' | 'gastos' | 'transacoes' | 'configuracao';

export interface PushPreferences {
  budgetAlert80: boolean;
  budgetAlert100: boolean;
  dailyReminder: boolean;
  dailyReminderTime: string;
  vapidPublicKey: string;
}

export interface AppSettings {
  monthlyBudget: number;
  theme: ThemeMode;
  glassClarity: GlassClarityMode;
  autoSyncSeconds: number; // 0 = manual only, otherwise polling interval in seconds
  privacyMode: boolean;
}

export interface BudgetMonthHistoryItem {
  ym: string;
  label: string;
  total: number;
  count: number;
}

export interface BudgetRecommendation {
  months: BudgetMonthHistoryItem[];
  monthsWithData: number;
  average: number;
  suggestedBudget: number;
  source: 'last-3-months' | 'current-month' | 'empty';
  updatedAt: string;
}

export interface BackendSyncStatus {
  configured: boolean;
  connected: boolean;
  mode: BackendMode;
  spreadsheetName?: string;
  lastSyncedAt?: string;
  fromCache?: boolean;
  error?: string;
}

export interface CategorySummary {
  categoria: Category;
  total: number;
  count: number;
  percentage: number;
}

export type AutoLockTimeout = 0 | 1 | 5; // minutos (0 = imediato)

export interface AppLockConfig {
  enabled: boolean;
  biometricEnabled: boolean;
  biometricCredentialId?: string;
  pinSalt?: string;
  pinHash?: string;
  autoLockMinutes: AutoLockTimeout;
}

