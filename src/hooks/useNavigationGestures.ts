import { useCallback, useRef, useState, type TouchEvent } from 'react';

const HORIZONTAL_THRESHOLD_PX = 58;
const FLICK_DISTANCE_PX = 34;
const FLICK_VELOCITY_PX_MS = 0.35;
const PULL_THRESHOLD_PX = 58;
const PULL_MAX_PX = 84;

function isInteractiveOrHorizontallyScrollable(target: EventTarget | null): boolean {
  let node = target instanceof HTMLElement ? target : null;
  while (node && node !== document.body) {
    if (node.dataset.gestureIgnore === 'true') {
      return true;
    }
    const tag = node.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'OPTION') {
      return true;
    }
    if (node.isContentEditable) {
      return true;
    }
    // Respect elements that have real horizontal overflow scrolling (e.g. category filter bars)
    if (node.scrollWidth > node.clientWidth + 4) {
      const style = window.getComputedStyle(node);
      if (style.overflowX === 'auto' || style.overflowX === 'scroll') {
        return true;
      }
    }
    node = node.parentElement;
  }
  return false;
}

function triggerHapticLight(): void {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(8);
    } catch {
      // Ignore on browsers without vibration support
    }
  }
}

interface UseNavigationGesturesOptions {
  enabled: boolean;
  canSwipePrev: boolean;
  canSwipeNext: boolean;
  isRefreshing: boolean;
  onSwipePrev: () => void;
  onSwipeNext: () => void;
  onPullRefresh: () => void;
}

export function useNavigationGestures({
  enabled,
  canSwipePrev,
  canSwipeNext,
  isRefreshing,
  onSwipePrev,
  onSwipeNext,
  onPullRefresh,
}: UseNavigationGesturesOptions) {
  const [swipeOffsetX, setSwipeOffsetX] = useState(0);
  const [pullDistance, setPullDistance] = useState(0);

  const gestureRef = useRef<{
    active: boolean;
    axis: 'none' | 'x' | 'pull';
    startX: number;
    startY: number;
    startTime: number;
    lastX: number;
    lastY: number;
    startedAtTop: boolean;
  }>({
    active: false,
    axis: 'none',
    startX: 0,
    startY: 0,
    startTime: 0,
    lastX: 0,
    lastY: 0,
    startedAtTop: false,
  });

  const resetGesture = useCallback(() => {
    gestureRef.current.active = false;
    gestureRef.current.axis = 'none';
    setSwipeOffsetX(0);
    setPullDistance(0);
  }, []);

  const onTouchStart = useCallback(
    (e: TouchEvent<HTMLElement>) => {
      if (!enabled || e.touches.length !== 1) return;
      if (isInteractiveOrHorizontallyScrollable(e.target)) return;

      const touch = e.touches[0];
      // Leave a small 18px iOS Safari edge-swipe zone free so OS back-swipe works naturally
      const vw = window.innerWidth || 0;
      if (touch.clientX < 18 || (vw > 0 && touch.clientX > vw - 18)) {
        return;
      }

      gestureRef.current = {
        active: true,
        axis: 'none',
        startX: touch.clientX,
        startY: touch.clientY,
        startTime: performance.now(),
        lastX: touch.clientX,
        lastY: touch.clientY,
        startedAtTop: window.scrollY <= 1,
      };
    },
    [enabled]
  );

  const onTouchMove = useCallback(
    (e: TouchEvent<HTMLElement>) => {
      const state = gestureRef.current;
      if (!state.active || e.touches.length !== 1) return;

      const touch = e.touches[0];
      const dx = touch.clientX - state.startX;
      const dy = touch.clientY - state.startY;
      state.lastX = touch.clientX;
      state.lastY = touch.clientY;

      if (state.axis === 'none') {
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);
        if (absX < 10 && absY < 10) return;

        if (absX > absY * 1.4) {
          state.axis = 'x';
        } else if (
          dy > 10 &&
          absY > absX * 1.3 &&
          state.startedAtTop &&
          window.scrollY <= 1 &&
          !isRefreshing
        ) {
          state.axis = 'pull';
        } else {
          // Normal vertical page scroll — release gesture tracking immediately
          state.active = false;
          return;
        }
      }

      if (state.axis === 'x') {
        // Elastic resistance at the first/last tab boundaries
        const atEdge = (dx > 0 && !canSwipePrev) || (dx < 0 && !canSwipeNext);
        const damped = atEdge ? dx * 0.16 : Math.max(-96, Math.min(96, dx * 0.42));
        setSwipeOffsetX(damped);
      } else if (state.axis === 'pull') {
        if (dy <= 0) {
          setPullDistance(0);
          return;
        }
        // Logarithmic rubber-band pull resistance
        const dampedPull = Math.min(PULL_MAX_PX, Math.pow(dy, 0.82) * 1.35);
        setPullDistance(dampedPull);
      }
    },
    [canSwipePrev, canSwipeNext, isRefreshing]
  );

  const onTouchEnd = useCallback(() => {
    const state = gestureRef.current;
    if (!state.active) {
      resetGesture();
      return;
    }

    const dx = state.lastX - state.startX;
    const dy = state.lastY - state.startY;
    const elapsed = Math.max(1, performance.now() - state.startTime);
    const velocityX = Math.abs(dx) / elapsed;

    if (state.axis === 'x') {
      const triggered =
        Math.abs(dx) >= HORIZONTAL_THRESHOLD_PX ||
        (Math.abs(dx) >= FLICK_DISTANCE_PX && velocityX >= FLICK_VELOCITY_PX_MS);

      if (triggered) {
        if (dx < 0 && canSwipeNext) {
          triggerHapticLight();
          onSwipeNext();
        } else if (dx > 0 && canSwipePrev) {
          triggerHapticLight();
          onSwipePrev();
        }
      }
    } else if (state.axis === 'pull') {
      const dampedPull = dy > 0 ? Math.min(PULL_MAX_PX, Math.pow(dy, 0.82) * 1.35) : 0;
      if (dampedPull >= PULL_THRESHOLD_PX && !isRefreshing) {
        triggerHapticLight();
        onPullRefresh();
      }
    }

    resetGesture();
  }, [canSwipeNext, canSwipePrev, isRefreshing, onPullRefresh, onSwipeNext, onSwipePrev, resetGesture]);

  return {
    swipeOffsetX,
    pullDistance,
    pullProgress: Math.min(1, pullDistance / PULL_THRESHOLD_PX),
    pullReady: pullDistance >= PULL_THRESHOLD_PX,
    touchHandlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      onTouchCancel: resetGesture,
    },
  };
}
