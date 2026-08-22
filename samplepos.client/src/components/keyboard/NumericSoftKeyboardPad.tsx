/**
 * In-app numeric pad — amounts, qty, prices. Same policy as search keyboard.
 */

import { createPortal } from 'react-dom';
import type { MouseEvent, PointerEvent } from 'react';
import type { InAppNumericKey } from '../../lib/numericPadLogic';
import { PAD_KEY_ACTION, PAD_KEY_CHAR, PAD_KEY_ENTER, PAD_SHELL } from './keyboardPadStyles';

const ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
] as const;

type NumericSoftKeyboardPadProps = {
  onKey: (key: InAppNumericKey) => void;
  onEnter?: () => void;
  onClose: () => void;
  enterLabel?: string;
  allowDecimal?: boolean;
};

export function NumericSoftKeyboardPad({
  onKey,
  onEnter,
  onClose,
  enterLabel = 'Done',
  allowDecimal = true,
}: NumericSoftKeyboardPadProps) {
  if (typeof document === 'undefined') return null;

  const keepFocus = (e: PointerEvent | MouseEvent) => {
    e.preventDefault();
  };

  const digitBtn = (d: string) => (
    <button
      key={d}
      type="button"
      aria-label={`Digit ${d}`}
      className={PAD_KEY_CHAR}
      onPointerDown={keepFocus}
      onClick={() => onKey({ kind: 'digit', digit: d })}
    >
      {d}
    </button>
  );

  const pad = (
    <div
      className={PAD_SHELL}
      data-numeric-soft-keyboard-pad="true"
      role="group"
      aria-label="Number pad"
      onPointerDown={keepFocus}
    >
      <div className="mx-auto max-w-sm space-y-2 p-2.5 sm:p-3">
        <div className="mx-auto mb-0.5 h-1 w-10 rounded-full bg-stone-400/50" aria-hidden />
        {ROWS.map((row) => (
          <div key={row.join('')} className="grid grid-cols-3 gap-1.5">
            {row.map(digitBtn)}
          </div>
        ))}
        <div className={`grid gap-1.5 ${allowDecimal ? 'grid-cols-5' : 'grid-cols-4'}`}>
          <button
            type="button"
            aria-label="Hide number pad"
            className={PAD_KEY_ACTION}
            onPointerDown={keepFocus}
            onClick={onClose}
          >
            ⌄
          </button>
          <button
            type="button"
            aria-label="Clear"
            className={PAD_KEY_ACTION}
            onPointerDown={keepFocus}
            onClick={() => onKey({ kind: 'clear' })}
          >
            C
          </button>
          {digitBtn('0')}
          <button
            type="button"
            aria-label="Backspace"
            className={`${PAD_KEY_ACTION} text-xl`}
            onPointerDown={keepFocus}
            onClick={() => onKey({ kind: 'backspace' })}
          >
            ⌫
          </button>
          {allowDecimal ? (
            <button
              type="button"
              aria-label="Decimal point"
              className={PAD_KEY_CHAR}
              onPointerDown={keepFocus}
              onClick={() => onKey({ kind: 'decimal' })}
            >
              .
            </button>
          ) : null}
        </div>
        <button
          type="button"
          className={`${PAD_KEY_ENTER} w-full text-base tracking-wide`}
          onPointerDown={keepFocus}
          onClick={() => {
            onEnter?.();
            onClose();
          }}
        >
          {enterLabel}
        </button>
      </div>
    </div>
  );

  return createPortal(pad, document.body);
}

export default NumericSoftKeyboardPad;
