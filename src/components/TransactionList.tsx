import { useRef, useState, type TouchEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  Clock,
  Download,
  LayoutGrid,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Trash2,
  X,
} from 'lucide-react';
import { CATEGORIES, CATEGORY_MAP } from '../constants/categories';
import type { Category, Transaction } from '../types';
import { formatDateTimeShort } from '../utils/format';
import { AnimatedMoney } from './AnimatedMoney';

const ITEM_EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

interface TransactionListProps {
  transactions: Transaction[];
  totalMonthTransactions: number;
  searchQuery: string;
  onChangeSearch: (q: string) => void;
  selectedCategory: Category | 'Todas';
  onSelectCategory: (cat: Category | 'Todas') => void;
  loading: boolean;
  error: string | null;
  canDelete: boolean;
  privacyMode: boolean;
  onDeleteTransaction?: (id: string) => void;
  onRetry: () => void;
  onOpenSettings: () => void;
  onOpenNewExpense: () => void;
  onExportCsv: () => void;
}

export function TransactionList({
  transactions,
  totalMonthTransactions,
  searchQuery,
  onChangeSearch,
  selectedCategory,
  onSelectCategory,
  loading,
  error,
  canDelete,
  privacyMode,
  onDeleteTransaction,
  onRetry,
  onOpenSettings,
  onOpenNewExpense,
  onExportCsv,
}: TransactionListProps) {
  const hasFilters = searchQuery.trim().length > 0 || selectedCategory !== 'Todas';
  const [swipedTxId, setSwipedTxId] = useState<string | null>(null);
  const rowTouchRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);

  const handleRowTouchStart = (id: string, e: TouchEvent<HTMLLIElement>) => {
    if (!canDelete || !onDeleteTransaction || e.touches.length !== 1) return;
    const t = e.touches[0];
    rowTouchRef.current = {
      id,
      startX: t.clientX,
      startY: t.clientY,
      moved: false,
    };
  };

  const handleRowTouchMove = (id: string, e: TouchEvent<HTMLLIElement>) => {
    const state = rowTouchRef.current;
    if (!state || state.id !== id || e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - state.startX;
    const dy = t.clientY - state.startY;
    if (Math.abs(dx) > 22 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      state.moved = true;
      if (dx < -34) {
        setSwipedTxId(id);
      } else if (dx > 28 && swipedTxId === id) {
        setSwipedTxId(null);
      }
    }
  };

  const handleRowTouchEnd = () => {
    rowTouchRef.current = null;
  };

  return (
    <section
      aria-label="Lista de transações recentes"
      className="glass-surface flex flex-col overflow-hidden rounded-[28px]"
    >
      {/* Top Bar: Title + CSV Export */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-6 sm:pt-6">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-white">
            Transações recentes
          </h2>
          {!loading && !error && (
            <span className="font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
              {transactions.length}
            </span>
          )}
        </div>

        <motion.button
          type="button"
          whileTap={{ scale: 0.96 }}
          onClick={onExportCsv}
          disabled={loading || transactions.length === 0}
          className="glass-control inline-flex min-h-[34px] items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-xs font-semibold text-slate-700 transition-all disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:text-slate-200"
          title="Exportar transações visíveis em CSV"
        >
          <Download className="h-3.5 w-3.5" />
          <span>Exportar CSV</span>
        </motion.button>
      </div>

      {/* Search & Icon-Only Category Filter Controls */}
      <div className="mt-4 space-y-3 px-4 sm:px-6">
        {/* Search Input */}
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
            aria-hidden="true"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onChangeSearch(e.target.value)}
            placeholder="Buscar estabelecimento ou método..."
            aria-label="Buscar transação por estabelecimento"
            className="glass-input h-11 w-full rounded-full pl-11 pr-10 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-emerald-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onChangeSearch('')}
              aria-label="Limpar busca"
              className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 hover:bg-slate-900/5 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Icon-Only Category Filter Bar (No text inside category tags) */}
        <div
          className="no-scrollbar -mx-0.5 flex items-center justify-between gap-2 overflow-x-auto px-0.5 py-1 sm:justify-start"
          role="group"
          aria-label="Filtrar por categoria"
        >
          <motion.button
            type="button"
            whileTap={{ scale: 0.91 }}
            onClick={() => onSelectCategory('Todas')}
            aria-label="Todas as categorias"
            title="Todas as categorias"
            aria-pressed={selectedCategory === 'Todas'}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
              selectedCategory === 'Todas'
                ? 'glass-accent text-white dark:text-slate-950'
                : 'glass-control text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
            }`}
          >
            <LayoutGrid className="h-[18px] w-[18px]" />
          </motion.button>

          {CATEGORIES.map((cat) => {
            const cfg = CATEGORY_MAP[cat];
            const Icon = cfg.icon;
            const active = selectedCategory === cat;
            return (
              <motion.button
                key={cat}
                type="button"
                whileTap={{ scale: 0.91 }}
                onClick={() => onSelectCategory(active ? 'Todas' : cat)}
                aria-label={cat}
                title={cat}
                aria-pressed={active}
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                  active
                    ? 'glass-accent text-white dark:text-slate-950'
                    : `glass-icon-orb ${cfg.iconBg} ${cfg.iconText} hover:scale-[1.03]`
                }`}
              >
                <Icon className="h-[18px] w-[18px]" />
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Divider */}
      <div className="mt-3 border-t border-slate-900/[0.06] dark:border-white/[0.08]" />

      {/* List Content States */}
      {loading ? (
        <ul className="divide-y divide-slate-100 px-5 py-2 dark:divide-slate-800/70">
          {Array.from({ length: 6 }).map((_, idx) => (
            <li key={idx} className="flex min-h-[68px] items-center justify-between gap-3 py-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
                <div className="space-y-2">
                  <div className="h-4 w-36 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                  <div className="h-3 w-44 animate-pulse rounded bg-slate-100 dark:bg-slate-800/70" />
                </div>
              </div>
              <div className="h-4 w-20 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            </li>
          ))}
        </ul>
      ) : error ? (
        <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400">
            <AlertCircle className="h-5 w-5" />
          </div>
          <h3 className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">
            Erro ao carregar transações
          </h3>
          <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            {error}
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-xl bg-slate-900 px-4 text-xs font-medium text-white transition-colors hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Tentar novamente</span>
            </button>
            <button
              type="button"
              onClick={onOpenSettings}
              className="inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 px-4 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Settings className="h-3.5 w-3.5" />
              <span>Configuração</span>
            </button>
          </div>
        </div>
      ) : transactions.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            {hasFilters && totalMonthTransactions > 0
              ? 'Nenhuma transação encontrada'
              : 'Nenhuma saída registrada neste mês'}
          </p>
          <p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            {hasFilters && totalMonthTransactions > 0
              ? 'Tente ajustar o termo de busca ou selecione outra categoria.'
              : 'Use o botão + para registrar uma saída manual ou conecte sua planilha.'}
          </p>
          <div className="mt-5">
            {hasFilters && totalMonthTransactions > 0 ? (
              <button
                type="button"
                onClick={() => {
                  onChangeSearch('');
                  onSelectCategory('Todas');
                }}
                className="glass-control inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-xs font-semibold text-slate-700 transition-colors dark:text-slate-200"
              >
                <X className="h-3.5 w-3.5" />
                <span>Limpar filtros</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onOpenNewExpense}
                className="glass-accent inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-xs font-semibold text-white transition-all dark:text-slate-950"
              >
                <Plus className="h-4 w-4" />
                <span>Registrar saída</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-slate-900/[0.06] px-2 py-1 sm:px-4 dark:divide-white/[0.07]">
          <AnimatePresence initial={true}>
            {transactions.map((tx, index) => {
              const cfg = CATEGORY_MAP[tx.categoria] ?? CATEGORY_MAP.Outros;
              const Icon = cfg.icon;
              const isSwiped = swipedTxId === tx.id;
              return (
                <motion.li
                  key={tx.id}
                  data-gesture-ignore={canDelete && onDeleteTransaction ? 'true' : undefined}
                  onTouchStart={(e) => handleRowTouchStart(tx.id, e)}
                  onTouchMove={(e) => handleRowTouchMove(tx.id, e)}
                  onTouchEnd={handleRowTouchEnd}
                  onClick={() => {
                    if (isSwiped) setSwipedTxId(null);
                  }}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{
                    duration: 0.22,
                    delay: Math.min(index * 0.025, 0.25),
                    ease: ITEM_EASE,
                  }}
                  className="relative overflow-hidden rounded-xl"
                >
                  {/* Revealed Swipe-to-Delete Action (hidden when at rest so it never shows through glass) */}
                  {canDelete && onDeleteTransaction && (
                    <div
                      aria-hidden={!isSwiped}
                      className={`absolute inset-y-0.5 right-0 flex w-24 items-center justify-end pr-1 transition-opacity duration-150 ${
                        isSwiped ? 'opacity-100' : 'pointer-events-none opacity-0'
                      }`}
                    >
                      <button
                        type="button"
                        tabIndex={isSwiped ? 0 : -1}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSwipedTxId(null);
                          onDeleteTransaction(tx.id);
                        }}
                        aria-label={`Confirmar remoção de ${tx.estabelecimento}`}
                        className="flex h-full w-full items-center justify-center gap-1 rounded-xl bg-red-600/95 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-red-700 active:scale-[0.98]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Remover</span>
                      </button>
                    </div>
                  )}

                  {/* Sliding Foreground Row */}
                  <motion.div
                    animate={{ x: isSwiped ? -96 : 0 }}
                    transition={{ duration: 0.22, ease: ITEM_EASE }}
                    className="group relative flex min-h-[68px] items-center justify-between gap-2.5 rounded-2xl px-2 py-3 transition-colors hover:bg-white/55 sm:gap-3 sm:px-2.5 dark:hover:bg-white/[0.05]"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div
                        className={`glass-icon-orb flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${cfg.iconBg} ${cfg.iconText}`}
                        title={tx.categoria}
                        aria-label={tx.categoria}
                      >
                        <Icon className="h-[18px] w-[18px]" />
                      </div>

                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {tx.estabelecimento}
                        </p>
                        {/* Clean unboxed metadata without repeating text category tag */}
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-mono tabular-nums">
                            {formatDateTimeShort(tx.data)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="truncate">{tx.metodo}</span>
                          {tx.pendingSync && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span
                                className="inline-flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400"
                                title="Salvo offline — aguardando conexão para enviar à planilha"
                              >
                                <Clock className="h-3 w-3 shrink-0" />
                                <span>Na fila</span>
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <AnimatedMoney
                        value={tx.valor}
                        hidden={privacyMode}
                        durationMs={0}
                        className="text-sm font-semibold text-slate-900 sm:text-[15px] dark:text-white"
                      />

                      {canDelete && onDeleteTransaction && (
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.88 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteTransaction(tx.id);
                          }}
                          aria-label={`Remover lançamento ${tx.estabelecimento}`}
                          title="Remover lançamento"
                          className="hidden h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 sm:flex sm:opacity-0 sm:group-hover:opacity-100 dark:hover:bg-red-950/50 dark:hover:text-red-400"
                        >
                          <Trash2 className="h-4 w-4" />
                        </motion.button>
                      )}
                    </div>
                  </motion.div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}
