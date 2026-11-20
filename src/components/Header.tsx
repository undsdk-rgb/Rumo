import { AnimatePresence, motion } from 'motion/react';
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Monitor,
  Moon,
  Plus,
  RefreshCw,
  Sun,
} from 'lucide-react';
import type { NavTab, ThemeMode } from '../types';
import {
  formatMonthYear,
  formatMonthYearShort,
  getCurrentYearMonth,
} from '../utils/format';

const ICON_EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

export type SheetConnectionState =
  | 'pending'
  | 'syncing'
  | 'connected'
  | 'offline'
  | 'error';

interface HeaderProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  selectedMonth: string;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onResetCurrentMonth: () => void;
  theme: ThemeMode;
  onCycleTheme: () => void;
  privacyMode: boolean;
  onTogglePrivacyMode: () => void;
  onOpenNewOutflow: () => void;
  sheetState: SheetConnectionState;
  pendingSyncCount?: number;
  onSheetStatusClick: () => void;
}

const DESKTOP_TABS: { id: NavTab; label: string }[] = [
  { id: 'resumo', label: 'Resumo' },
  { id: 'gastos', label: 'Gastos' },
  { id: 'transacoes', label: 'Transações' },
  { id: 'configuracao', label: 'Configuração' },
];

export function Header({
  activeTab,
  onSelectTab,
  selectedMonth,
  onPrevMonth,
  onNextMonth,
  onResetCurrentMonth,
  theme,
  onCycleTheme,
  privacyMode,
  onTogglePrivacyMode,
  onOpenNewOutflow,
  sheetState,
  pendingSyncCount = 0,
  onSheetStatusClick,
}: HeaderProps) {
  const isCurrentMonth = selectedMonth === getCurrentYearMonth();

  const themeLabel =
    theme === 'system'
      ? 'Tema: Automático (Sistema)'
      : theme === 'dark'
        ? 'Tema: Escuro'
        : 'Tema: Claro';

  const sheetStatusMeta: Record<
    SheetConnectionState,
    { label: string; iconColor: string; dotColor: string | null }
  > = {
    connected: {
      label:
        pendingSyncCount > 0
          ? `Planilha conectada · ${pendingSyncCount} item(ns) na fila (toque para sincronizar)`
          : 'Planilha sincronizada · OK (toque para sincronizar agora)',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      dotColor: pendingSyncCount > 0 ? 'bg-amber-500' : 'bg-emerald-500',
    },
    syncing: {
      label: 'Sincronizando com a planilha...',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      dotColor: null,
    },
    offline: {
      label:
        pendingSyncCount > 0
          ? `Offline · ${pendingSyncCount} item(ns) na fila para envio automático`
          : 'Offline · exibindo últimos dados em cache local',
      iconColor: 'text-amber-600 dark:text-amber-400',
      dotColor: 'bg-amber-500',
    },
    error: {
      label: 'Erro no sincronismo com a planilha (toque para tentar novamente)',
      iconColor: 'text-red-600 dark:text-red-400',
      dotColor: 'bg-red-500',
    },
    pending: {
      label: 'Aguardando variáveis da planilha no console (exibindo dados de demonstração)',
      iconColor: 'text-amber-600 dark:text-amber-400',
      dotColor: 'bg-amber-500',
    },
  };

  const currentSheetMeta = sheetStatusMeta[sheetState];

  return (
    <header className="pointer-events-none sticky top-0 z-30 px-2 pt-2 sm:px-5 sm:pt-3">
      <div className="glass-chrome pointer-events-auto mx-auto flex h-[50px] w-full max-w-6xl items-center justify-between gap-1 overflow-hidden rounded-full px-1.5 sm:h-[52px] sm:gap-3 sm:px-2.5">
        {/* Zone 1: Brand + Floating Liquid Glass Desktop Navigation Capsule */}
        <div className="relative z-10 flex shrink-0 items-center gap-2 lg:gap-4">
          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            onClick={() => {
              onSelectTab('resumo');
              onResetCurrentMonth();
            }}
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full py-1 pl-0.5 pr-1 text-left text-[14px] font-bold tracking-tight text-slate-900 transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 sm:gap-2 sm:pl-1 sm:pr-2 sm:text-base dark:text-white"
            aria-label="Rumo — Ir para Resumo"
          >
            <img
              src="/icons/rumo-liquid-glass.svg?v=8"
              alt=""
              aria-hidden="true"
              referrerPolicy="no-referrer"
              className="h-7 w-7 shrink-0 object-contain drop-shadow-[0_2px_6px_rgba(5,102,72,0.28)] sm:h-8 sm:w-8"
            />
            <span>Rumo</span>
          </motion.button>

          <nav
            aria-label="Navegação desktop"
            className="glass-track hidden items-center gap-0.5 rounded-full p-1 lg:flex"
          >
            {DESKTOP_TABS.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onSelectTab(tab.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`relative z-10 flex h-8 shrink-0 items-center whitespace-nowrap rounded-full px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 lg:px-3.5 ${
                    active
                      ? 'text-slate-900 dark:text-white'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="desktop-nav-lens"
                      transition={{ duration: 0.24, ease: ICON_EASE }}
                      className="glass-pill-active absolute inset-0 -z-10 rounded-full"
                    />
                  )}
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Zone 2: Recessed Liquid Glass Month / Year Capsule */}
        <div
          className="glass-track relative z-10 inline-flex shrink-0 items-center justify-center gap-0.5 rounded-full px-2.5 py-0.5 sm:gap-1 sm:px-3"
          role="group"
          aria-label="Selecionar mês e ano"
        >
          <motion.button
            type="button"
            whileTap={{ scale: 0.88 }}
            onClick={onPrevMonth}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-800 transition-colors hover:bg-white/80 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 sm:h-7 sm:w-7 dark:text-slate-100 dark:hover:bg-white/15 dark:hover:text-white"
            aria-label="Mês anterior"
          >
            <ChevronLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={2.4} />
          </motion.button>

          <button
            type="button"
            onClick={onResetCurrentMonth}
            disabled={isCurrentMonth}
            title={isCurrentMonth ? 'Mês atual' : 'Voltar para o mês atual'}
            className={`min-h-[26px] whitespace-nowrap rounded-full px-1.5 text-[12.5px] font-semibold leading-none tracking-tight transition-colors sm:min-h-[28px] sm:px-2 sm:text-[13px] dark:text-slate-100 ${
              isCurrentMonth
                ? 'cursor-default text-slate-900'
                : 'text-slate-900 hover:bg-white/80 dark:hover:bg-white/12'
            }`}
          >
            <span className="lg:hidden">{formatMonthYearShort(selectedMonth)}</span>
            <span className="hidden lg:inline">{formatMonthYear(selectedMonth)}</span>
          </button>

          <motion.button
            type="button"
            whileTap={{ scale: 0.88 }}
            onClick={onNextMonth}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-800 transition-colors hover:bg-white/80 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 sm:h-7 sm:w-7 dark:text-slate-100 dark:hover:bg-white/15 dark:hover:text-white"
            aria-label="Próximo mês"
          >
            <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={2.4} />
          </motion.button>
        </div>

        {/* Zone 3: Focus/Privacy Toggle, Sheet Status, Theme Cycle & Sculpted Liquid Glass CTA */}
        <div className="relative z-10 flex shrink-0 items-center gap-0.5 sm:gap-1">
          <motion.button
            type="button"
            whileTap={{ scale: 0.9 }}
            onClick={onTogglePrivacyMode}
            aria-pressed={privacyMode}
            aria-label={
              privacyMode
                ? 'Desativar modo foco e exibir valores'
                : 'Ativar modo foco e ocultar valores'
            }
            title={
              privacyMode
                ? 'Modo foco ativo — toque para mostrar valores'
                : 'Modo foco — toque para ocultar valores'
            }
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 sm:h-9 sm:w-9 ${
              privacyMode
                ? 'bg-emerald-500/18 text-emerald-700 ring-1 ring-emerald-500/30 hover:bg-emerald-500/24 dark:bg-emerald-400/18 dark:text-emerald-300 dark:ring-emerald-400/30'
                : 'text-slate-700 hover:bg-white/75 hover:text-slate-950 dark:text-slate-200 dark:hover:bg-white/12 dark:hover:text-white'
            }`}
          >
            <AnimatePresence mode="wait" initial={false}>
              {privacyMode ? (
                <motion.span
                  key="eye-off"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.14, ease: ICON_EASE }}
                  className="flex items-center justify-center"
                >
                  <EyeOff className="h-[17px] w-[17px]" />
                </motion.span>
              ) : (
                <motion.span
                  key="eye-on"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.14, ease: ICON_EASE }}
                  className="flex items-center justify-center"
                >
                  <Eye className="h-[17px] w-[17px]" />
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>

          <motion.button
            type="button"
            whileTap={{ scale: 0.9 }}
            onClick={onSheetStatusClick}
            disabled={sheetState === 'syncing'}
            title={currentSheetMeta.label}
            aria-label={currentSheetMeta.label}
            className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/75 disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 sm:h-9 sm:w-9 dark:hover:bg-white/12 ${currentSheetMeta.iconColor}`}
          >
            {sheetState === 'syncing' ? (
              <RefreshCw className="h-[17px] w-[17px] animate-spin" />
            ) : (
              <FileSpreadsheet className="h-[17px] w-[17px]" />
            )}
            {pendingSyncCount > 0 && sheetState !== 'syncing' ? (
              <span
                aria-hidden="true"
                className="absolute right-0.5 top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 font-mono text-[10px] font-bold leading-none text-white ring-2 ring-white/85 dark:ring-[#121a2c]"
              >
                {pendingSyncCount > 9 ? '9+' : pendingSyncCount}
              </span>
            ) : (
              currentSheetMeta.dotColor && (
                <span
                  aria-hidden="true"
                  className={`absolute right-1 top-1 h-2 w-2 rounded-full ring-2 ring-white/85 sm:right-1.5 sm:top-1.5 dark:ring-[#121a2c] ${currentSheetMeta.dotColor}`}
                />
              )
            )}
          </motion.button>

          <motion.button
            type="button"
            whileTap={{ scale: 0.9 }}
            onClick={onCycleTheme}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-700 transition-colors hover:bg-white/75 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 sm:h-9 sm:w-9 dark:text-slate-200 dark:hover:bg-white/12 dark:hover:text-white"
            aria-label={`${themeLabel}. Toque para alternar.`}
            title={`${themeLabel} (toque para alternar)`}
          >
            {theme === 'system' ? (
              <Monitor className="h-[17px] w-[17px]" />
            ) : theme === 'dark' ? (
              <Moon className="h-[17px] w-[17px]" />
            ) : (
              <Sun className="h-[17px] w-[17px]" />
            )}
          </motion.button>

          <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={onOpenNewOutflow}
            aria-label="Registrar nova saída"
            title="Nova saída"
            className="glass-accent hidden h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-xs font-semibold text-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 lg:inline-flex dark:text-slate-950"
          >
            <Plus className="h-4 w-4 shrink-0" strokeWidth={2.5} />
            <span>Nova saída</span>
          </motion.button>
        </div>
      </div>
    </header>
  );
}
