/**
 * In-app QWERTY for search — SSOT pad. Phone and Windows use this same surface.
 * Large touch targets + clear press feedback; preventDefault keeps the input focused.
 */

import { memo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MouseEvent, PointerEvent } from 'react';
import {
  SOFT_KEYBOARD_ALPHA_ROWS,
  SOFT_KEYBOARD_DIGIT_ROW,
  type InAppSoftKey,
} from '../../lib/softKeyboard';

const KEY =
  'touch-manipulation select-none min-h-12 sm:min-h-[3.25rem] rounded-xl text-lg font-semibold ' +
  'shadow-[0_1px_0_0_rgba(0,0,0,0.08),0_2px_4px_rgba(0,0,0,0.06)] ' +
  'active:scale-[0.96] active:shadow-none active:translate-y-px ' +
  'transition-[transform,box-shadow,background-color] duration-75';

const KEY_CHAR = `${KEY} border border-stone-200/90 bg-white text-stone-900 active:bg-emerald-50`;
const KEY_ACTION =
  `${KEY} border border-stone-300/80 bg-stone-200/90 text-stone-700 active:bg-stone-300 text-base font-bold`;
const KEY_ENTER =
  `${KEY} border border-emerald-700 bg-emerald-600 text-white active:bg-emerald-700 shadow-[0_2px_0_0_#047857]`;

type SoftKeyboardPadProps = {
  onKey: (key: InAppSoftKey) => void;
  onEnter?: () => void;
  onClose: () => void;
  enterLabel?: string;
};

export const SoftKeyboardPad = memo(function SoftKeyboardPad({
  onKey,
  onEnter,
  onClose,
  enterLabel = 'Search',
}: SoftKeyboardPadProps) {
  const [shift, setShift] = useState(false);

  if (typeof document === 'undefined') return null;

  const keepFocus = (e: PointerEvent | MouseEvent) => {
    e.preventDefault();
  };

  const emitChar = (ch: string) => {
    onKey({ kind: 'char', char: shift ? ch.toUpperCase() : ch });
    setShift(false);
  };

  const charKey = (label: string, key: InAppSoftKey, extra = '') => (
    <button
      key={label}
      type="button"
      aria-label={label === '⌫' ? 'Backspace' : label === 'space' ? 'Space' : `Key ${label}`}
      className={`${KEY_CHAR} ${extra}`}
      onPointerDown={keepFocus}
      onClick={() => onKey(key)}
    >
      {label === 'space' ? (
        <span className="text-xs font-semibold uppercase tracking-widest text-stone-500">space</span>
      ) : (
        label
      )}
    </button>
  );

  const letterKey = (ch: string) => {
    const shown = shift ? ch.toUpperCase() : ch;
    return (
      <button
        key={ch}
        type="button"
        aria-label={`Key ${shown}`}
        className={KEY_CHAR}
        onPointerDown={keepFocus}
        onClick={() => emitChar(ch)}
      >
        {shown}
      </button>
    );
  };

  const pad = (
    <div
      className="fixed inset-x-0 bottom-0 z-[70] border-t border-stone-300/80 bg-gradient-to-b from-stone-200 to-stone-300 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-12px_40px_rgba(0,0,0,0.18)]"
      data-soft-keyboard-pad="true"
      data-shift={shift ? '1' : '0'}
      role="group"
      aria-label="On-screen keyboard"
      onPointerDown={keepFocus}
    >
      <div className="mx-auto max-w-3xl space-y-2 p-2.5 sm:p-3">
        <div className="mx-auto mb-0.5 h-1 w-10 rounded-full bg-stone-400/50" aria-hidden />

        <div className="grid grid-cols-10 gap-1.5">
          {SOFT_KEYBOARD_DIGIT_ROW.map((d) => charKey(d, { kind: 'char', char: d }))}
        </div>

        <div className="grid grid-cols-10 gap-1.5">
          {SOFT_KEYBOARD_ALPHA_ROWS[0].map(letterKey)}
        </div>

        <div className="grid grid-cols-9 gap-1.5 px-3 sm:px-5">
          {SOFT_KEYBOARD_ALPHA_ROWS[1].map(letterKey)}
        </div>

        <div className="grid grid-cols-10 gap-1.5">
          <button
            type="button"
            aria-label="Shift"
            aria-pressed={shift}
            data-soft-keyboard-shift="true"
            className={
              shift
                ? `${KEY} border border-emerald-700 bg-emerald-600 text-base font-bold text-white shadow-[0_2px_0_0_#047857] active:bg-emerald-700`
                : KEY_ACTION
            }
            onPointerDown={keepFocus}
            onClick={() => setShift((s) => !s)}
          >
            ⇧
          </button>
          {SOFT_KEYBOARD_ALPHA_ROWS[2].map(letterKey)}
          <button
            type="button"
            aria-label="Backspace"
            className={`${KEY_ACTION} col-span-2 text-xl`}
            onPointerDown={keepFocus}
            onClick={() => onKey({ kind: 'backspace' })}
          >
            ⌫
          </button>
        </div>

        <div className="grid grid-cols-8 gap-1.5">
          <button
            type="button"
            aria-label="Hide keyboard"
            className={`${KEY_ACTION} col-span-1 text-xl`}
            onPointerDown={keepFocus}
            onClick={onClose}
          >
            ⌄
          </button>
          {charKey('-', { kind: 'char', char: '-' })}
          {charKey('.', { kind: 'char', char: '.' })}
          {charKey('space', { kind: 'space' }, 'col-span-3')}
          <button
            type="button"
            className={`${KEY_ENTER} col-span-2 text-sm sm:text-base tracking-wide`}
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
    </div>
  );

  return createPortal(pad, document.body);
});

export default SoftKeyboardPad;
