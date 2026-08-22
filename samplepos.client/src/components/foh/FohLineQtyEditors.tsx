import { useCallback, useEffect, useState, type MouseEvent } from 'react';
import { NumericSoftKeyboardInput } from '../keyboard/NumericSoftKeyboardInput';

/** Touch-first FOH qty controls — same targets as RestaurantPosPage SSOT. */
export const FOH_TOUCH =
  'touch-manipulation select-none [-webkit-tap-highlight-color:transparent] transition-[transform,background-color,border-color,box-shadow] duration-100 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 disabled:active:scale-100';

/** 3× touch targets + gap-0.5 — must match POS_CART_COL_QTY_WIDTH (7.25rem). */
export const FOH_LINE_QTY_GRID_CLASS =
  'grid grid-cols-[2.25rem_2.25rem_2.25rem] gap-0.5 w-[7.25rem] max-w-[7.25rem] shrink-0';

function fohQtySideBtnClass(sameLineEditors: boolean) {
  return `${FOH_TOUCH} ${
    sameLineEditors ? 'h-9 min-h-9 w-full text-base' : 'h-10 min-h-10 w-full text-lg'
  } rounded-lg border border-stone-300 bg-stone-50 font-bold text-stone-800`;
}

function fohQtyMiddleBtnClass(sameLineEditors: boolean, overStock = false) {
  const tone = overStock ? 'border-red-500 bg-red-50' : 'border-stone-300 bg-white';
  return sameLineEditors
    ? `${FOH_TOUCH} h-9 min-h-9 w-full max-w-full rounded-lg border ${tone} text-xs font-bold tabular-nums text-stone-900 text-center px-0 box-border [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:outline-none focus:ring-2 focus:ring-amber-400/60`
    : `${FOH_TOUCH} h-10 min-h-10 w-full max-w-full rounded-lg border ${tone} text-sm font-bold tabular-nums text-stone-900 text-center px-0 box-border [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:outline-none focus:ring-2 focus:ring-amber-400/60`;
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

type FohLineQtyEditorsBase = {
  sameLineEditors?: boolean;
  disabled?: boolean;
};

export type FohLineQtyEditorsRestaurantProps = FohLineQtyEditorsBase & {
  variant: 'restaurant';
  quantity: number;
  onDecrease: () => void;
  onIncrease: () => void;
  onSetQuantity: () => void;
};

export type FohLineQtyEditorsRetailProps = FohLineQtyEditorsBase & {
  variant: 'retail';
  value: number;
  onChange: (quantity: number) => void;
  onFocus?: () => void;
  overStock?: boolean;
  uomLabel?: string;
  productName: string;
};

export type FohLineQtyEditorsProps =
  | FohLineQtyEditorsRestaurantProps
  | FohLineQtyEditorsRetailProps;

export function FohLineQtyEditors(props: FohLineQtyEditorsProps) {
  const sameLineEditors = props.sameLineEditors ?? true;
  const disabled = props.disabled ?? false;
  const stackClass = sameLineEditors ? '' : 'mt-2';

  const stopRowClick = (e: MouseEvent) => {
    e.stopPropagation();
  };

  if (props.variant === 'restaurant') {
    return (
      <div
        className={`inline-flex items-center gap-0.5 shrink-0 ${stackClass}`}
        onClick={stopRowClick}
        data-foh-line-qty-editors="true"
        data-row-editors={sameLineEditors ? 'same-line' : 'stacked'}
        role="group"
        aria-label="Line quantity"
      >
        <button
          type="button"
          aria-label="Decrease quantity"
          disabled={disabled}
          onClick={props.onDecrease}
          className={fohQtySideBtnClass(sameLineEditors)}
          data-foh-qty-dec="true"
          data-pos-qty-dec="true"
        >
          −
        </button>
        {!sameLineEditors ? (
          <button
            type="button"
            aria-label="Set quantity"
            disabled={disabled}
            onClick={props.onSetQuantity}
            className={fohQtyMiddleBtnClass(false)}
          >
            {props.quantity}
          </button>
        ) : (
          <button
            type="button"
            aria-label="Set quantity"
            disabled={disabled}
            onClick={props.onSetQuantity}
            className={fohQtyMiddleBtnClass(true)}
          >
            {props.quantity}
          </button>
        )}
        <button
          type="button"
          aria-label="Increase quantity"
          disabled={disabled}
          onClick={props.onIncrease}
          className={fohQtySideBtnClass(sameLineEditors)}
          data-foh-qty-inc="true"
          data-pos-qty-inc="true"
        >
          +
        </button>
      </div>
    );
  }

  return (
    <RetailFohLineQtyEditors
      {...props}
      sameLineEditors={sameLineEditors}
      disabled={disabled}
      stackClass={stackClass}
      stopRowClick={stopRowClick}
    />
  );
}

function RetailFohLineQtyEditors({
  value,
  onChange,
  onFocus,
  overStock = false,
  uomLabel = 'units',
  productName,
  sameLineEditors,
  disabled,
  stackClass,
  stopRowClick,
}: FohLineQtyEditorsRetailProps & {
  sameLineEditors: boolean;
  disabled: boolean;
  stackClass: string;
  stopRowClick: (e: MouseEvent) => void;
}) {
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

  const dec = () => {
    setEditing(false);
    onChange(value - 1);
  };

  const inc = () => {
    setEditing(false);
    onChange(value + 1);
  };

  const ariaQty = `Quantity in ${uomLabel} for ${productName}`;

  return (
    <div
      className={`${FOH_LINE_QTY_GRID_CLASS} ${stackClass}`}
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
        onClick={dec}
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
        className={fohQtyMiddleBtnClass(sameLineEditors, overStock)}
        aria-label={ariaQty}
      />
      <button
        type="button"
        onClick={inc}
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
