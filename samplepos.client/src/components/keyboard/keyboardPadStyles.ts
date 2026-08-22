/** Shared touch key styling for in-app search + numeric pads. */

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
