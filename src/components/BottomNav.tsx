import { motion } from 'motion/react';
import { LayoutDashboard, PieChart, Plus, ReceiptText, Settings } from 'lucide-react';
import type { NavTab } from '../types';

const EASE_IOS: [number, number, number, number] = [0.16, 1, 0.3, 1];

interface BottomNavProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onOpenNewOutflow: () => void;
}

const TABS: { id: NavTab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'resumo', label: 'Resumo', icon: LayoutDashboard },
  { id: 'gastos', label: 'Gastos', icon: PieChart },
  { id: 'transacoes', label: 'Transações', icon: ReceiptText },
  { id: 'configuracao', label: 'Ajustes', icon: Settings },
];

export function BottomNav({
  activeTab,
  onSelectTab,
  onOpenNewOutflow,
}: BottomNavProps) {
  return (
    <div className="bottom-dock-safe pointer-events-none fixed bottom-0 left-0 right-0 z-40 lg:hidden">
      <div className="mx-auto flex max-w-md items-center gap-2.5">
        {/* Iconic iOS 26 Floating Liquid Glass Tab Capsule */}
        <nav
          aria-label="Navegação principal"
          className="glass-chrome pointer-events-auto flex-1 overflow-hidden rounded-full p-1.5"
        >
          <div className="grid h-12 grid-cols-4 items-center gap-0.5">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <motion.button
                  key={tab.id}
                  type="button"
                  whileTap={{ scale: 0.92 }}
                  transition={{ duration: 0.12, ease: EASE_IOS }}
                  onClick={() => onSelectTab(tab.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`relative z-10 flex h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-full px-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                    active
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="mobile-bottom-nav-indicator"
                      transition={{ duration: 0.26, ease: EASE_IOS }}
                      className="glass-pill-active absolute inset-0 -z-10 rounded-full"
                    />
                  )}
                  <motion.span
                    animate={{ y: active ? -0.5 : 0, scale: active ? 1.06 : 1 }}
                    transition={{ duration: 0.18, ease: EASE_IOS }}
                  >
                    <Icon
                      className="h-[18px] w-[18px] shrink-0"
                      strokeWidth={active ? 2.4 : 1.9}
                    />
                  </motion.span>
                  <span className="max-w-full truncate text-[10px] font-semibold leading-none tracking-tight">
                    {tab.label}
                  </span>
                </motion.button>
              );
            })}
          </div>
        </nav>

        {/* Detached Floating Liquid Glass Action Orb (+) — Signature iOS 26 Pattern */}
        <motion.button
          type="button"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.9 }}
          transition={{ duration: 0.14, ease: EASE_IOS }}
          onClick={onOpenNewOutflow}
          aria-label="Inserir saída manual"
          title="Inserir saída manual"
          className="glass-accent pointer-events-auto flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-full text-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 dark:text-slate-950 dark:focus-visible:ring-offset-[#050911]"
        >
          <Plus className="h-6 w-6" strokeWidth={2.6} />
        </motion.button>
      </div>
    </div>
  );
}
