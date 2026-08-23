import { useCallback, useEffect, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { NumericSoftKeyboardInput } from '../keyboard/NumericSoftKeyboardInput';

/** Touch-first FOH qty controls — matches RestaurantPosPage inline ± (min-w-9 targets). */
export const FOH_TOUCH =
  'touch-manipulation select-none [-webkit-tap-highlight-color:transparent] transition-[transform,background-color,border-color,box-shadow] duration-100 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 disabled:active:scale-100';

/** 3× touch targets + gap-0.5 — cart cell must be ≥7.75rem (this + px-1) so + is not clipped. */
export const FOH_LINE_QTY_GRID_CLASS =
  'grid grid-cols-[2.25rem_minmax(0,1fr)_2.25rem] gap-0.5 w-[7.25rem] max-w-[7.25rem] shrink-0 items-stretch';

function fohQtySideBtnClass(sameLineEditors: boolean) {
  return `${FOH_TOUCH} ${
    sameLineEditors ? 'h-9 w-full text-base' : 'h-10 w-full text-lg'
  } rounded-lg border border-stone-300 bg-stone-50 font-bold text-stone-800`;
}

function fohQtyMiddleBtnClass(sameLineEditors: boolean, overStock = false) {
  const tone = overStock ? 'border-red-500 bg-red-50' : 'border-stone-300 bg-white';
  return sameLineEditors
    ? `${FOH_TOUCH} h-9 w-full min-w-0 rounded-lg border ${tone} text-xs font-bold tabular-nums text-stone-900 text-center px-0.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:outline-none focus:ring-2 focus:ring-amber-400/60`
    : `${FOH_TOUCH} h-10 w-full min-w-0 rounded-lg border ${tone} text-sm font-bold tabular-nums text-stone-900 text-center px-0.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:outline-none focus:ring-2 focus:ring-amber-400/60`;
}

/** Parse qty draft on blur/enter — empty/invalid reverts to fallback (does not drop line). */
export function commitFohQuantityDraft(raw: string, fallback: number): number {
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  const parsed = parseInt(trimmed, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

/** @deprecated Use commitFohQuantityDraft — kept for existing proof imports. */
export const commitPosQuantityDraft = commitFohQuantityDraft;

export type FohLineQtyEditorsProps = {
  value: number;
  onChange: (quantity: number) => void;
  onFocus?: () => void;
  overStock?: boolean;
  uomLabel?: string;
  productName: string;
  sameLineEditors?: boolean;
  disabled?: boolean;
};

/** Retail POS qty stepper — same min-w-9 ± styling as restaurant; grid layout for table column. */
export function FohLineQtyEditors({
  value,
  onChange,
  onFocus,
  overStock = false,
  uomLabel = 'units',
  productName,
  sameLineEditors = true,
  disabled = false,
}: FohLineQtyEditorsProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => String(value));

  useEffect(() => {
    if (!editing) {
      setDraft(String(value));
    }
  }, [value, editing]);

  const commit = useCallback(
    (raw: string) => {
      setEditing(false);
      onChange(commitFohQuantityDraft(raw, value));
    },
    [onChange, value],
  );

  const stepFrom = useCallback(
    (delta: number) => {
      const base = editing ? commitFohQuantityDraft(draft, value) : value;
      setEditing(false);
      onChange(base + delta);
    },
    [draft, editing, onChange, value],
  );

  const stopRowClick = (e: MouseEvent) => {
    e.stopPropagation();
  };

  const onQtyKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!disabled) stepFrom(1);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!disabled) stepFrom(-1);
    }
  };

  const ariaQty = `Quantity in ${uomLabel} for ${productName}`;

  return (
    <div
      className={FOH_LINE_QTY_GRID_CLASS}
      onClick={stopRowClick}
      onPointerDown={stopRowClick}
      data-foh-line-qty-editors="true"
      data-row-editors={sameLineEditors ? 'same-line' : 'stacked'}
      data-pos-qty-stepper="true"
      role="group"
      aria-label={ariaQty}
    >
      <button
        type="button"
        onClick={() => stepFrom(-1)}
        disabled={disabled}
        className={fohQtySideBtnClass(sameLineEditors)}
        data-foh-qty-dec="true"
        data-pos-qty-dec="true"
        aria-label={`Decrease quantity for ${productName}`}
      >
        −
      </button>
      <NumericSoftKeyboardInput
        mode="integer"
        showToggle={false}
        selectOnFocus
        disabled={disabled}
        wrapClassName="w-full min-w-0 max-w-full"
        value={editing ? draft : String(value)}
        onChange={(raw) => {
          setEditing(true);
          setDraft(raw);
        }}
        onCommit={commit}
        onFocus={() => {
          setEditing(true);
          setDraft(String(value));
          onFocus?.();
        }}
        onKeyDown={onQtyKeyDown}
        className={fohQtyMiddleBtnClass(sameLineEditors, overStock)}
        aria-label={ariaQty}
      />
      <button
        type="button"
        onClick={() => stepFrom(1)}
        disabled={disabled}
        className={fohQtySideBtnClass(sameLineEditors)}
        data-foh-qty-inc="true"
        data-pos-qty-inc="true"
        aria-label={`Increase quantity for ${productName}`}
      >
        +
      </button>
    </div>
  );
}
