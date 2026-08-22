import { useCallback, useRef, useState, type FocusEvent, type PointerEvent } from 'react';
import { applyInAppNumericKey, type InAppNumericKey } from '../lib/numericPadLogic';
import {
  readInAppKeyboardContext,
  requestSoftKeyboard,
  shouldCloseInAppKeyboardOnBlur,
  shouldOpenInAppKeyboard,
} from '../lib/softKeyboard';

type BindOpts = {
  onFocus?: (e: FocusEvent<HTMLInputElement>) => void;
  onBlur?: (e: FocusEvent<HTMLInputElement>) => void;
  onPointerDown?: (e: PointerEvent<HTMLInputElement>) => void;
};

type UseNumericSoftKeyboardOpts = {
  allowDecimal?: boolean;
};

/**
 * Numeric SSOT: in-app number pad for amount/qty/price fields on touch POS.
 */
export function useNumericSoftKeyboard(
  onChange: (next: string) => void,
  value: string,
  opts?: UseNumericSoftKeyboardOpts,
) {
  const [open, setOpen] = useState(false);
  const replaceAllRef = useRef(false);
  const optsRef = useRef<BindOpts | undefined>(undefined);
  const allowDecimal = opts?.allowDecimal !== false;

  const close = useCallback(() => setOpen(false), []);
  const openPad = useCallback(() => setOpen(true), []);

  const openPadIfAuto = useCallback(() => {
    const ctx = readInAppKeyboardContext();
    if (shouldOpenInAppKeyboard({ source: 'autofocus', ...ctx })) {
      setOpen(true);
    }
  }, []);

  const markReplaceAll = useCallback(() => {
    replaceAllRef.current = true;
  }, []);

  const applyKey = useCallback(
    (key: InAppNumericKey) => {
      const r = applyInAppNumericKey(value, key, {
        allowDecimal,
        replaceAll: replaceAllRef.current,
      });
      replaceAllRef.current = r.replaceAll;
      onChange(r.next);
    },
    [allowDecimal, onChange, value],
  );

  const bindInput = useCallback((bindOpts?: BindOpts) => {
    optsRef.current = bindOpts;
    return {
      onPointerDown: (e: PointerEvent<HTMLInputElement>) => {
        optsRef.current?.onPointerDown?.(e);
        requestSoftKeyboard(e.currentTarget);
        const ctx = readInAppKeyboardContext();
        if (
          shouldOpenInAppKeyboard({
            source: 'pointerdown',
            pointerType: e.pointerType,
            ...ctx,
          })
        ) {
          setOpen(true);
        }
      },
      onFocus: (e: FocusEvent<HTMLInputElement>) => {
        requestSoftKeyboard(e.currentTarget);
        const ctx = readInAppKeyboardContext();
        if (shouldOpenInAppKeyboard({ source: 'focus', ...ctx })) {
          setOpen(true);
        }
        optsRef.current?.onFocus?.(e);
      },
      onBlur: (e: FocusEvent<HTMLInputElement>) => {
        if (shouldCloseInAppKeyboardOnBlur(e.relatedTarget)) {
          setOpen(false);
        }
        optsRef.current?.onBlur?.(e);
      },
    };
  }, []);

  return { open, openPad, openPadIfAuto, close, applyKey, bindInput, markReplaceAll };
}
