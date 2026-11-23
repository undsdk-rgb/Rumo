import { useEffect, useState, type FormEvent } from 'react';
import { AnimatePresence, motion, useDragControls, type PanInfo } from 'motion/react';
import { Loader2, X } from 'lucide-react';
import { CATEGORIES, CATEGORY_MAP, PAYMENT_METHODS } from '../constants/categories';
import type { Category, CreateTransactionPayload, Transaction } from '../types';
import { getNowLocalDateTimeInput, parseMoneyInput } from '../utils/format';

const EASE_IOS: [number, number, number, number] = [0.16, 1, 0.3, 1];

interface ExpenseModalProps {
  open: boolean;
  mode?: 'create' | 'edit';
  initialTransaction?: Transaction | null;
  isRealMode: boolean;
  isOnline: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateTransactionPayload, editId?: string) => Promise<void>;
}

const QUICK_OUTFLOW_PRESETS: {
  label: string;
  estabelecimento: string;
  categoria: Category;
  metodo: string;
}[] = [
  { label: 'Café / Lanche', estabelecimento: 'Padaria / Café', categoria: 'Alimentação', metodo: 'Pix' },
  { label: 'Mercado', estabelecimento: 'Mercado', categoria: 'Mercado', metodo: 'Cartão de Débito' },
  { label: 'Transporte', estabelecimento: 'Uber / Transporte', categoria: 'Transporte', metodo: 'Apple Pay' },
  { label: 'Combustível', estabelecimento: 'Posto de Combustível', categoria: 'Combustível', metodo: 'Apple Pay' },
  { label: 'Farmácia', estabelecimento: 'Farmácia / Drogaria', categoria: 'Remédio', metodo: 'Pix' },
  { label: 'Pix avulso', estabelecimento: 'Transferência Pix', categoria: 'Outros', metodo: 'Pix' },
];

export function ExpenseModal({
  open,
  mode = 'create',
  initialTransaction,
  isRealMode,
  isOnline,
  onClose,
  onSubmit,
}: ExpenseModalProps) {
  const isEdit = mode === 'edit' || Boolean(initialTransaction);
  const [estabelecimento, setEstabelecimento] = useState('');
  const [valorInput, setValorInput] = useState('');
  const [categoria, setCategoria] = useState<Category>('Alimentação');
  const [metodo, setMetodo] = useState<string>('Pix');
  const [data, setData] = useState(getNowLocalDateTimeInput());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const dragControls = useDragControls();

  const handleSheetDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (submitting) return;
    if (info.offset.y > 90 || info.velocity.y > 450) {
      onClose();
    }
  };

  useEffect(() => {
    if (open) {
      if (initialTransaction) {
        setEstabelecimento(initialTransaction.estabelecimento || '');
        setValorInput(
          typeof initialTransaction.valor === 'number'
            ? initialTransaction.valor.toLocaleString('pt-BR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })
            : ''
        );
        setCategoria(initialTransaction.categoria || 'Geral');
        setMetodo(initialTransaction.metodo || 'Pix');
        setData(initialTransaction.data ? initialTransaction.data.slice(0, 16) : getNowLocalDateTimeInput());
      } else {
        setEstabelecimento('');
        setValorInput('');
        setCategoria('Alimentação');
        setMetodo('Pix');
        setData(getNowLocalDateTimeInput());
      }
      setError(null);
      setSubmitting(false);
    }
  }, [open, initialTransaction]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, submitting, onClose]);

  const applyPreset = (preset: (typeof QUICK_OUTFLOW_PRESETS)[number]) => {
    if (!estabelecimento.trim()) {
      setEstabelecimento(preset.estabelecimento);
    }
    setCategoria(preset.categoria);
    setMetodo(preset.metodo);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = estabelecimento.trim();
    if (!trimmedName) {
      setError('Informe o nome do estabelecimento ou descrição da saída.');
      return;
    }

    const parsedValor = parseMoneyInput(valorInput);
    if (!Number.isFinite(parsedValor) || parsedValor <= 0) {
      setError('Informe um valor válido maior que zero.');
      return;
    }

    if (!data) {
      setError('Informe a data e hora da saída.');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(
        {
          estabelecimento: trimmedName,
          valor: Math.round(parsedValor * 100) / 100,
          categoria,
          metodo,
          data,
        },
        initialTransaction?.id
      );
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Não foi possível salvar a saída.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="expense-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: EASE_IOS }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/35 backdrop-blur-md sm:items-center sm:p-4 dark:bg-black/60"
          role="dialog"
          aria-modal="true"
          aria-labelledby="expense-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !submitting) onClose();
          }}
        >
          <motion.div
            key="expense-modal-sheet"
            initial={{ opacity: 0, y: 36, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 28, scale: 0.97 }}
            transition={{ duration: 0.26, ease: EASE_IOS }}
            drag={submitting ? false : 'y'}
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.04, bottom: 0.65 }}
            onDragEnd={handleSheetDragEnd}
            className="glass-sheet flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[32px] sm:max-w-md sm:rounded-[32px]"
          >
            {/* Grab handle & draggable header */}
            <div
              onPointerDown={(e) => {
                if (!submitting) dragControls.start(e);
              }}
              className="touch-none select-none"
            >
              <div className="flex justify-center pt-3 sm:hidden" aria-hidden="true">
                <span className="h-1.5 w-11 rounded-full bg-slate-400/50 dark:bg-white/20" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-5 pb-3 pt-3 sm:px-6 sm:pt-5">
                <div>
                  <h2
                    id="expense-modal-title"
                    className="text-base font-semibold tracking-tight text-slate-900 dark:text-white"
                  >
                    {isEdit ? 'Editar saída' : 'Registrar saída manual'}
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {isEdit
                      ? 'Atualiza simultaneamente na Planilha Google e no Notion.'
                      : !isOnline && isRealMode
                        ? 'Sem conexão — será enfileirado e enviado ao reconectar.'
                        : isRealMode
                          ? 'Enviado diretamente para a Planilha e Notion.'
                          : 'Salvo localmente no modo demonstração.'}
                  </p>
                </div>
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={onClose}
                  disabled={submitting}
                  aria-label="Fechar modal"
                  className="glass-control flex h-10 w-10 items-center justify-center rounded-full text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Form Body */}
            <form
              onSubmit={handleSubmit}
              className="flex flex-1 flex-col overflow-y-auto px-4 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] sm:px-6"
            >
              <div className="space-y-4">
                {/* Presets (somente no modo criação) */}
                {!isEdit && (
                  <div>
                    <span className="block text-xs font-medium text-slate-500 dark:text-slate-400">
                      Atalhos rápidos
                    </span>
                    <div className="no-scrollbar -mx-0.5 mt-1.5 flex items-center gap-1.5 overflow-x-auto px-0.5 py-1">
                      {QUICK_OUTFLOW_PRESETS.map((preset) => (
                        <motion.button
                          key={preset.label}
                          type="button"
                          whileTap={{ scale: 0.95 }}
                          onClick={() => applyPreset(preset)}
                          className="glass-control min-h-[34px] shrink-0 whitespace-nowrap rounded-full px-3.5 text-xs font-medium text-slate-700 transition-all dark:text-slate-200"
                        >
                          {preset.label}
                        </motion.button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Estabelecimento */}
                <div>
                  <label
                    htmlFor="tx-estabelecimento"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Estabelecimento ou descrição
                  </label>
                  <input
                    id="tx-estabelecimento"
                    type="text"
                    required
                    value={estabelecimento}
                    onChange={(e) => setEstabelecimento(e.target.value)}
                    placeholder="Ex: Padaria, Mercado, Aluguel"
                    className="glass-input mt-1.5 h-11 w-full rounded-xl px-3.5 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-emerald-500"
                  />
                </div>

                {/* Valor & Data row */}
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  <div className="min-w-0">
                    <label
                      htmlFor="tx-valor"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                    >
                      Valor (R$)
                    </label>
                    <div className="relative mt-1.5">
                      <span
                        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-sm text-slate-400"
                        aria-hidden="true"
                      >
                        R$
                      </span>
                      <input
                        id="tx-valor"
                        type="text"
                        inputMode="decimal"
                        required
                        value={valorInput}
                        onChange={(e) => setValorInput(e.target.value)}
                        placeholder="0,00"
                        className="glass-input h-11 w-full min-w-0 max-w-full rounded-xl pl-10 pr-3.5 font-mono text-sm text-slate-900 tabular-nums placeholder:text-slate-400 transition-colors focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="min-w-0">
                    <label
                      htmlFor="tx-data"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                    >
                      Data e hora
                    </label>
                    <input
                      id="tx-data"
                      type="datetime-local"
                      required
                      value={data}
                      onChange={(e) => setData(e.target.value)}
                      className="glass-input mt-1.5 h-11 w-full min-w-0 max-w-full appearance-none rounded-xl px-3 font-mono text-xs text-slate-900 tabular-nums transition-colors focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:text-white dark:focus:border-emerald-500"
                    />
                  </div>
                </div>

                {/* Categoria Selector (todas as 20 categorias oficiais) */}
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Categoria
                    </span>
                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      {categoria}
                    </span>
                  </div>
                  <div
                    className="mt-1.5 grid grid-cols-5 sm:grid-cols-6 gap-2"
                    role="radiogroup"
                    aria-label="Selecionar categoria"
                  >
                    {CATEGORIES.map((cat) => {
                      const cfg = CATEGORY_MAP[cat];
                      const Icon = cfg.icon;
                      const active = categoria === cat;
                      return (
                        <motion.button
                          key={cat}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          aria-label={cat}
                          title={cat}
                          whileTap={{ scale: 0.92 }}
                          transition={{ duration: 0.12, ease: EASE_IOS }}
                          onClick={() => setCategoria(cat)}
                          className={`flex h-11 flex-col items-center justify-center rounded-2xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                            active
                              ? 'glass-accent text-white dark:text-slate-950 scale-105 shadow-md shadow-emerald-600/25'
                              : `glass-icon-orb ${cfg.iconBg} ${cfg.iconText} hover:scale-[1.03]`
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                        </motion.button>
                      );
                    })}
                  </div>
                </div>

                {/* Método de Pagamento */}
                <div>
                  <span className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Método de pagamento
                  </span>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {PAYMENT_METHODS.map((item) => {
                      const active = metodo === item;
                      return (
                        <motion.button
                          key={item}
                          type="button"
                          whileTap={{ scale: 0.96 }}
                          onClick={() => setMetodo(item)}
                          className={`min-h-[36px] whitespace-nowrap rounded-full px-3.5 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                            active
                              ? 'glass-accent text-white dark:text-slate-950'
                              : 'glass-control text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          {item}
                        </motion.button>
                      );
                    })}
                  </div>
                </div>

                {/* Inline error */}
                {error && (
                  <div
                    role="alert"
                    className="rounded-2xl border border-red-200/80 bg-red-50/85 px-3.5 py-2.5 text-xs font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/55 dark:text-red-300"
                  >
                    {error}
                  </div>
                )}
              </div>

              {/* Submit Footer */}
              <div className="mt-6 flex items-center gap-2.5 pt-2">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  onClick={onClose}
                  disabled={submitting}
                  className="glass-control h-12 flex-1 rounded-full text-sm font-semibold text-slate-700 transition-colors disabled:opacity-50 dark:text-slate-200"
                >
                  Cancelar
                </motion.button>
                <motion.button
                  type="submit"
                  whileTap={{ scale: 0.98 }}
                  disabled={submitting}
                  className="glass-accent flex h-12 flex-[1.5] items-center justify-center gap-2 rounded-full text-sm font-semibold text-white transition-all disabled:opacity-60 dark:text-slate-950"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <span>
                      {isEdit
                        ? 'Salvar alterações'
                        : !isOnline && isRealMode
                          ? 'Salvar na fila offline'
                          : 'Registrar saída'}
                    </span>
                  )}
                </motion.button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
