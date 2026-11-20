import { useCallback, useEffect, useState } from 'react';
import type { SyncFlushResult } from '../types';
import {
  syncManager,
  type SyncManagerSnapshot,
} from '../services/syncManager';

interface UseSyncManagerOptions {
  onFlushComplete?: (result: SyncFlushResult) => void;
  onSwrCacheUpdated?: (updatedUrl?: string) => void;
}

export function useSyncManager(options?: UseSyncManagerOptions) {
  const [state, setState] = useState<SyncManagerSnapshot>(() =>
    syncManager.getSnapshot()
  );

  useEffect(() => {
    syncManager.start();
    const unsubscribeState = syncManager.subscribe(setState);

    const unsubscribeFlush = options?.onFlushComplete
      ? syncManager.onFlushComplete(options.onFlushComplete)
      : undefined;

    const unsubscribeSwr = options?.onSwrCacheUpdated
      ? syncManager.onSwrCacheUpdated(options.onSwrCacheUpdated)
      : undefined;

    return () => {
      unsubscribeState();
      unsubscribeFlush?.();
      unsubscribeSwr?.();
    };
  }, [options?.onFlushComplete, options?.onSwrCacheUpdated]);

  const flushNow = useCallback(() => syncManager.flushQueue(), []);

  return {
    ...state,
    flushNow,
  };
}
