import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { ArrowRight, Clock, CloudUpload, RefreshCw, WifiOff } from 'lucide-react';
import { AnimatedMoney } from './components/AnimatedMoney';
import { BottomNav } from './components/BottomNav';
import { CategoryChart } from './components/CategoryChart';
import { Header, type SheetConnectionState } from './components/Header';
import { LiquidGlassOptics } from './components/LiquidGlassOptics';
import { NewExpenseModal } from './components/NewExpenseModal';
import { SettingsView } from './components/SettingsView';
import { SummaryCards } from './components/SummaryCards';
import { Toast, type ToastMessage } from './components/Toast';
import { TransactionList } from './components/TransactionList';
import { CATEGORIES, CATEGORY_MAP } from './constants/categories';
import { useLiquidGlassGlare } from './hooks/useGlassGlare';
import { useNavigationGestures } from './hooks/useNavigationGestures';
import { usePWAInstall } from './hooks/usePWAInstall';
import { usePushNotifications } from './hooks/usePushNotifications';
import { useSyncManager } from './hooks/useSyncManager';
import {
  createTransaction,
  deleteTransaction,
  fetchBudgetRecommendation,
  fetchTransactions,
  isNetworkError,
  loadSettings,
  saveSettings,
} from './services/api';
import { syncManager } from './services/syncManager';
import type {
  AppSettings,
  BackendSyncStatus,
  BudgetRecommendation,
  Category,
  CategorySummary,
  ChartViewMode,
  CreateTransactionPayload,
  GlassClarityMode,
  NavTab,
  ResolvedTheme,
  SyncFlushResult,
  ThemeMode,
  Transaction,
} from './types';
import {
  computeDailyAverage,
  exportTransactionsToCsv,
  formatCurrency,
  formatDateTimeShort,
  formatMonthYear,
  getCurrentYearMonth,
  normalizeText,
  shiftYearMonth,
} from './utils/format';

const VIEW_EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

const NAV_TABS_ORDERED: NavTab[] = ['resumo', 'gastos', 'transacoes', 'configuracao'];

const TAB_ORDER: Record<NavTab, number> = {
  resumo: 0,
  gastos: 1,
  transacoes: 2,
  configuracao: 3,
};

function parseTabFromHash(): NavTab {
  if (typeof window === 'undefined') return 'resumo';
  const clean = window.location.hash.replace(/^#\/?/, '') as NavTab;
  return NAV_TABS_ORDERED.includes(clean) ? clean : 'resumo';
}

const tabViewVariants = {
  enter: (direction: number) => ({
    opacity: 0,
    x: direction * 14,
    y: 4,
  }),
  center: {
    opacity: 1,
    x: 0,
    y: 0,
    transition: {
      duration: 0.24,
      ease: VIEW_EASE,
    },
  },
  exit: (direction: number) => ({
    opacity: 0,
    x: direction * -10,
    y: -2,
    transition: {
      duration: 0.16,
      ease: VIEW_EASE,
    },
  }),
};

export default function App() {
  useLiquidGlassGlare();
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() =>
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false
  );
  const [activeTab, setActiveTab] = useState<NavTab>(() => parseTabFromHash());
  const [tabDirection, setTabDirection] = useState<number>(1);
  const [selectedMonth, setSelectedMonth] = useState<string>(() => getCurrentYearMonth());
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [backendStatus, setBackendStatus] = useState<BackendSyncStatus>(() => {
    const lastMeta = syncManager.getLastKnownMeta();
    if (lastMeta && lastMeta.mode === 'sheets') {
      return {
        configured: true,
        connected: false,
        mode: 'sheets',
        spreadsheetName: lastMeta.spreadsheetName,
        lastSyncedAt: lastMeta.updatedAt,
        fromCache: true,
      };
    }
    return {
      configured: false,
      connected: false,
      mode: 'demo',
    };
  });

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<Category | 'Todas'>('Todas');
  const [chartMode, setChartMode] = useState<ChartViewMode>('donut');

  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const [budgetRecommendation, setBudgetRecommendation] =
    useState<BudgetRecommendation | null>(null);
  const [loadingRecommendation, setLoadingRecommendation] = useState<boolean>(false);

  const pwa = usePWAInstall();
  const push = usePushNotifications(pwa.isIOS, pwa.isInstalled);

  const resolvedTheme: ResolvedTheme =
    settings.theme === 'system'
      ? systemPrefersDark
        ? 'dark'
        : 'light'
      : settings.theme;

  const showToast = useCallback((type: ToastMessage['type'], text: string) => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToast({ id: Date.now(), type, text });
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
    }, 3500);
  }, []);

  // Listen to OS color-scheme changes in real time
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemPrefersDark(e.matches);
    };
    setSystemPrefersDark(mq.matches);
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, []);

  // Sync Tailwind v4 .dark class & browser theme-color meta tag
  useEffect(() => {
    const root = document.documentElement;
    if (resolvedTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', resolvedTheme === 'dark' ? '#0A0F17' : '#E3E8EF');
    }
  }, [resolvedTheme]);

  // Sync user-chosen Liquid Glass transparency level on <html>
  useEffect(() => {
    document.documentElement.setAttribute('data-glass-clarity', settings.glassClarity);
  }, [settings.glassClarity]);

  // Fetch month data with Stale-While-Revalidate hydration + offline queue overlay
  const loadMonthData = useCallback(
    async (options?: { silent?: boolean; bypassSwCache?: boolean }) => {
      const silent = Boolean(options?.silent);
      const cachedSnapshot = syncManager.getMonthSnapshot(selectedMonth);

      // Step 1 (Stale): Instantly display the latest cached snapshot merged with offline queue
      if (cachedSnapshot && !silent) {
        setTransactions(
          syncManager.mergeMonthTransactions(selectedMonth, cachedSnapshot.transactions)
        );
        setBackendStatus((prev) => ({
          ...prev,
          configured: cachedSnapshot.mode === 'sheets',
          connected: navigator.onLine ? prev.connected : false,
          mode: cachedSnapshot.mode,
          spreadsheetName: cachedSnapshot.spreadsheetName ?? prev.spreadsheetName,
          lastSyncedAt: cachedSnapshot.updatedAt,
          fromCache: true,
          error: undefined,
        }));
        setLoading(false);
        setError(null);
      } else if (!silent) {
        setLoading(true);
        setError(null);
      }

      // If browser is offline, keep the freshest cached snapshot + queued offline items cleanly
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        if (!cachedSnapshot) {
          setTransactions(syncManager.mergeMonthTransactions(selectedMonth, []));
          setLoading(false);
        }
        setSyncing(false);
        return;
      }

      setSyncing(true);

      // Step 2 (Revalidate): Fetch latest data from /api/transactions (also cached by Workbox SWR)
      try {
        const result = await fetchTransactions(selectedMonth, {
          bypassSwCache: options?.bypassSwCache,
        });

        syncManager.saveMonthSnapshot(selectedMonth, result.transactions, {
          mode: result.status.mode,
          spreadsheetName: result.status.spreadsheetName,
          updatedAt: result.status.lastSyncedAt,
        });

        setTransactions(
          syncManager.mergeMonthTransactions(selectedMonth, result.transactions)
        );
        setBackendStatus({
          ...result.status,
          fromCache: false,
        });
        setError(null);
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Erro desconhecido ao sincronizar despesas.';

        // If we already have a cached snapshot (or offline network error), stay resilient without wiping UI
        if (cachedSnapshot || isNetworkError(err)) {
          if (cachedSnapshot) {
            setTransactions(
              syncManager.mergeMonthTransactions(
                selectedMonth,
                cachedSnapshot.transactions
              )
            );
          } else {
            setTransactions(syncManager.mergeMonthTransactions(selectedMonth, []));
          }
          setError(null);
          setBackendStatus((prev) => ({
            ...prev,
            connected: false,
            fromCache: true,
            error: isNetworkError(err) ? undefined : msg,
          }));
        } else {
          if (!silent) {
            setTransactions([]);
            setError(msg);
          }
          setBackendStatus((prev) => ({
            ...prev,
            configured: true,
            connected: false,
            mode: 'sheets',
            error: msg,
          }));
        }
      } finally {
        setLoading(false);
        setSyncing(false);
      }
    },
    [selectedMonth]
  );

  // SyncManager callbacks: auto-reconcile after offline queue flush or SW background SWR update
  const handleSyncFlushComplete = useCallback(
    (result: SyncFlushResult) => {
      if (result.syncedCount > 0) {
        showToast(
          'success',
          result.syncedCount === 1
            ? '1 lançamento offline enviado para a planilha.'
            : `${result.syncedCount} lançamentos offline enviados para a planilha.`
        );
        void loadMonthData({ silent: true, bypassSwCache: true });
      } else if (result.failedCount > 0 && result.lastError) {
        showToast('error', `Falha ao sincronizar fila: ${result.lastError}`);
      }
    },
    [loadMonthData, showToast]
  );

  const handleSwrCacheUpdated = useCallback(
    (updatedUrl?: string) => {
      if (
        !updatedUrl ||
        updatedUrl.includes(`mes=${encodeURIComponent(selectedMonth)}`) ||
        updatedUrl.includes(`mes=${selectedMonth}`)
      ) {
        void loadMonthData({ silent: true });
      }
    },
    [selectedMonth, loadMonthData]
  );

  const syncState = useSyncManager({
    onFlushComplete: handleSyncFlushComplete,
    onSwrCacheUpdated: handleSwrCacheUpdated,
  });

  // Initial & month-change fetch
  useEffect(() => {
    void loadMonthData();
  }, [loadMonthData]);

  // Automated background synchronization (polling + visibility/focus/online triggers)
  useEffect(() => {
    if (!pwa.isOnline) return;

    const triggerSilentSync = () => {
      if (document.visibilityState === 'visible') {
        void loadMonthData({ silent: true });
      }
    };

    const handleOnline = () => {
      // SyncManager flushes queued writes on 'online'; also refresh current month data
      void loadMonthData({ silent: true, bypassSwCache: true });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('focus', triggerSilentSync);
    document.addEventListener('visibilitychange', triggerSilentSync);

    let intervalId: number | undefined;
    if (settings.autoSyncSeconds > 0) {
      intervalId = window.setInterval(
        triggerSilentSync,
        settings.autoSyncSeconds * 1000
      );
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('focus', triggerSilentSync);
      document.removeEventListener('visibilitychange', triggerSilentSync);
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [pwa.isOnline, settings.autoSyncSeconds, loadMonthData]);

  const handleSelectTab = useCallback(
    (nextTab: NavTab, options?: { skipHistory?: boolean }) => {
      setActiveTab((prevTab) => {
        if (prevTab !== nextTab) {
          setTabDirection(TAB_ORDER[nextTab] >= TAB_ORDER[prevTab] ? 1 : -1);
          if (!options?.skipHistory && typeof window !== 'undefined') {
            try {
              window.history.pushState({ tab: nextTab }, '', `#${nextTab}`);
            } catch {
              // Ignore history API restrictions in sandboxed frames
            }
          }
        }
        return nextTab;
      });
    },
    []
  );

  // Sync initial history entry & support OS/browser Back & Forward gestures cleanly
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (!window.history.state?.tab) {
        window.history.replaceState({ tab: activeTab }, '', `#${activeTab}`);
      }
    } catch {
      // Ignore history API restrictions
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handlePopState = (event: PopStateEvent) => {
      if (isNewModalOpen) {
        setIsNewModalOpen(false);
        return;
      }
      const targetTab: NavTab =
        event.state?.tab && NAV_TABS_ORDERED.includes(event.state.tab)
          ? event.state.tab
          : parseTabFromHash();
      handleSelectTab(targetTab, { skipHistory: true });
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [handleSelectTab, isNewModalOpen]);

  // Desktop keyboard navigation shortcuts (Alt+Left/Right for tabs, Alt+[/] for months)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (inInput || isNewModalOpen) return;

      if (e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        e.preventDefault();
        const idx = NAV_TABS_ORDERED.indexOf(activeTab);
        const nextIdx = e.key === 'ArrowRight' ? idx + 1 : idx - 1;
        if (nextIdx >= 0 && nextIdx < NAV_TABS_ORDERED.length) {
          handleSelectTab(NAV_TABS_ORDERED[nextIdx]);
        }
      } else if (e.altKey && e.key === '[') {
        e.preventDefault();
        setSelectedMonth((prev) => shiftYearMonth(prev, -1));
        setSelectedCategory('Todas');
      } else if (e.altKey && e.key === ']') {
        e.preventDefault();
        setSelectedMonth((prev) => shiftYearMonth(prev, 1));
        setSelectedCategory('Todas');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, handleSelectTab, isNewModalOpen]);

  const handleChangeMonth = (nextMonth: string) => {
    setSelectedMonth(nextMonth);
    setSelectedCategory('Todas');
  };

  const handleSetTheme = (nextTheme: ThemeMode) => {
    const next: AppSettings = { ...settings, theme: nextTheme };
    setSettings(next);
    saveSettings(next);
  };

  const handleSetGlassClarity = (nextClarity: GlassClarityMode) => {
    const next: AppSettings = { ...settings, glassClarity: nextClarity };
    setSettings(next);
    saveSettings(next);
    const label =
      nextClarity === 'cristal'
        ? 'Transparência: Vidro cristal ativado'
        : nextClarity === 'sutil'
          ? 'Transparência: Modo mais opaco'
          : 'Transparência: Liquid Glass equilibrado';
    showToast('info', label);
  };

  const handleCycleTheme = () => {
    const order: ThemeMode[] = ['system', 'light', 'dark'];
    const idx = order.indexOf(settings.theme);
    const nextTheme = order[(idx + 1) % order.length];
    handleSetTheme(nextTheme);
    const label =
      nextTheme === 'system'
        ? 'Tema automático (sistema)'
        : nextTheme === 'dark'
          ? 'Tema escuro ativado'
          : 'Tema claro ativado';
    showToast('info', label);
  };

  const handleTogglePrivacyMode = useCallback(() => {
    setSettings((prev) => {
      const next: AppSettings = { ...prev, privacyMode: !prev.privacyMode };
      saveSettings(next);
      showToast(
        'info',
        next.privacyMode
          ? 'Modo foco ativado — valores ocultos.'
          : 'Valores visíveis novamente.'
      );
      return next;
    });
  }, [showToast]);

  const handleSaveSettings = (next: AppSettings) => {
    setSettings(next);
    saveSettings(next);
    showToast('success', 'Preferências salvas.');
  };

  const handleDeleteTransaction = async (id: string) => {
    const prevList = transactions;
    setTransactions((prev) => prev.filter((item) => item.id !== id));

    // If item was created offline and is still in the local queue, cancel it locally
    if (id.startsWith('offline-')) {
      syncManager.enqueueDelete(id);
      showToast('info', 'Lançamento removido da fila offline.');
      return;
    }

    // If currently offline in sheets mode, queue the deletion for automatic online sync
    if (!pwa.isOnline && backendStatus.mode === 'sheets') {
      syncManager.enqueueDelete(id);
      showToast('info', 'Remoção na fila — será sincronizada ao reconectar.');
      return;
    }

    try {
      await deleteTransaction(id, backendStatus.mode);
      if (backendStatus.mode === 'sheets') {
        const nextList = prevList.filter((item) => item.id !== id);
        syncManager.saveMonthSnapshot(selectedMonth, nextList, {
          mode: backendStatus.mode,
          spreadsheetName: backendStatus.spreadsheetName,
        });
      }
      showToast('info', 'Saída removida.');
    } catch (err) {
      if (backendStatus.mode === 'sheets' && isNetworkError(err)) {
        syncManager.enqueueDelete(id);
        showToast('info', 'Sem conexão — remoção enfileirada para envio automático.');
        return;
      }
      setTransactions(prevList);
      showToast(
        'error',
        err instanceof Error ? err.message : 'Não foi possível remover a saída.'
      );
    }
  };

  // Aggregations
  const totalSpent = useMemo(
    () => transactions.reduce((sum, item) => sum + item.valor, 0),
    [transactions]
  );

  const loadBudgetRecommendation = useCallback(async () => {
    setLoadingRecommendation(true);
    try {
      const rec = await fetchBudgetRecommendation({
        currentMonthTotal: totalSpent,
        currentMonthCount: transactions.length,
        getCachedMonth: (ym) => syncManager.getMonthSnapshot(ym)?.transactions ?? null,
      });
      setBudgetRecommendation(rec);
    } catch {
      // Keep previous recommendation if recalculation fails
    } finally {
      setLoadingRecommendation(false);
    }
  }, [totalSpent, transactions.length]);

  useEffect(() => {
    if (activeTab === 'configuracao') {
      void loadBudgetRecommendation();
    }
  }, [activeTab, backendStatus.mode, loadBudgetRecommendation]);

  const dailyAverageInfo = useMemo(
    () => computeDailyAverage(totalSpent, selectedMonth),
    [totalSpent, selectedMonth]
  );

  const categorySummaries = useMemo<CategorySummary[]>(() => {
    const totals = new Map<Category, { total: number; count: number }>();
    for (const cat of CATEGORIES) {
      totals.set(cat, { total: 0, count: 0 });
    }
    for (const tx of transactions) {
      const prev = totals.get(tx.categoria) ?? { total: 0, count: 0 };
      totals.set(tx.categoria, {
        total: prev.total + tx.valor,
        count: prev.count + 1,
      });
    }

    return CATEGORIES.map((categoria) => {
      const entry = totals.get(categoria)!;
      return {
        categoria,
        total: entry.total,
        count: entry.count,
        percentage: totalSpent > 0 ? (entry.total / totalSpent) * 100 : 0,
      };
    }).sort((a, b) => b.total - a.total);
  }, [transactions, totalSpent]);

  const topCategory = useMemo(() => {
    const first = categorySummaries[0];
    return first && first.total > 0 ? first : null;
  }, [categorySummaries]);

  const filteredTransactions = useMemo(() => {
    const q = normalizeText(searchQuery);
    return transactions.filter((tx) => {
      if (selectedCategory !== 'Todas' && tx.categoria !== selectedCategory) {
        return false;
      }
      if (q) {
        const matchName = normalizeText(tx.estabelecimento).includes(q);
        const matchMethod = normalizeText(tx.metodo).includes(q);
        return matchName || matchMethod;
      }
      return true;
    });
  }, [transactions, searchQuery, selectedCategory]);

  const handleCreateTransaction = async (payload: CreateTransactionPayload) => {
    const previousTotal = totalSpent;
    let created: Transaction;
    let queuedOffline = false;

    if (!pwa.isOnline && backendStatus.mode === 'sheets') {
      created = syncManager.enqueueCreate(payload);
      queuedOffline = true;
    } else {
      try {
        created = await createTransaction(payload, backendStatus.mode);
      } catch (err) {
        if (backendStatus.mode === 'sheets' && isNetworkError(err)) {
          created = syncManager.enqueueCreate(payload);
          queuedOffline = true;
        } else {
          throw err;
        }
      }
    }

    const createdMonth = created.data.slice(0, 7);

    if (createdMonth === selectedMonth) {
      const nextTotal = previousTotal + created.valor;
      const nextList = [created, ...transactions].sort((a, b) =>
        b.data.localeCompare(a.data)
      );
      setTransactions(nextList);

      if (!queuedOffline && backendStatus.mode === 'sheets') {
        syncManager.saveMonthSnapshot(selectedMonth, nextList, {
          mode: backendStatus.mode,
          spreadsheetName: backendStatus.spreadsheetName,
        });
        syncManager.requestSwRevalidation(selectedMonth);
      }

      showToast(
        queuedOffline ? 'info' : 'success',
        queuedOffline
          ? 'Salvo offline — será enviado automaticamente ao reconectar.'
          : 'Saída registrada com sucesso.'
      );

      if (
        settings.monthlyBudget > 0 &&
        push.permission === 'granted' &&
        !push.needsIOSHomeScreen
      ) {
        const prevPct = (previousTotal / settings.monthlyBudget) * 100;
        const nextPct = (nextTotal / settings.monthlyBudget) * 100;
        if (push.preferences.budgetAlert100 && prevPct < 100 && nextPct >= 100) {
          void push.sendNotification(
            'Rumo · Meta mensal excedida',
            `Suas saídas chegaram a ${formatCurrency(nextTotal)} (meta: ${formatCurrency(settings.monthlyBudget)}).`,
            'rumo-budget-100'
          );
        } else if (push.preferences.budgetAlert80 && prevPct < 80 && nextPct >= 80) {
          void push.sendNotification(
            'Rumo · Atenção ao orçamento',
            `Você atingiu ${Math.round(nextPct)}% da sua meta mensal (${formatCurrency(nextTotal)}).`,
            'rumo-budget-80'
          );
        }
      }
    } else if (/^\d{4}-\d{2}$/.test(createdMonth)) {
      setSelectedMonth(createdMonth);
      showToast(
        queuedOffline ? 'info' : 'success',
        queuedOffline
          ? `Salvo na fila offline em ${formatMonthYear(createdMonth)}.`
          : `Saída salva em ${formatMonthYear(createdMonth)}.`
      );
    } else {
      await loadMonthData({ silent: true });
      showToast(
        queuedOffline ? 'info' : 'success',
        queuedOffline
          ? 'Salvo offline — será enviado ao reconectar.'
          : 'Saída registrada com sucesso.'
      );
    }
  };

  const handleExportCsv = () => {
    if (filteredTransactions.length === 0) return;
    exportTransactionsToCsv(filteredTransactions, selectedMonth, selectedCategory);
    showToast('success', 'Arquivo CSV exportado.');
  };

  const handleSendTestPush = () =>
    push.sendNotification(
      'Rumo · Teste de notificação',
      `Push ativo neste dispositivo. Total gasto em ${formatMonthYear(selectedMonth)}: ${formatCurrency(totalSpent)}.`,
      'rumo-test-push'
    );

  const recentPreview = useMemo(() => transactions.slice(0, 4), [transactions]);

  const sheetState: SheetConnectionState =
    syncing || syncState.isFlushing
      ? 'syncing'
      : !pwa.isOnline
        ? 'offline'
        : backendStatus.connected
          ? 'connected'
          : backendStatus.error || error
            ? 'error'
            : 'pending';

  const handleManualSync = useCallback(async () => {
    if (!pwa.isOnline) {
      showToast(
        'info',
        syncState.pendingCount > 0
          ? `Offline · ${syncState.pendingCount} item(ns) serão enviados assim que a conexão voltar.`
          : 'Sem conexão — exibindo dados mais recentes do cache offline.'
      );
      return;
    }

    if (syncState.pendingCount > 0) {
      await syncState.flushNow();
    }
    await loadMonthData({ silent: true, bypassSwCache: true });

    if (backendStatus.configured && !error) {
      showToast('success', 'Planilha sincronizada.');
    } else if (!backendStatus.configured) {
      showToast(
        'info',
        'Aguardando APPS_SCRIPT_URL e APPS_SCRIPT_TOKEN no console.'
      );
    }
  }, [
    pwa.isOnline,
    syncState,
    loadMonthData,
    backendStatus.configured,
    error,
    showToast,
  ]);

  const currentTabIndex = NAV_TABS_ORDERED.indexOf(activeTab);

  const navGestures = useNavigationGestures({
    enabled: !isNewModalOpen,
    canSwipePrev: currentTabIndex > 0,
    canSwipeNext: currentTabIndex < NAV_TABS_ORDERED.length - 1,
    isRefreshing: syncing || syncState.isFlushing,
    onSwipePrev: () => {
      if (currentTabIndex > 0) {
        handleSelectTab(NAV_TABS_ORDERED[currentTabIndex - 1]);
      }
    },
    onSwipeNext: () => {
      if (currentTabIndex < NAV_TABS_ORDERED.length - 1) {
        handleSelectTab(NAV_TABS_ORDERED[currentTabIndex + 1]);
      }
    },
    onPullRefresh: () => {
      void handleManualSync();
    },
  });

  const handleOpenNewModal = useCallback(() => {
    setIsNewModalOpen(true);
    if (typeof window !== 'undefined') {
      try {
        window.history.pushState({ tab: activeTab, modal: 'new' }, '', `#${activeTab}`);
      } catch {
        // Ignore history restrictions
      }
    }
  }, [activeTab]);

  return (
    <MotionConfig reducedMotion="user">
      <div
        data-focus-mode={settings.privacyMode ? 'true' : undefined}
        data-syncing={syncing || syncState.isFlushing ? 'true' : undefined}
        className="rumo-atmosphere relative min-h-dvh text-slate-900 transition-colors duration-150 dark:text-slate-100"
      >
        {/* Hidden adaptive Liquid Glass optics & mobile/low-power performance tier controller */}
        <LiquidGlassOptics />

        {/* Clean neutral architectural micro-dot reference layer (zero color gradients or heavy blurs) */}
        <div
          aria-hidden="true"
          className="rumo-optics-grid pointer-events-none fixed inset-0"
        />

        <Header
          activeTab={activeTab}
          onSelectTab={handleSelectTab}
          selectedMonth={selectedMonth}
          onPrevMonth={() => handleChangeMonth(shiftYearMonth(selectedMonth, -1))}
          onNextMonth={() => handleChangeMonth(shiftYearMonth(selectedMonth, 1))}
          onResetCurrentMonth={() => handleChangeMonth(getCurrentYearMonth())}
          theme={settings.theme}
          onCycleTheme={handleCycleTheme}
          privacyMode={settings.privacyMode}
          onTogglePrivacyMode={handleTogglePrivacyMode}
          onOpenNewOutflow={handleOpenNewModal}
          sheetState={sheetState}
          pendingSyncCount={syncState.pendingCount}
          onSheetStatusClick={() => void handleManualSync()}
        />

        <motion.main
          {...navGestures.touchHandlers}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: VIEW_EASE }}
          className="main-safe-padding relative z-10 mx-auto max-w-5xl overflow-x-clip pt-4 sm:pt-6"
        >
          {/* Subtle iOS-style Pull-to-Refresh Indicator */}
          <AnimatePresence>
            {(navGestures.pullDistance > 8 || (syncing && navGestures.pullDistance > 0)) && (
              <motion.div
                key="pull-to-refresh"
                initial={{ opacity: 0, height: 0 }}
                animate={{
                  opacity: Math.min(1, navGestures.pullProgress * 1.15),
                  height: Math.max(36, navGestures.pullDistance * 0.72),
                }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18, ease: VIEW_EASE }}
                className="mb-2 flex items-center justify-center overflow-hidden"
                aria-live="polite"
              >
                <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <RefreshCw
                    className={`h-4 w-4 transition-colors ${
                      syncing
                        ? 'animate-spin text-emerald-600 dark:text-emerald-400'
                        : navGestures.pullReady
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-400 dark:text-slate-500'
                    }`}
                    style={
                      syncing
                        ? undefined
                        : { transform: `rotate(${Math.round(navGestures.pullProgress * 220)}deg)` }
                    }
                  />
                  <span>
                    {syncing
                      ? 'Atualizando...'
                      : navGestures.pullReady
                        ? 'Solte para atualizar'
                        : 'Puxe para atualizar'}
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Horizontal swipe follow wrapper */}
          <div
            className="w-full min-w-0"
            style={{
              transform:
                navGestures.swipeOffsetX !== 0
                  ? `translate3d(${navGestures.swipeOffsetX}px, 0, 0)`
                  : undefined,
              transition:
                navGestures.swipeOffsetX === 0
                  ? 'transform 220ms cubic-bezier(0.16, 1, 0.3, 1)'
                  : 'none',
            }}
          >
          {/* Non-intrusive offline / pending sync queue indicator */}
          {!pwa.isOnline ? (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-300/60 bg-amber-50/75 px-3.5 py-2.5 text-xs font-medium text-amber-900 backdrop-blur-md dark:border-amber-500/25 dark:bg-amber-950/45 dark:text-amber-300">
              <div className="flex items-center gap-2">
                <WifiOff className="h-4 w-4 shrink-0" />
                <span>
                  Modo offline — exibindo versão mais recente em cache
                  {syncState.pendingCount > 0
                    ? ` · ${syncState.pendingCount} na fila de envio`
                    : '.'}
                </span>
              </div>
            </div>
          ) : (
            syncState.pendingCount > 0 && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-300/60 bg-emerald-50/75 px-3.5 py-2.5 text-xs font-medium text-emerald-900 backdrop-blur-md dark:border-emerald-500/25 dark:bg-emerald-950/45 dark:text-emerald-300">
                <div className="flex items-center gap-2">
                  <CloudUpload className="h-4 w-4 shrink-0" />
                  <span>
                    {syncState.isFlushing
                      ? `Enviando ${syncState.pendingCount} lançamento(s) offline para a planilha...`
                      : `${syncState.pendingCount} lançamento(s) offline pronto(s) para envio.`}
                  </span>
                </div>
                {!syncState.isFlushing && (
                  <button
                    type="button"
                    onClick={() => void syncState.flushNow()}
                    className="glass-accent rounded-lg px-2.5 py-1 text-[11px] font-semibold text-white transition-colors dark:text-slate-950"
                  >
                    Enviar agora
                  </button>
                )}
              </div>
            )
          )}

          {/* Dedicated Screen Views — Smooth Directional Framer Motion Transitions */}
          <AnimatePresence mode="wait" initial={false} custom={tabDirection}>
            {activeTab === 'resumo' && (
              <motion.div
                key="view-resumo"
                custom={tabDirection}
                variants={tabViewVariants}
                initial="enter"
                animate="center"
                exit="exit"
                className="space-y-4"
              >
                <SummaryCards
                  animationKey={`${selectedMonth}-${backendStatus.mode}`}
                  totalSpent={totalSpent}
                  transactionCount={transactions.length}
                  dailyAverage={dailyAverageInfo.average}
                  dailyAverageLabel={dailyAverageInfo.label}
                  topCategory={topCategory}
                  monthlyBudget={settings.monthlyBudget}
                  loading={loading}
                  privacyMode={settings.privacyMode}
                  onEditBudget={() => handleSelectTab('configuracao')}
                  onSelectCategory={(cat) => {
                    setSelectedCategory(cat);
                    handleSelectTab('transacoes');
                  }}
                />

                {/* Compact Snapshot of Latest Outflows with jump to Transações */}
                {!loading && !error && recentPreview.length > 0 && (
                  <section className="glass-surface overflow-hidden rounded-[28px] p-4 sm:p-6">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-white">
                        Últimas saídas
                      </h2>
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.96 }}
                        onClick={() => handleSelectTab('transacoes')}
                        className="glass-control inline-flex min-h-[32px] items-center gap-1 rounded-full px-3 text-xs font-semibold text-emerald-700 transition-all hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
                      >
                        <span>Ver todas</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </motion.button>
                    </div>

                    <ul className="mt-3 divide-y divide-slate-900/[0.06] dark:divide-white/[0.07]">
                      {recentPreview.map((tx) => {
                        const cfg = CATEGORY_MAP[tx.categoria] ?? CATEGORY_MAP.Outros;
                        const Icon = cfg.icon;
                        return (
                          <li
                            key={tx.id}
                            className="flex min-h-[60px] items-center justify-between gap-3 py-2.5"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <span
                                className={`glass-icon-orb flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${cfg.iconBg} ${cfg.iconText}`}
                                title={tx.categoria}
                              >
                                <Icon className="h-4 w-4" />
                              </span>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                                  {tx.estabelecimento}
                                </p>
                                <p className="flex flex-wrap items-center gap-x-1 text-xs text-slate-500 dark:text-slate-400">
                                  <span className="font-mono tabular-nums">
                                    {formatDateTimeShort(tx.data)}
                                  </span>
                                  <span aria-hidden="true">·</span>
                                  <span>{tx.metodo}</span>
                                  {tx.pendingSync && (
                                    <>
                                      <span aria-hidden="true">·</span>
                                      <span className="inline-flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400">
                                        <Clock className="h-3 w-3 shrink-0" />
                                        <span>Na fila</span>
                                      </span>
                                    </>
                                  )}
                                </p>
                              </div>
                            </div>
                            <AnimatedMoney
                              value={tx.valor}
                              hidden={settings.privacyMode}
                              durationMs={0}
                              className="shrink-0 text-sm font-semibold text-slate-900 dark:text-white"
                            />
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                )}
              </motion.div>
            )}

            {activeTab === 'gastos' && (
              <motion.div
                key="view-gastos"
                custom={tabDirection}
                variants={tabViewVariants}
                initial="enter"
                animate="center"
                exit="exit"
              >
                <CategoryChart
                  summaries={categorySummaries}
                  totalSpent={totalSpent}
                  selectedCategory={selectedCategory}
                  onSelectCategory={setSelectedCategory}
                  onInspectCategoryTransactions={(cat) => {
                    setSelectedCategory(cat);
                    handleSelectTab('transacoes');
                  }}
                  chartMode={chartMode}
                  onChangeChartMode={setChartMode}
                  theme={resolvedTheme}
                  loading={loading}
                  privacyMode={settings.privacyMode}
                />
              </motion.div>
            )}

            {activeTab === 'transacoes' && (
              <motion.div
                key="view-transacoes"
                custom={tabDirection}
                variants={tabViewVariants}
                initial="enter"
                animate="center"
                exit="exit"
              >
                <TransactionList
                  transactions={filteredTransactions}
                  totalMonthTransactions={transactions.length}
                  searchQuery={searchQuery}
                  onChangeSearch={setSearchQuery}
                  selectedCategory={selectedCategory}
                  onSelectCategory={setSelectedCategory}
                  loading={loading}
                  error={error}
                  canDelete={true}
                  privacyMode={settings.privacyMode}
                  onDeleteTransaction={(id) => void handleDeleteTransaction(id)}
                  onRetry={() => void loadMonthData()}
                  onOpenSettings={() => handleSelectTab('configuracao')}
                  onOpenNewExpense={handleOpenNewModal}
                  onExportCsv={handleExportCsv}
                />
              </motion.div>
            )}

            {activeTab === 'configuracao' && (
              <motion.div
                key="view-configuracao"
                custom={tabDirection}
                variants={tabViewVariants}
                initial="enter"
                animate="center"
                exit="exit"
              >
                <SettingsView
                  settings={settings}
                  backendStatus={backendStatus}
                  syncing={syncing}
                  isOnline={pwa.isOnline}
                  pendingSyncCount={syncState.pendingCount}
                  isFlushingQueue={syncState.isFlushing}
                  privacyMode={settings.privacyMode}
                  budgetRecommendation={budgetRecommendation}
                  loadingRecommendation={loadingRecommendation}
                  onRefreshRecommendation={() => void loadBudgetRecommendation()}
                  onTogglePrivacyMode={handleTogglePrivacyMode}
                  onSaveSettings={handleSaveSettings}
                  onChangeTheme={handleSetTheme}
                  onChangeGlassClarity={handleSetGlassClarity}
                  onSyncNow={() => void handleManualSync()}
                  onFlushQueue={() => void syncState.flushNow()}
                  isIOS={pwa.isIOS}
                  isInstalled={pwa.isInstalled}
                  isInstallable={pwa.isInstallable}
                  onInstallApp={pwa.install}
                  pushPermission={push.permission}
                  needsIOSHomeScreen={push.needsIOSHomeScreen}
                  hasPushManager={push.hasPushManager}
                  pushPreferences={push.preferences}
                  subscriptionJson={push.subscriptionJson}
                  pushBusy={push.busy}
                  onUpdatePushPreferences={push.updatePreferences}
                  onRequestPushPermission={push.requestPermission}
                  onSendTestNotification={handleSendTestPush}
                  onSubscribeWebPush={push.subscribeWebPush}
                  onUnsubscribeWebPush={push.unsubscribeWebPush}
                  onNotifyFeedback={showToast}
                />
              </motion.div>
            )}
          </AnimatePresence>
          </div>
        </motion.main>

        {/* Mobile Fixed Bottom Navigation Bar with Dedicated Tabs & Central (+) Button */}
        <BottomNav
          activeTab={activeTab}
          onSelectTab={handleSelectTab}
          onOpenNewOutflow={handleOpenNewModal}
        />

        {/* Manual Outflow Modal / Bottom Sheet */}
        <NewExpenseModal
          open={isNewModalOpen}
          isRealMode={backendStatus.mode === 'sheets'}
          isOnline={pwa.isOnline}
          onClose={() => setIsNewModalOpen(false)}
          onSubmit={handleCreateTransaction}
        />

        <Toast toast={toast} onDismiss={() => setToast(null)} />
      </div>
    </MotionConfig>
  );
}
