/**
 * Focus Trap Hook
 * 
 * Custom hook for trapping focus within modals for accessibility.
 * Implements ARIA dialog best practices with keyboard navigation.
 */

import { useEffect, useRef } from 'react';

/**
 * Focusable element selectors
 */
const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]'
].join(', ');

/**
 * Hook to trap focus within a modal/dialog
 * 
 * @param isOpen - Whether the modal is open
 * @returns Ref to attach to the modal container
 * 
 * @example
 * ```tsx
 * function Modal({ isOpen, onClose }) {
 *   const modalRef = useFocusTrap(isOpen);
 *   
 *   return (
 *     <div ref={modalRef} role="dialog" aria-modal="true">
 *       <button onClick={onClose}>Close</button>
 *       <input type="text" />
 *     </div>
 *   );
 * }
 * ```
 */
export function useFocusTrap(isOpen: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    // Save the currently focused element
    previousFocusRef.current = document.activeElement as HTMLElement;

    // Get all focusable elements within the container
    const getFocusableElements = (): HTMLElement[] => {
      if (!containerRef.current) return [];
      return Array.from(
        containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)
      );
    };

    // Focus the first focusable element
    const focusableElements = getFocusableElements();
    if (focusableElements.length > 0) {
      focusableElements[0].focus();
    }

    // Handle Tab key to trap focus
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;

      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey) {
        // Shift + Tab: Move focus backwards
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab: Move focus forwards
        if (document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    };

    // Attach event listener
    document.addEventListener('keydown', handleKeyDown);

    // Cleanup: restore previous focus
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (previousFocusRef.current) {
        previousFocusRef.current.focus();
      }
    };
  }, [isOpen]);

  return containerRef;
}

/**
 * Hook to handle Escape key for closing modals
 * 
 * @param isOpen - Whether the modal is open
 * @param onClose - Callback to close the modal
 * 
 * @example
 * ```tsx
 * function Modal({ isOpen, onClose }) {
 *   useEscapeKey(isOpen, onClose);
 *   
 *   return <div>...</div>;
 * }
 * ```
 */
export function useEscapeKey(isOpen: boolean, onClose: () => void) {
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);
}

/**
 * Hook to prevent body scroll when modal is open
 * 
 * @param isOpen - Whether the modal is open
 * 
 * @example
 * ```tsx
 * function Modal({ isOpen }) {
 *   usePreventScroll(isOpen);
 *   
 *   return <div>...</div>;
 * }
 * ```
 */
export function usePreventScroll(isOpen: boolean) {
  useEffect(() => {
    if (!isOpen) return;

    // Save current scroll position
    const scrollY = window.scrollY;
    
    // Prevent scroll
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';

    return () => {
      // Restore scroll
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      window.scrollTo(0, scrollY);
    };
  }, [isOpen]);
}

/**
 * Combined modal accessibility hook
 * Includes focus trap, escape key, and scroll prevention
 * 
 * @param isOpen - Whether the modal is open
 * @param onClose - Callback to close the modal
 * @returns Ref to attach to the modal container
 * 
 * @example
 * ```tsx
 * function Modal({ isOpen, onClose }) {
 *   const modalRef = useModalAccessibility(isOpen, onClose);
 *   
 *   return (
 *     <div ref={modalRef} role="dialog" aria-modal="true">
 *       ...
 *     </div>
 *   );
 * }
 * ```
 */
export function useModalAccessibility(isOpen: boolean, onClose: () => void) {
  const modalRef = useFocusTrap(isOpen);
  useEscapeKey(isOpen, onClose);
  usePreventScroll(isOpen);
  
  return modalRef;
}
