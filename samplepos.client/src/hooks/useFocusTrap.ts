import { useEffect, useRef } from 'react';

/**
 * useFocusTrap
 * Traps keyboard focus within a container element while active.
 * Returns a ref to assign to the modal content element.
 * Features:
 *  - Cycles Tab / Shift+Tab within focusable children
 *  - ESC triggers onEscape callback (if provided)
 *  - Restores focus to previously focused element on unmount
 */
export function useFocusTrap(active: boolean, onEscape?: () => void) {
  const containerRef = useRef<HTMLElement | null>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    lastFocusedRef.current = document.activeElement as HTMLElement;
    const container = containerRef.current;
    if (!container) return;
    // Focus first focusable child
    const focusable = getFocusable(container);
    if (focusable[0]) focusable[0].focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!active) return;
      if (e.key === 'Escape') {
        if (onEscape) onEscape();
        e.stopPropagation();
        return;
      }
      if (e.key === 'Tab') {
        const list = getFocusable(container);
        if (list.length === 0) return;
        const currentIndex = list.indexOf(document.activeElement as HTMLElement);
        let nextIndex = currentIndex;
        if (e.shiftKey) {
          nextIndex = currentIndex <= 0 ? list.length - 1 : currentIndex - 1;
        } else {
          nextIndex = currentIndex === list.length - 1 ? 0 : currentIndex + 1;
        }
        list[nextIndex].focus();
        e.preventDefault();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      // Restore focus
      if (lastFocusedRef.current) {
        try { lastFocusedRef.current.focus(); } catch {}
      }
    };
  }, [active, onEscape]);

  return containerRef;
}

function getFocusable(root: HTMLElement) {
  const selectors = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ];
  const nodes = Array.from(root.querySelectorAll<HTMLElement>(selectors.join(',')));
  return nodes.filter(el => !el.hasAttribute('disabled') && !el.getAttribute('aria-hidden'));
}

export default useFocusTrap;