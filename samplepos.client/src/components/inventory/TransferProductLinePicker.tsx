import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import toast from 'react-hot-toast';
import { UomSelector } from './UomSelector';
import {
  EnterpriseProductSearch,
  type WarehouseSearchProduct,
} from './shared/EnterpriseProductSearch';
import type { TransferLotSearchResult } from './TransferLotSearch';
import type { ProductUomDetail } from '../../hooks/useProductWithUoms';
import {
  poLineBaseQuantity,
  convertPoLineQuantityForUomChange,
} from '../../../../shared/utils/po-line-uom';
import {
  formatMultiUomQuantity,
  productFromApiUoms,
} from '../../utils/formatQuantity';
import { allocateTransferQuantityFefo } from '../../utils/transferFefoAllocation';
import { DataTable, type DataTableColumn } from '@/components/shared/DataTable';

export interface TransferDraftLineInput {
  productLotId: string;
  label: string;
  quantity: number;
  maxQty: number;
  productId: string;
}

interface ProductTransferLine {
  key: string;
  product: WarehouseSearchProduct;
  quantity: string;
  selectedUomId: string | null;
  conversionFactor: string;
  uomName: string;
}

interface TransferProductLinePickerProps {
  storeLocationId: string;
  storeLabel?: string;
  onFetchProductLots: (productId: string) => Promise<TransferLotSearchResult[]>;
  onLinesChange: (lines: TransferDraftLineInput[]) => void;
  disabled?: boolean;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
}

function mapApiUomsToPrefetched(uoms: unknown): ProductUomDetail[] {
  const arr = Array.isArray(uoms) ? uoms : [];
  return arr.map((raw: Record<string, unknown>) => ({
    id: String(raw.uomId ?? ''),
    uomId: String(raw.uomId ?? ''),
    uomName: String(raw.name ?? raw.uomName ?? ''),
    uomSymbol: (raw.symbol ?? raw.uomSymbol ?? null) as string | null,
    conversionFactor: String(raw.conversionFactor ?? 1),
    barcode: null,
    isDefault: Boolean(raw.isDefault),
    priceOverride: raw.price != null ? String(raw.price) : null,
    costOverride: raw.cost != null ? String(raw.cost) : null,
    factor: String(raw.conversionFactor ?? 1),
    displayCost: String(raw.cost ?? 0),
    displayPrice: String(raw.price ?? 0),
    marginPct: '0',
  }));
}

function buildTransferLineLabel(
  product: WarehouseSearchProduct,
  lot: TransferLotSearchResult,
  baseQty: number,
): string {
  const uomProduct = productFromApiUoms(product.uoms);
  const qtyLabel = formatMultiUomQuantity(baseQty, uomProduct);
  const expiry = lot.expiryDate ? ` · exp ${String(lot.expiryDate).split('T')[0]}` : '';
  return `${product.productName} — ${lot.lotNumber}${expiry} (${qtyLabel})`;
}

function freeQuantity(product: WarehouseSearchProduct): number {
  return product.freeQuantity ?? product.availableQuantity;
}

function linesSignature(lines: TransferDraftLineInput[]): string {
  return JSON.stringify(
    lines.map((l) => ({ id: l.productLotId, q: l.quantity, p: l.productId })),
  );
}

export function TransferProductLinePicker({
  storeLocationId,
  storeLabel,
  onFetchProductLots,
  onLinesChange,
  disabled = false,
  searchInputRef: externalSearchRef,
}: TransferProductLinePickerProps) {
  const internalSearchRef = useRef<HTMLInputElement>(null);
  const searchInputRef = externalSearchRef ?? internalSearchRef;
  const qtyRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const onLinesChangeRef = useRef(onLinesChange);
  const onFetchProductLotsRef = useRef(onFetchProductLots);
  const lastEmittedRef = useRef<string | null>(null);

  onLinesChangeRef.current = onLinesChange;
  onFetchProductLotsRef.current = onFetchProductLots;

  const [productLines, setProductLines] = useState<ProductTransferLine[]>([]);
  const [syncing, setSyncing] = useState(false);

  const emitLines = useCallback((lines: TransferDraftLineInput[]) => {
    const sig = linesSignature(lines);
    if (sig === lastEmittedRef.current) return;
    lastEmittedRef.current = sig;
    onLinesChangeRef.current(lines);
  }, []);

  const syncLotLines = useCallback(async (lines: ProductTransferLine[]) => {
    if (lines.length === 0) {
      emitLines([]);
      return;
    }

    setSyncing(true);
    try {
      const allocated: TransferDraftLineInput[] = [];

      for (const line of lines) {
        const qtyInUom = parseFloat(line.quantity);
        if (!qtyInUom || qtyInUom <= 0) continue;

        const baseQty = poLineBaseQuantity(qtyInUom, line.conversionFactor);
        const maxFree = freeQuantity(line.product);
        if (baseQty > maxFree + 0.0001) {
          toast.error(`${line.product.productName}: quantity exceeds free stock`);
          return;
        }

        const lots = await onFetchProductLotsRef.current(line.product.productId);
        const { lines: fefoLines, shortfall } = allocateTransferQuantityFefo(lots, baseQty);
        if (fefoLines.length === 0 || shortfall > 0) {
          toast.error(`${line.product.productName}: insufficient lot stock`);
          return;
        }

        for (const { productLotId, quantity: lotQty, lot } of fefoLines) {
          allocated.push({
            productLotId,
            quantity: lotQty,
            maxQty: lot.availableQuantity,
            productId: line.product.productId,
            label: buildTransferLineLabel(line.product, lot, lotQty),
          });
        }
      }

      emitLines(allocated);
    } finally {
      setSyncing(false);
    }
  }, [emitLines]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void syncLotLines(productLines);
    }, 400);
    return () => clearTimeout(timer);
  }, [productLines, syncLotLines]);

  const handleProductSelect = useCallback((product: WarehouseSearchProduct) => {
    const key = product.productId;
    setProductLines((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        setTimeout(() => qtyRefs.current.get(key)?.focus(), 0);
        return prev;
      }
      const prefetchedUoms = mapApiUomsToPrefetched(product.uoms);
      const defaultUom = prefetchedUoms.find((u) => u.isDefault) ?? prefetchedUoms[0];
      const next: ProductTransferLine = {
        key,
        product,
        quantity: '1',
        selectedUomId: defaultUom?.uomId ?? null,
        conversionFactor: defaultUom?.conversionFactor ?? '1',
        uomName: defaultUom?.uomSymbol || defaultUom?.uomName || 'Base UoM',
      };
      setTimeout(() => qtyRefs.current.get(key)?.focus(), 0);
      return [...prev, next];
    });
  }, []);

  const updateLine = (key: string, patch: Partial<ProductTransferLine>) => {
    setProductLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const removeLine = (key: string) => {
    setProductLines((prev) => prev.filter((l) => l.key !== key));
    setTimeout(() => searchInputRef.current?.focus(), 0);
  };

  const handleQtyKeyDown = (e: React.KeyboardEvent, key: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      searchInputRef.current?.focus();
    }
    if (e.key === 'Escape') {
      removeLine(key);
    }
  };

  const lineColumns = useMemo((): DataTableColumn<ProductTransferLine>[] => {
    return [
      {
        id: 'product',
        header: 'Product',
        cell: (line) => (
          <div className="min-w-[10rem]">
            <p className="font-medium text-sm text-gray-900">{line.product.productName}</p>
            <p className="text-xs text-gray-500">
              {line.product.sku && <>SKU {line.product.sku}</>}
              {line.product.primaryLotNumber && <> · {line.product.primaryLotNumber}</>}
            </p>
          </div>
        ),
      },
      {
        id: 'available',
        header: 'Free qty',
        align: 'right',
        cell: (line) => {
          const uomProduct = productFromApiUoms(line.product.uoms);
          const maxFree = freeQuantity(line.product);
          return (
            <span className="font-mono text-green-700 text-sm">
              {formatMultiUomQuantity(maxFree, uomProduct)}
            </span>
          );
        },
      },
      {
        id: 'warehouse',
        header: 'Warehouse',
        cell: (line) => (
          <span className="text-sm text-gray-600">
            {storeLabel ?? line.product.storeName ?? 'MAIN'}
          </span>
        ),
      },
      {
        id: 'expiry',
        header: 'Nearest expiry',
        cell: (line) => (
          <span className="text-sm text-gray-600">
            {line.product.nearestExpiry
              ? String(line.product.nearestExpiry).split('T')[0]
              : '—'}
          </span>
        ),
      },
      {
        id: 'qty',
        header: 'Transfer qty',
        align: 'right',
        cellClassName: 'align-top',
        cell: (line) => (
          <Input
            ref={(el) => {
              if (el) qtyRefs.current.set(line.key, el);
              else qtyRefs.current.delete(line.key);
            }}
            type="number"
            min={0}
            step="any"
            value={line.quantity}
            onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
            onKeyDown={(e) => handleQtyKeyDown(e, line.key)}
            disabled={disabled || syncing}
            className="h-9 w-full min-w-[5rem] max-w-[7rem] ml-auto text-right font-mono"
          />
        ),
      },
      {
        id: 'uom',
        header: 'UoM',
        cellClassName: 'align-top min-w-[8rem]',
        cell: (line) => {
          const prefetchedUoms = mapApiUomsToPrefetched(line.product.uoms);
          return (
            <UomSelector
              productId={line.product.productId}
              baseCost={0}
              selectedUomId={line.selectedUomId}
              prefetchedUoms={prefetchedUoms}
              disabled={disabled || syncing}
              onChange={({ uomId, conversionFactor: cf, uomName }) => {
                updateLine(line.key, {
                  quantity: convertPoLineQuantityForUomChange(
                    line.quantity,
                    line.conversionFactor,
                    cf,
                  ),
                  selectedUomId: uomId,
                  conversionFactor: cf,
                  uomName,
                });
              }}
              className="w-full min-w-[7rem] px-2 py-1.5 text-xs border border-gray-300 rounded-md bg-white h-9"
            />
          );
        },
      },
      {
        id: 'actions',
        header: '',
        align: 'right',
        cell: (line) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-gray-400 hover:text-red-600"
            onClick={() => removeLine(line.key)}
            disabled={disabled || syncing}
          >
            Remove
          </Button>
        ),
      },
    ];
  }, [disabled, syncing, storeLabel]);

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium text-gray-700">Search product</Label>
        <EnterpriseProductSearch
          mode="warehouse"
          storeLocationId={storeLocationId}
          storeLabel={storeLabel}
          onProductSelect={handleProductSelect}
          disabled={disabled || !storeLocationId}
          inputRef={searchInputRef}
          className="mt-1"
          placeholder="Search product… name, SKU, barcode, lot"
        />
        <p className="text-[10px] text-gray-400 mt-1">
          ↑↓ navigate · Enter adds line immediately · Esc removes focus. Source warehouse stock only
          (zero, expired, and blocked lots hidden).
        </p>
      </div>

      <DataTable
        columns={lineColumns}
        data={productLines}
        getRowKey={(line) => line.key}
        stickyHeader
        emptyMessage="Search and press Enter to add products to this request."
        className="shadow-none border rounded-lg"
      />

      {syncing && (
        <p className="text-xs text-indigo-600">Allocating lots (FEFO)…</p>
      )}
    </div>
  );
}

/** @deprecated use WarehouseSearchProduct from EnterpriseProductSearch */
export type TransferStoreProduct = WarehouseSearchProduct;
