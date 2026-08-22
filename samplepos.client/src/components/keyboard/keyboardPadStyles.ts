/** Shared touch key styling for in-app search + numeric pads. */

/** Strip any pr-* token and optionally apply SSOT right padding for toggle icon. */
export function mergeInputPaddingRight(className: string, prToken: string): string {
  const stripped = className.replace(/\bpr-\S+/g, '').replace(/\s{2,}/g, ' ').trim();
  return prToken ? `${stripped} ${prToken}`.trim() : stripped;
}

/** Narrow qty/price fields — smaller toggle + tighter padding so digits stay visible. */
export function isCompactInAppKeyboardField(className: string): boolean {
  return /\bh-[78]\b|\bw-\[(?:3|4|4\.|5)|\bw-(?:9|12|16|20)\b|\bmax-w-\[(?:4|5|6)/.test(
    className,
  );
}

export type InAppKeyboardToggleLayout = {
  showToggle: boolean;
  inputClassName: string;
  toggleButtonClass: string;
  iconClass: string;
};

export function resolveInAppKeyboardToggleLayout(
  className: string,
  showToggle: boolean,
): InAppKeyboardToggleLayout {
  if (!showToggle) {
    return {
      showToggle: false,
      inputClassName: mergeInputPaddingRight(className, ''),
      toggleButtonClass: '',
      iconClass: 'h-4 w-4',
    };
  }
  const compact = isCompactInAppKeyboardField(className);
  const pr = compact ? 'pr-7' : 'pr-10';
  return {
    showToggle: true,
    inputClassName: mergeInputPaddingRight(className, pr),
    toggleButtonClass: compact ? 'h-6 w-6' : 'h-8 w-8',
    iconClass: compact ? 'h-3 w-3' : 'h-4 w-4',
  };
}

export const PAD_KEY =
  'touch-manipulation select-none min-h-12 sm:min-h-[3.25rem] rounded-xl text-lg font-semibold ' +
  'shadow-[0_1px_0_0_rgba(0,0,0,0.08),0_2px_4px_rgba(0,0,0,0.06)] ' +
  'active:scale-[0.96] active:shadow-none active:translate-y-px ' +
  'transition-[transform,box-shadow,background-color] duration-75';

export const PAD_KEY_CHAR = `${PAD_KEY} border border-stone-200/90 bg-white text-stone-900 active:bg-emerald-50`;
export const PAD_KEY_ACTION = `${PAD_KEY} border border-stone-300/80 bg-stone-200/90 text-stone-700 active:bg-stone-300 text-base font-bold`;
export const PAD_KEY_ENTER = `${PAD_KEY} border border-emerald-700 bg-emerald-600 text-white active:bg-emerald-700 shadow-[0_2px_0_0_#047857]`;

export const PAD_SHELL =
  'fixed inset-x-0 bottom-0 z-[70] border-t border-stone-300/80 bg-gradient-to-b from-stone-200 to-stone-300 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-12px_40px_rgba(0,0,0,0.18)]';
