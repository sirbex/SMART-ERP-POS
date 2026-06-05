/**
 * Transaction Guard Context
 *
 * SAP-grade UI transaction locking system. When any transactional panel is
 * open, the entire ERP UI is locked:
 *   - Semi-transparent dark overlay with backdrop-blur covers all background content
 *   - Body scroll locked (overflow: hidden on <body>)
 *   - All background pointer events disabled (overlay sits above entire app)
 *   - Navigation clicks ignored (overlay covers nav)
 *   - ESC key controlled per-panel (cancellable option)
 *   - Backdrop click controlled per-panel (cancellable option)
 *   - Supports nested dialogs (dialog stacked on top of drawer)
 *
 * Mental model:
 *   BEGIN UI TRANSACTION
 *   LOCK APPLICATION UI
 *   ...user completes or cancels...
 *   COMMIT / ROLLBACK
 *   UNLOCK UI
 *
 * ─── Z-Index Hierarchy ──────────────────────────────────────────────────────
 *   App content          : 0 – 60   (existing components, drawers, dialogs)
 *   Guard overlay        : 970      (blocks ALL background — nav, grids, etc.)
 *   Active panel         : 975      (above overlay — transactional component)
 *   Nested guard overlay : 980      (second-level lock)
 *   Nested panel         : 985      (second-level panel)
 *   Toast / alerts       : 999      (always topmost — never blocked)
 */

import {
  createContext,
  useContext,
  useCallback,
  useRef,
  useState,
  useEffect,
} from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import BackdropOverlay from '../components/ui/BackdropOverlay';
import { setTransactionGuardDepth } from '../lib/sessionActivity';

// ─── Z-Index Constants (export for panel components to import) ────────────────

export const ZINDEX = {
  /** Backdrop overlay that blocks all background content */
  OVERLAY: 970,
  /** Active transactional panel (above the overlay) */
  PANEL: 975,
  /** Overlay for a second-level (nested) guard */
  NESTED_OVERLAY: 980,
  /** Panel for a second-level (nested) guard */
  NESTED_PANEL: 985,
  /** Toast / notification system — always above everything */
  ALERTS: 999,
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GuardOptions {
  /**
   * Whether ESC key and backdrop click will dismiss the guard.
   * Set to false for irreversible operations (e.g. posting a payment) where
   * accidental dismissal would be dangerous.
   * Default: true
   */
  cancellable?: boolean;
  /** Accessible label announced to screen readers while guard is active. */
  label?: string;
}

export interface GuardHandle {
  /** Unique ID for this guard instance — pass to closeGuard() to release. */
  id: string;
  /**
   * Z-index to apply to the panel's outermost container element.
   * Guaranteed to be above the guard's backdrop overlay.
   * Use as: <div style={{ zIndex: handle.panelZIndex }} className="fixed inset-0 ...">
   */
  panelZIndex: number;
}

/** @internal */
interface GuardEntry {
  id: string;
  options: Required<GuardOptions>;
  /** Non-null only when openWithGuard() was used */
  content: ReactNode | null;
  panelZIndex: number;
  overlayZIndex: number;
}

export interface TransactionGuardContextValue {
  /**
   * Lock the ERP UI. The calling component manages its own panel rendering.
   * Returns a GuardHandle — use handle.panelZIndex on your panel, and pass
   * handle.id to closeGuard() when done.
   *
   * @example
   *   const guard = openGuard({ cancellable: true, label: 'Pay Invoice' });
   *   // ...set your panel z-index: style={{ zIndex: guard.panelZIndex }}
   *   // ...when closing: closeGuard(guard.id)
   */
  openGuard: (options?: GuardOptions) => GuardHandle;

  /**
   * Render content inside a portal panel AND lock the ERP UI.
   * The content is rendered at the correct z-index automatically — no
   * z-index management needed in the content component.
   * Returns the guard ID for use with closeGuard().
   *
   * @example
   *   const id = openWithGuard(
   *     <SupplierPaymentPanel onClose={() => closeGuard(id)} />,
   *     { cancellable: false, label: 'Record supplier payment' }
   *   );
   */
  openWithGuard: (content: ReactNode, options?: GuardOptions) => string;

  /**
   * Release the UI lock and remove the guard.
   * @param id - The guard ID or handle.id from openGuard / openWithGuard.
   *             If omitted, releases the topmost (most recently opened) guard.
   */
  closeGuard: (id?: string) => void;

  /** True if any guard layer is currently active. */
  isGuardActive: boolean;

  /** Number of stacked guard layers (supports nested transactions). */
  guardDepth: number;

  /** The ID of the topmost active guard (most recently opened). */
  activeGuardId: string | null;
}

// ─── Context ──────────────────────────────────────────────────────────────────

export const TransactionGuardContext =
  createContext<TransactionGuardContextValue | null>(null);

// ─── Internal helpers ─────────────────────────────────────────────────────────

let _seq = 0;
const nextId = () => `tg-${Date.now()}-${++_seq}`;

function buildEntry(
  options: GuardOptions,
  depth: number,
  content: ReactNode | null
): GuardEntry {
  const overlayZIndex = ZINDEX.OVERLAY + (depth - 1) * 10;
  const panelZIndex = ZINDEX.PANEL + (depth - 1) * 10;
  return {
    id: nextId(),
    options: {
      cancellable: options.cancellable ?? true,
      label: options.label ?? 'Transaction in progress',
    },
    content,
    overlayZIndex,
    panelZIndex,
  };
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function TransactionGuardProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<GuardEntry[]>([]);
  const stackRef = useRef<GuardEntry[]>([]);

  // Keep ref in sync so callbacks can read current stack without stale closure
  useEffect(() => {
    stackRef.current = stack;
  }, [stack]);

  // ── Body scroll lock ──────────────────────────────────────────────────────
  useEffect(() => {
    if (stack.length > 0) {
      const original = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = original;
      };
    }
  }, [stack.length]);

  // Pause idle logout + keep session alive while PO/payment panels are open
  useEffect(() => {
    setTransactionGuardDepth(stack.length);
    window.dispatchEvent(
      new CustomEvent('app:transaction-guard', {
        detail: { active: stack.length > 0, depth: stack.length },
      }),
    );
  }, [stack.length]);

  // ── ESC key handler (capture phase — runs before component key handlers) ──
  const handleEsc = useCallback((e: KeyboardEvent) => {
    const top = stackRef.current[stackRef.current.length - 1];
    if (!top) return;
    if (e.key === 'Escape') {
      e.stopImmediatePropagation();
      if (top.options.cancellable) {
        setStack((prev) => prev.filter((en) => en.id !== top.id));
      }
    }
  }, []);

  useEffect(() => {
    if (stack.length > 0) {
      document.addEventListener('keydown', handleEsc, true);
      return () => document.removeEventListener('keydown', handleEsc, true);
    }
  }, [stack.length, handleEsc]);

  // ── openGuard ─────────────────────────────────────────────────────────────
  const openGuard = useCallback((options: GuardOptions = {}): GuardHandle => {
    const depth = stackRef.current.length + 1;
    const entry = buildEntry(options, depth, null);
    setStack((prev) => [...prev, entry]);
    return { id: entry.id, panelZIndex: entry.panelZIndex };
  }, []);

  // ── openWithGuard ─────────────────────────────────────────────────────────
  const openWithGuard = useCallback(
    (content: ReactNode, options: GuardOptions = {}): string => {
      const depth = stackRef.current.length + 1;
      const entry = buildEntry(options, depth, content);
      setStack((prev) => [...prev, entry]);
      return entry.id;
    },
    []
  );

  // ── closeGuard ────────────────────────────────────────────────────────────
  const closeGuard = useCallback((id?: string) => {
    setStack((prev) => {
      if (!id) return prev.slice(0, -1);
      return prev.filter((en) => en.id !== id);
    });
  }, []);

  // ── Backdrop click handler ────────────────────────────────────────────────
  const handleBackdropClick = useCallback(
    (entryId: string) => {
      setStack((prev) => {
        const entry = prev.find((en) => en.id === entryId);
        if (entry?.options.cancellable) {
          return prev.filter((en) => en.id !== entryId);
        }
        return prev;
      });
    },
    []
  );

  const topEntry = stack.length > 0 ? stack[stack.length - 1] : null;

  const value: TransactionGuardContextValue = {
    openGuard,
    openWithGuard,
    closeGuard,
    isGuardActive: stack.length > 0,
    guardDepth: stack.length,
    activeGuardId: topEntry?.id ?? null,
  };

  return (
    <TransactionGuardContext.Provider value={value}>
      {children}

      {/*
       * Portal-rendered guard layers.
       * Each entry renders:
       *   - A semi-transparent overlay (blocks all background interaction)
       *   - Optionally: panel content (when openWithGuard() was used)
       *
       * Rendered directly in document.body so they are never clipped by a
       * parent stacking context.
       */}
      {stack.map((entry, idx) => {
        const isTopmost = idx === stack.length - 1;
        return createPortal(
          <BackdropOverlay
            key={entry.id}
            guardId={entry.id}
            overlayZIndex={entry.overlayZIndex}
            panelZIndex={entry.panelZIndex}
            cancellable={entry.options.cancellable}
            label={entry.options.label}
            isTopmost={isTopmost}
            onBackdropClick={handleBackdropClick}
            content={entry.content}
          />,
          document.body
        );
      })}
    </TransactionGuardContext.Provider>
  );
}

// ─── Raw context accessor (used internally and by useTransactionGuard) ────────

export function useTransactionGuardContext(): TransactionGuardContextValue {
  const ctx = useContext(TransactionGuardContext);
  if (!ctx) {
    throw new Error(
      'useTransactionGuard must be used inside <TransactionGuardProvider>. ' +
        'Ensure TransactionGuardProvider wraps your application in main.tsx.'
    );
  }
  return ctx;
}
