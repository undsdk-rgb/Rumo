import type { AppLockConfig, AutoLockTimeout } from '../types';
import { getAppsScriptConfig } from './api';

const LOCK_STORAGE_KEY = 'rumo_app_lock_v1';
const DB_NAME = 'rumo_security_db';
const DB_STORE = 'security_store';
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_SECONDS = 30;

export const DEFAULT_LOCK_CONFIG: AppLockConfig = {
  enabled: false,
  biometricEnabled: false,
  autoLockMinutes: 1,
};

// In-memory unlock state for current browser session
let sessionUnlocked = false;
let failedAttempts = 0;
let lockedUntilTimestamp = 0;
let lastBackgroundTimestamp: number | null = null;

// ==========================================
// IndexedDB Helper for Resilient Security Storage
// ==========================================
function openSecurityDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB indisponível'));
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await openSecurityDb();
    return new Promise((resolve) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const store = tx.objectStore(DB_STORE);
      const req = store.get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function idbSet<T>(key: string, val: T): Promise<void> {
  try {
    const db = await openSecurityDb();
    return new Promise((resolve) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      const store = tx.objectStore(DB_STORE);
      store.put(val, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Ignore idb errors
  }
}

// ==========================================
// Platform Detection
// ==========================================
export function isAppleDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent || '';
  const platform = window.navigator.platform || '';
  return (
    /iPhone|iPad|iPod|Macintosh|MacIntel/i.test(ua) ||
    /iPhone|iPad|iPod|Macintosh|MacIntel/i.test(platform) ||
    (navigator.maxTouchPoints > 1 && /Macintosh/i.test(platform))
  );
}

export function isAndroidDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return /Android/i.test(window.navigator.userAgent || '');
}

export function getBiometricLabel(): string {
  if (isAppleDevice()) {
    // iPhones modernos usam Face ID
    return 'Face ID';
  }
  if (isAndroidDevice()) {
    return 'Biometria';
  }
  return 'Biometria do Dispositivo';
}

// ==========================================
// Cryptography: PBKDF2-SHA256 for PIN
// ==========================================
function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToUint8Array(hex: string): Uint8Array {
  const match = hex.match(/.{1,2}/g) || [];
  return new Uint8Array(match.map((byte) => parseInt(byte, 16)));
}

export function generateSalt(): string {
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  return bufferToHex(bytes.buffer);
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(pin),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const saltBytes = hexToUint8Array(salt);
  const derivedBits = await window.crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes as unknown as BufferSource,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  return bufferToHex(derivedBits);
}

export async function verifyPin(
  pin: string,
  salt: string,
  expectedHash: string
): Promise<boolean> {
  if (!pin || !salt || !expectedHash) return false;
  try {
    const computed = await hashPin(pin, salt);
    return computed === expectedHash;
  } catch {
    return false;
  }
}

// ==========================================
// WebAuthn Platform Authenticator (Face ID / Android)
// ==========================================
function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function base64ToUint8(base64: string): Uint8Array {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function isWebAuthnSupported(): boolean {
  return Boolean(
    typeof window !== 'undefined' &&
      window.PublicKeyCredential &&
      navigator.credentials &&
      typeof navigator.credentials.create === 'function' &&
      typeof navigator.credentials.get === 'function'
  );
}

export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isWebAuthnSupported()) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export async function registerBiometrics(): Promise<string> {
  if (!isWebAuthnSupported()) {
    throw new Error('WebAuthn não é suportado neste navegador.');
  }

  const challenge = new Uint8Array(32);
  window.crypto.getRandomValues(challenge);

  const userId = new Uint8Array(16);
  window.crypto.getRandomValues(userId);

  // Usa hostname ou 'localhost' seguro
  const rpId = window.location.hostname === 'localhost' ? 'localhost' : window.location.hostname;

  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: {
        name: 'Rumo Finanças',
        id: rpId,
      },
      user: {
        id: userId,
        name: 'usuario-rumo',
        displayName: 'Usuário Rumo',
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' }, // ES256
        { alg: -257, type: 'public-key' }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60000,
      attestation: 'none',
    },
  })) as PublicKeyCredential | null;

  if (!credential) {
    throw new Error('Registro biométrico cancelado ou não concluído.');
  }

  return uint8ToBase64(new Uint8Array(credential.rawId));
}

export async function authenticateBiometrics(credentialId?: string): Promise<boolean> {
  if (!isWebAuthnSupported()) return false;

  try {
    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);

    const rpId = window.location.hostname === 'localhost' ? 'localhost' : window.location.hostname;

    const allowCredentials: PublicKeyCredentialDescriptor[] | undefined = credentialId
      ? [
          {
            id: base64ToUint8(credentialId) as unknown as BufferSource,
            type: 'public-key' as const,
          },
        ]
      : undefined;

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId,
        allowCredentials,
        userVerification: 'required',
        timeout: 60000,
      },
    });

    return Boolean(assertion);
  } catch (err) {
    console.warn('Autenticação biométrica falhou ou cancelada:', err);
    return false;
  }
}

// ==========================================
// Config Load & Save
// ==========================================
export async function loadLockConfig(): Promise<AppLockConfig> {
  try {
    // 1. Tenta IndexedDB
    const idbConfig = await idbGet<AppLockConfig>(LOCK_STORAGE_KEY);
    if (idbConfig && typeof idbConfig.enabled === 'boolean') {
      return idbConfig;
    }

    // 2. Fallback localStorage
    const raw = localStorage.getItem(LOCK_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppLockConfig;
      if (typeof parsed.enabled === 'boolean') {
        void idbSet(LOCK_STORAGE_KEY, parsed);
        return parsed;
      }
    }
  } catch {
    // Ignora erros
  }
  return { ...DEFAULT_LOCK_CONFIG };
}

export async function saveLockConfig(config: AppLockConfig): Promise<void> {
  try {
    localStorage.setItem(LOCK_STORAGE_KEY, JSON.stringify(config));
    await idbSet(LOCK_STORAGE_KEY, config);
  } catch {
    // Ignora restrições de storage
  }
}

// ==========================================
// Session State & Cooldown
// ==========================================
export function getIsSessionUnlocked(): boolean {
  return sessionUnlocked;
}

export function setSessionUnlocked(unlocked: boolean): void {
  sessionUnlocked = unlocked;
  if (unlocked) {
    failedAttempts = 0;
    lockedUntilTimestamp = 0;
  }
}

export function recordFailedAttempt(): { isLockedOut: boolean; remainingSeconds: number } {
  failedAttempts++;
  if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
    lockedUntilTimestamp = Date.now() + LOCKOUT_DURATION_SECONDS * 1000;
    return { isLockedOut: true, remainingSeconds: LOCKOUT_DURATION_SECONDS };
  }
  return { isLockedOut: false, remainingSeconds: 0 };
}

export function getLockoutRemainingSeconds(): number {
  if (Date.now() < lockedUntilTimestamp) {
    return Math.ceil((lockedUntilTimestamp - Date.now()) / 1000);
  }
  return 0;
}

export function resetFailedAttempts(): void {
  failedAttempts = 0;
  lockedUntilTimestamp = 0;
}

/**
 * Redefine o PIN e desativa o bloqueio mediante confirmação do API_TOKEN.
 */
export async function resetLockWithToken(tokenInput: string): Promise<boolean> {
  const currentToken = getAppsScriptConfig().token.trim();
  const input = tokenInput.trim();

  if (!currentToken || !input || input !== currentToken) {
    return false;
  }

  // Token válido: reseta configuração de bloqueio
  const resetConfig: AppLockConfig = {
    enabled: false,
    biometricEnabled: false,
    autoLockMinutes: 1,
  };

  await saveLockConfig(resetConfig);
  setSessionUnlocked(true);
  return true;
}

// ==========================================
// Inactivity & Background Auto-Lock Listener
// ==========================================
export function setupAutoLockWatcher(
  config: AppLockConfig,
  onLockTriggered: () => void
): () => void {
  if (!config.enabled) return () => {};

  const handleVisibility = () => {
    if (document.hidden) {
      lastBackgroundTimestamp = Date.now();
    } else {
      if (lastBackgroundTimestamp) {
        const elapsedMinutes = (Date.now() - lastBackgroundTimestamp) / (1000 * 60);
        if (config.autoLockMinutes === 0 || elapsedMinutes >= config.autoLockMinutes) {
          sessionUnlocked = false;
          onLockTriggered();
        }
        lastBackgroundTimestamp = null;
      }
    }
  };

  const handlePageHide = () => {
    lastBackgroundTimestamp = Date.now();
  };

  document.addEventListener('visibilitychange', handleVisibility);
  window.addEventListener('pagehide', handlePageHide);

  return () => {
    document.removeEventListener('visibilitychange', handleVisibility);
    window.removeEventListener('pagehide', handlePageHide);
  };
}
