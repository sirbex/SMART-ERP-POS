/**
 * Soft / on-screen keyboard helpers for login & PIN.
 *
 * Browsers (Windows included) do not expose a reliable "force OSK" API.
 * We: (1) focus a real editable control,
 * (2) call Chromium's VirtualKeyboard API when present,
 * (3) use in-app PinNumPad for PIN so POS never depends on the OS keyboard.
 */

export type SoftKeyboardInputMode = 'text' | 'email' | 'numeric' | 'tel' | 'url' | 'search';

export type EnterKeyHint =
  | 'enter'
  | 'done'
  | 'go'
  | 'next'
  | 'previous'
  | 'search'
  | 'send';

/** Attributes that encourage the system soft keyboard / correct layout. */
export function softKeyboardAttrs(
  mode: SoftKeyboardInputMode,
  enterKeyHint?: EnterKeyHint,
): {
  inputMode: SoftKeyboardInputMode;
  enterKeyHint?: EnterKeyHint;
  autoCorrect: 'off';
  autoCapitalize?: 'none';
  spellCheck: false;
} {
  return {
    inputMode: mode,
    ...(enterKeyHint ? { enterKeyHint } : {}),
    autoCorrect: 'off',
    ...(mode === 'email' ? { autoCapitalize: 'none' as const } : {}),
    spellCheck: false,
  };
}

type VirtualKeyboardNav = Navigator & {
  virtualKeyboard?: {
    overlaysContent?: boolean;
    show?: () => void;
    hide?: () => void;
  };
};

/**
 * Request the system soft keyboard for an already-focused (or about-to-focus) field.
 * Safe no-op when the VirtualKeyboard API is missing (most desktop browsers).
 */
export function requestSoftKeyboard(el: HTMLElement | null | undefined): void {
  if (!el) return;

  try {
    if (typeof el.focus === 'function') {
      el.focus({ preventScroll: false });
    }
  } catch {
    try {
      el.focus();
    } catch {
      /* ignore */
    }
  }

  if (typeof navigator === 'undefined') return;
  const vk = (navigator as VirtualKeyboardNav).virtualKeyboard;
  if (!vk) return;
  try {
    if (typeof vk.overlaysContent === 'boolean') {
      vk.overlaysContent = true;
    }
    vk.show?.();
  } catch {
    /* policy / unsupported */
  }
}
