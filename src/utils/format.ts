import type { Transaction } from '../types';

const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const MONTH_NAMES_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

export function formatCurrency(value: number): string {
  return brlFormatter.format(Number.isFinite(value) ? value : 0);
}

const percentFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatPercent(value: number): string {
  const safeVal = Number.isFinite(value) ? value : 0;
  return `${percentFormatter.format(safeVal)}%`;
}

export const MASKED_CURRENCY = 'R$ ••••';

export function maskCurrency(value: number, hidden: boolean): string {
  return hidden ? MASKED_CURRENCY : formatCurrency(value);
}

export function getCurrentYearMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function shiftYearMonth(ym: string, deltaMonths: number): string {
  const [yearStr, monthStr] = ym.split('-');
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  const date = new Date(year, monthIndex + deltaMonths, 1);
  const nextY = date.getFullYear();
  const nextM = String(date.getMonth() + 1).padStart(2, '0');
  return `${nextY}-${nextM}`;
}

const MONTH_SHORT_PT = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
];

export function formatMonthYear(ym: string): string {
  const [yearStr, monthStr] = ym.split('-');
  const monthIdx = Math.max(0, Math.min(11, Number(monthStr) - 1));
  return `${MONTH_NAMES_PT[monthIdx]} ${yearStr}`;
}

export function formatMonthYearShort(ym: string): string {
  const [yearStr, monthStr] = ym.split('-');
  const monthIdx = Math.max(0, Math.min(11, Number(monthStr) - 1));
  return `${MONTH_SHORT_PT[monthIdx]} ${yearStr}`;
}

export function formatMonthShortOnly(ym: string): string {
  const [, monthStr] = ym.split('-');
  const monthIdx = Math.max(0, Math.min(11, Number(monthStr) - 1));
  return MONTH_SHORT_PT[monthIdx];
}

export function getNowLocalDateTimeInput(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:${min}`;
}

export function normalizeIsoDate(raw: unknown): string {
  const str = String(raw || '').trim();
  if (!str) return new Date().toISOString().slice(0, 16);
  // Formato brasileiro DD/MM/YYYY ou DD/MM/YYYY HH:mm
  const brMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[T\s]+(\d{1,2}):(\d{1,2}))?/);
  if (brMatch) {
    const day = brMatch[1].padStart(2, '0');
    const month = brMatch[2].padStart(2, '0');
    const year = brMatch[3];
    const hour = brMatch[4] ? brMatch[4].padStart(2, '0') : '12';
    const min = brMatch[5] ? brMatch[5].padStart(2, '0') : '00';
    return `${year}-${month}-${day}T${hour}:${min}`;
  }
  // Formato simples YYYY-MM-DD
  if (str.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return `${str}T12:00`;
  }
  // Formato ISO com horário/fuso: YYYY-MM-DDTHH:mm
  if (/^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}/.test(str)) {
    return str.replace(' ', 'T').slice(0, 16);
  }
  return str.slice(0, 16);
}

export function formatDateTimeShort(isoString: string): string {
  if (!isoString) return '—';
  // Normaliza caso não esteja no padrão ISO
  const normalized = normalizeIsoDate(isoString);
  const [datePart, timePart] = normalized.split('T');
  const parts = datePart.split('-');
  if (parts.length !== 3) return isoString;
  const [, month, day] = parts;
  if (timePart) {
    const [hh, mm] = timePart.split(':');
    return `${day}/${month} · ${hh}:${mm}`;
  }
  return `${day}/${month}`;
}

export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function computeDailyAverage(
  total: number,
  ym: string
): { average: number; daysBasis: number; label: string } {
  if (total <= 0) {
    return { average: 0, daysBasis: 0, label: 'Sem gastos no período' };
  }

  const [yearStr, monthStr] = ym.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const daysInMonth = new Date(year, month, 0).getDate();

  const now = new Date();
  const currentYm = getCurrentYearMonth();

  if (ym === currentYm) {
    const elapsed = Math.max(1, now.getDate());
    return {
      average: total / elapsed,
      daysBasis: elapsed,
      label: elapsed === 1 ? 'Baseado em 1 dia decorrido' : `Baseado em ${elapsed} dias decorridos`,
    };
  }

  if (ym < currentYm) {
    return {
      average: total / daysInMonth,
      daysBasis: daysInMonth,
      label: `Média nos ${daysInMonth} dias do mês`,
    };
  }

  return {
    average: total / daysInMonth,
    daysBasis: daysInMonth,
    label: `Projeção para ${daysInMonth} dias`,
  };
}

export function parseMoneyInput(raw: string): number {
  const cleaned = raw.replace(/[^\d.,]/g, '').trim();
  if (!cleaned) return NaN;

  // Handle Brazilian format: 1.250,90 or 45,90 or 45.90
  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');

  if (hasComma && hasDot) {
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');
    if (lastComma > lastDot) {
      // 1.250,90 -> 1250.90
      return Number(cleaned.replace(/\./g, '').replace(',', '.'));
    }
    // 1,250.90 -> 1250.90
    return Number(cleaned.replace(/,/g, ''));
  }

  if (hasComma) {
    return Number(cleaned.replace(',', '.'));
  }

  return Number(cleaned);
}

function escapeCsvCell(value: string): string {
  const safe = value.replace(/"/g, '""');
  return `"${safe}"`;
}

export function exportTransactionsToCsv(
  transactions: Transaction[],
  ym: string,
  activeCategory: string
): void {
  const header = ['Data/Hora', 'Estabelecimento', 'Categoria', 'Método', 'Valor (R$)'];

  const rows = transactions.map((t) => [
    formatDateTimeShort(t.data).replace(' · ', ' '),
    t.estabelecimento,
    t.categoria,
    t.metodo,
    t.valor.toFixed(2).replace('.', ','),
  ]);

  const csvLines = [
    header.map(escapeCsvCell).join(';'),
    ...rows.map((r) => r.map(escapeCsvCell).join(';')),
  ];

  // UTF-8 BOM ensures proper accent rendering in Microsoft Excel PT-BR & Google Sheets
  const csvContent = '\uFEFF' + csvLines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const catSuffix =
    activeCategory && activeCategory !== 'Todas'
      ? `-${normalizeText(activeCategory).replace(/\s+/g, '-')}`
      : '';
  const filename = `rumo-despesas-${ym}${catSuffix}.csv`;

  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
