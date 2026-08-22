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

/** True when the global wedge listener should handle the key (focus outside fields). */
export function shouldCaptureBarcodeKeydownGlobally(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return true;
  const el = target as HTMLElement;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return false;
  if (el.isContentEditable) return false;
  return true;
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
      if (!shouldCaptureBarcodeKeydownGlobally(e.target)) {
        return;
      }

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
