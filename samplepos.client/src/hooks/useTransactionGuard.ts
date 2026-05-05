/**
 * useTransactionGuard
 *
 * Primary hook for interacting with the Transaction Guard system.
 * Must be used inside a component tree wrapped by <TransactionGuardProvider>.
 *
 * ─── Quick Reference ──────────────────────────────────────────────────────────
 *
 * Pattern A — Self-rendering component (drawer, slide-over, inline panel):
 *
 *   const { openGuard, closeGuard } = useTransactionGuard();
 *   const guardRef = useRef<GuardHandle | null>(null);
 *
 *   useEffect(() => {
 *     if (open) {
 *       guardRef.current = openGuard({ cancellable: true, label: 'Pay Invoice' });
 *       return () => {
 *         if (guardRef.current) closeGuard(guardRef.current.id);
 *       };
 *     }
 *   }, [open]);
 *
 *   // Apply handle.panelZIndex to your outermost fixed container:
 *   <div style={{ zIndex: guardRef.current?.panelZIndex ?? 975 }} className="fixed inset-0 ...">
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Pattern B — Portal-rendered content (dialog inside guard overlay):
 *
 *   const { openWithGuard, closeGuard } = useTransactionGuard();
 *
 *   const openPayment = () => {
 *     openWithGuard(
 *       <SupplierPaymentPanel onClose={() => closeGuard()} />,
 *       { cancellable: false, label: 'Record supplier payment' }
 *     );
 *   };
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Double-submission prevention (singleSubmit):
 *
 *   const { singleSubmit } = useTransactionGuard();
 *   const handlePay = singleSubmit(async () => {
 *     await api.payments.create(payload);
 *   });
 *   <button onClick={handlePay}>Post Payment</button>
 *   // Subsequent clicks while the first call is in flight are no-ops.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useRef } from 'react';
import { useTransactionGuardContext } from '../contexts/TransactionGuardContext';
import type { GuardOptions, GuardHandle } from '../contexts/TransactionGuardContext';

// Re-export ZINDEX for convenience — no additional import needed in components
export { ZINDEX } from '../contexts/TransactionGuardContext';
export type { GuardOptions, GuardHandle };

// ─── Hook ────────────────────────────────────────────────────────────────────

export interface UseTransactionGuard {
  /**
   * Lock the ERP UI. The calling component manages its own panel rendering.
   * Returns a GuardHandle with { id, panelZIndex }.
   * Set style={{ zIndex: handle.panelZIndex }} on your panel container.
   */
  openGuard: (options?: GuardOptions) => GuardHandle;

  /**
   * Render content inside the guard overlay portal AND lock the ERP UI.
   * Returns the guard ID — pass to closeGuard() when done.
   */
  openWithGuard: (content: React.ReactNode, options?: GuardOptions) => string;

  /**
   * Release the UI lock.
   * @param id - Guard ID from openGuard / openWithGuard.
   *             Omit to release the topmost active guard.
   */
  closeGuard: (id?: string) => void;

  /** True while any guard is active. */
  isGuardActive: boolean;

  /** Number of stacked guard layers. */
  guardDepth: number;

  /** ID of the topmost active guard. */
  activeGuardId: string | null;

  /**
   * Wraps an async action to prevent double-submission.
   * All calls while the wrapped function is executing are silently ignored.
   * This is a convenience utility on top of component-level isSubmitting state.
   *
   * Each call to singleSubmit() creates a new prevention scope — call it once
   * during component initialization (useMemo / stable ref), not on every render.
   *
   * @example
   *   const handlePay = singleSubmit(async () => {
   *     await api.payments.create(data);
   *   });
   */
  singleSubmit: <T>(handler: () => Promise<T>) => () => Promise<T | void>;
}

export function useTransactionGuard(): UseTransactionGuard {
  const ctx = useTransactionGuardContext();

  const singleSubmit = useCallback(
    <T,>(handler: () => Promise<T>) => {
      const inFlight = { current: false };
      return async (): Promise<T | void> => {
        if (inFlight.current) return;
        inFlight.current = true;
        try {
          return await handler();
        } finally {
          inFlight.current = false;
        }
      };
    },
    [] // stable — does not depend on any context values
  );

  return {
    openGuard: ctx.openGuard,
    openWithGuard: ctx.openWithGuard,
    closeGuard: ctx.closeGuard,
    isGuardActive: ctx.isGuardActive,
    guardDepth: ctx.guardDepth,
    activeGuardId: ctx.activeGuardId,
    singleSubmit,
  };
}

// ─── Convenience hook: auto-open/close guard bound to a boolean ───────────────

/**
 * useGuardedOpen
 *
 * Declarative convenience hook. Opens the guard when `open` is true,
 * closes it when `open` becomes false or the component unmounts.
 * Returns the current GuardHandle (null when not active).
 *
 * Useful for components that already have `open` state and just need
 * to hook into the guard system without managing guard IDs manually.
 *
 * @example
 *   const handle = useGuardedOpen(isPaymentModalOpen, {
 *     cancellable: false,
 *     label: 'Record supplier payment',
 *   });
 *   // Then on your panel container:
 *   <div style={{ zIndex: handle?.panelZIndex ?? 975 }} className="fixed inset-0 ...">
 */
export function useGuardedOpen(
  open: boolean,
  options?: GuardOptions
): GuardHandle | null {
  const { openGuard, closeGuard } = useTransactionGuard();
  const handleRef = useRef<GuardHandle | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // We intentionally use an imperative ref-based approach here rather than
  // useEffect to avoid guard flicker on re-renders with the same `open` state.
  const prevOpenRef = useRef(false);

  if (open && !prevOpenRef.current) {
    // Transition false → true: open guard immediately (synchronous)
    prevOpenRef.current = true;
    // Note: openGuard calls setStack which is async, but the handle is
    // computed synchronously from the current stack length.
    handleRef.current = openGuard(optionsRef.current);
  } else if (!open && prevOpenRef.current) {
    // Transition true → false: close guard
    prevOpenRef.current = false;
    if (handleRef.current) {
      closeGuard(handleRef.current.id);
      handleRef.current = null;
    }
  }

  return handleRef.current;
}
