import { useCallback, useEffect, useState } from 'react';
import type { PushPreferences } from '../types';

const PUSH_PREFS_KEY = 'rumo_push_prefs_v1';

const DEFAULT_PUSH_PREFS: PushPreferences = {
  budgetAlert80: true,
  budgetAlert100: true,
  dailyReminder: false,
  dailyReminderTime: '20:00',
  vapidPublicKey: '',
};

function loadPushPreferences(): PushPreferences {
  try {
    const raw = localStorage.getItem(PUSH_PREFS_KEY);
    if (!raw) return { ...DEFAULT_PUSH_PREFS };
    const parsed = JSON.parse(raw) as Partial<PushPreferences>;
    return {
      budgetAlert80:
        typeof parsed.budgetAlert80 === 'boolean'
          ? parsed.budgetAlert80
          : DEFAULT_PUSH_PREFS.budgetAlert80,
      budgetAlert100:
        typeof parsed.budgetAlert100 === 'boolean'
          ? parsed.budgetAlert100
          : DEFAULT_PUSH_PREFS.budgetAlert100,
      dailyReminder:
        typeof parsed.dailyReminder === 'boolean'
          ? parsed.dailyReminder
          : DEFAULT_PUSH_PREFS.dailyReminder,
      dailyReminderTime:
        typeof parsed.dailyReminderTime === 'string' && parsed.dailyReminderTime
          ? parsed.dailyReminderTime
          : DEFAULT_PUSH_PREFS.dailyReminderTime,
      vapidPublicKey:
        typeof parsed.vapidPublicKey === 'string' ? parsed.vapidPublicKey : '',
    };
  } catch {
    return { ...DEFAULT_PUSH_PREFS };
  }
}

function savePushPreferences(prefs: PushPreferences): void {
  try {
    localStorage.setItem(PUSH_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage quota issues
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export type PushPermissionState = NotificationPermission | 'unsupported';

export function usePushNotifications(isIOS: boolean, isStandalone: boolean) {
  const [preferences, setPreferences] = useState<PushPreferences>(() =>
    loadPushPreferences()
  );
  const [permission, setPermission] = useState<PushPermissionState>('default');
  const [subscriptionJson, setSubscriptionJson] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const hasServiceWorker =
    typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
  const hasNotificationApi =
    typeof window !== 'undefined' && 'Notification' in window;
  const hasPushManager =
    typeof window !== 'undefined' && 'PushManager' in window;

  // On iOS 16.4+, Web Push & Notification API are only exposed when installed to Home Screen (standalone)
  const needsIOSHomeScreen = isIOS && !isStandalone;
  const isSupported = hasNotificationApi && hasServiceWorker;

  useEffect(() => {
    if (!hasNotificationApi) {
      setPermission('unsupported');
      return;
    }
    setPermission(Notification.permission);

    // Check existing PushSubscription if PushManager is available
    if (hasServiceWorker && hasPushManager) {
      navigator.serviceWorker.ready
        .then((reg) => reg.pushManager.getSubscription())
        .then((sub) => {
          if (sub) {
            setSubscriptionJson(JSON.stringify(sub.toJSON(), null, 2));
          }
        })
        .catch(() => {
          // Ignore if SW is not active yet
        });
    }
  }, [hasNotificationApi, hasServiceWorker, hasPushManager]);

  const updatePreferences = useCallback((patch: Partial<PushPreferences>) => {
    setPreferences((prev) => {
      const next = { ...prev, ...patch };
      savePushPreferences(next);
      return next;
    });
  }, []);

  const requestPermission = useCallback(async (): Promise<{
    ok: boolean;
    message: string;
  }> => {
    if (needsIOSHomeScreen) {
      return {
        ok: false,
        message:
          'No iPhone/iPad, adicione o Rumo à Tela de Início pelo Safari e abra-o pelo ícone instalado para ativar notificações push.',
      };
    }

    if (!hasNotificationApi) {
      setPermission('unsupported');
      return {
        ok: false,
        message: 'Este navegador não oferece suporte a notificações push.',
      };
    }

    setBusy(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === 'granted') {
        return { ok: true, message: 'Notificações push ativadas com sucesso.' };
      }
      if (result === 'denied') {
        return {
          ok: false,
          message:
            'Permissão negada. Libere as notificações para o Rumo nos Ajustes do aparelho ou navegador.',
        };
      }
      return { ok: false, message: 'Permissão de notificação não concedida.' };
    } catch {
      return {
        ok: false,
        message: 'Não foi possível solicitar permissão de notificação.',
      };
    } finally {
      setBusy(false);
    }
  }, [needsIOSHomeScreen, hasNotificationApi]);

  const sendNotification = useCallback(
    async (
      title: string,
      body: string,
      tag = 'rumo-alert'
    ): Promise<{ ok: boolean; message: string }> => {
      if (needsIOSHomeScreen) {
        return {
          ok: false,
          message: 'Instale o app na Tela de Início do iOS para receber notificações.',
        };
      }

      if (!hasNotificationApi || Notification.permission !== 'granted') {
        return {
          ok: false,
          message: 'Ative as notificações push antes de enviar um alerta.',
        };
      }

      try {
        // iOS PWA strictly requires ServiceWorkerRegistration.showNotification()
        if (hasServiceWorker) {
          const registration = await navigator.serviceWorker.ready;
          await registration.showNotification(title, {
            body,
            icon: '/pwa-192x192.png',
            badge: '/pwa-192x192.png',
            tag,
            data: { url: '/' },
          });
          return { ok: true, message: 'Notificação push enviada.' };
        }

        // Fallback for non-SW desktop environments
        new Notification(title, {
          body,
          icon: '/pwa-192x192.png',
          tag,
        });
        return { ok: true, message: 'Notificação enviada.' };
      } catch {
        return {
          ok: false,
          message:
            'Não foi possível exibir a notificação. Verifique as permissões do sistema.',
        };
      }
    },
    [needsIOSHomeScreen, hasNotificationApi, hasServiceWorker]
  );

  const subscribeWebPush = useCallback(
    async (vapidPublicKey: string): Promise<{ ok: boolean; message: string }> => {
      const trimmedKey = vapidPublicKey.trim();
      if (!trimmedKey) {
        return {
          ok: false,
          message: 'Informe a chave pública VAPID para gerar a inscrição Web Push.',
        };
      }

      if (!hasServiceWorker || !hasPushManager) {
        return {
          ok: false,
          message: 'PushManager não está disponível neste ambiente.',
        };
      }

      if (Notification.permission !== 'granted') {
        const perm = await requestPermission();
        if (!perm.ok) return perm;
      }

      setBusy(true);
      try {
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        if (existing) {
          await existing.unsubscribe();
        }
        const keyBytes = urlBase64ToUint8Array(trimmedKey);
        const sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyBytes.buffer as ArrayBuffer,
        });
        const serialized = JSON.stringify(sub.toJSON(), null, 2);
        setSubscriptionJson(serialized);
        updatePreferences({ vapidPublicKey: trimmedKey });
        return {
          ok: true,
          message: 'Inscrição Web Push (APNs/FCM) gerada com sucesso.',
        };
      } catch {
        return {
          ok: false,
          message:
            'Chave VAPID inválida ou PushManager bloqueado. Verifique a chave pública em Base64 URL-safe.',
        };
      } finally {
        setBusy(false);
      }
    },
    [hasServiceWorker, hasPushManager, requestPermission, updatePreferences]
  );

  const unsubscribeWebPush = useCallback(async (): Promise<{
    ok: boolean;
    message: string;
  }> => {
    if (!hasServiceWorker || !hasPushManager) {
      setSubscriptionJson(null);
      return { ok: true, message: 'Inscrição removida.' };
    }
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        await existing.unsubscribe();
      }
      setSubscriptionJson(null);
      return { ok: true, message: 'Inscrição Web Push cancelada.' };
    } catch {
      return { ok: false, message: 'Erro ao cancelar inscrição Web Push.' };
    } finally {
      setBusy(false);
    }
  }, [hasServiceWorker, hasPushManager]);

  return {
    preferences,
    updatePreferences,
    permission,
    isSupported,
    needsIOSHomeScreen,
    hasPushManager,
    subscriptionJson,
    busy,
    requestPermission,
    sendNotification,
    subscribeWebPush,
    unsubscribeWebPush,
  };
}
