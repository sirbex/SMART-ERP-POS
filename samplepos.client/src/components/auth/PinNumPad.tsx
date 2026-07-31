/**
 * In-app PIN number pad — Samba/Toast-style dialer for POS login & approvals.
 * Does not rely on the OS soft keyboard (unreliable on Windows tablets).
 * Hardware keyboards still work via window keydown.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  applyPinPadKey,
  canSubmitPin,
  mapKeyboardEventToPinKey,
  type PinPadKey,
} from '../../lib/pinNumPadLogic';

const KEYS: PinPadKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'];

const TOUCH =
  'touch-manipulation select-none active:scale-[0.98] transition-transform min-h-14';

export type PinNumPadProps = {
  length: number;
  onComplete: (pin: string) => void;
  /** Fires on every digit change (for Approve buttons that accept shorter PINs). */
  onChange?: (pin: string) => void;
  /** Auto-call onComplete when length digits entered (default true). */
  autoSubmit?: boolean;
  /**
   * When set (< length), show a Done button once this many digits are entered
   * (manager PIN 4–6). Auto-submits at `length` when autoSubmit is true.
   */
  minLength?: number;
  doneLabel?: string;
  error?: string | null;
  isLoading?: boolean;
  /** Mask digits as bullets (default true). */
  masked?: boolean;
  className?: string;
  /** Extra label above the dots. */
  label?: string;
};

export function PinNumPad({
  length,
  onComplete,
  onChange,
  autoSubmit = true,
  minLength,
  doneLabel = 'Done',
  error,
  isLoading = false,
  masked = true,
  className = '',
  label,
}: PinNumPadProps) {
  const [digits, setDigits] = useState('');
  const earlyDone = typeof minLength === 'number' && minLength > 0 && minLength < length;

  const applyKey = useCallback(
    (key: PinPadKey) => {
      if (isLoading) return;
      setDigits((prev) => {
        const r = applyPinPadKey({ digits: prev, length }, key);
        onChange?.(r.digits);
        if (autoSubmit && r.completed) {
          queueMicrotask(() => onComplete(r.digits));
        }
        return r.digits;
      });
    },
    [autoSubmit, isLoading, length, onChange, onComplete],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isLoading) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
        return;
      }
      const mapped = mapKeyboardEventToPinKey(e.key);
      if (mapped) {
        e.preventDefault();
        applyKey(mapped);
        return;
      }
      if (
        e.key === 'Enter' &&
        earlyDone &&
        canSubmitPin(digits, minLength ?? length, length)
      ) {
        e.preventDefault();
        onComplete(digits);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [applyKey, digits, earlyDone, isLoading, length, minLength, onComplete]);

  const reset = useCallback(() => {
    setDigits('');
    onChange?.('');
  }, [onChange]);

  useEffect(() => {
    if (error) reset();
  }, [error, reset]);

  useEffect(() => {
    reset();
  }, [length, reset]);

  return (
    <div className={`flex w-full max-w-xs flex-col items-center gap-4 ${className}`}>
      {label ? (
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</p>
      ) : null}

      <div
        className="flex gap-2.5"
        role="group"
        aria-label={`${length}-digit PIN`}
        aria-live="polite"
      >
        {Array.from({ length }, (_, i) => {
          const filled = i < digits.length;
          return (
            <div
              key={i}
              className={`flex h-14 w-12 items-center justify-center rounded-xl border-2 text-2xl font-bold ${
                filled
                  ? 'border-blue-500 bg-blue-50 text-blue-900 dark:border-blue-400 dark:bg-blue-950 dark:text-blue-100'
                  : 'border-gray-300 bg-white text-gray-300 dark:border-gray-600 dark:bg-gray-800'
              }`}
              aria-hidden
            >
              {filled ? (masked ? '•' : digits[i]) : ''}
            </div>
          );
        })}
      </div>

      <input
        type="password"
        inputMode="none"
        autoComplete="one-time-code"
        value={digits}
        readOnly
        tabIndex={-1}
        aria-hidden
        className="sr-only"
      />

      {error ? (
        <p className="animate-pulse text-sm font-medium text-red-500" role="alert">
          {error}
        </p>
      ) : null}

      {isLoading ? (
        <div className="flex items-center gap-2 text-gray-500">
          <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" aria-hidden>
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <span>Verifying...</span>
        </div>
      ) : (
        <>
          <div className="grid w-full grid-cols-3 gap-2" role="group" aria-label="Number pad">
            {KEYS.map((key) => (
              <button
                key={key}
                type="button"
                disabled={isLoading}
                aria-label={
                  key === 'C' ? 'Clear PIN' : key === '⌫' ? 'Delete last digit' : `Digit ${key}`
                }
                className={`${TOUCH} rounded-xl border text-xl font-bold disabled:opacity-50 ${
                  key === 'C' || key === '⌫'
                    ? 'border-stone-300 bg-stone-100 text-stone-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200'
                    : 'border-stone-300 bg-white text-stone-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100'
                }`}
                onClick={() => applyKey(key)}
              >
                {key}
              </button>
            ))}
          </div>
          {earlyDone ? (
            <button
              type="button"
              disabled={
                isLoading || !canSubmitPin(digits, minLength ?? length, length)
              }
              className={`${TOUCH} w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40`}
              onClick={() => {
                if (canSubmitPin(digits, minLength ?? length, length)) onComplete(digits);
              }}
            >
              {doneLabel}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}

export default PinNumPad;
