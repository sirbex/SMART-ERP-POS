import { useCallback, useRef, useState, type FocusEvent, type PointerEvent } from 'react';
import {
  applyInAppSoftKey,
  readInAppKeyboardContext,
  requestSoftKeyboard,
  shouldCloseInAppKeyboardOnBlur,
  shouldOpenInAppKeyboard,
  type InAppSoftKey,
} from '../lib/softKeyboard';

type BindOpts = {
  onFocus?: (e: FocusEvent<HTMLInputElement>) => void;
  onBlur?: (e: FocusEvent<HTMLInputElement>) => void;
  onPointerDown?: (e: PointerEvent<HTMLInputElement>) => void;
};

/** Search SSOT: in-app QWERTY for touch; PC with physical keyboard types normally. */
export function useSearchSoftKeyboard(onChange: (next: string) => void, value: string) {
  const [open, setOpen] = useState(false);
  const replaceAllRef = useRef(false);
  const optsRef = useRef<BindOpts | undefined>(undefined);

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
    (key: InAppSoftKey) => {
      const r = applyInAppSoftKey(value, key, { replaceAll: replaceAllRef.current });
      replaceAllRef.current = r.replaceAll;
      onChange(r.next);
    },
    [onChange, value],
  );

  const bindInput = useCallback((opts?: BindOpts) => {
    optsRef.current = opts;
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
