import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  Delete,
  Fingerprint,
  KeyRound,
  Lock,
  RotateCcw,
  ScanFace,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { AppLockConfig } from '../types';
import {
  authenticateBiometrics,
  getBiometricLabel,
  getLockoutRemainingSeconds,
  isAppleDevice,
  recordFailedAttempt,
  resetFailedAttempts,
  resetLockWithToken,
  setSessionUnlocked,
  verifyPin,
} from '../services/security';

const EASE_IOS: [number, number, number, number] = [0.16, 1, 0.3, 1];

interface LockScreenProps {
  lockConfig: AppLockConfig;
  onUnlock: () => void;
}

export function LockScreen({ lockConfig, onUnlock }: LockScreenProps) {
  const [pin, setPin] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [lockoutSeconds, setLockoutSeconds] = useState(getLockoutRemainingSeconds());
  const [mode, setMode] = useState<'biometric' | 'pin'>(
    lockConfig.biometricEnabled ? 'biometric' : 'pin'
  );

  // Recovery modal state
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryToken, setRecoveryToken] = useState('');
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoveryBusy, setRecoveryBusy] = useState(false);

  const biometricLabel = getBiometricLabel();
  const isApple = isAppleDevice();
  const BiometricIcon = isApple ? ScanFace : Fingerprint;

  // Lockout countdown timer
  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const interval = setInterval(() => {
      const remaining = getLockoutRemainingSeconds();
      setLockoutSeconds(remaining);
      if (remaining <= 0) {
        resetFailedAttempts();
        setErrorMsg(null);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutSeconds]);

  // Prompt biometrics on mount if configured
  useEffect(() => {
    if (lockConfig.biometricEnabled && mode === 'biometric' && lockoutSeconds <= 0) {
      void handleBiometricAuth();
    }
  }, []);

  const triggerHaptic = () => {
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(15);
      }
    } catch {
      // Ignora falhas de haptics
    }
  };

  const handleBiometricAuth = async () => {
    if (lockoutSeconds > 0 || isVerifying) return;
    setIsVerifying(true);
    setErrorMsg(null);

    try {
      const success = await authenticateBiometrics(lockConfig.biometricCredentialId);
      if (success) {
        triggerHaptic();
        setSessionUnlocked(true);
        onUnlock();
      } else {
        setErrorMsg('Biometria não reconhecida. Use seu PIN.');
        setMode('pin');
      }
    } catch {
      setErrorMsg('Falha na autenticação biométrica.');
      setMode('pin');
    } finally {
      setIsVerifying(false);
    }
  };

  const handlePinInput = async (digit: string) => {
    if (lockoutSeconds > 0 || isVerifying) return;
    if (pin.length >= 4) return;

    triggerHaptic();
    const nextPin = pin + digit;
    setPin(nextPin);
    setErrorMsg(null);

    if (nextPin.length === 4) {
      setIsVerifying(true);
      try {
        if (!lockConfig.pinHash || !lockConfig.pinSalt) {
          setErrorMsg('PIN não configurado.');
          setIsVerifying(false);
          return;
        }

        const valid = await verifyPin(nextPin, lockConfig.pinSalt, lockConfig.pinHash);
        if (valid) {
          triggerHaptic();
          setSessionUnlocked(true);
          onUnlock();
        } else {
          const { isLockedOut, remainingSeconds } = recordFailedAttempt();
          setShake(true);
          setTimeout(() => setShake(false), 500);
          setPin('');

          if (isLockedOut) {
            setLockoutSeconds(remainingSeconds);
            setErrorMsg(`Muitas tentativas. Bloqueado por ${remainingSeconds}s.`);
          } else {
            setErrorMsg('PIN incorreto. Tente novamente.');
          }
        }
      } catch {
        setErrorMsg('Erro ao verificar PIN.');
        setPin('');
      } finally {
        setIsVerifying(false);
      }
    }
  };

  const handleBackspace = () => {
    if (pin.length > 0) {
      triggerHaptic();
      setPin((prev) => prev.slice(0, -1));
      setErrorMsg(null);
    }
  };

  const handleClearPin = () => {
    triggerHaptic();
    setPin('');
    setErrorMsg(null);
  };

  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryError(null);
    setRecoveryBusy(true);

    try {
      const ok = await resetLockWithToken(recoveryToken);
      if (ok) {
        setShowRecovery(false);
        onUnlock();
      } else {
        setRecoveryError('Token de API incorreto. Verifique as configurações.');
      }
    } catch {
      setRecoveryError('Falha ao redefinir segurança.');
    } finally {
      setRecoveryBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tela de bloqueio do Rumo"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-3xl bg-slate-950/80 transition-colors select-none"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.28, ease: EASE_IOS }}
        className="glass-surface relative w-full max-w-sm rounded-[32px] p-6 text-center shadow-2xl border border-white/10 dark:border-white/15"
      >
        {/* Shield Icon Badge */}
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-500 dark:text-emerald-400 border border-emerald-500/20">
          <ShieldCheck className="h-8 w-8" />
        </div>

        <h2 className="mt-4 text-xl font-bold tracking-tight text-white">
          Rumo Protegido
        </h2>
        <p className="mt-1 text-xs text-slate-400">
          {lockoutSeconds > 0
            ? `Aguarde ${lockoutSeconds}s para tentar novamente`
            : mode === 'biometric' && lockConfig.biometricEnabled
              ? `Autentique com ${biometricLabel} para acessar`
              : 'Digite seu PIN de 4 dígitos'}
        </p>

        {/* PIN Dots Display */}
        <motion.div
          animate={shake ? { x: [-12, 12, -8, 8, -4, 4, 0] } : {}}
          transition={{ duration: 0.4 }}
          className="my-6 flex items-center justify-center gap-3.5"
        >
          {Array.from({ length: 4 }).map((_, idx) => {
            const filled = pin.length > idx;
            return (
              <div
                key={idx}
                className={`h-4 w-4 rounded-full border transition-all duration-200 ${
                  filled
                    ? 'border-emerald-400 bg-emerald-500 scale-110 shadow-sm shadow-emerald-500/50'
                    : 'border-white/25 bg-white/5'
                }`}
              />
            );
          })}
        </motion.div>

        {/* Error message */}
        <AnimatePresence>
          {errorMsg && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-3 py-1 text-xs font-medium text-red-400 border border-red-500/20"
            >
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{errorMsg}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Biometric Primary Button (quando em modo biométrico) */}
        {lockConfig.biometricEnabled && mode === 'biometric' && lockoutSeconds <= 0 && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => void handleBiometricAuth()}
              disabled={isVerifying}
              className="glass-accent flex w-full min-h-[52px] items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold text-white shadow-lg transition-transform active:scale-[0.98]"
            >
              <BiometricIcon className="h-5 w-5" />
              <span>Desbloquear com {biometricLabel}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('pin');
                setErrorMsg(null);
              }}
              className="flex w-full min-h-[44px] items-center justify-center gap-1.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white transition-colors"
            >
              <KeyRound className="h-3.5 w-3.5" />
              <span>Usar PIN de 4 dígitos</span>
            </button>
          </div>
        )}

        {/* Numeric Keypad (quando em modo PIN ou alternado) */}
        {mode === 'pin' && lockoutSeconds <= 0 && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => void handlePinInput(String(num))}
                  disabled={isVerifying}
                  className="flex h-14 w-full items-center justify-center rounded-2xl bg-white/[0.07] text-xl font-mono font-medium text-white shadow-sm border border-white/[0.08] transition-all hover:bg-white/[0.12] active:scale-95 active:bg-white/20"
                >
                  {num}
                </button>
              ))}

              <button
                type="button"
                onClick={handleClearPin}
                disabled={pin.length === 0}
                className="flex h-14 w-full items-center justify-center rounded-2xl text-xs font-semibold text-slate-400 transition-colors hover:text-white disabled:opacity-30"
                title="Limpar dígitos"
              >
                Limpar
              </button>

              <button
                type="button"
                onClick={() => void handlePinInput('0')}
                disabled={isVerifying}
                className="flex h-14 w-full items-center justify-center rounded-2xl bg-white/[0.07] text-xl font-mono font-medium text-white shadow-sm border border-white/[0.08] transition-all hover:bg-white/[0.12] active:scale-95 active:bg-white/20"
              >
                0
              </button>

              <button
                type="button"
                onClick={handleBackspace}
                disabled={pin.length === 0}
                className="flex h-14 w-full items-center justify-center rounded-2xl text-slate-300 transition-colors hover:text-white disabled:opacity-30 active:scale-95"
                title="Apagar dígito"
              >
                <Delete className="h-5 w-5" />
              </button>
            </div>

            {lockConfig.biometricEnabled && (
              <button
                type="button"
                onClick={() => {
                  setMode('biometric');
                  void handleBiometricAuth();
                }}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                <BiometricIcon className="h-3.5 w-3.5" />
                <span>Voltar para {biometricLabel}</span>
              </button>
            )}
          </div>
        )}

        {/* Recovery Link */}
        <div className="mt-5 border-t border-white/[0.08] pt-3">
          <button
            type="button"
            onClick={() => {
              setRecoveryError(null);
              setRecoveryToken('');
              setShowRecovery(true);
            }}
            className="text-[11px] font-medium text-slate-400 hover:text-slate-200 transition-colors"
          >
            Esqueci meu PIN ou biometria indisponível
          </button>
        </div>
      </motion.div>

      {/* Recovery Modal */}
      <AnimatePresence>
        {showRecovery && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-surface w-full max-w-sm rounded-3xl p-6 border border-white/15 text-left text-white shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <RotateCcw className="h-5 w-5 text-amber-400" />
                  <h3 className="text-base font-bold">Recuperar Acesso</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowRecovery(false)}
                  className="rounded-full p-1 text-slate-400 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <p className="mt-2 text-xs text-slate-300 leading-relaxed">
                Para redefinir o PIN de segurança, digite o <strong>Token de API</strong> compartilhado
                com a Planilha Google (configurado no Apps Script ou .env).
              </p>

              <form onSubmit={handleRecoverySubmit} className="mt-4 space-y-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-300">
                    Token de API (API_TOKEN)
                  </label>
                  <input
                    type="password"
                    value={recoveryToken}
                    onChange={(e) => setRecoveryToken(e.target.value)}
                    placeholder="Cole seu token secreto"
                    className="mt-1 flex w-full rounded-xl bg-white/10 px-3 py-2 text-xs text-white placeholder-slate-500 border border-white/10 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    autoFocus
                  />
                </div>

                {recoveryError && (
                  <p className="text-xs text-red-400 font-medium">
                    {recoveryError}
                  </p>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowRecovery(false)}
                    className="flex-1 min-h-[40px] rounded-xl border border-white/15 text-xs font-semibold text-slate-300 hover:bg-white/5"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={recoveryBusy || !recoveryToken.trim()}
                    className="flex-1 min-h-[40px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition-colors disabled:opacity-40"
                  >
                    {recoveryBusy ? 'Verificando...' : 'Redefinir PIN'}
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
