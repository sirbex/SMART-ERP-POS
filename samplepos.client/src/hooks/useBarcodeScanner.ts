import { useEffect, useRef, useState } from 'react';

interface UseBarcodeScanner {
  buffer: string;
  lastScannedBarcode: string | null;
}

interface BarcodeScannerOptions {
  onScan: (barcode: string) => void;
  minLength?: number;
  maxLength?: number;
  timeout?: number; // ms between keystrokes before buffer resets
  enabled?: boolean;
}

/**
 * Hook to listen for barcode scanner input
 * Barcode scanners typically type very fast (< 50ms between chars)
 * and end with Enter key
 */
export function useBarcodeScanner({
  onScan,
  minLength = 3,
  maxLength = 50,
  timeout = 100,
  enabled = true,
}: BarcodeScannerOptions): UseBarcodeScanner {
  const [buffer, setBuffer] = useState('');
  const [lastScannedBarcode, setLastScannedBarcode] = useState<string | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastKeystrokeRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input field (except search)
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' &&
        !target.classList.contains('barcode-scanner-enabled') &&
        target.getAttribute('type') !== 'search'
      ) {
        return;
      }
      if (target.tagName === 'TEXTAREA') return;
      if (target.tagName === 'SELECT') return;

      const now = Date.now();
      const timeSinceLastKeystroke = now - lastKeystrokeRef.current;

      // Reset buffer if too much time passed (human typing)
      if (timeSinceLastKeystroke > timeout && buffer.length > 0) {
        setBuffer('');
      }

      lastKeystrokeRef.current = now;

      // Clear existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Handle Enter key (end of barcode)
      if (e.key === 'Enter') {
        e.preventDefault();
        if (buffer.length >= minLength && buffer.length <= maxLength) {
          setLastScannedBarcode(buffer);
          onScan(buffer);
          setBuffer('');
        } else {
          setBuffer('');
        }
        return;
      }

      // Ignore special keys
      if (
        e.key.length > 1 && // Ignore keys like Shift, Control, Alt, etc.
        e.key !== 'Enter' &&
        e.key !== 'Backspace'
      ) {
        return;
      }

      // Accumulate character
      if (e.key.length === 1) {
        e.preventDefault(); // Prevent typing in background
        setBuffer(prev => {
          const newBuffer = prev + e.key;
          // Auto-submit if max length reached
          if (newBuffer.length === maxLength) {
            timeoutRef.current = setTimeout(() => {
              setLastScannedBarcode(newBuffer);
              onScan(newBuffer);
              setBuffer('');
            }, 50);
          }
          return newBuffer;
        });

        // Set timeout to auto-reset buffer
        timeoutRef.current = setTimeout(() => {
          setBuffer('');
        }, timeout);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [buffer, enabled, maxLength, minLength, onScan, timeout]);

  return { buffer, lastScannedBarcode };
}
