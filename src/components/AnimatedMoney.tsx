import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { formatCurrency, MASKED_CURRENCY } from '../utils/format';

const EASE_IOS: [number, number, number, number] = [0.16, 1, 0.3, 1];

interface AnimatedMoneyProps {
  value: number;
  hidden?: boolean;
  className?: string;
  durationMs?: number;
}

/**
 * Smooth fintech currency display with rAF easing count-up/down
 * and a seamless blur/opacity transition when Focus/Privacy mode toggles.
 */
export function AnimatedMoney({
  value,
  hidden = false,
  className = '',
  durationMs = 380,
}: AnimatedMoneyProps) {
  const prefersReduced = useReducedMotion();
  const safeValue = Number.isFinite(value) ? value : 0;
  const [displayValue, setDisplayValue] = useState<number>(safeValue);
  const currentRef = useRef<number>(safeValue);

  useEffect(() => {
    if (prefersReduced || hidden || durationMs <= 0) {
      currentRef.current = safeValue;
      setDisplayValue(safeValue);
      return;
    }

    const from = currentRef.current;
    const to = safeValue;
    if (Math.abs(to - from) < 0.005) {
      currentRef.current = to;
      setDisplayValue(to);
      return;
    }

    let rafId = 0;
    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      // Expo ease-out curve matching iOS/fintech deceleration
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      const next = from + (to - from) * eased;
      currentRef.current = next;
      setDisplayValue(next);

      if (progress < 1) {
        rafId = window.requestAnimationFrame(step);
      } else {
        currentRef.current = to;
        setDisplayValue(to);
      }
    };

    rafId = window.requestAnimationFrame(step);
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [safeValue, hidden, durationMs, prefersReduced]);

  return (
    <span className={`inline-block font-mono tabular-nums ${className}`}>
      <AnimatePresence mode="wait" initial={false}>
        {hidden ? (
          <motion.span
            key="masked"
            initial={prefersReduced ? { opacity: 1 } : { opacity: 0, filter: 'blur(4px)', scale: 0.98 }}
            animate={{ opacity: 1, filter: 'blur(0px)', scale: 1 }}
            exit={prefersReduced ? { opacity: 0 } : { opacity: 0, filter: 'blur(4px)', scale: 0.98 }}
            transition={{ duration: 0.16, ease: EASE_IOS }}
            className="inline-block select-none tracking-wider text-slate-400 dark:text-slate-500"
            aria-label="Valor oculto no modo foco"
          >
            {MASKED_CURRENCY}
          </motion.span>
        ) : (
          <motion.span
            key="visible"
            initial={prefersReduced ? { opacity: 1 } : { opacity: 0, filter: 'blur(4px)', scale: 0.98 }}
            animate={{ opacity: 1, filter: 'blur(0px)', scale: 1 }}
            exit={prefersReduced ? { opacity: 0 } : { opacity: 0, filter: 'blur(4px)', scale: 0.98 }}
            transition={{ duration: 0.18, ease: EASE_IOS }}
            className="inline-block"
          >
            {formatCurrency(displayValue)}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
