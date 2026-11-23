import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  Bell,
  Check,
  CheckCircle2,
  Clock,
  CloudUpload,
  Droplets,
  Eye,
  EyeOff,
  Fingerprint,
  Key,
  KeyRound,
  Layers,
  Link as LinkIcon,
  Lock,
  Monitor,
  Moon,
  RefreshCw,
  ScanFace,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  X,
} from 'lucide-react';
import type { PushPermissionState } from '../hooks/usePushNotifications';
import type {
  AppLockConfig,
  AppSettings,
  AutoLockTimeout,
  BackendSyncStatus,
  BudgetRecommendation,
  GlassClarityMode,
  PushPreferences,
  ThemeMode,
} from '../types';
import { parseMoneyInput } from '../utils/format';
import { AnimatedMoney } from './AnimatedMoney';
import { NotificationsPanel } from './NotificationsPanel';
import { getAppsScriptConfig, setCustomAppsScriptConfig } from '../services/api';
import {
  generateSalt,
  getBiometricLabel,
  hashPin,
  isAppleDevice,
  registerBiometrics,
  verifyPin,
} from '../services/security';

const EASE_IOS: [number, number, number, number] = [0.16, 1, 0.3, 1];

interface SettingsViewProps {
  settings: AppSettings;
  lockConfig: AppLockConfig;
  onSaveLockConfig: (config: AppLockConfig) => Promise<void>;
  onLockNow: () => void;
  backendStatus: BackendSyncStatus;
  syncing: boolean;
  isOnline: boolean;
  pendingSyncCount: number;
  isFlushingQueue: boolean;
  privacyMode: boolean;
  budgetRecommendation: BudgetRecommendation | null;
  loadingRecommendation: boolean;
  onRefreshRecommendation: () => void;
  onTogglePrivacyMode: () => void;
  onSaveSettings: (next: AppSettings) => void;
  onChangeTheme: (theme: ThemeMode) => void;
  onChangeGlassClarity: (clarity: GlassClarityMode) => void;
  onSyncNow: () => void;
  onFlushQueue: () => void;
  // Push & PWA props
  isIOS: boolean;
  isInstalled: boolean;
  isInstallable: boolean;
  onInstallApp: () => Promise<boolean>;
  pushPermission: PushPermissionState;
  needsIOSHomeScreen: boolean;
  hasPushManager: boolean;
  pushPreferences: PushPreferences;
  subscriptionJson: string | null;
  pushBusy: boolean;
  onUpdatePushPreferences: (patch: Partial<PushPreferences>) => void;
  onRequestPushPermission: () => Promise<{ ok: boolean; message: string }>;
  onSendTestNotification: () => Promise<{ ok: boolean; message: string }>;
  onSubscribeWebPush: (vapidKey: string) => Promise<{ ok: boolean; message: string }>;
  onUnsubscribeWebPush: () => Promise<{ ok: boolean; message: string }>;
  onNotifyFeedback: (type: 'success' | 'error' | 'info', text: string) => void;
}

type SettingsSubTab = 'geral' | 'seguranca' | 'push';

const SYNC_INTERVAL_OPTIONS = [
  { value: 15, label: '15s' },
  { value: 30, label: '30s' },
  { value: 60, label: '60s' },
  { value: 0, label: 'Manual' },
];

function formatSyncTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function SettingsView({
  settings,
  backendStatus,
  syncing,
  isOnline,
  pendingSyncCount,
  isFlushingQueue,
  privacyMode,
  budgetRecommendation,
  loadingRecommendation,
  onRefreshRecommendation,
  onTogglePrivacyMode,
  onSaveSettings,
  onChangeTheme,
  onChangeGlassClarity,
  onSyncNow,
  onFlushQueue,
  isIOS,
  isInstalled,
  isInstallable,
  onInstallApp,
  pushPermission,
  needsIOSHomeScreen,
  hasPushManager,
  pushPreferences,
  subscriptionJson,
  pushBusy,
  onUpdatePushPreferences,
  onRequestPushPermission,
  onSendTestNotification,
  onSubscribeWebPush,
  onUnsubscribeWebPush,
  onNotifyFeedback,
  lockConfig,
  onSaveLockConfig,
  onLockNow,
}: SettingsViewProps) {
  const [subTab, setSubTab] = useState<SettingsSubTab>('geral');
  const [budgetInput, setBudgetInput] = useState(
    settings.monthlyBudget > 0
      ? String(settings.monthlyBudget).replace('.', ',')
      : ''
  );
  const [error, setError] = useState<string | null>(null);

  // Security & Lock Modal State
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinModalMode, setPinModalMode] = useState<'create' | 'change' | 'disable'>('create');
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [confirmPinInput, setConfirmPinInput] = useState('');
  const [pinModalError, setPinModalError] = useState<string | null>(null);
  const [pinModalBusy, setPinModalBusy] = useState(false);

  const biometricLabel = getBiometricLabel();
  const isApple = isAppleDevice();
  const BiometricIcon = isApple ? ScanFace : Fingerprint;

  const handleToggleLock = () => {
    if (lockConfig.enabled) {
      // Para desativar, se tiver PIN configurado, solicita confirmação
      if (lockConfig.pinHash) {
        setPinModalMode('disable');
        setCurrentPinInput('');
        setPinModalError(null);
        setShowPinModal(true);
      } else {
        void onSaveLockConfig({
          ...lockConfig,
          enabled: false,
        });
        onNotifyFeedback('info', 'Bloqueio desativado.');
      }
    } else {
      // Se não tiver PIN cadastrado, abre modal para criar PIN
      if (!lockConfig.pinHash) {
        setPinModalMode('create');
        setNewPinInput('');
        setConfirmPinInput('');
        setPinModalError(null);
        setShowPinModal(true);
      } else {
        void onSaveLockConfig({
          ...lockConfig,
          enabled: true,
        });
        onNotifyFeedback('success', 'Bloqueio de segurança ativado.');
      }
    }
  };

  const handleToggleBiometrics = async () => {
    if (!lockConfig.biometricEnabled) {
      try {
        const credentialId = await registerBiometrics();
        await onSaveLockConfig({
          ...lockConfig,
          biometricEnabled: true,
          biometricCredentialId: credentialId,
        });
        onNotifyFeedback('success', `${biometricLabel} ativado com sucesso!`);
      } catch (err) {
        onNotifyFeedback('error', err instanceof Error ? err.message : 'Falha ao ativar biometria.');
      }
    } else {
      await onSaveLockConfig({
        ...lockConfig,
        biometricEnabled: false,
      });
      onNotifyFeedback('info', `${biometricLabel} desativado.`);
    }
  };

  const handleChangeAutoLock = async (timeout: AutoLockTimeout) => {
    await onSaveLockConfig({
      ...lockConfig,
      autoLockMinutes: timeout,
    });
    onNotifyFeedback('success', 'Tempo de bloqueio atualizado.');
  };

  const handlePinModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinModalError(null);
    setPinModalBusy(true);

    try {
      if (pinModalMode === 'disable') {
        if (!lockConfig.pinSalt || !lockConfig.pinHash) {
          await onSaveLockConfig({ ...lockConfig, enabled: false });
          setShowPinModal(false);
          return;
        }
        const valid = await verifyPin(currentPinInput, lockConfig.pinSalt, lockConfig.pinHash);
        if (!valid) {
          setPinModalError('PIN atual incorreto.');
          return;
        }
        await onSaveLockConfig({ ...lockConfig, enabled: false });
        onNotifyFeedback('info', 'Bloqueio desativado.');
        setShowPinModal(false);
        return;
      }

      if (pinModalMode === 'change') {
        if (lockConfig.pinSalt && lockConfig.pinHash) {
          const valid = await verifyPin(currentPinInput, lockConfig.pinSalt, lockConfig.pinHash);
          if (!valid) {
            setPinModalError('PIN atual incorreto.');
            return;
          }
        }
      }

      // Validação de novo PIN (4 dígitos)
      if (!/^\d{4}$/.test(newPinInput)) {
        setPinModalError('O PIN deve conter exatamente 4 números.');
        return;
      }

      if (newPinInput !== confirmPinInput) {
        setPinModalError('A confirmação do PIN não confere.');
        return;
      }

      const salt = generateSalt();
      const hash = await hashPin(newPinInput, salt);

      await onSaveLockConfig({
        ...lockConfig,
        enabled: true,
        pinSalt: salt,
        pinHash: hash,
      });

      onNotifyFeedback('success', 'PIN configurado com sucesso!');
      setShowPinModal(false);
    } catch {
      setPinModalError('Erro ao salvar PIN.');
    } finally {
      setPinModalBusy(false);
    }
  };

  useEffect(() => {
    setBudgetInput(
      settings.monthlyBudget > 0
        ? String(settings.monthlyBudget).replace('.', ',')
        : ''
    );
  }, [settings.monthlyBudget]);

  const handleSaveBudget = (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    let parsedBudget = 0;
    if (budgetInput.trim()) {
      const val = parseMoneyInput(budgetInput);
      if (!Number.isFinite(val) || val < 0) {
        setError('Informe uma meta de orçamento mensal válida (ou deixe vazio para desativar).');
        return;
      }
      parsedBudget = Math.round(val * 100) / 100;
    }

    onSaveSettings({
      ...settings,
      monthlyBudget: parsedBudget,
    });
  };

  const handleApplySuggestedBudget = () => {
    if (!budgetRecommendation || budgetRecommendation.suggestedBudget <= 0) return;
    setError(null);
    const suggested = budgetRecommendation.suggestedBudget;
    setBudgetInput(String(suggested).replace('.', ','));
    onSaveSettings({
      ...settings,
      monthlyBudget: suggested,
    });
  };

  const handleChangeSyncInterval = (seconds: number) => {
    onSaveSettings({
      ...settings,
      autoSyncSeconds: seconds,
    });
  };

  // Live comparison between the typed (or active) budget and the 3-month average
  const liveComparison = useMemo(() => {
    if (!budgetRecommendation || budgetRecommendation.average <= 0) return null;

    const avg = budgetRecommendation.average;
    const rawTyped = budgetInput.trim() ? parseMoneyInput(budgetInput) : 0;
    const activeBudget =
      Number.isFinite(rawTyped) && rawTyped > 0 ? rawTyped : 0;

    // Bar scale: 0% -> 160% of average (average marker sits at 62.5% of the track)
    const maxScale = avg * 1.6;
    const avgMarkerPct = (avg / maxScale) * 100;
    const currentFillPct =
      activeBudget > 0 ? Math.min(100, (activeBudget / maxScale) * 100) : 0;

    if (activeBudget <= 0) {
      return {
        avgMarkerPct,
        currentFillPct: 0,
        statusLabel: 'Sem meta ativa · aplique a média para ativar alertas',
        tone: 'neutral' as const,
        isExactSuggestion: false,
      };
    }

    const ratio = activeBudget / avg;
    const diffPct = Math.round((ratio - 1) * 100);
    const isExactSuggestion =
      Math.abs(activeBudget - budgetRecommendation.suggestedBudget) < 0.01;

    if (ratio < 0.95) {
      return {
        avgMarkerPct,
        currentFillPct,
        statusLabel: `Meta enxuta · ${Math.abs(diffPct)}% abaixo da média`,
        tone: 'emerald' as const,
        isExactSuggestion,
      };
    }
    if (ratio <= 1.1) {
      return {
        avgMarkerPct,
        currentFillPct,
        statusLabel:
          diffPct === 0
            ? 'Alinhada exatamente à sua média'
            : `Equilibrada com sua média (${diffPct > 0 ? '+' : ''}${diffPct}%)`,
        tone: 'emerald' as const,
        isExactSuggestion,
      };
    }
    return {
      avgMarkerPct,
      currentFillPct,
      statusLabel: `Com margem · +${diffPct}% acima da média`,
      tone: 'amber' as const,
      isExactSuggestion,
    };
  }, [budgetRecommendation, budgetInput]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* Sub-navigation switcher: Geral | Segurança | Push e iOS */}
      <div
        className="glass-chrome grid grid-cols-3 gap-1 rounded-full p-1.5"
        role="tablist"
        aria-label="Seções de configuração"
      >
        {(
          [
            { id: 'geral', label: 'Geral', icon: SlidersHorizontal },
            { id: 'seguranca', label: 'Segurança', icon: ShieldCheck },
            { id: 'push', label: 'Push e iOS', icon: Bell },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = subTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSubTab(tab.id)}
              className={`relative flex min-h-[40px] items-center justify-center gap-2 whitespace-nowrap rounded-full px-3 text-xs font-semibold transition-colors ${
                active
                  ? 'text-slate-900 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="settings-subtab-pill"
                  transition={{ duration: 0.24, ease: EASE_IOS }}
                  className="glass-pill-active absolute inset-0 rounded-full"
                />
              )}
              <Icon className="relative z-10 h-4 w-4" />
              <span className="relative z-10">{tab.label}</span>
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {subTab === 'seguranca' ? (
          <motion.div
            key="subtab-seguranca"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2, ease: EASE_IOS }}
            className="space-y-4"
          >
            {/* Main Security Card */}
            <section className="glass-surface space-y-4 overflow-hidden rounded-[28px] p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-500" />
                    <span>Bloqueio de Segurança e Privacidade</span>
                  </h2>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Protege o acesso aos seus saldos e despesas financeiras com Face ID, Biometria e PIN de 4 dígitos.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleToggleLock}
                  role="switch"
                  aria-checked={lockConfig.enabled}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
                    lockConfig.enabled ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      lockConfig.enabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {lockConfig.enabled && (
                <div className="space-y-4 pt-2 border-t border-slate-900/[0.06] dark:border-white/[0.08]">
                  {/* PIN Section */}
                  <div className="flex items-center justify-between py-1">
                    <div>
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
                        PIN de 4 dígitos
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        {lockConfig.pinHash ? 'PIN cadastrado e ativo' : 'Nenhum PIN configurado'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setPinModalMode(lockConfig.pinHash ? 'change' : 'create');
                        setCurrentPinInput('');
                        setNewPinInput('');
                        setConfirmPinInput('');
                        setPinModalError(null);
                        setShowPinModal(true);
                      }}
                      className="glass-control inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-4 text-xs font-semibold text-slate-700 transition-colors dark:text-slate-200"
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                      <span>{lockConfig.pinHash ? 'Alterar PIN' : 'Cadastrar PIN'}</span>
                    </button>
                  </div>

                  {/* Biometric Toggle Section */}
                  <div className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
                        <BiometricIcon className="h-5 w-5" />
                      </div>
                      <div>
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
                          {biometricLabel}
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          {lockConfig.biometricEnabled
                            ? `Desbloqueio rápido por ${biometricLabel} ativo`
                            : `Desbloquear com sensor do aparelho`}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleToggleBiometrics()}
                      role="switch"
                      aria-checked={lockConfig.biometricEnabled}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
                        lockConfig.biometricEnabled ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          lockConfig.biometricEnabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Auto-Lock Timeout Options */}
                  <div className="pt-2">
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-2">
                      Bloquear automaticamente após inatividade
                    </span>
                    <div className="glass-chrome grid grid-cols-3 gap-1 rounded-full p-1.5" role="radiogroup">
                      {[
                        { value: 0 as AutoLockTimeout, label: 'Imediato' },
                        { value: 1 as AutoLockTimeout, label: '1 minuto' },
                        { value: 5 as AutoLockTimeout, label: '5 minutos' },
                      ].map((item) => {
                        const active = lockConfig.autoLockMinutes === item.value;
                        return (
                          <button
                            key={item.value}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() => void handleChangeAutoLock(item.value)}
                            className={`relative flex min-h-[36px] items-center justify-center gap-1.5 rounded-full px-2 text-xs font-semibold transition-colors ${
                              active
                                ? 'text-slate-900 dark:text-white'
                                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                            }`}
                          >
                            {active && (
                              <motion.span
                                layoutId="settings-autolock-pill"
                                transition={{ duration: 0.24, ease: EASE_IOS }}
                                className="glass-pill-active absolute inset-0 rounded-full"
                              />
                            )}
                            <span className="relative z-10">{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Lock Now Button */}
                  <div className="pt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={onLockNow}
                      className="glass-control inline-flex min-h-[42px] items-center gap-2 rounded-full px-5 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                    >
                      <Lock className="h-4 w-4 text-emerald-500" />
                      <span>Bloquear aplicativo agora</span>
                    </button>
                  </div>
                </div>
              )}
            </section>
          </motion.div>
        ) : subTab === 'push' ? (
          <motion.div
            key="subtab-push"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2, ease: EASE_IOS }}
          >
            <NotificationsPanel
              isIOS={isIOS}
              isInstalled={isInstalled}
              isInstallable={isInstallable}
              onInstallApp={onInstallApp}
              permission={pushPermission}
              needsIOSHomeScreen={needsIOSHomeScreen}
              hasPushManager={hasPushManager}
              preferences={pushPreferences}
              subscriptionJson={subscriptionJson}
              busy={pushBusy}
              onUpdatePreferences={onUpdatePushPreferences}
              onRequestPermission={onRequestPushPermission}
              onSendTestNotification={onSendTestNotification}
              onSubscribeWebPush={onSubscribeWebPush}
              onUnsubscribeWebPush={onUnsubscribeWebPush}
              onNotifyFeedback={onNotifyFeedback}
            />
          </motion.div>
        ) : (
          <motion.div
            key="subtab-geral"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2, ease: EASE_IOS }}
            className="space-y-4"
          >
            {/* Monthly Budget Form + Smart 3-Month Recommendation Bar */}
            <form
              onSubmit={handleSaveBudget}
              className="glass-surface space-y-4 overflow-hidden rounded-[28px] p-4 sm:p-6"
            >
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Meta de orçamento mensal
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Define o teto usado na barra de progresso e nos alertas automáticos de 80% e 100%.
                </p>
              </div>

              <div className="flex flex-col gap-2.5 sm:flex-row">
                <div className="relative flex-1">
                  <span
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-mono text-sm text-slate-400"
                    aria-hidden="true"
                  >
                    R$
                  </span>
                  <input
                    id="cfg-budget"
                    type="text"
                    inputMode="decimal"
                    aria-label="Meta de orçamento mensal em reais"
                    value={budgetInput}
                    onChange={(e) => setBudgetInput(e.target.value)}
                    placeholder="3500,00"
                    className="glass-input h-11 w-full rounded-full pl-11 pr-4 font-mono text-sm text-slate-900 tabular-nums placeholder:text-slate-400 transition-colors focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-emerald-500"
                  />
                </div>

                <motion.button
                  type="submit"
                  whileTap={{ scale: 0.97 }}
                  className="glass-accent h-11 whitespace-nowrap rounded-full px-5 text-xs font-semibold text-white transition-all dark:text-slate-950"
                >
                  Salvar meta
                </motion.button>
              </div>

              {/* Smart Recommendation Bar directly below the budget input */}
              <div className="glass-inset rounded-[20px] p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                    <Sparkles className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span>
                      {budgetRecommendation?.source === 'current-month'
                        ? 'Recomendação · Baseada no mês atual'
                        : 'Recomendação inteligente · Média dos últimos 3 meses'}
                    </span>
                  </div>

                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.9 }}
                    onClick={onRefreshRecommendation}
                    disabled={loadingRecommendation}
                    aria-label="Recalcular recomendação de orçamento"
                    title="Recalcular com base nos últimos 3 meses"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-200/70 hover:text-slate-700 disabled:opacity-50 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${loadingRecommendation ? 'animate-spin' : ''}`}
                    />
                  </motion.button>
                </div>

                {loadingRecommendation && !budgetRecommendation ? (
                  <div className="mt-3 space-y-2.5">
                    <div className="h-5 w-36 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                    <div className="h-2 w-full animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
                    <div className="h-3 w-48 animate-pulse rounded bg-slate-200/80 dark:bg-slate-800/80" />
                  </div>
                ) : !budgetRecommendation || budgetRecommendation.source === 'empty' ? (
                  <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    Ainda não há histórico suficiente nos últimos 3 meses para calcular uma sugestão automática. Registre suas saídas para liberar a recomendação.
                  </p>
                ) : (
                  <div className="mt-3 space-y-3">
                    {/* Suggested Value + 1-Tap Apply CTA */}
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <div>
                        <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                          Meta sugerida
                          {budgetRecommendation.source === 'last-3-months' &&
                            budgetRecommendation.monthsWithData < 3 && (
                              <> · {budgetRecommendation.monthsWithData} {budgetRecommendation.monthsWithData === 1 ? 'mês' : 'meses'} com dados</>
                            )}
                        </span>
                        <div className="mt-0.5 flex items-baseline gap-2">
                          <AnimatedMoney
                            value={budgetRecommendation.suggestedBudget}
                            hidden={privacyMode}
                            className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white"
                          />
                          {Math.abs(
                            budgetRecommendation.suggestedBudget -
                              budgetRecommendation.average
                          ) >= 0.01 && (
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">
                              média{' '}
                              <AnimatedMoney
                                value={budgetRecommendation.average}
                                hidden={privacyMode}
                                durationMs={0}
                                className="text-[11px] font-medium text-slate-600 dark:text-slate-300"
                              />
                            </span>
                          )}
                        </div>
                      </div>

                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.96 }}
                        onClick={handleApplySuggestedBudget}
                        disabled={liveComparison?.isExactSuggestion}
                        className={`inline-flex min-h-[34px] items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-xs font-semibold transition-all ${
                          liveComparison?.isExactSuggestion
                            ? 'bg-emerald-500/15 text-emerald-800 ring-1 ring-emerald-500/25 dark:bg-emerald-400/20 dark:text-emerald-300'
                            : 'glass-accent text-white dark:text-slate-950'
                        }`}
                      >
                        {liveComparison?.isExactSuggestion ? (
                          <>
                            <Check className="h-3.5 w-3.5" />
                            <span>Sugestão aplicada</span>
                          </>
                        ) : (
                          <span>Aplicar sugestão</span>
                        )}
                      </motion.button>
                    </div>

                    {/* Smart Comparison Bar against 3-month average */}
                    {liveComparison && (
                      <div className="space-y-1.5">
                        <div className="glass-track relative h-2.5 w-full overflow-hidden rounded-full p-[1px]">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${liveComparison.currentFillPct}%` }}
                            transition={{ duration: 0.45, ease: EASE_IOS }}
                            className={`h-full rounded-full ${
                              liveComparison.tone === 'amber'
                                ? 'bg-amber-500'
                                : liveComparison.tone === 'emerald'
                                  ? 'bg-emerald-600 dark:bg-emerald-400'
                                  : 'bg-slate-400'
                            }`}
                          />
                          {/* 3-month average reference marker */}
                          <div
                            style={{ left: `${liveComparison.avgMarkerPct}%` }}
                            title="Média dos últimos 3 meses"
                            aria-hidden="true"
                            className="absolute bottom-0 top-0 w-0.5 -translate-x-1/2 bg-slate-900/75 dark:bg-white/85"
                          />
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                          <span
                            className={`font-medium ${
                              liveComparison.tone === 'amber'
                                ? 'text-amber-700 dark:text-amber-400'
                                : liveComparison.tone === 'emerald'
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {liveComparison.statusLabel}
                          </span>
                          <span className="text-slate-400 dark:text-slate-500">
                            Marca vertical = média 3M
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Clean unboxed 3-month history breakdown */}
                    {budgetRecommendation.source === 'last-3-months' && (
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-slate-200/70 pt-2.5 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
                        {budgetRecommendation.months.map((m, idx) => (
                          <span key={m.ym} className="inline-flex items-center gap-1">
                            {idx > 0 && (
                              <span
                                aria-hidden="true"
                                className="mr-1 text-slate-300 dark:text-slate-600"
                              >
                                ·
                              </span>
                            )}
                            <span className="font-medium text-slate-600 dark:text-slate-300">
                              {m.label}
                            </span>
                            <AnimatedMoney
                              value={m.total}
                              hidden={privacyMode}
                              durationMs={0}
                              className="text-[11px] text-slate-500 dark:text-slate-400"
                            />
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {error && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-300"
                >
                  {error}
                </div>
              )}
            </form>

            {/* Focus / Privacy Mode Toggle Card */}
            <section className="glass-surface flex items-center justify-between gap-3 overflow-hidden rounded-[28px] p-4 sm:gap-4 sm:p-6">
              <div className="flex min-w-0 items-start gap-3">
                <span
                  className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${
                    privacyMode
                      ? 'glass-icon-orb bg-emerald-500/18 text-emerald-700 ring-1 ring-emerald-500/25 dark:bg-emerald-400/18 dark:text-emerald-300'
                      : 'glass-control text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {privacyMode ? (
                    <EyeOff className="h-[18px] w-[18px]" />
                  ) : (
                    <Eye className="h-[18px] w-[18px]" />
                  )}
                </span>
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Modo foco e privacidade
                  </h2>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    Oculta saldos, metas e valores monetários em toda a interface. Também acessível com 1 toque no topo.
                  </p>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={privacyMode}
                aria-label="Alternar modo foco e privacidade"
                onClick={onTogglePrivacyMode}
                className={`relative flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#050911] ${
                  privacyMode
                    ? 'justify-end bg-emerald-600 shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)] dark:bg-emerald-500'
                    : 'glass-track justify-start'
                }`}
              >
                <motion.span
                  layout
                  transition={{ type: 'spring', stiffness: 520, damping: 34 }}
                  className="h-5 w-5 rounded-full bg-white shadow-sm"
                />
              </button>
            </section>

            {/* Appearance Card: System / Light / Dark */}
            <section className="glass-surface overflow-hidden rounded-[28px] p-4 sm:p-6">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Aparência
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Acompanha automaticamente o tema do sistema ou fixa em claro/escuro.
              </p>

              <div
                className="glass-track mt-3.5 grid grid-cols-3 gap-1 rounded-full p-1"
                role="radiogroup"
                aria-label="Tema do aplicativo"
              >
                {(
                  [
                    { id: 'system', label: 'Automático', icon: Monitor },
                    { id: 'light', label: 'Claro', icon: Sun },
                    { id: 'dark', label: 'Escuro', icon: Moon },
                  ] as const
                ).map((option) => {
                  const Icon = option.icon;
                  const active = settings.theme === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => onChangeTheme(option.id)}
                      className={`relative flex min-h-[38px] min-w-0 items-center justify-center gap-1 whitespace-nowrap rounded-full px-1.5 text-[11.5px] font-semibold transition-colors sm:gap-1.5 sm:px-2.5 sm:text-xs ${
                        active
                          ? 'text-slate-900 dark:text-white'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId="settings-theme-pill"
                          transition={{ duration: 0.24, ease: EASE_IOS }}
                          className="glass-pill-active absolute inset-0 rounded-full"
                        />
                      )}
                      <Icon className="relative z-10 h-3.5 w-3.5 shrink-0" />
                      <span className="relative z-10 truncate">{option.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Liquid Glass Transparency Level Control */}
              <div className="mt-4 border-t border-slate-900/[0.06] pt-4 dark:border-white/[0.08]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Transparência Liquid Glass
                  </span>
                  <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                    {settings.glassClarity === 'cristal'
                      ? 'Máxima transparência'
                      : settings.glassClarity === 'sutil'
                        ? 'Mais opaco'
                        : 'Padrão'}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {settings.glassClarity === 'cristal'
                    ? 'Efeito cristal quase totalmente transparente, mantendo o contraste e a nitidez da leitura.'
                    : settings.glassClarity === 'sutil'
                      ? 'Acabamento mais fosco e encorpado para maior contraste em ambientes muito claros.'
                      : 'Equilíbrio clássico entre transparência de vidro líquido e legibilidade.'}
                </p>

                <div
                  className="glass-track mt-3 grid grid-cols-3 gap-1 rounded-full p-1"
                  role="radiogroup"
                  aria-label="Nível de transparência do vidro"
                >
                  {(
                    [
                      { id: 'sutil', label: 'Mais opaco', icon: Layers },
                      { id: 'equilibrado', label: 'Equilibrado', icon: Sparkles },
                      { id: 'cristal', label: 'Vidro cristal', icon: Droplets },
                    ] as const
                  ).map((option) => {
                    const Icon = option.icon;
                    const active = settings.glassClarity === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => onChangeGlassClarity(option.id)}
                        className={`relative flex min-h-[38px] min-w-0 items-center justify-center gap-1 whitespace-nowrap rounded-full px-1.5 text-[11.5px] font-semibold transition-colors sm:gap-1.5 sm:px-2.5 sm:text-xs ${
                          active
                            ? 'text-slate-900 dark:text-white'
                            : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                        }`}
                      >
                        {active && (
                          <motion.span
                            layoutId="settings-clarity-pill"
                            transition={{ duration: 0.24, ease: EASE_IOS }}
                            className="glass-pill-active absolute inset-0 rounded-full"
                          />
                        )}
                        <Icon className="relative z-10 h-3.5 w-3.5 shrink-0" />
                        <span className="relative z-10 truncate">{option.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* Automated Backend Sync Status (Read-Only — Configured via Console) */}
            <section className="glass-surface space-y-4 overflow-hidden rounded-[28px] p-4 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Sincronismo automático
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Conexão gerenciada pelo backend via console e variáveis de ambiente.
                  </p>
                </div>

                <motion.button
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  onClick={onSyncNow}
                  disabled={syncing}
                  className="glass-control inline-flex min-h-[36px] items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-xs font-semibold text-slate-700 transition-all disabled:opacity-50 dark:text-slate-200"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
                  <span>{syncing ? 'Sincronizando...' : 'Sincronizar agora'}</span>
                </motion.button>
              </div>

              {/* Live connection state summary */}
              <div className="glass-inset rounded-[20px] p-4">
                {!isOnline ? (
                  <div className="flex items-start gap-2.5 text-xs text-amber-700 dark:text-amber-400">
                    <Clock className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <p className="font-semibold">
                        Modo offline · cache SWR ativo
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                        Último snapshot salvo: {formatSyncTime(backendStatus.lastSyncedAt)}
                      </p>
                    </div>
                  </div>
                ) : backendStatus.connected ? (
                  <div className="flex items-start gap-2.5 text-xs text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <p className="font-semibold">
                        Conectado{backendStatus.spreadsheetName ? ` · ${backendStatus.spreadsheetName}` : ' à Planilha Google'}
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                        Último sincronismo: {formatSyncTime(backendStatus.lastSyncedAt)}
                      </p>
                    </div>
                  </div>
                ) : backendStatus.error ? (
                  <div className="flex items-start gap-2.5 text-xs text-red-700 dark:text-red-400">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <p className="font-semibold">Falha no sincronismo com o backend</p>
                      <p className="mt-0.5 text-slate-600 dark:text-slate-400">
                        {backendStatus.error}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-300">
                    <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <div>
                      <p className="font-semibold text-slate-800 dark:text-slate-100">
                        Aguardando ativação no console do servidor
                      </p>
                      <p className="mt-0.5 leading-relaxed text-slate-500 dark:text-slate-400">
                        Defina <code className="font-mono">APPS_SCRIPT_URL</code> e{' '}
                        <code className="font-mono">APPS_SCRIPT_TOKEN</code> nas variáveis de ambiente para sincronizar automaticamente com sua planilha.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Offline Sync Queue Banner (only shown when items are queued) */}
              {pendingSyncCount > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-amber-200 bg-amber-50/80 px-3.5 py-3 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                  <div className="flex items-center gap-2">
                    <CloudUpload className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span>
                      <strong>{pendingSyncCount}</strong>{' '}
                      {pendingSyncCount === 1
                        ? 'operação na fila offline'
                        : 'operações na fila offline'}{' '}
                      {isOnline ? 'aguardando envio.' : '— envio automático ao reconectar.'}
                    </span>
                  </div>
                  {isOnline && (
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.96 }}
                      onClick={onFlushQueue}
                      disabled={isFlushingQueue}
                      className="inline-flex min-h-[32px] items-center gap-1.5 whitespace-nowrap rounded-lg bg-amber-600 px-3 text-[11px] font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-60 dark:bg-amber-500 dark:text-slate-950 dark:hover:bg-amber-400"
                    >
                      <RefreshCw className={`h-3 w-3 ${isFlushingQueue ? 'animate-spin' : ''}`} />
                      <span>{isFlushingQueue ? 'Enviando...' : 'Enviar agora'}</span>
                    </motion.button>
                  )}
                </div>
              )}

              {/* Auto-Sync Interval Picker */}
              <div className="border-t border-slate-900/[0.06] pt-4 dark:border-white/[0.08]">
                <span className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Frequência de atualização automática
                </span>
                <div
                  className="glass-track mt-2.5 grid grid-cols-4 gap-1 rounded-full p-1"
                  role="radiogroup"
                  aria-label="Intervalo de sincronização automática"
                >
                  {SYNC_INTERVAL_OPTIONS.map((opt) => {
                    const active = settings.autoSyncSeconds === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => handleChangeSyncInterval(opt.value)}
                        className={`relative min-h-[36px] whitespace-nowrap rounded-full text-xs font-semibold transition-colors ${
                          active
                            ? 'text-slate-900 dark:text-white'
                            : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                        }`}
                      >
                        {active && (
                          <motion.span
                            layoutId="settings-sync-pill"
                            transition={{ duration: 0.24, ease: EASE_IOS }}
                            className="glass-pill-active absolute inset-0 rounded-full"
                          />
                        )}
                        <span className="relative z-10">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PIN Setup / Change Modal */}
      <AnimatePresence>
        {showPinModal && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-surface w-full max-w-sm rounded-3xl p-6 border border-white/15 text-left text-slate-900 dark:text-white shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <KeyRound className="h-5 w-5 text-emerald-500" />
                  <h3 className="text-base font-bold">
                    {pinModalMode === 'disable'
                      ? 'Desativar Bloqueio'
                      : pinModalMode === 'change'
                        ? 'Alterar PIN de Segurança'
                        : 'Definir PIN de Segurança'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPinModal(false)}
                  className="rounded-full p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <p className="mt-2 text-xs text-slate-500 dark:text-slate-300 leading-relaxed">
                {pinModalMode === 'disable'
                  ? 'Digite seu PIN atual de 4 dígitos para confirmar a desativação.'
                  : 'O PIN numérico de 4 dígitos serve para desbloquear o app e como alternativa à biometria.'}
              </p>

              <form onSubmit={handlePinModalSubmit} className="mt-4 space-y-3">
                {(pinModalMode === 'disable' || (pinModalMode === 'change' && lockConfig.pinHash)) && (
                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                      PIN Atual (4 dígitos)
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      required
                      value={currentPinInput}
                      onChange={(e) => setCurrentPinInput(e.target.value.replace(/\D/g, ''))}
                      placeholder="••••"
                      className="mt-1 flex w-full rounded-xl bg-white/50 dark:bg-white/10 px-3.5 py-2 font-mono text-center text-lg tracking-widest text-slate-900 dark:text-white border border-slate-200 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      autoFocus
                    />
                  </div>
                )}

                {pinModalMode !== 'disable' && (
                  <>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                        Novo PIN (4 dígitos)
                      </label>
                      <input
                        type="password"
                        inputMode="numeric"
                        maxLength={4}
                        required
                        value={newPinInput}
                        onChange={(e) => setNewPinInput(e.target.value.replace(/\D/g, ''))}
                        placeholder="••••"
                        className="mt-1 flex w-full rounded-xl bg-white/50 dark:bg-white/10 px-3.5 py-2 font-mono text-center text-lg tracking-widest text-slate-900 dark:text-white border border-slate-200 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        autoFocus={pinModalMode === 'create'}
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                        Confirmar Novo PIN
                      </label>
                      <input
                        type="password"
                        inputMode="numeric"
                        maxLength={4}
                        required
                        value={confirmPinInput}
                        onChange={(e) => setConfirmPinInput(e.target.value.replace(/\D/g, ''))}
                        placeholder="••••"
                        className="mt-1 flex w-full rounded-xl bg-white/50 dark:bg-white/10 px-3.5 py-2 font-mono text-center text-lg tracking-widest text-slate-900 dark:text-white border border-slate-200 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </>
                )}

                {pinModalError && (
                  <p className="text-xs text-red-600 dark:text-red-400 font-medium">
                    {pinModalError}
                  </p>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowPinModal(false)}
                    className="flex-1 min-h-[42px] rounded-xl border border-slate-200 dark:border-white/15 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={
                      pinModalBusy ||
                      (pinModalMode === 'disable'
                        ? currentPinInput.length !== 4
                        : newPinInput.length !== 4 || confirmPinInput.length !== 4)
                    }
                    className="flex-1 min-h-[42px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition-colors disabled:opacity-40"
                  >
                    {pinModalBusy ? 'Salvando...' : pinModalMode === 'disable' ? 'Desativar' : 'Salvar PIN'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
