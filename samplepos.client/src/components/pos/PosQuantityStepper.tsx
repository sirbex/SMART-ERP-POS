import { useCallback, useEffect, useState, type MouseEvent } from 'react';
import { NumericSoftKeyboardInput } from '../keyboard/NumericSoftKeyboardInput';

export type PosQuantityStepperProps = {
  value: number;
  onChange: (quantity: number) => void;
  onFocus?: () => void;
  /** Highlight field as over-stock warning */
  overStock?: boolean;
  /** Compact cart row (h-7) vs table row (h-8+) */
  dense?: boolean;
  uomLabel?: string;
  productName: string;
};

/** Parse qty draft on blur/enter — empty/invalid reverts to fallback (does not drop line). */
export function commitPosQuantityDraft(raw: string, fallback: number): number {
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  const parsed = parseInt(trimmed, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

export default function PosQuantityStepper({
  value,
  onChange,
  onFocus,
  overStock = false,
  dense = false,
  uomLabel = 'units',
  productName,
}: PosQuantityStepperProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => String(value));

  useEffect(() => {
    if (!editing) {
      setDraft(String(value));
    }
  }, [value, editing]);

  const stopRowClick = (e: MouseEvent) => {
    e.stopPropagation();
  };

  const commit = useCallback(
    (raw: string) => {
      setEditing(false);
      onChange(commitPosQuantityDraft(raw, value));
    },
    [onChange, value],
  );

  const dec = () => {
    setEditing(false);
    onChange(value - 1);
  };

  const inc = () => {
    setEditing(false);
    onChange(value + 1);
  };

  const borderTone = overStock ? 'border-red-500' : 'border-gray-200';
  const shellClass = dense
    ? `inline-flex shrink-0 items-stretch rounded border ${borderTone} h-7 min-w-[5.5rem]`
    : `inline-flex shrink-0 items-stretch rounded border ${borderTone} h-8 sm:h-9 min-w-[6.75rem]`;

  const btnClass = dense
    ? 'flex h-7 w-7 shrink-0 items-center justify-center bg-gray-50 text-sm font-semibold text-gray-700 hover:bg-gray-100 active:bg-gray-200 touch-manipulation select-none'
    : 'flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center bg-gray-50 text-base font-semibold text-gray-700 hover:bg-gray-100 active:bg-gray-200 touch-manipulation select-none';

  const inputClass =
    (dense
      ? 'h-7 min-w-[2rem] flex-1 border-x border-gray-200 px-0.5 text-center text-xs focus:ring-1 focus:ring-blue-500'
      : 'h-8 sm:h-9 min-w-[2.25rem] flex-1 border-x border-gray-200 px-1 text-center text-xs sm:text-sm focus:ring-2 focus:ring-blue-500') +
    ' [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ' +
    (overStock ? 'bg-red-50' : 'bg-white');

  const ariaQty = `Quantity in ${uomLabel} for ${productName}`;

  return (
    <div
      className={shellClass}
      onClick={stopRowClick}
      onPointerDown={stopRowClick}
      data-pos-qty-stepper="true"
      role="group"
      aria-label={ariaQty}
    >
      <button
        type="button"
        onClick={dec}
        className={btnClass}
        data-pos-qty-dec="true"
        aria-label={`Decrease quantity for ${productName}`}
      >
        −
      </button>
      <NumericSoftKeyboardInput
        mode="integer"
        showToggle={false}
        selectOnFocus
        wrapClassName="min-w-0 flex-1"
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
        className={inputClass}
        aria-label={ariaQty}
      />
      <button
        type="button"
        onClick={inc}
        className={btnClass}
        data-pos-qty-inc="true"
        aria-label={`Increase quantity for ${productName}`}
      >
        +
      </button>
    </div>
  );
}
