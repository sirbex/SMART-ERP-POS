import type { DeviceCapabilityHost } from './deviceCapabilities';
import { detectDeviceCapabilityExtras } from './deviceCapabilities';

/**
 * Soft / on-screen keyboard helpers for login, PIN, and search.
 *
 * Browsers (Windows included) do not expose a reliable "force OSK" API.
 * We: (1) focus a real editable control,
 * (2) call Chromium's VirtualKeyboard API when present,
 * (3) use in-app PinNumPad for PIN so POS never depends on the OS keyboard,
 * (4) use an in-app QWERTY pad for search on touch / Windows (OS TabTip is unreliable).
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

/** Touch / pen tap — always prefer the in-app pad. */
export function pointerTypeWantsInAppKeyboard(pointerType: string | undefined): boolean {
  return pointerType === 'touch' || pointerType === 'pen';
}

export type InAppKeyboardSource = 'pointerdown' | 'focus' | 'toggle' | 'autofocus';

/** @deprecated use InAppKeyboardSource */
export type InAppSearchKeyboardSource = InAppKeyboardSource;

export type InAppKeyboardRuntimeContext = {
  pointerCoarse: boolean;
  hasHwKeyboard: boolean;
  maxTouchPoints: number;
  anyHover: boolean;
};

/** @deprecated use InAppKeyboardRuntimeContext */
export type SearchKeyboardRuntimeContext = InAppKeyboardRuntimeContext;

export type InAppKeyboardContext = InAppKeyboardRuntimeContext & {
  source: InAppKeyboardSource;
  pointerType?: string;
};

/** @deprecated use InAppKeyboardContext */
export type SearchKeyboardContext = InAppKeyboardContext;

/** Vitest-only override — never set in production UI. */
let inAppKeyboardContextOverride: InAppKeyboardRuntimeContext | null = null;

export function setInAppKeyboardContextOverrideForTests(
  ctx: InAppKeyboardRuntimeContext | null,
): void {
  inAppKeyboardContextOverride = ctx;
}

/** @deprecated use setInAppKeyboardContextOverrideForTests */
export function setSearchKeyboardContextOverrideForTests(
  ctx: InAppKeyboardRuntimeContext | null,
): void {
  setInAppKeyboardContextOverrideForTests(ctx);
}

/** Runtime signals for auto-open (injectable in tests). */
export function readInAppKeyboardContext(
  host: DeviceCapabilityHost | null | undefined = typeof window !== 'undefined'
    ? (window as unknown as DeviceCapabilityHost)
    : null,
): InAppKeyboardRuntimeContext {
  if (inAppKeyboardContextOverride) {
    return inAppKeyboardContextOverride;
  }
  if (!host) {
    return { pointerCoarse: false, hasHwKeyboard: true, maxTouchPoints: 0, anyHover: true };
  }
  const pointerCoarse =
    typeof host.matchMedia === 'function' &&
    host.matchMedia('(pointer: coarse)').matches;
  const anyHover =
    typeof host.matchMedia !== 'function' || host.matchMedia('(hover: hover)').matches;
  const maxTouchPoints = host.navigator?.maxTouchPoints ?? 0;
  const hasHwKeyboard = detectDeviceCapabilityExtras(host).hasHwKeyboard;
  return { pointerCoarse, hasHwKeyboard, maxTouchPoints, anyHover };
}

/** @deprecated use readInAppKeyboardContext */
export function readSearchKeyboardContext(
  host?: DeviceCapabilityHost | null,
): InAppKeyboardRuntimeContext {
  return readInAppKeyboardContext(host);
}

/**
 * Touch-first device: auto-open in-app pad. Desktop PC with mouse+keyboard: type normally.
 */
export function prefersAutoInAppKeyboard(
  ctx: Pick<InAppKeyboardRuntimeContext, 'pointerCoarse' | 'hasHwKeyboard' | 'maxTouchPoints' | 'anyHover'>,
): boolean {
  if (ctx.hasHwKeyboard === false) return true;
  if (ctx.pointerCoarse) return true;
  if (ctx.maxTouchPoints > 0 && !ctx.anyHover) return true;
  return false;
}

/** @deprecated use prefersAutoInAppKeyboard */
export function prefersAutoSearchKeyboard(
  ctx: Pick<InAppKeyboardRuntimeContext, 'pointerCoarse' | 'hasHwKeyboard' | 'maxTouchPoints' | 'anyHover'>,
): boolean {
  return prefersAutoInAppKeyboard(ctx);
}

/**
 * Smart in-app keyboard policy (search + numeric):
 * - PC + physical keyboard: do not auto-open; toggle always works.
 * - Touch / tablet / touch POS: auto-open on focus and tap.
 */
export function shouldOpenInAppKeyboard(input: InAppKeyboardContext): boolean {
  if (input.source === 'toggle') return true;
  if (pointerTypeWantsInAppKeyboard(input.pointerType)) return true;
  if (
    input.source === 'pointerdown' ||
    input.source === 'focus' ||
    input.source === 'autofocus'
  ) {
    return prefersAutoInAppKeyboard(input);
  }
  return false;
}

/** @deprecated use shouldOpenInAppKeyboard */
export function shouldOpenInAppSearchKeyboard(input: InAppKeyboardContext): boolean {
  return shouldOpenInAppKeyboard(input);
}

/** Keep pad open while tapping keys or the toggle (avoid blur flicker). */
export function shouldCloseInAppKeyboardOnBlur(related: EventTarget | null | undefined): boolean {
  if (!related || typeof related !== 'object') return true;
  const el = related as HTMLElement;
  if (typeof el.closest !== 'function') return true;
  if (el.closest('[data-soft-keyboard-pad]')) return false;
  if (el.closest('[data-numeric-soft-keyboard-pad]')) return false;
  if (el.closest('[data-search-soft-keyboard-toggle]')) return false;
  if (el.closest('[data-numeric-soft-keyboard-toggle]')) return false;
  return true;
}

/** @deprecated use shouldCloseInAppKeyboardOnBlur */
export function shouldCloseSearchKeyboardOnBlur(related: EventTarget | null | undefined): boolean {
  return shouldCloseInAppKeyboardOnBlur(related);
}

export type InAppSoftKey =
  | { kind: 'char'; char: string }
  | { kind: 'backspace' }
  | { kind: 'space' }
  | { kind: 'clear' };

export function applyInAppSoftKey(
  value: string,
  key: InAppSoftKey,
  opts?: { replaceAll?: boolean },
): { next: string; replaceAll: boolean } {
  const current = typeof value === 'string' ? value : '';
  if (key.kind === 'clear') {
    return { next: '', replaceAll: false };
  }
  if (key.kind === 'backspace') {
    if (opts?.replaceAll) return { next: '', replaceAll: false };
    return { next: current.slice(0, -1), replaceAll: false };
  }
  const ch = key.kind === 'space' ? ' ' : key.char;
  if (!ch) return { next: current, replaceAll: false };
  if (opts?.replaceAll) return { next: ch, replaceAll: false };
  return { next: current + ch, replaceAll: false };
}

export const SOFT_KEYBOARD_DIGIT_ROW = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'] as const;

export const SOFT_KEYBOARD_ALPHA_ROWS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
] as const;
