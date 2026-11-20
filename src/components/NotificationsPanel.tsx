import { useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  Bell,
  BellOff,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Send,
  Share,
  Smartphone,
  Trash2,
} from 'lucide-react';
import type { PushPermissionState } from '../hooks/usePushNotifications';
import type { PushPreferences } from '../types';

interface NotificationsPanelProps {
  isIOS: boolean;
  isInstalled: boolean;
  isInstallable: boolean;
  onInstallApp: () => Promise<boolean>;
  permission: PushPermissionState;
  needsIOSHomeScreen: boolean;
  hasPushManager: boolean;
  preferences: PushPreferences;
  subscriptionJson: string | null;
  busy: boolean;
  onUpdatePreferences: (patch: Partial<PushPreferences>) => void;
  onRequestPermission: () => Promise<{ ok: boolean; message: string }>;
  onSendTestNotification: () => Promise<{ ok: boolean; message: string }>;
  onSubscribeWebPush: (vapidKey: string) => Promise<{ ok: boolean; message: string }>;
  onUnsubscribeWebPush: () => Promise<{ ok: boolean; message: string }>;
  onNotifyFeedback: (type: 'success' | 'error' | 'info', text: string) => void;
}

export function NotificationsPanel({
  isIOS,
  isInstalled,
  isInstallable,
  onInstallApp,
  permission,
  needsIOSHomeScreen,
  hasPushManager,
  preferences,
  subscriptionJson,
  busy,
  onUpdatePreferences,
  onRequestPermission,
  onSendTestNotification,
  onSubscribeWebPush,
  onUnsubscribeWebPush,
  onNotifyFeedback,
}: NotificationsPanelProps) {
  const [showVapid, setShowVapid] = useState(false);
  const [vapidInput, setVapidInput] = useState(preferences.vapidPublicKey);
  const [copiedSub, setCopiedSub] = useState(false);
  const [showIOSGuideModal, setShowIOSGuideModal] = useState(false);

  const isGranted = permission === 'granted' && !needsIOSHomeScreen;

  const handleEnablePush = async () => {
    const res = await onRequestPermission();
    onNotifyFeedback(res.ok ? 'success' : 'error', res.message);
  };

  const handleSendTest = async () => {
    const res = await onSendTestNotification();
    onNotifyFeedback(res.ok ? 'success' : 'error', res.message);
  };

  const handleSubscribe = async () => {
    const res = await onSubscribeWebPush(vapidInput);
    onNotifyFeedback(res.ok ? 'success' : 'error', res.message);
  };

  const handleUnsubscribe = async () => {
    const res = await onUnsubscribeWebPush();
    onNotifyFeedback(res.ok ? 'info' : 'error', res.message);
  };

  const handleCopySubscription = async () => {
    if (!subscriptionJson) return;
    try {
      await navigator.clipboard.writeText(subscriptionJson);
      setCopiedSub(true);
      setTimeout(() => setCopiedSub(false), 2000);
    } catch {
      onNotifyFeedback('error', 'Não foi possível copiar o JSON.');
    }
  };

  const handleInstallClick = async () => {
    const accepted = await onInstallApp();
    if (accepted) {
      onNotifyFeedback('success', 'Rumo instalado com sucesso.');
    }
  };

  return (
    <section aria-label="Central de notificações push" className="mx-auto max-w-3xl space-y-4">
      {/* Status & iOS Compatibility Card */}
      <div className="glass-surface overflow-hidden rounded-[28px] p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
                isGranted
                  ? 'glass-icon-orb bg-emerald-500/18 text-emerald-700 ring-1 ring-emerald-500/25 dark:bg-emerald-400/18 dark:text-emerald-300'
                  : 'glass-control text-slate-700 dark:text-slate-200'
              }`}
              aria-hidden="true"
            >
              {isGranted ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
            </div>

            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-white">
                Notificações Push (iOS e Web)
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                Receba alertas no celular quando suas saídas atingirem 80% ou ultrapassarem a meta mensal. Compatível com iPhone/iPad (iOS 16.4+) instalado na Tela de Início.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!isGranted ? (
              <button
                type="button"
                onClick={handleEnablePush}
                disabled={busy}
                className="glass-accent inline-flex min-h-[42px] items-center gap-2 whitespace-nowrap rounded-full px-4 text-xs font-semibold text-white transition-all disabled:opacity-50 dark:text-slate-950"
              >
                <Bell className="h-4 w-4" />
                <span>Ativar notificações push</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSendTest}
                disabled={busy}
                className="glass-accent inline-flex min-h-[42px] items-center gap-2 whitespace-nowrap rounded-full px-4 text-xs font-semibold text-white transition-all disabled:opacity-50 dark:text-slate-950"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Enviar notificação de teste</span>
              </button>
            )}
          </div>
        </div>

        {/* Explicit State Feedback Row */}
        <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800/80">
          {isGranted ? (
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>
                Push ativo neste dispositivo via Service Worker
                {isInstalled ? ' (App instalado na Tela de Início).' : '.'}
              </span>
            </div>
          ) : needsIOSHomeScreen ? (
            <div className="space-y-3 rounded-xl border border-amber-200/80 bg-amber-50/70 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
              <div className="flex items-start gap-2.5 text-xs font-medium text-amber-900 dark:text-amber-300">
                <Smartphone className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-semibold">Ação necessária no iPhone / iPad</p>
                  <p className="mt-1 font-normal leading-relaxed text-amber-800 dark:text-amber-200/85">
                    O iOS exige que o aplicativo seja salvo na Tela de Início para liberar notificações push nativas:
                  </p>
                </div>
              </div>
              <ol className="list-decimal space-y-1.5 pl-6 text-xs text-amber-900 dark:text-amber-200">
                <li>
                  No Safari, toque no botão <strong>Compartilhar</strong>{' '}
                  <Share className="inline h-3.5 w-3.5 align-text-bottom" /> na barra inferior.
                </li>
                <li>
                  Role para baixo e toque em <strong>Adicionar à Tela de Início</strong>.
                </li>
                <li>
                  Feche o Safari, abra o <strong>Rumo</strong> pelo novo ícone na Tela de Início e toque em <strong>Ativar notificações push</strong>.
                </li>
              </ol>
            </div>
          ) : permission === 'denied' ? (
            <div className="flex items-start gap-2 text-xs font-medium text-red-700 dark:text-red-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Permissão bloqueada pelo sistema. Abra os Ajustes do navegador ou do iOS e permita notificações para este app.
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
              <span>
                Status atual: aguardando permissão. Toque em ativar para autorizar alertas do sistema.
              </span>

              {!isInstalled && isInstallable && (
                <button
                  type="button"
                  onClick={handleInstallClick}
                  className="glass-control inline-flex min-h-[36px] items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-xs font-semibold text-slate-700 dark:text-slate-200"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Instalar aplicativo</span>
                </button>
              )}

              {!isInstalled && !isInstallable && !isIOS && (
                <button
                  type="button"
                  onClick={() => setShowIOSGuideModal(true)}
                  className="glass-control inline-flex min-h-[36px] items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-xs font-semibold text-slate-700 dark:text-slate-200"
                >
                  <Smartphone className="h-3.5 w-3.5" />
                  <span>Como instalar no iOS</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Automatic Budget & Reminder Rules */}
      <div className="glass-surface overflow-hidden rounded-[28px] p-4 sm:p-6">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
          Gatilhos de notificação
        </h3>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Escolha quais eventos financeiros disparam alertas no dispositivo.
        </p>

        <div className="mt-4 divide-y divide-slate-900/[0.06] dark:divide-white/[0.07]">
          <div className="flex min-h-[58px] items-center justify-between gap-3 py-3 sm:gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                Aviso ao atingir 80% da meta mensal
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Dispara alerta preventivo ao registrar uma saída que aproxime do limite.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={preferences.budgetAlert80}
              aria-label="Aviso ao atingir 80% da meta mensal"
              onClick={() => onUpdatePreferences({ budgetAlert80: !preferences.budgetAlert80 })}
              className={`relative flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                preferences.budgetAlert80
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
          </div>

          <div className="flex min-h-[58px] items-center justify-between gap-3 py-3 sm:gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                Alerta de meta excedida (100%)
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Notifica imediatamente se o total de saídas do mês ultrapassar o orçamento.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={preferences.budgetAlert100}
              aria-label="Alerta de meta excedida (100%)"
              onClick={() => onUpdatePreferences({ budgetAlert100: !preferences.budgetAlert100 })}
              className={`relative flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                preferences.budgetAlert100
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
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 py-3 sm:gap-4">
            <div className="flex min-w-0 flex-1 items-center justify-between gap-3 sm:gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  Lembrete diário de saídas manuais
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Preferência salva para lembrar de lançar Pix e dinheiro no fim do dia.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={preferences.dailyReminder}
                aria-label="Lembrete diário de saídas manuais"
                onClick={() => onUpdatePreferences({ dailyReminder: !preferences.dailyReminder })}
                className={`relative flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                  preferences.dailyReminder
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
            </div>

            {preferences.dailyReminder && (
              <input
                type="time"
                aria-label="Horário do lembrete diário"
                value={preferences.dailyReminderTime}
                onChange={(e) =>
                  onUpdatePreferences({ dailyReminderTime: e.target.value })
                }
                className="glass-input h-10 rounded-full px-3.5 font-mono text-xs text-slate-900 tabular-nums dark:text-white"
              />
            )}
          </div>
        </div>
      </div>

      {/* Advanced Web Push VAPID / APNs Subscription */}
      {hasPushManager && (
        <div className="glass-surface overflow-hidden rounded-[28px]">
          <button
            type="button"
            onClick={() => setShowVapid((prev) => !prev)}
            className="flex min-h-[56px] w-full items-center justify-between gap-3 px-4 py-3.5 text-left sm:px-6"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                Integração Web Push em segundo plano (VAPID / Apple APNs)
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Opcional: gere o token de inscrição PushSubscription para disparar pushes remotos mesmo com o app fechado.
              </p>
            </div>
            {showVapid ? (
              <ChevronUp className="h-4 w-4 shrink-0 text-slate-500" />
            ) : (
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
            )}
          </button>

          {showVapid && (
            <div className="space-y-4 border-t border-slate-900/[0.06] px-5 py-4 sm:px-6 dark:border-white/[0.08]">
              <div>
                <label
                  htmlFor="vapid-public-key"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Chave Pública VAPID (Base64 URL-safe)
                </label>
                <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
                  <input
                    id="vapid-public-key"
                    type="text"
                    value={vapidInput}
                    onChange={(e) => setVapidInput(e.target.value)}
                    placeholder="BEl62iUYgUivxIkv69yViEuiBIa..."
                    className="glass-input h-11 flex-1 rounded-full px-4 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={handleSubscribe}
                    disabled={busy || needsIOSHomeScreen}
                    className="glass-accent min-h-[44px] whitespace-nowrap rounded-full px-4 text-xs font-semibold text-white transition-all disabled:opacity-50 dark:text-slate-950"
                  >
                    Registrar dispositivo
                  </button>
                </div>
              </div>

              {subscriptionJson && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Inscrição ativa (PushSubscription JSON)
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleCopySubscription}
                        className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        {copiedSub ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-500" />
                            <span>Copiado</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            <span>Copiar JSON</span>
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={handleUnsubscribe}
                        disabled={busy}
                        className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-red-200 px-2.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/40"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Revogar</span>
                      </button>
                    </div>
                  </div>
                  <pre className="max-h-44 overflow-auto rounded-xl bg-slate-950 p-3 font-mono text-[11px] leading-relaxed text-slate-200">
                    <code>{subscriptionJson}</code>
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* iOS Installation Guide Modal (accessible from desktop or non-installed info button) */}
      {showIOSGuideModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/38 backdrop-blur-sm sm:items-center sm:p-4 dark:bg-black/55"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ios-guide-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowIOSGuideModal(false);
          }}
        >
          <div className="glass-sheet w-full overflow-hidden rounded-t-[32px] p-6 sm:max-w-sm sm:rounded-[32px]">
            <h3
              id="ios-guide-title"
              className="text-base font-semibold text-slate-900 dark:text-white"
            >
              Instalar o Rumo no iPhone / iPad
            </h3>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              <li>Abra o aplicativo no <strong>Safari</strong> do iPhone ou iPad (iOS 16.4+).</li>
              <li>
                Toque no ícone <strong>Compartilhar</strong>{' '}
                <Share className="inline h-3.5 w-3.5 align-text-bottom" /> na barra inferior.
              </li>
              <li>
                Selecione <strong>Adicionar à Tela de Início</strong> e confirme em <strong>Adicionar</strong>.
              </li>
              <li>Abra o ícone do Rumo na Tela de Início e toque em <strong>Ativar notificações push</strong>.</li>
            </ol>
            <button
              type="button"
              onClick={() => setShowIOSGuideModal(false)}
              className="glass-accent mt-5 h-11 w-full rounded-full text-xs font-semibold text-white dark:text-slate-950"
            >
              Entendi
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
