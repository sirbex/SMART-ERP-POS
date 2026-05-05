/**
 * BackdropOverlay
 *
 * The visual layer rendered by TransactionGuardProvider when a UI transaction
 * guard is active. Covers the entire viewport with a semi-transparent dark
 * backdrop and blur effect, freezing all background content.
 *
 * This component is NOT intended to be used directly by application code.
 * Use useTransactionGuard() → openGuard() or openWithGuard() instead.
 *
 * Visual spec (matches SAP Fiori / Radix overlay):
 *   background : rgba(0, 0, 0, 0.45)
 *   blur       : backdrop-filter: blur(3px)
 *   position   : fixed, inset 0 (full viewport)
 */

import type { ReactNode } from 'react';

interface BackdropOverlayProps {
  guardId: string;
  overlayZIndex: number;
  panelZIndex: number;
  cancellable: boolean;
  label: string;
  /** True if this is the topmost (most recently opened) guard layer */
  isTopmost: boolean;
  onBackdropClick: (guardId: string) => void;
  /**
   * When non-null (openWithGuard usage), renders this content inside a portal
   * panel above the overlay. When null (openGuard usage), the calling component
   * manages its own panel rendering and must apply panelZIndex to its container.
   */
  content: ReactNode | null;
}

export default function BackdropOverlay({
  guardId,
  overlayZIndex,
  panelZIndex,
  cancellable,
  label,
  isTopmost,
  onBackdropClick,
  content,
}: BackdropOverlayProps) {
  const handleBackdropPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only fire if the click landed directly on the backdrop (not a child panel)
    if (e.target === e.currentTarget && cancellable) {
      onBackdropClick(guardId);
    }
  };

  return (
    <>
      {/*
       * ── Overlay ──────────────────────────────────────────────────────────
       * Covers the ENTIRE viewport including:
       *   - Main navigation sidebar
       *   - Page header / tabs
       *   - Data grids / tables
       *   - All other UI elements behind the active panel
       *
       * pointer-events: auto — this div intentionally captures all pointer
       * events so that no background element is clickable while guard is active.
       *
       * The blur is applied via backdrop-filter to create a visual depth cue
       * that the background is frozen (not just darkened).
       */}
      <div
        aria-hidden="true"
        data-transaction-guard="overlay"
        data-guard-id={guardId}
        data-topmost={isTopmost}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: overlayZIndex,
          background: 'rgba(0, 0, 0, 0.45)',
          backdropFilter: 'blur(3px)',
          WebkitBackdropFilter: 'blur(3px)',
          // Absorb all pointer events — freeze background
          pointerEvents: 'auto',
        }}
        onPointerDown={handleBackdropPointerDown}
        // Accessibility: announce guard state to screen readers
        role="presentation"
      />

      {/*
       * ── Panel slot (openWithGuard usage only) ────────────────────────────
       * When content is provided via openWithGuard(), render it here in a
       * portal at the correct z-index so it sits above the overlay.
       *
       * The panel div is a full-viewport flex container — content components
       * are responsible for their own positioning (centered dialog, slide-over,
       * etc.) using normal CSS/Tailwind positioning within this container.
       */}
      {content !== null && (
        <div
          data-transaction-guard="panel"
          data-guard-id={guardId}
          role="dialog"
          aria-modal="true"
          aria-label={label}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: panelZIndex,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            // pointer-events: none on the wrapper — the content component
            // applies its own pointer-events. This prevents the panel
            // wrapper itself from blocking clicks that should reach the content.
            pointerEvents: 'none',
          }}
        >
          <div style={{ pointerEvents: 'auto' }}>{content}</div>
        </div>
      )}
    </>
  );
}
