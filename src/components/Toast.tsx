import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

const EASE_IOS: [number, number, number, number] = [0.16, 1, 0.3, 1];

export interface ToastMessage {
  id: number;
  type: 'success' | 'error' | 'info';
  text: string;
}

interface ToastProps {
  toast: ToastMessage | null;
  onDismiss: () => void;
}

export function Toast({ toast, onDismiss }: ToastProps) {
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key={toast.id}
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: 18, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.95 }}
          transition={{ duration: 0.24, ease: EASE_IOS }}
          className="glass-toast toast-safe-bottom fixed left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 items-center justify-between gap-3 rounded-full py-2.5 pl-3.5 pr-2.5 text-xs font-medium text-slate-900 dark:text-slate-100"
        >
          <div className="relative z-10 flex min-w-0 items-center gap-2.5">
            {toast.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : toast.type === 'error' ? (
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
            ) : (
              <Info className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
            )}
            <span className="truncate">{toast.text}</span>
          </div>
          <motion.button
            type="button"
            whileTap={{ scale: 0.88 }}
            onClick={onDismiss}
            aria-label="Fechar aviso"
            className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-900/6 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/12 dark:hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
