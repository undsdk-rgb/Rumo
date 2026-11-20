import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, BarChart3, PieChart, X } from 'lucide-react';
import { CATEGORY_MAP } from '../constants/categories';
import type { Category, CategorySummary, ChartViewMode, ResolvedTheme } from '../types';
import { formatPercent, maskCurrency } from '../utils/format';
import { AnimatedMoney } from './AnimatedMoney';

const EASE_IOS: [number, number, number, number] = [0.16, 1, 0.3, 1];

interface CategoryChartProps {
  summaries: CategorySummary[];
  totalSpent: number;
  selectedCategory: Category | 'Todas';
  onSelectCategory: (category: Category | 'Todas') => void;
  onInspectCategoryTransactions?: (category: Category) => void;
  chartMode: ChartViewMode;
  onChangeChartMode: (mode: ChartViewMode) => void;
  theme: ResolvedTheme;
  privacyMode: boolean;
  loading: boolean;
}

export function CategoryChart({
  summaries,
  totalSpent,
  selectedCategory,
  onSelectCategory,
  onInspectCategoryTransactions,
  chartMode,
  onChangeChartMode,
  theme,
  privacyMode,
  loading,
}: CategoryChartProps) {
  const [hoveredCategory, setHoveredCategory] = useState<Category | null>(null);

  const nonZeroSummaries = summaries.filter((s) => s.total > 0);
  const activeFocusCategory: Category | null =
    hoveredCategory ?? (selectedCategory !== 'Todas' ? selectedCategory : null);

  const focusedSummary = activeFocusCategory
    ? nonZeroSummaries.find((s) => s.categoria === activeFocusCategory) ?? null
    : null;

  const handleToggleCategory = (cat: Category) => {
    if (selectedCategory === cat) {
      onSelectCategory('Todas');
    } else {
      onSelectCategory(cat);
    }
  };

  // Donut SVG geometry (includes safe inner margin so active +3px stroke never clips outside SVG bounds)
  const size = 260;
  const strokeWidth = 24;
  const svgSafetyInset = 4;
  const radius = (size - strokeWidth) / 2 - svgSafetyInset;
  const circumference = 2 * Math.PI * radius;

  let accumulatedLength = 0;
  const slices = nonZeroSummaries.map((item) => {
    const rawLength = totalSpent > 0 ? (item.total / totalSpent) * circumference : 0;
    const gap = nonZeroSummaries.length > 1 ? 3 : 0;
    const dashLength = Math.max(2, rawLength - gap);
    const dashOffset = -accumulatedLength;
    accumulatedLength += rawLength;

    const cfg = CATEGORY_MAP[item.categoria] ?? CATEGORY_MAP.Outros;
    return {
      ...item,
      color: theme === 'dark' ? cfg.darkColor : cfg.color,
      dashArray: `${dashLength} ${circumference - dashLength}`,
      dashOffset,
    };
  });

  return (
    <section
      aria-label="Distribuição de gastos por categoria"
      className="glass-surface overflow-hidden rounded-[28px] p-4 sm:p-6"
    >
      {/* Header + Animated Segmented Toggle */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-white">
            Gastos por categoria
          </h2>
          <AnimatePresence>
            {selectedCategory !== 'Todas' && (
              <motion.button
                key="clear-cat-filter"
                type="button"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.16, ease: EASE_IOS }}
                whileTap={{ scale: 0.94 }}
                onClick={() => onSelectCategory('Todas')}
                aria-label="Limpar categoria selecionada"
                title="Limpar filtro"
                className="glass-control inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-medium text-slate-700 dark:text-slate-200"
              >
                {(() => {
                  const ActiveIcon = (CATEGORY_MAP[selectedCategory] ?? CATEGORY_MAP.Outros).icon;
                  return <ActiveIcon className="h-3.5 w-3.5" />;
                })()}
                <X className="h-3 w-3" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* Interactive Chart Switcher with sliding Liquid Glass lens */}
        <div
          className="glass-track relative inline-flex items-center rounded-full p-1"
          role="tablist"
          aria-label="Tipo de gráfico"
        >
          {(
            [
              { id: 'donut', label: 'Rosca', icon: PieChart },
              { id: 'bars', label: 'Barras', icon: BarChart3 },
            ] as const
          ).map((mode) => {
            const Icon = mode.icon;
            const active = chartMode === mode.id;
            return (
              <motion.button
                key={mode.id}
                type="button"
                role="tab"
                aria-selected={active}
                whileTap={{ scale: 0.97 }}
                onClick={() => onChangeChartMode(mode.id)}
                className={`relative z-10 inline-flex min-h-[34px] items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-xs font-semibold transition-colors ${
                  active
                    ? 'text-slate-900 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="chart-mode-pill"
                    transition={{ duration: 0.24, ease: EASE_IOS }}
                    className="glass-pill-active absolute inset-0 -z-10 rounded-full"
                  />
                )}
                <Icon className="h-3.5 w-3.5" />
                <span>{mode.label}</span>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="mt-6 flex flex-col items-center gap-6 py-4">
          <div className="h-48 w-48 animate-pulse rounded-full border-[24px] border-slate-200 dark:border-slate-800" />
          <div className="w-full space-y-3">
            <div className="h-4 w-full animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            <div className="h-4 w-4/6 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
          </div>
        </div>
      ) : nonZeroSummaries.length === 0 ? (
        <div className="mt-6 flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 px-4 py-12 text-center dark:border-slate-800">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Sem dados para exibir no gráfico
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            As saídas deste mês aparecerão distribuídas por categoria aqui.
          </p>
        </div>
      ) : (
        <AnimatePresence mode="wait" initial={false}>
          {chartMode === 'donut' ? (
            <motion.div
              key="chart-donut"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.22, ease: EASE_IOS }}
              className="mt-6 grid grid-cols-1 items-center gap-6 md:grid-cols-12 md:gap-8"
            >
              {/* Interactive Animated SVG Donut */}
              <div className="flex flex-col items-center justify-center py-2 md:col-span-5">
                <div className="relative flex h-[250px] w-[250px] max-w-full items-center justify-center sm:h-[280px] sm:w-[280px] shrink-0">
                  <svg
                    viewBox={`0 0 ${size} ${size}`}
                    className="h-full w-full -rotate-90"
                    role="img"
                    aria-label="Gráfico de rosca de despesas por categoria"
                  >
                    <circle
                      cx={size / 2}
                      cy={size / 2}
                      r={radius}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={strokeWidth}
                      className="text-slate-100 dark:text-slate-800/80"
                    />
                    {slices.map((slice, idx) => {
                      const isDimmed =
                        activeFocusCategory !== null && activeFocusCategory !== slice.categoria;
                      const isSelected = selectedCategory === slice.categoria;
                      return (
                        <motion.circle
                          key={slice.categoria}
                          cx={size / 2}
                          cy={size / 2}
                          r={radius}
                          fill="none"
                          stroke={slice.color}
                          strokeLinecap="butt"
                          initial={{
                            strokeDasharray: `0 ${circumference}`,
                            strokeDashoffset: slice.dashOffset,
                            opacity: 0,
                          }}
                          animate={{
                            strokeDasharray: slice.dashArray,
                            strokeDashoffset: slice.dashOffset,
                            strokeWidth: isSelected ? strokeWidth + 3 : strokeWidth,
                            opacity: isDimmed ? 0.26 : 1,
                          }}
                          transition={{
                            strokeDasharray: {
                              duration: 0.55,
                              delay: idx * 0.045,
                              ease: EASE_IOS,
                            },
                            strokeDashoffset: {
                              duration: 0.55,
                              delay: idx * 0.045,
                              ease: EASE_IOS,
                            },
                            opacity: { duration: 0.18, ease: EASE_IOS },
                            strokeWidth: { duration: 0.18, ease: EASE_IOS },
                          }}
                          className="cursor-pointer"
                          onMouseEnter={() => setHoveredCategory(slice.categoria)}
                          onMouseLeave={() => setHoveredCategory(null)}
                          onClick={() => handleToggleCategory(slice.categoria)}
                        >
                          <title>
                            {slice.categoria}: {maskCurrency(slice.total, privacyMode)} (
                            {formatPercent(slice.percentage)})
                          </title>
                        </motion.circle>
                      );
                    })}
                  </svg>

                  {/* Center Optical Liquid Glass Medallion with smooth counting currency */}
                  <div
                    style={{ position: 'absolute' }}
                    className="glass-medallion pointer-events-none inset-0 m-auto flex h-[162px] w-[162px] flex-col items-center justify-center overflow-hidden rounded-full p-2.5 text-center sm:h-[180px] sm:w-[180px]"
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      {focusedSummary ? (
                        <motion.div
                          key={focusedSummary.categoria}
                          initial={{ opacity: 0, y: -2 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 2 }}
                          transition={{ duration: 0.16, ease: EASE_IOS }}
                          className="mb-1 flex max-w-[140px] items-center gap-1.5"
                        >
                          {(() => {
                            const fCfg = CATEGORY_MAP[focusedSummary.categoria] ?? CATEGORY_MAP.Outros;
                            const FocusedIcon = fCfg.icon;
                            return (
                              <span
                                className={`glass-icon-orb flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${fCfg.iconBg} ${fCfg.iconText}`}
                              >
                                <FocusedIcon className="h-3 w-3" />
                              </span>
                            );
                          })()}
                          <span className="truncate text-xs font-semibold text-slate-700 dark:text-slate-200">
                            {focusedSummary.categoria}
                          </span>
                        </motion.div>
                      ) : (
                        <motion.span
                          key="total-label"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.14 }}
                          className="mb-1 text-[11px] font-semibold tracking-wider uppercase text-slate-500 dark:text-slate-400"
                        >
                          Total no mês
                        </motion.span>
                      )}
                    </AnimatePresence>

                    <span className="max-w-full px-2 text-[22px] font-bold leading-tight tracking-tight text-slate-900 sm:text-[25px] dark:text-white">
                      <AnimatedMoney
                        value={focusedSummary ? focusedSummary.total : totalSpent}
                        hidden={privacyMode}
                        durationMs={340}
                      />
                    </span>

                    {focusedSummary ? (
                      <span className="mt-1 font-mono text-xs font-semibold text-emerald-600 tabular-nums dark:text-emerald-400">
                        {formatPercent(focusedSummary.percentage)}
                        <span className="ml-1 text-[10px] font-normal text-slate-500 dark:text-slate-400">
                          ({focusedSummary.count} {focusedSummary.count === 1 ? 'saída' : 'saídas'})
                        </span>
                      </span>
                    ) : (
                      <span className="mt-1 font-mono text-[11px] font-medium text-slate-500 tabular-nums dark:text-slate-400">
                        {nonZeroSummaries.reduce((acc, s) => acc + s.count, 0)}{' '}
                        {nonZeroSummaries.reduce((acc, s) => acc + s.count, 0) === 1
                          ? 'saída'
                          : 'saídas'}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Interactive Icon Legend List */}
              <ul className="w-full min-w-0 divide-y divide-slate-900/[0.06] md:col-span-7 dark:divide-white/[0.07]">
                {nonZeroSummaries.map((item, idx) => {
                  const cfg = CATEGORY_MAP[item.categoria] ?? CATEGORY_MAP.Outros;
                  const Icon = cfg.icon;
                  const isSelected = selectedCategory === item.categoria;
                  const isDimmed =
                    selectedCategory !== 'Todas' && selectedCategory !== item.categoria;

                  return (
                    <motion.li
                      key={item.categoria}
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{
                        duration: 0.24,
                        delay: idx * 0.035,
                        ease: EASE_IOS,
                      }}
                    >
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.99 }}
                        onClick={() => handleToggleCategory(item.categoria)}
                        onMouseEnter={() => setHoveredCategory(item.categoria)}
                        onMouseLeave={() => setHoveredCategory(null)}
                        aria-label={`${item.categoria}: ${maskCurrency(item.total, privacyMode)}`}
                        className={`flex min-h-[54px] w-full items-center justify-between gap-3 rounded-2xl px-2.5 py-2 text-left transition-colors hover:bg-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:hover:bg-white/[0.06] ${
                          isSelected ? 'glass-control' : ''
                        } ${isDimmed ? 'opacity-45' : 'opacity-100'}`}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span
                            className={`glass-icon-orb flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${cfg.iconBg} ${cfg.iconText}`}
                            title={item.categoria}
                          >
                            <Icon className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                              {item.categoria}
                            </p>
                            <p className="font-mono text-xs text-slate-400 tabular-nums dark:text-slate-500">
                              {item.count} {item.count === 1 ? 'saída' : 'saídas'} ·{' '}
                              {formatPercent(item.percentage)}
                            </p>
                          </div>
                        </div>

                        <AnimatedMoney
                          value={item.total}
                          hidden={privacyMode}
                          durationMs={320}
                          className="shrink-0 text-sm font-semibold text-slate-900 dark:text-slate-100"
                        />
                      </motion.button>
                    </motion.li>
                  );
                })}
              </ul>
            </motion.div>
          ) : (
            /* Animated Horizontal Ranked Bars View */
            <motion.ul
              key="chart-bars"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.22, ease: EASE_IOS }}
              className="mt-5 space-y-2.5"
            >
              {nonZeroSummaries.map((item, idx) => {
                const cfg = CATEGORY_MAP[item.categoria] ?? CATEGORY_MAP.Outros;
                const Icon = cfg.icon;
                const barColor = theme === 'dark' ? cfg.darkColor : cfg.color;
                const isSelected = selectedCategory === item.categoria;
                const isDimmed =
                  selectedCategory !== 'Todas' && selectedCategory !== item.categoria;

                return (
                  <motion.li
                    key={item.categoria}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.24,
                      delay: idx * 0.04,
                      ease: EASE_IOS,
                    }}
                  >
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.99 }}
                      onClick={() => handleToggleCategory(item.categoria)}
                      className={`group w-full rounded-2xl p-2.5 text-left transition-colors hover:bg-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:hover:bg-white/[0.06] ${
                        isSelected
                          ? 'glass-control'
                          : ''
                      } ${isDimmed ? 'opacity-45' : 'opacity-100'}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span
                            className={`glass-icon-orb flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${cfg.iconBg} ${cfg.iconText}`}
                            title={item.categoria}
                          >
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                            {item.categoria}
                          </span>
                        </div>

                        <div className="flex shrink-0 items-baseline gap-2">
                          <AnimatedMoney
                            value={item.total}
                            hidden={privacyMode}
                            durationMs={320}
                            className="text-sm font-semibold text-slate-900 dark:text-white"
                          />
                          <span className="w-14 text-right font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
                            {formatPercent(item.percentage)}
                          </span>
                        </div>
                      </div>

                      <div className="glass-track mt-2.5 h-2.5 w-full overflow-hidden rounded-full p-[1px]">
                        <motion.div
                          initial={{ scaleX: 0 }}
                          animate={{ scaleX: Math.max(0.03, item.percentage / 100) }}
                          transition={{
                            duration: 0.48,
                            delay: 0.05 + idx * 0.045,
                            ease: EASE_IOS,
                          }}
                          className="h-full w-full origin-left rounded-full"
                          style={{ backgroundColor: barColor }}
                        />
                      </div>
                    </motion.button>
                  </motion.li>
                );
              })}
            </motion.ul>
          )}
        </AnimatePresence>
      )}

      {/* Quick jump to Transações when a category is selected */}
      <AnimatePresence>
        {selectedCategory !== 'Todas' && onInspectCategoryTransactions && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.18, ease: EASE_IOS }}
            className="mt-5 flex justify-end border-t border-slate-900/[0.06] pt-4 dark:border-white/[0.08]"
          >
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={() => onInspectCategoryTransactions(selectedCategory)}
              className="glass-accent inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-4 text-xs font-semibold text-white transition-all dark:text-slate-950"
            >
              <span>Ver transações filtradas</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
