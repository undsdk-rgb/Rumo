import type {
  BackendMode,
  CreateTransactionPayload,
  SyncFlushResult,
  SyncQueueItem,
  Transaction,
} from '../types';
import { createTransaction, deleteTransaction, isNetworkError } from './api';

const QUEUE_STORAGE_KEY = 'rumo_sync_queue_v1';
const SWR_SNAPSHOT_STORAGE_KEY = 'rumo_swr_months_v1';
const LAST_META_STORAGE_KEY = 'rumo_swr_meta_v1';
const SWR_BROADCAST_CHANNEL = 'rumo-swr-updates';
const SW_SYNC_TAG = 'rumo-offline-sync';

export interface MonthSnapshot {
  transactions: Transaction[];
  updatedAt: string;
  spreadsheetName?: string;
  mode: BackendMode;
}

export interface SyncManagerSnapshot {
  queue: SyncQueueItem[];
  pendingCount: number;
  isFlushing: boolean;
  lastFlushedAt: string | null;
  lastError: string | null;
}

type StateListener = (state: SyncManagerSnapshot) => void;
type FlushListener = (result: SyncFlushResult) => void;
type SwrUpdateListener = (updatedUrl?: string) => void;

interface SyncRegistration extends ServiceWorkerRegistration {
  sync?: {
    register: (tag: string) => Promise<void>;
  };
}

class OfflineSyncManager {
  private queue: SyncQueueItem[] = [];
  private isFlushing = false;
  private lastFlushedAt: string | null = null;
  private lastError: string | null = null;
  private flushingPromise: Promise<SyncFlushResult> | null = null;

  private stateListeners = new Set<StateListener>();
  private flushListeners = new Set<FlushListener>();
  private swrUpdateListeners = new Set<SwrUpdateListener>();

  private started = false;
  private broadcastChannel: BroadcastChannel | null = null;

  constructor() {
    this.queue = this.loadQueueFromStorage();
  }

  private loadQueueFromStorage(): SyncQueueItem[] {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as SyncQueueItem[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private saveQueueToStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(this.queue));
    } catch {
      // Ignore storage quota errors
    }
  }

  private emitState(): void {
    const snap = this.getSnapshot();
    for (const listener of this.stateListeners) {
      listener(snap);
    }
  }

  getSnapshot(): SyncManagerSnapshot {
    return {
      queue: [...this.queue],
      pendingCount: this.queue.length,
      isFlushing: this.isFlushing,
      lastFlushedAt: this.lastFlushedAt,
      lastError: this.lastError,
    };
  }

  subscribe(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  onFlushComplete(listener: FlushListener): () => void {
    this.flushListeners.add(listener);
    return () => {
      this.flushListeners.delete(listener);
    };
  }

  onSwrCacheUpdated(listener: SwrUpdateListener): () => void {
    this.swrUpdateListeners.add(listener);
    return () => {
      this.swrUpdateListeners.delete(listener);
    };
  }

  /**
   * Starts global online, Service Worker message, and Workbox BroadcastChannel listeners.
   */
  start(): void {
    if (this.started || typeof window === 'undefined') return;
    this.started = true;

    window.addEventListener('online', this.handleBrowserOnline);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', this.handleSwMessage);
    }

    if ('BroadcastChannel' in window) {
      try {
        this.broadcastChannel = new BroadcastChannel(SWR_BROADCAST_CHANNEL);
        this.broadcastChannel.addEventListener('message', this.handleBroadcastMessage);
      } catch {
        this.broadcastChannel = null;
      }
    }

    // If app opens online with leftover queued items from a previous offline session, flush immediately
    if (navigator.onLine && this.queue.length > 0) {
      void this.flushQueue();
    }
  }

  stop(): void {
    if (!this.started || typeof window === 'undefined') return;
    this.started = false;

    window.removeEventListener('online', this.handleBrowserOnline);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.removeEventListener('message', this.handleSwMessage);
    }

    if (this.broadcastChannel) {
      this.broadcastChannel.removeEventListener('message', this.handleBroadcastMessage);
      this.broadcastChannel.close();
      this.broadcastChannel = null;
    }
  }

  private handleBrowserOnline = (): void => {
    if (this.queue.length > 0) {
      void this.flushQueue();
    }
  };

  private handleSwMessage = (event: MessageEvent): void => {
    const data = event.data as {
      type?: string;
      url?: string;
      payload?: { updatedURL?: string };
    } | null;
    if (!data?.type) return;

    if (data.type === 'RUMO_SYNC_TRIGGER') {
      if (this.queue.length > 0 && navigator.onLine) {
        void this.flushQueue();
      }
      return;
    }

    if (data.type === 'RUMO_SWR_REVALIDATED') {
      for (const listener of this.swrUpdateListeners) {
        listener(data.url);
      }
      return;
    }

    if (data.type === 'CACHE_UPDATED') {
      for (const listener of this.swrUpdateListeners) {
        listener(data.payload?.updatedURL);
      }
    }
  };

  private handleBroadcastMessage = (event: MessageEvent): void => {
    const data = event.data as {
      type?: string;
      payload?: { updatedURL?: string };
    } | null;
    if (data?.type === 'CACHE_UPDATED') {
      for (const listener of this.swrUpdateListeners) {
        listener(data.payload?.updatedURL);
      }
    }
  };

  /**
   * Requests native Background Sync registration when supported (Chromium/Android).
   */
  private async registerBackgroundSync(): Promise<void> {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    try {
      const reg = (await navigator.serviceWorker.ready) as SyncRegistration;
      if (reg.sync) {
        await reg.sync.register(SW_SYNC_TAG);
      }
    } catch {
      // iOS Safari and some browsers do not support Background Sync; window 'online' event handles flushing
    }
  }

  /**
   * Asks the Service Worker to proactively revalidate a URL in the SWR cache.
   */
  requestSwRevalidation(ym: string): void {
    if (
      typeof navigator === 'undefined' ||
      !navigator.onLine ||
      !('serviceWorker' in navigator) ||
      !navigator.serviceWorker.controller
    ) {
      return;
    }
    try {
      navigator.serviceWorker.controller.postMessage({
        type: 'RUMO_REVALIDATE_URL',
        url: `/api/transactions?mes=${encodeURIComponent(ym)}`,
      });
    } catch {
      // Non-critical optimization
    }
  }

  /**
   * Enqueues a new offline transaction and returns the optimistic local Transaction object.
   */
  enqueueCreate(payload: CreateTransactionPayload): Transaction {
    const localId = `offline-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const queueItem: SyncQueueItem = {
      queueId: `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'create',
      localId,
      payload,
      createdAt: new Date().toISOString(),
      attempts: 0,
    };

    this.queue = [...this.queue, queueItem];
    this.lastError = null;
    this.saveQueueToStorage();
    this.emitState();
    void this.registerBackgroundSync();

    return {
      id: localId,
      ...payload,
      pendingSync: true,
    };
  }

  /**
   * Enqueues a delete operation, or cancels a pending offline creation cleanly.
   */
  enqueueDelete(targetId: string): { removedLocallyOnly: boolean } {
    const pendingCreateIndex = this.queue.findIndex(
      (item) => item.type === 'create' && item.localId === targetId
    );

    if (pendingCreateIndex >= 0) {
      this.queue = this.queue.filter((_, idx) => idx !== pendingCreateIndex);
      this.saveQueueToStorage();
      this.emitState();
      return { removedLocallyOnly: true };
    }

    const alreadyQueuedDelete = this.queue.some(
      (item) => item.type === 'delete' && item.targetId === targetId
    );
    if (!alreadyQueuedDelete) {
      const queueItem: SyncQueueItem = {
        queueId: `q-del-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'delete',
        targetId,
        createdAt: new Date().toISOString(),
        attempts: 0,
      };
      this.queue = [...this.queue, queueItem];
      this.lastError = null;
      this.saveQueueToStorage();
      this.emitState();
      void this.registerBackgroundSync();
    }

    return { removedLocallyOnly: false };
  }

  /**
   * Flushes queued offline transactions in FIFO order when online.
   * Uses a single-flight lock to prevent duplicate writes.
   */
  async flushQueue(): Promise<SyncFlushResult> {
    if (this.flushingPromise) {
      return this.flushingPromise;
    }

    if (this.queue.length === 0) {
      return { syncedCount: 0, failedCount: 0, remainingCount: 0 };
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return {
        syncedCount: 0,
        failedCount: 0,
        remainingCount: this.queue.length,
      };
    }

    this.flushingPromise = this.runFlushPass();
    try {
      return await this.flushingPromise;
    } finally {
      this.flushingPromise = null;
    }
  }

  private async runFlushPass(): Promise<SyncFlushResult> {
    this.isFlushing = true;
    this.lastError = null;
    this.emitState();

    let syncedCount = 0;
    let failedCount = 0;
    let lastError: string | undefined;

    const workingQueue = [...this.queue];
    const remaining: SyncQueueItem[] = [];

    for (let i = 0; i < workingQueue.length; i++) {
      const item = workingQueue[i];

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        remaining.push(...workingQueue.slice(i));
        break;
      }

      try {
        if (item.type === 'create') {
          await createTransaction(item.payload, 'sheets');
        } else {
          await deleteTransaction(item.targetId, 'sheets');
        }
        syncedCount++;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Erro ao sincronizar item offline.';

        // If a queued delete references a row already gone on the sheet, drop it cleanly
        if (
          item.type === 'delete' &&
          message.toLowerCase().includes('não encontrado')
        ) {
          syncedCount++;
          continue;
        }

        failedCount++;
        lastError = message;

        const updatedItem: SyncQueueItem = {
          ...item,
          attempts: item.attempts + 1,
          lastError: message,
        };

        // On network drop, preserve FIFO order for this and all subsequent queued items
        if (isNetworkError(err)) {
          remaining.push(updatedItem, ...workingQueue.slice(i + 1));
          break;
        }

        remaining.push(updatedItem);
      }
    }

    this.queue = remaining;
    this.isFlushing = false;
    if (syncedCount > 0) {
      this.lastFlushedAt = new Date().toISOString();
    }
    this.lastError = lastError ?? null;
    this.saveQueueToStorage();
    this.emitState();

    const result: SyncFlushResult = {
      syncedCount,
      failedCount,
      remainingCount: this.queue.length,
      lastError,
    };

    if (syncedCount > 0 || failedCount > 0) {
      for (const listener of this.flushListeners) {
        listener(result);
      }
    }

    return result;
  }

  /* --------------------------------------------------------------------------
   * Stale-While-Revalidate Local Month Snapshot Store
   * Guarantees instant display of the freshest known dataset while offline
   * ------------------------------------------------------------------------ */

  private loadAllSnapshots(): Record<string, MonthSnapshot> {
    if (typeof window === 'undefined') return {};
    try {
      const raw = localStorage.getItem(SWR_SNAPSHOT_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Record<string, MonthSnapshot>;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  getMonthSnapshot(ym: string): MonthSnapshot | null {
    const all = this.loadAllSnapshots();
    return all[ym] ?? null;
  }

  saveMonthSnapshot(
    ym: string,
    transactions: Transaction[],
    meta: { mode: BackendMode; spreadsheetName?: string; updatedAt?: string }
  ): void {
    if (typeof window === 'undefined') return;
    try {
      const all = this.loadAllSnapshots();
      const cleanList = transactions.filter((tx) => !tx.pendingSync);
      const updatedAt = meta.updatedAt || new Date().toISOString();
      all[ym] = {
        transactions: cleanList,
        updatedAt,
        spreadsheetName: meta.spreadsheetName,
        mode: meta.mode,
      };

      // Keep at most the 24 most recently accessed months to stay lightweight
      const keys = Object.keys(all);
      if (keys.length > 24) {
        keys
          .sort((a, b) =>
            (all[b]?.updatedAt || '').localeCompare(all[a]?.updatedAt || '')
          )
          .slice(24)
          .forEach((oldKey) => {
            delete all[oldKey];
          });
      }

      localStorage.setItem(SWR_SNAPSHOT_STORAGE_KEY, JSON.stringify(all));
      localStorage.setItem(
        LAST_META_STORAGE_KEY,
        JSON.stringify({
          mode: meta.mode,
          spreadsheetName: meta.spreadsheetName,
          updatedAt,
        })
      );
    } catch {
      // Ignore storage quota issues
    }
  }

  getLastKnownMeta(): {
    mode: BackendMode;
    spreadsheetName?: string;
    updatedAt?: string;
  } | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(LAST_META_STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as {
        mode: BackendMode;
        spreadsheetName?: string;
        updatedAt?: string;
      };
    } catch {
      return null;
    }
  }

  /**
   * Overlays queued offline creations and deletions on top of any cached or server list.
   */
  mergeMonthTransactions(ym: string, baseTransactions: Transaction[]): Transaction[] {
    const deletedIds = new Set(
      this.queue
        .filter((item): item is Extract<SyncQueueItem, { type: 'delete' }> => item.type === 'delete')
        .map((item) => item.targetId)
    );

    const pendingCreates: Transaction[] = this.queue
      .filter(
        (item): item is Extract<SyncQueueItem, { type: 'create' }> =>
          item.type === 'create' && item.payload.data.startsWith(ym)
      )
      .map((item) => ({
        id: item.localId,
        ...item.payload,
        pendingSync: true,
      }));

    const existingIds = new Set(pendingCreates.map((t) => t.id));
    const filteredBase = baseTransactions.filter(
      (tx) => !deletedIds.has(tx.id) && !existingIds.has(tx.id)
    );

    return [...pendingCreates, ...filteredBase].sort((a, b) =>
      b.data.localeCompare(a.data)
    );
  }
}

export const syncManager = new OfflineSyncManager();
