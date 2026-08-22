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
import {
  readInAppKeyboardContext,
  requestSoftKeyboard,
  shouldShowInAppKeyboardToggle,
  softKeyboardAttrs,
} from '../../lib/softKeyboard';
import { useSearchSoftKeyboard } from '../../hooks/useSearchSoftKeyboard';
import { resolveInAppKeyboardToggleLayout } from './keyboardPadStyles';
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
  /** Hide keyboard icon (narrow inline fields). Pad still auto-opens on touch. */
  showToggle?: boolean;
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
  showToggle: showToggleProp,
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
  const kbCtx = readInAppKeyboardContext();
  const hasHwKeyboard = kbCtx.hasHwKeyboard;
  const showToggle = shouldShowInAppKeyboardToggle(kbCtx, showToggleProp);
  const toggleLayout = resolveInAppKeyboardToggleLayout(className, showToggle);
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

  return (
    <div className={`relative min-w-0 w-full ${wrapClassName}`.trim()}>
      <input
        {...rest}
        ref={refToUse}
        type="text"
        value={value}
        disabled={disabled}
        autoComplete={rest.autoComplete ?? 'off'}
        className={toggleLayout.inputClassName}
        {...softKeyboardAttrs('search', 'search')}
        inputMode={kb.open && !hasHwKeyboard ? 'none' : 'search'}
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
      {toggleLayout.showToggle ? (
        <button
          type="button"
          disabled={disabled}
          aria-label={kb.open ? 'Hide keyboard' : 'Show keyboard'}
          aria-pressed={kb.open}
          data-search-soft-keyboard-toggle="true"
          className={`absolute right-0.5 top-1/2 z-[1] inline-flex -translate-y-1/2 items-center justify-center rounded-md text-stone-500 hover:bg-stone-100 disabled:opacity-60 ${toggleLayout.toggleButtonClass} ${toggleClassName}`.trim()}
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
          <Keyboard className={toggleLayout.iconClass} aria-hidden />
        </button>
      ) : null}
      {kb.open ? (
        <SoftKeyboardPad onKey={kb.applyKey} onEnter={onEnter} onClose={kb.close} enterLabel={enterLabel} />
      ) : null}
    </div>
  );
}

export default SearchSoftKeyboardInput;
