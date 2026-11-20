import { motion } from 'motion/react';
import {
  AlertTriangle,
  CheckCircle2,
  Pencil,
  TrendingUp,
} from 'lucide-react';
import { CATEGORY_MAP } from '../constants/categories';
import type { CategorySummary } from '../types';
import { AnimatedMoney } from './AnimatedMoney';
import { formatPercent } from '../utils/format';

interface SummaryCardsProps {
  animationKey: string;
  totalSpent: number;
  transactionCount: number;
  dailyAverage: number;
  dailyAverageLabel: string;
  topCategory: CategorySummary | null;
  monthlyBudget: number;
  privacyMode: boolean;
  loading: boolean;
  onEditBudget: () => void;
  onSelectCategory: (cat: CategorySummary['categoria']) => void;
}

const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.06,
    },
  },
};

const secondaryGroupVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.06,
    },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.28,
      ease: EASE_OUT_EXPO,
    },
  },
};

export function SummaryCards({
  animationKey,
  totalSpent,
  transactionCount,
  dailyAverage,
  dailyAverageLabel,
  topCategory,
  monthlyBudget,
  privacyMode,
  loading,
  onEditBudget,
  onSelectCategory,
}: SummaryCardsProps) {
  const hasBudget = monthlyBudget > 0;
  const budgetPct = hasBudget ? (totalSpent / monthlyBudget) * 100 : 0;
  const clampedPct = Math.min(100, Math.max(0, budgetPct));
  const remaining = monthlyBudget - totalSpent;

  const isExactGoal = hasBudget && Math.abs(remaining) < 0.01;
  const isOverBudget = hasBudget && remaining <= -0.01;
  const isWarningBudget = hasBudget && !isOverBudget && !isExactGoal && budgetPct >= 80;

  if (loading) {
    return (
      <section aria-label="Resumo financeiro" className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="glass-surface rounded-[28px] p-6 lg:col-span-6">
          <div className="h-3.5 w-32 animate-pulse rounded-full bg-slate-300/60 dark:bg-slate-700/60" />
          <div className="mt-3.5 h-10 w-52 animate-pulse rounded-xl bg-slate-300/60 dark:bg-slate-700/60" />
          <div className="mt-6 h-2.5 w-full animate-pulse rounded-full bg-slate-300/50 dark:bg-slate-700/50" />
          <div className="mt-3 h-3.5 w-56 animate-pulse rounded-full bg-slate-300/50 dark:bg-slate-700/50" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-6">
          <div className="glass-surface rounded-[28px] p-4 sm:p-5">
            <div className="h-3.5 w-24 animate-pulse rounded-full bg-slate-300/60 dark:bg-slate-700/60" />
            <div className="mt-4 h-7 w-28 animate-pulse rounded-xl bg-slate-300/60 dark:bg-slate-700/60" />
            <div className="mt-2.5 h-3 w-32 animate-pulse rounded-full bg-slate-300/50 dark:bg-slate-700/50" />
          </div>
          <div className="glass-surface rounded-[28px] p-4 sm:p-5">
            <div className="h-3.5 w-24 animate-pulse rounded-full bg-slate-300/60 dark:bg-slate-700/60" />
            <div className="mt-4 h-7 w-28 animate-pulse rounded-xl bg-slate-300/60 dark:bg-slate-700/60" />
            <div className="mt-2.5 h-3 w-32 animate-pulse rounded-full bg-slate-300/50 dark:bg-slate-700/50" />
          </div>
        </div>
      </section>
    );
  }

  const progressBarColor = isOverBudget
    ? 'bg-red-500'
    : isExactGoal
      ? 'bg-emerald-500'
      : isWarningBudget
        ? 'bg-amber-500'
        : 'bg-emerald-600 dark:bg-emerald-500';

  const statusTextColor = isOverBudget
    ? 'text-red-700 dark:text-red-400'
    : isExactGoal
      ? 'text-emerald-700 dark:text-emerald-400'
      : isWarningBudget
        ? 'text-amber-700 dark:text-amber-400'
        : 'text-emerald-700 dark:text-emerald-400';

  const topCatConfig = topCategory ? (CATEGORY_MAP[topCategory.categoria] ?? CATEGORY_MAP.Outros) : null;
  const TopCatIcon = topCatConfig?.icon;

  return (
    <motion.section
      key={animationKey}
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      aria-label="Resumo financeiro"
      className="grid grid-cols-1 gap-4 lg:grid-cols-12"
    >
      {/* Primary Hero Metric Card: Total Spent + Monthly Budget Progress */}
      <motion.div
        variants={cardVariants}
        className={`glass-surface relative flex min-w-0 flex-col justify-between overflow-hidden rounded-[28px] p-4 transition-shadow duration-300 sm:p-6 lg:col-span-6 ${
          isOverBudget
            ? 'ring-1 ring-red-500/40 dark:ring-red-500/30'
            : ''
        }`}
      >
        <div className="relative z-0 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-medium text-slate-500 dark:text-slate-400">
              Total gasto no mês
            </span>
            <span className="shrink-0 tabular-nums text-xs font-medium text-slate-500 dark:text-slate-400">
              {transactionCount} {transactionCount === 1 ? 'lançamento' : 'lançamentos'}
            </span>
          </div>

          <p className="mt-2 max-w-full truncate text-[30px] font-bold leading-none tracking-[-0.03em] text-slate-900 sm:text-[40px] dark:text-white">
            <AnimatedMoney value={totalSpent} hidden={privacyMode} durationMs={420} />
          </p>
        </div>

        {/* Monthly Budget Bar */}
        <div className="relative z-0 mt-5 border-t border-slate-900/[0.06] pt-4 sm:mt-6 dark:border-white/[0.08]">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="font-medium text-slate-600 dark:text-slate-300">
                Meta mensal
              </span>
              {hasBudget && (
                <>
                  <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                    ·
                  </span>
                  <AnimatedMoney
                    value={monthlyBudget}
                    hidden={privacyMode}
                    durationMs={300}
                    className="font-semibold text-slate-800 dark:text-slate-200"
                  />
                </>
              )}
            </div>

            <motion.button
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={onEditBudget}
              className="glass-control inline-flex min-h-[30px] items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[11px] font-semibold text-slate-700 transition-all hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:text-slate-200 dark:hover:text-white"
            >
              <Pencil className="h-3 w-3" />
              <span>{hasBudget ? 'Ajustar' : 'Definir meta'}</span>
            </motion.button>
          </div>

          {hasBudget ? (
            <>
              <div
                className="glass-track mt-2.5 h-2.5 w-full overflow-hidden rounded-full p-[1px]"
                role="progressbar"
                aria-valuenow={Math.round(budgetPct)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Progresso da meta de orçamento mensal"
              >
                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: clampedPct / 100 }}
                  transition={{ duration: 0.45, ease: EASE_OUT_EXPO, delay: 0.08 }}
                  className={`h-full w-full origin-left rounded-full ${progressBarColor}`}
                />
              </div>

              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className={`inline-flex items-center gap-1.5 font-medium ${statusTextColor}`}>
                  {isOverBudget ? (
                    <>
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-500" />
                      <span>
                        Meta excedida em{' '}
                        <AnimatedMoney
                          value={Math.abs(remaining)}
                          hidden={privacyMode}
                          durationMs={340}
                        />
                      </span>
                    </>
                  ) : isExactGoal ? (
                    <>
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                      <span>Limite de 100% atingido</span>
                    </>
                  ) : isWarningBudget ? (
                    <>
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                      <span>
                        Atenção: restam{' '}
                        <AnimatedMoney
                          value={remaining}
                          hidden={privacyMode}
                          durationMs={340}
                        />
                      </span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                      <span>
                        Restam{' '}
                        <AnimatedMoney
                          value={remaining}
                          hidden={privacyMode}
                          durationMs={340}
                        />
                      </span>
                    </>
                  )}
                </span>

                <div className="flex items-center gap-1.5">
                  <span
                    className={`font-mono font-semibold tabular-nums ${
                      isOverBudget
                        ? 'text-red-600 dark:text-red-400'
                        : isWarningBudget
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {Math.round(budgetPct)}% usado
                  </span>
                </div>
              </div>
            </>
          ) : (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Defina um teto mensal nas configurações para acompanhar seu ritmo de gastos.
            </p>
          )}
        </div>
      </motion.div>

      {/* Secondary KPIs: Daily Average & Top Category */}
      <motion.div
        variants={secondaryGroupVariants}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-6"
      >
        {/* Daily Average Card */}
        <motion.div
          variants={cardVariants}
          className="glass-surface flex min-w-0 flex-col justify-between overflow-hidden rounded-[28px] p-4 sm:p-6"
        >
          <div className="relative z-0 flex items-center justify-between gap-2">
            <span className="text-[13px] font-medium text-slate-500 dark:text-slate-400">
              Média diária
            </span>
            <span
              className="glass-control flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 dark:text-slate-300"
              aria-hidden="true"
            >
              <TrendingUp className="h-4 w-4" />
            </span>
          </div>

          <div className="relative z-0 mt-5 min-w-0">
            <p className="truncate text-[24px] font-bold leading-tight tracking-[-0.025em] text-slate-900 sm:text-[26px] dark:text-white">
              <AnimatedMoney value={dailyAverage} hidden={privacyMode} durationMs={380} />
            </p>
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              {dailyAverageLabel}
            </p>
          </div>
        </motion.div>

        {/* Top Category Card */}
        <motion.button
          variants={cardVariants}
          type="button"
          disabled={!topCategory}
          onClick={() => topCategory && onSelectCategory(topCategory.categoria)}
          className={`glass-surface flex w-full min-w-0 flex-col justify-between overflow-hidden rounded-[28px] p-4 text-left sm:p-6 ${
            topCategory
              ? 'cursor-pointer hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600'
              : 'cursor-default'
          }`}
        >
          <div className="relative z-0 flex w-full items-center justify-between gap-2">
            <span className="text-[13px] font-medium text-slate-500 dark:text-slate-400">
              Maior gasto
            </span>
            {topCatConfig && TopCatIcon && (
              <span
                className={`glass-icon-orb flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${topCatConfig.iconBg} ${topCatConfig.iconText}`}
                aria-hidden="true"
              >
                <TopCatIcon className="h-4 w-4" />
              </span>
            )}
          </div>

          {topCategory ? (
            <div className="relative z-0 mt-4 w-full min-w-0">
              <p className="truncate text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                {topCategory.categoria}
              </p>
              <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <AnimatedMoney
                  value={topCategory.total}
                  hidden={privacyMode}
                  durationMs={360}
                  className="font-semibold text-slate-700 dark:text-slate-200"
                />
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  {formatPercent(topCategory.percentage)} do total
                </span>
              </div>
            </div>
          ) : (
            <div className="relative z-0 mt-4">
              <p className="text-xl font-bold text-slate-400 dark:text-slate-500">—</p>
              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                Sem categorias no mês
              </p>
            </div>
          )}
        </motion.button>
      </motion.div>
    </motion.section>
  );
}
