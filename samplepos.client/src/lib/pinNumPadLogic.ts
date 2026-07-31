/**
 * Pure PIN pad state transitions — tested without DOM.
 * PinNumPad UI drives these; hardware keys map to the same keys.
 */

export type PinPadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'C' | '⌫';

export type PinPadState = {
  digits: string;
  length: number;
};

export type PinPadResult = {
  digits: string;
  /** True when digits just reached `length` (auto-submit signal). */
  completed: boolean;
};

export function applyPinPadKey(state: PinPadState, key: PinPadKey): PinPadResult {
  const { length } = state;
  if (key === 'C') {
    return { digits: '', completed: false };
  }
  if (key === '⌫') {
    return { digits: state.digits.slice(0, -1), completed: false };
  }
  if (state.digits.length >= length) {
    return { digits: state.digits, completed: false };
  }
  const digits = state.digits + key;
  return { digits, completed: digits.length === length };
}

/** Whether Approve/Done is allowed for variable-length manager PINs. */
export function canSubmitPin(digits: string, minLength: number, maxLength: number): boolean {
  const n = digits.length;
  return n >= minLength && n <= maxLength && /^\d+$/.test(digits);
}

export function mapKeyboardEventToPinKey(key: string): PinPadKey | null {
  if (key >= '0' && key <= '9') return key as PinPadKey;
  if (key === 'Backspace') return '⌫';
  if (key === 'Escape') return 'C';
  return null;
}
