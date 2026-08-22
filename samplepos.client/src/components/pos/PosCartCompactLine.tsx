/**
 * Retail POS — compressed cart line for mobile / compact tiers only.
 * Restaurant FOH uses its own ticket UI; do not wire this outside POSPage.
 */
import { forwardRef } from 'react';
import { ServiceBadge } from './ServiceBadge';
import PosUnitPriceInput from './PosUnitPriceInput';
import PosQuantityStepper from './PosQuantityStepper';
import { formatCurrency } from '../../utils/currency';
import {
  getPosLineMinUnitPrice,
  isPosLineBlockedByCatalogCost,
  type AtCostLayerSegment,
} from '../../utils/posCartLine';
import { POS_ADAPTIVE_CLASSES } from '../../lib/posAdaptiveLayout';

export type PosCartCompactLineItem = {
  id: string;
  name: string;
  uom: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  marginPct: number;
  productType?: 'inventory' | 'consumable' | 'service';
  stockOnHand?: number;
  availableUoms?: Array<{
    uomId: string;
    name: string;
    symbol?: string;
    conversionFactor: number;
    price: number;
    cost: number;
    isDefault: boolean;
  }>;
  selectedUomId?: string;
  unitPriceManuallySet?: boolean;
  discount?: { amount: number };
  pricingRule?: { scope: string; ruleName: string | null; discount: number };
  atCostLayerIndex?: number;
  atCostLayerLabel?: string;
  atCostLayers?: AtCostLayerSegment[];
};

type StockUom = {
  uomLabel: string;
  stockHint?: string | null;
  stockInSellingUom?: number;
};

export type PosCartCompactLineProps = {
  item: PosCartCompactLineItem;
  index: number;
  focused: boolean;
  stockUom: StockUom;
  lineQtyOverStock: boolean;
  pricingMode?: string | null;
  atCostHint?: string | null;
  onFocus: () => void;
  onRemove: () => void;
  onQuantityChange: (qty: number) => void;
  onUnitPriceChange: (price: number, opts?: { silent?: boolean }) => void;
  onUnitPriceCommit: (price: number) => void;
  onUomChange: (uomId: string) => void;
  onOpenDiscount: () => void;
  onRemoveDiscount: () => void;
};

/** Single-line alert for compressed cart — highest priority wins. */
export function posCartCompactAlert(input: {
  item: PosCartCompactLineItem;
  lineQtyOverStock: boolean;
  stockUom: StockUom;
  pricingMode?: string | null;
  atCostHint?: string | null;
}): string | null {
  const { item, lineQtyOverStock, stockUom, pricingMode, atCostHint } = input;
  if (isPosLineBlockedByCatalogCost(item, pricingMode)) {
    return 'Below cost — sale blocked';
  }
  if (lineQtyOverStock || stockUom.stockHint) {
    return (
      stockUom.stockHint ??
      `Only ${stockUom.stockInSellingUom ?? 0} ${stockUom.uomLabel} in stock`
    );
  }
  if (item.discount) {
    return `Discount −${formatCurrency(item.discount.amount)}`;
  }
  if (atCostHint) return atCostHint;
  if (item.pricingRule?.scope === 'at_cost') return 'AT COST pricing';
  if (item.pricingRule?.scope === 'group_discount') return 'Group discount applied';
  return null;
}

export const PosCartCompactLine = forwardRef<HTMLDivElement, PosCartCompactLineProps>(
  function PosCartCompactLine(
    {
      item,
      index,
      focused,
      stockUom,
      lineQtyOverStock,
      pricingMode,
      atCostHint,
      onFocus,
      onRemove,
      onQuantityChange,
      onUnitPriceChange,
      onUnitPriceCommit,
      onUomChange,
      onOpenDiscount,
      onRemoveDiscount,
    },
    ref,
  ) {
  const alert = posCartCompactAlert({ item, lineQtyOverStock, stockUom, pricingMode, atCostHint });
  const canDiscount =
    !item.discount && item.pricingRule?.scope !== 'at_cost' && pricingMode !== 'AT_COST';

  return (
    <div
      ref={ref}
      className={`${POS_ADAPTIVE_CLASSES.cartCardShell} ${
        focused ? 'ring-2 ring-blue-400 border-blue-200' : ''
      }`}
      onClick={onFocus}
      data-pos-cart-compact-line={index}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 items-start">
        <div className="min-w-0">
          <div className="flex items-start gap-1 min-w-0">
            <span className="text-sm font-medium leading-snug line-clamp-2 text-gray-900 min-w-0">
              {item.name}
            </span>
            {item.productType === 'service' ? (
              <ServiceBadge className="shrink-0 scale-[0.85] origin-top-right" />
            ) : null}
          </div>
          <p className="mt-0.5 text-[11px] leading-tight text-gray-500 tabular-nums truncate">
            {item.quantity} × {formatCurrency(item.unitPrice)} · {stockUom.uomLabel}
          </p>
        </div>
        <div className="flex flex-col items-end gap-0.5 shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="text-red-500 hover:text-red-700 text-base leading-none p-0.5"
            aria-label={`Remove ${item.name}`}
          >
            ×
          </button>
          <span className="text-sm font-semibold tabular-nums text-gray-900 whitespace-nowrap">
            {formatCurrency(item.subtotal)}
          </span>
        </div>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-1 gap-y-1 min-w-0">
        <PosQuantityStepper
          dense
          value={item.quantity}
          overStock={lineQtyOverStock}
          uomLabel={stockUom.uomLabel}
          productName={item.name}
          onFocus={onFocus}
          onChange={onQuantityChange}
        />

        <PosUnitPriceInput
          dense
          value={item.unitPrice}
          minUnitPrice={getPosLineMinUnitPrice(item, pricingMode)}
          atCostLine={pricingMode === 'AT_COST' || item.pricingRule?.scope === 'at_cost'}
          uomLabel={stockUom.uomLabel}
          productName={item.name}
          onFocus={onFocus}
          onChange={(price) => onUnitPriceChange(price, { silent: true })}
          onCommit={onUnitPriceCommit}
          manualOverride={!!item.unitPriceManuallySet}
        />

        {item.availableUoms && item.availableUoms.length > 1 ? (
          <select
            value={item.selectedUomId || ''}
            onChange={(e) => onUomChange(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            className="h-7 max-w-[4.5rem] shrink-0 rounded border border-gray-200 bg-white px-1 text-[11px] focus:ring-1 focus:ring-blue-500"
            aria-label={`Unit of measure for ${item.name}`}
          >
            {item.availableUoms.map((u) => (
              <option key={u.uomId} value={u.uomId}>
                {u.symbol || u.name}
              </option>
            ))}
          </select>
        ) : null}

        {item.discount ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemoveDiscount();
            }}
            className="ml-auto h-7 shrink-0 rounded border border-red-200 px-1.5 text-[11px] text-red-600"
          >
            ✕%
          </button>
        ) : canDiscount ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenDiscount();
            }}
            className="ml-auto h-7 shrink-0 rounded border border-amber-200 px-1.5 text-[11px] text-amber-700"
            aria-label={`Add discount to ${item.name}`}
          >
            %
          </button>
        ) : null}
      </div>

      {alert ? (
        <p
          className={`mt-0.5 truncate text-[10px] leading-tight ${
            alert.includes('Below cost') || alert.includes('stock')
              ? 'font-medium text-red-600'
              : 'text-gray-600'
          }`}
        >
          {alert}
        </p>
      ) : null}
    </div>
  );
  },
);

export default PosCartCompactLine;
