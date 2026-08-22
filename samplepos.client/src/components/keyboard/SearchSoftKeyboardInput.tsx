/**
 * Search field SSOT — real input + in-app QWERTY.
 * Phone and Windows use this same control. Surfaces must not fork a private pad.
 */

import {
  useEffect,
  useRef,
  type FocusEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from 'react';
import { Keyboard } from 'lucide-react';
import { requestSoftKeyboard, softKeyboardAttrs } from '../../lib/softKeyboard';
import { useSearchSoftKeyboard } from '../../hooks/useSearchSoftKeyboard';
import { SoftKeyboardPad } from './SoftKeyboardPad';

export type SearchSoftKeyboardInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type' | 'inputMode' | 'enterKeyHint'
> & {
  value: string;
  onChange: (value: string) => void;
  onEnter?: () => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  wrapClassName?: string;
  toggleClassName?: string;
  enterLabel?: string;
  selectOnFocus?: boolean;
  autoFocus?: boolean;
};

export function SearchSoftKeyboardInput({
  value,
  onChange,
  onEnter,
  inputRef,
  wrapClassName = '',
  toggleClassName = '',
  enterLabel,
  selectOnFocus = false,
  autoFocus,
  className = '',
  disabled,
  onFocus,
  onPointerDown,
  onKeyDown,
  ...rest
}: SearchSoftKeyboardInputProps) {
  const internalRef = useRef<HTMLInputElement>(null);
  const refToUse = inputRef ?? internalRef;
  const kb = useSearchSoftKeyboard(onChange, value);
  const kbBind = kb.bindInput({
    onFocus: (e: FocusEvent<HTMLInputElement>) => {
      if (selectOnFocus) {
        e.currentTarget.select();
        kb.markReplaceAll();
      }
      onFocus?.(e);
    },
    onPointerDown: (e: PointerEvent<HTMLInputElement>) => {
      onPointerDown?.(e);
    },
  });

  useEffect(() => {
    if (!autoFocus || !refToUse.current) return;
    requestSoftKeyboard(refToUse.current);
    kb.openPadIfAuto();
  }, [autoFocus, refToUse, kb.openPadIfAuto]);

  const paddedClass = /\bpr-/.test(className) ? className : `pr-11 ${className}`.trim();

  return (
    <div className={`relative min-w-0 w-full ${wrapClassName}`.trim()}>
      <input
        {...rest}
        ref={refToUse}
        type="search"
        value={value}
        disabled={disabled}
        autoComplete={rest.autoComplete ?? 'off'}
        className={paddedClass}
        {...softKeyboardAttrs('search', 'search')}
        inputMode={kb.open ? 'none' : 'search'}
        data-search-soft-keyboard-input="true"
        onChange={(e) => onChange(e.target.value)}
        onPointerDown={kbBind.onPointerDown}
        onFocus={kbBind.onFocus}
        onBlur={kbBind.onBlur}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          onKeyDown?.(e);
          if (e.key === 'Enter') {
            onEnter?.();
            kb.close();
          }
          if (e.key === 'Escape') kb.close();
        }}
      />
      <button
        type="button"
        disabled={disabled}
        aria-label={kb.open ? 'Hide keyboard' : 'Show keyboard'}
        aria-pressed={kb.open}
        data-search-soft-keyboard-toggle="true"
        className={`absolute right-1 top-1/2 z-[1] inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-stone-500 hover:bg-stone-100 disabled:opacity-60 ${toggleClassName}`.trim()}
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => {
          if (kb.open) {
            kb.close();
            return;
          }
          kb.openPad();
          requestSoftKeyboard(refToUse.current);
        }}
      >
        <Keyboard className="h-4 w-4" aria-hidden />
      </button>
      {kb.open ? (
        <SoftKeyboardPad onKey={kb.applyKey} onEnter={onEnter} onClose={kb.close} enterLabel={enterLabel} />
      ) : null}
    </div>
  );
}

export default SearchSoftKeyboardInput;
