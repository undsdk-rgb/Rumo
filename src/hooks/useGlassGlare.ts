import { useEffect } from 'react';

interface GlareState {
  currentX: number;
  currentY: number;
  targetX: number;
  targetY: number;
  active: boolean;
  initialized: boolean;
  touchFadeTimer?: number;
}

const GLASS_SELECTOR = '.glass-surface, .glass-chrome';
const POSITION_LERP = 0.2;
const TOUCH_DWELL_MS = 160;
const PRESS_CANCEL_DRAG_PX = 14;

/**
 * Delegated global Apple Liquid Glass interaction engine.
 * 1. Smoothly tracks --glare-x and --glare-y via requestAnimationFrame while pointer/touch is active.
 * 2. Toggles --glare-opacity (0 / 1) and data-glare-active so the GPU CSS transition
 *    (`transition: opacity 300ms ease-out`) handles the smooth 300ms fade-out on cursor exit or touch end
 *    without snapping coordinates back prematurely.
 * 3. Manages tactile press state (data-glass-pressed="true") for scale(1.02) + deepened drop-shadow
 *    without sticking during scrolls or horizontal swipes.
 */
export function useLiquidGlassGlare(): void {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const reducedMotionMq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const reducedTransparencyMq = window.matchMedia?.('(prefers-reduced-transparency: reduce)');

    const isGlareDisabled = () =>
      Boolean(reducedMotionMq?.matches || reducedTransparencyMq?.matches);

    const tracked = new Map<HTMLElement, GlareState>();
    let activeHoverEl: HTMLElement | null = null;
    let activeTouchEl: HTMLElement | null = null;
    let activePressedEl: HTMLElement | null = null;
    let pressOrigin: { x: number; y: number } | null = null;
    let rafId: number | null = null;

    const clearPressedElement = () => {
      if (activePressedEl) {
        activePressedEl.removeAttribute('data-glass-pressed');
        activePressedEl = null;
      }
      pressOrigin = null;
    };

    const isTextInputTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof Element)) return false;
      return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
    };

    const getLocalPercent = (el: HTMLElement, clientX: number, clientY: number) => {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return { x: 50, y: 50 };
      const x = Math.max(-10, Math.min(110, ((clientX - rect.left) / rect.width) * 100));
      const y = Math.max(-10, Math.min(110, ((clientY - rect.top) / rect.height) * 100));
      return { x, y };
    };

    const getOrCreateState = (el: HTMLElement): GlareState => {
      let state = tracked.get(el);
      if (!state) {
        state = {
          currentX: 50,
          currentY: 50,
          targetX: 50,
          targetY: 50,
          active: false,
          initialized: false,
        };
        tracked.set(el, state);
      }
      return state;
    };

    const scheduleFrame = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(tick);
    };

    const tick = () => {
      rafId = null;
      let hasWork = false;

      tracked.forEach((state, el) => {
        if (!el.isConnected) {
          if (state.touchFadeTimer) window.clearTimeout(state.touchFadeTimer);
          tracked.delete(el);
          return;
        }

        const dx = state.targetX - state.currentX;
        const dy = state.targetY - state.currentY;

        if (Math.abs(dx) > 0.08) {
          state.currentX += dx * POSITION_LERP;
          hasWork = true;
        } else {
          state.currentX = state.targetX;
        }

        if (Math.abs(dy) > 0.08) {
          state.currentY += dy * POSITION_LERP;
          hasWork = true;
        } else {
          state.currentY = state.targetY;
        }

        el.style.setProperty('--glare-x', `${state.currentX.toFixed(2)}%`);
        el.style.setProperty('--glare-y', `${state.currentY.toFixed(2)}%`);

        // Once inactive and settled, drop from rAF loop while preserving last X/Y for CSS 300ms fade-out
        if (!state.active && !hasWork && !state.touchFadeTimer) {
          tracked.delete(el);
        }
      });

      if (hasWork) {
        scheduleFrame();
      }
    };

    const deactivateElement = (el: HTMLElement | null) => {
      if (!el) return;
      const state = tracked.get(el);
      if (state) {
        if (state.touchFadeTimer) {
          window.clearTimeout(state.touchFadeTimer);
          state.touchFadeTimer = undefined;
        }
        state.active = false;
      }
      // Keep last --glare-x / --glare-y untouched so CSS 300ms fade-out dissolves smoothly in place
      el.removeAttribute('data-glare-active');
      el.style.setProperty('--glare-opacity', '0');
    };

    const activateAtPoint = (
      el: HTMLElement,
      clientX: number,
      clientY: number,
      opacity = 1
    ) => {
      const state = getOrCreateState(el);
      if (state.touchFadeTimer) {
        window.clearTimeout(state.touchFadeTimer);
        state.touchFadeTimer = undefined;
      }

      const { x, y } = getLocalPercent(el, clientX, clientY);
      state.targetX = x;
      state.targetY = y;

      if (!state.initialized || !state.active) {
        state.currentX = x;
        state.currentY = y;
        state.initialized = true;
        el.style.setProperty('--glare-x', `${x.toFixed(2)}%`);
        el.style.setProperty('--glare-y', `${y.toFixed(2)}%`);
      }

      state.active = true;
      el.setAttribute('data-glare-active', 'true');
      el.style.setProperty('--glare-opacity', String(opacity));

      scheduleFrame();
    };

    const findGlassTarget = (eventTarget: EventTarget | null): HTMLElement | null => {
      if (!(eventTarget instanceof Element)) return null;
      return eventTarget.closest<HTMLElement>(GLASS_SELECTOR);
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (activePressedEl && pressOrigin) {
        const dist = Math.hypot(e.clientX - pressOrigin.x, e.clientY - pressOrigin.y);
        if (dist > PRESS_CANCEL_DRAG_PX) {
          clearPressedElement();
        }
      }

      if (isGlareDisabled()) return;

      if (e.pointerType === 'touch') {
        if (!activeTouchEl) return;
        const target = findGlassTarget(e.target);
        if (target === activeTouchEl) {
          activateAtPoint(activeTouchEl, e.clientX, e.clientY, 0.95);
        }
        return;
      }

      const target = findGlassTarget(e.target);
      if (target !== activeHoverEl) {
        deactivateElement(activeHoverEl);
        activeHoverEl = target;
      }
      if (target) {
        activateAtPoint(target, e.clientX, e.clientY, 1);
      }
    };

    const handlePointerDown = (e: PointerEvent) => {
      const target = findGlassTarget(e.target);
      if (!target) return;

      if (!isTextInputTarget(e.target)) {
        clearPressedElement();
        activePressedEl = target;
        pressOrigin = { x: e.clientX, y: e.clientY };
        target.setAttribute('data-glass-pressed', 'true');
      }

      if (isGlareDisabled()) return;

      if (e.pointerType === 'touch') {
        if (activeTouchEl && activeTouchEl !== target) {
          deactivateElement(activeTouchEl);
        }
        activeTouchEl = target;
        activateAtPoint(target, e.clientX, e.clientY, 1);
      } else {
        activeHoverEl = target;
        activateAtPoint(target, e.clientX, e.clientY, 1);
      }
    };

    const releasePointer = () => {
      clearPressedElement();

      const el = activeTouchEl;
      activeTouchEl = null;
      if (!el) return;
      const state = tracked.get(el);
      if (!state) {
        deactivateElement(el);
        return;
      }

      if (state.touchFadeTimer) {
        window.clearTimeout(state.touchFadeTimer);
      }
      state.touchFadeTimer = window.setTimeout(() => {
        state.touchFadeTimer = undefined;
        deactivateElement(el);
        tracked.delete(el);
      }, TOUCH_DWELL_MS);
    };

    const handleWindowBlurOrLeave = () => {
      clearPressedElement();
      deactivateElement(activeHoverEl);
      activeHoverEl = null;
      releasePointer();
    };

    document.addEventListener('pointermove', handlePointerMove, { passive: true });
    document.addEventListener('pointerdown', handlePointerDown, { passive: true });
    window.addEventListener('pointerup', releasePointer, { passive: true });
    window.addEventListener('pointercancel', releasePointer, { passive: true });
    document.addEventListener('pointerleave', handleWindowBlurOrLeave, { passive: true });
    window.addEventListener('blur', handleWindowBlurOrLeave);

    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', releasePointer);
      window.removeEventListener('pointercancel', releasePointer);
      document.removeEventListener('pointerleave', handleWindowBlurOrLeave);
      window.removeEventListener('blur', handleWindowBlurOrLeave);

      clearPressedElement();

      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      tracked.forEach((state, el) => {
        if (state.touchFadeTimer) window.clearTimeout(state.touchFadeTimer);
        if (el.isConnected) {
          el.removeAttribute('data-glare-active');
          el.style.removeProperty('--glare-x');
          el.style.removeProperty('--glare-y');
          el.style.removeProperty('--glare-opacity');
        }
      });
      tracked.clear();
    };
  }, []);
}
