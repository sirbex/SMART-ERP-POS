import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/utils/api';
import { formatCurrency } from '@/utils/currency';
import {
  formatMultiUomQuantity,
  productFromApiUoms,
} from '@/utils/formatQuantity';
import { SearchSoftKeyboardInput } from '../../keyboard/SearchSoftKeyboardInput';

// ── Procurement (PO / GR) ─────────────────────────────────────────────

export interface ProcurementProduct {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  genericName: string | null;
  quantityOnHand: number;
  reorderLevel: number;
  reorderQuantity: number;
  costPrice: number;
  lastCost: number;
  preferredSupplierId: string | null;
  supplierProductCode: string | null;
  purchaseUomId: string | null;
  leadTimeDays: number;
  trackExpiry: boolean;
  baseUomId?: string | null;
  purchaseUomIncomplete?: boolean;
  effectivePurchaseUomId?: string | null;
  supplierLastPrice: number | null;
  supplierPurchaseCount: number | null;
  supplierName: string | null;
}

// ── Warehouse (transfer / store-scoped) ───────────────────────────────

export interface WarehouseSearchProduct {
  productId: string;
  productName: string;
  sku: string | null;
  barcode: string | null;
  category: string | null;
  storeCode: string | null;
  storeName: string | null;
  onHandQuantity: number;
  reservedQuantity: number;
  freeQuantity: number;
  /** @deprecated use freeQuantity — kept for API compat */
  availableQuantity: number;
  nearestExpiry: string | null;
  primaryLotNumber: string | null;
  uoms: unknown;
}

type BaseProps = {
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  minChars?: number;
};

type ProcurementModeProps = BaseProps & {
  mode: 'procurement';
  /** When omitted, searches full catalog (supplier-agnostic). */
  supplierId?: string;
  onProductSelect: (product: ProcurementProduct) => void;
};

type WarehouseModeProps = BaseProps & {
  mode: 'warehouse';
  storeLocationId: string;
  storeLabel?: string;
  onProductSelect: (product: WarehouseSearchProduct) => void;
};

export type EnterpriseProductSearchProps = ProcurementModeProps | WarehouseModeProps;

function formatExpiryShort(expiry: string | null | undefined): string | null {
  if (!expiry) return null;
  const d = new Date(String(expiry).split('T')[0]);
  if (Number.isNaN(d.getTime())) return String(expiry).split('T')[0];
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

function getBestProcurementCost(p: ProcurementProduct): { value: number; source: string } {
  if (p.supplierLastPrice && p.supplierLastPrice > 0) {
    return { value: p.supplierLastPrice, source: 'Supplier' };
  }
  if (p.lastCost > 0) return { value: p.lastCost, source: 'Last' };
  if (p.costPrice > 0) return { value: p.costPrice, source: 'Cost' };
  return { value: 0, source: '—' };
}

/**
 * Single enterprise product search combobox — shared by PO, GR, transfers, etc.
 * Keyboard: ↑↓ navigate · Enter select · Esc close · barcode via server ILIKE.
 */
export function EnterpriseProductSearch(props: EnterpriseProductSearchProps) {
  const {
    disabled = false,
    className = '',
    inputRef: externalInputRef,
    minChars = 2,
  } = props;

  const placeholder =
    props.placeholder ??
    (props.mode === 'warehouse'
      ? 'Search product… name, SKU, barcode, lot'
      : 'Search products by name, SKU, barcode, or supplier code...');

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const internalInputRef = useRef<HTMLInputElement>(null);
  const inputElementRef = externalInputRef || internalInputRef;
  const dropdownRef = useRef<HTMLDivElement>(null);

  const supplierId = props.mode === 'procurement' ? props.supplierId : undefined;
  const storeLocationId = props.mode === 'warehouse' ? props.storeLocationId : undefined;
  const storeLabel = props.mode === 'warehouse' ? props.storeLabel : undefined;

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 200);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [search]);

  useEffect(() => {
    if (props.mode === 'warehouse') {
      setSearch('');
      setDebouncedSearch('');
      setShowDropdown(false);
      setHighlightedIndex(-1);
    }
  }, [props.mode === 'warehouse' ? props.storeLocationId : null, props.mode]);

  const shouldSearch = debouncedSearch.length >= minChars;

  const { data: procurementResults, isLoading: procurementLoading, isFetching: procurementFetching } = useQuery({
    queryKey: ['procurement-search', debouncedSearch, supplierId],
    queryFn: async () => {
      const response = await api.products.procurementSearch({
        q: debouncedSearch,
        supplierId: supplierId || undefined,
        limit: 20,
      });
      return (response.data as { data: ProcurementProduct[] }).data || [];
    },
    enabled: props.mode === 'procurement' && shouldSearch,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const { data: warehouseResults, isLoading: warehouseLoading, isFetching: warehouseFetching } = useQuery({
    queryKey: ['warehouse-product-search', storeLocationId, debouncedSearch],
    queryFn: async () => {
      const response = await api.warehouse.searchStoreProducts(
        storeLocationId!,
        debouncedSearch,
        20,
      );
      return (response.data?.data ?? []) as WarehouseSearchProduct[];
    },
    enabled: props.mode === 'warehouse' && shouldSearch && !!storeLocationId,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const isLoading =
    props.mode === 'procurement'
      ? procurementLoading && !procurementResults
      : warehouseLoading && !warehouseResults;
  const isFetching = props.mode === 'procurement' ? procurementFetching : warehouseFetching;
  const resultCount =
    props.mode === 'procurement'
      ? (procurementResults?.length ?? 0)
      : (warehouseResults?.length ?? 0);

  const procurementList = useMemo(
    () => (props.mode === 'procurement' ? procurementResults ?? [] : []),
    [props.mode, procurementResults],
  );

  const warehouseList = useMemo(
    () => (props.mode === 'warehouse' ? warehouseResults ?? [] : []),
    [props.mode, warehouseResults],
  );

  useEffect(() => {
    setHighlightedIndex(resultCount > 0 ? 0 : -1);
  }, [resultCount, debouncedSearch]);

  useEffect(() => {
    if (highlightedIndex >= 0 && dropdownRef.current) {
      const items = dropdownRef.current.querySelectorAll('[data-enterprise-search-item]');
      items[highlightedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex]);

  const handleProcurementSelect = useCallback(
    (product: ProcurementProduct) => {
      if (props.mode !== 'procurement') return;
      props.onProductSelect(product);
      setSearch('');
      setDebouncedSearch('');
      setShowDropdown(false);
      setHighlightedIndex(-1);
    },
    [props],
  );

  const handleWarehouseSelect = useCallback(
    (product: WarehouseSearchProduct) => {
      if (props.mode !== 'warehouse') return;
      props.onProductSelect(product);
      setSearch('');
      setDebouncedSearch('');
      setShowDropdown(false);
      setHighlightedIndex(-1);
    },
    [props],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && shouldSearch && resultCount > 0) {
        e.preventDefault();
        const idx =
          highlightedIndex >= 0 && highlightedIndex < resultCount ? highlightedIndex : 0;
        if (props.mode === 'procurement') {
          handleProcurementSelect(procurementList[idx]);
        } else {
          handleWarehouseSelect(warehouseList[idx]);
        }
        return;
      }

      if (!showDropdown || resultCount === 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setHighlightedIndex((prev) => (prev < resultCount - 1 ? prev + 1 : 0));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : resultCount - 1));
          break;
        case 'Enter':
          e.preventDefault();
          if (highlightedIndex >= 0 && highlightedIndex < resultCount) {
            if (props.mode === 'procurement') {
              handleProcurementSelect(procurementList[highlightedIndex]);
            } else {
              handleWarehouseSelect(warehouseList[highlightedIndex]);
            }
          }
          break;
        case 'Escape':
          e.preventDefault();
          setShowDropdown(false);
          setHighlightedIndex(-1);
          break;
      }
    },
    [
      showDropdown,
      resultCount,
      highlightedIndex,
      shouldSearch,
      props.mode,
      procurementList,
      warehouseList,
      handleProcurementSelect,
      handleWarehouseSelect,
    ],
  );

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        inputElementRef.current &&
        !inputElementRef.current.contains(target)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [inputElementRef]);

  const renderProcurementItem = (product: ProcurementProduct, idx: number) => {
    const cost = getBestProcurementCost(product);
    const reorder = product.quantityOnHand <= product.reorderLevel;
    const isHighlighted = idx === highlightedIndex;

    return (
      <button
        key={product.id}
        id={`enterprise-search-item-${idx}`}
        data-enterprise-search-item
        type="button"
        role="option"
        aria-selected={isHighlighted}
        onClick={() => handleProcurementSelect(product)}
        onMouseEnter={() => setHighlightedIndex(idx)}
        className={`w-full px-3 py-2 text-left border-b border-gray-50 last:border-b-0 transition-colors ${
          isHighlighted ? 'bg-blue-50 border-blue-100' : 'hover:bg-gray-50'
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900 text-sm truncate">{product.name}</span>
          {product.trackExpiry && (
            <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-semibold rounded bg-purple-100 text-purple-700">
              Perishable
            </span>
          )}
          {reorder && (
            <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-semibold rounded bg-red-100 text-red-700">
              Low Stock
            </span>
          )}
          {product.purchaseUomIncomplete && (
            <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-semibold rounded bg-amber-100 text-amber-800">
              Purchase UoM incomplete
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
          {product.sku && <span>SKU: {product.sku}</span>}
          {product.barcode && <span>BC: {product.barcode}</span>}
          {product.supplierProductCode && (
            <span className="text-blue-600">Sup: {product.supplierProductCode}</span>
          )}
        </div>
        <div className="flex items-center gap-4 mt-1 text-xs flex-wrap">
          <span className={`font-medium ${reorder ? 'text-red-600' : 'text-green-600'}`}>
            On hand: {Number(product.quantityOnHand).toLocaleString()}
          </span>
          <span className="text-gray-500">
            Reorder: {Number(product.reorderLevel).toLocaleString()}
          </span>
          <span className="text-gray-800 font-medium">
            {cost.source}: {formatCurrency(cost.value)}
          </span>
          {product.supplierName && (
            <span className="text-blue-600 truncate">
              {product.supplierName}
              {product.supplierPurchaseCount ? ` (×${product.supplierPurchaseCount})` : ''}
            </span>
          )}
        </div>
      </button>
    );
  };

  const renderWarehouseItem = (product: WarehouseSearchProduct, idx: number) => {
    const isHighlighted = idx === highlightedIndex;
    const uomProduct = productFromApiUoms(product.uoms);
    const freeQty = product.freeQuantity ?? product.availableQuantity;
    const freeLabel = formatMultiUomQuantity(freeQty, uomProduct);
    const onHandLabel = formatMultiUomQuantity(product.onHandQuantity ?? freeQty, uomProduct);
    const reservedLabel = formatMultiUomQuantity(product.reservedQuantity ?? 0, uomProduct);
    const expiryLabel = formatExpiryShort(product.nearestExpiry);
    const location = storeLabel ?? product.storeName ?? product.storeCode ?? 'Warehouse';

    return (
      <button
        key={product.productId}
        id={`enterprise-search-item-${idx}`}
        data-enterprise-search-item
        type="button"
        role="option"
        aria-selected={isHighlighted}
        onClick={() => handleWarehouseSelect(product)}
        onMouseEnter={() => setHighlightedIndex(idx)}
        className={`w-full px-3 py-2.5 text-left border-b border-gray-100 last:border-b-0 transition-colors ${
          isHighlighted ? 'bg-indigo-50 border-indigo-100' : 'hover:bg-gray-50'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-gray-900 text-sm">{product.productName}</span>
              <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-semibold rounded bg-slate-100 text-slate-700">
                {location}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
              {product.sku && <span>SKU: {product.sku}</span>}
              {product.barcode && <span>Barcode: {product.barcode}</span>}
              {product.primaryLotNumber && <span>Lot: {product.primaryLotNumber}</span>}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-3 gap-y-0.5 mt-1.5 text-xs">
              <span>
                <span className="text-gray-500">Free qty </span>
                <span className="font-semibold text-green-700">{freeLabel}</span>
              </span>
              <span>
                <span className="text-gray-500">Avail. UoM </span>
                <span className="font-medium">
                  {uomProduct.unitOfMeasure ??
                    uomProduct.productUoms?.find((u) => u.isDefault)?.uomSymbol ??
                    'Base'}
                </span>
              </span>
              <span>
                <span className="text-gray-500">On hand </span>
                <span className="font-medium">{onHandLabel}</span>
              </span>
              {(product.reservedQuantity ?? 0) > 0 && (
                <span>
                  <span className="text-gray-500">Reserved </span>
                  <span className="font-medium text-amber-700">{reservedLabel}</span>
                </span>
              )}
              {expiryLabel && (
                <span>
                  <span className="text-gray-500">Expiry </span>
                  <span className="font-medium">{expiryLabel}</span>
                </span>
              )}
            </div>
          </div>
          <span
            className={`shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-lg font-bold ${
              isHighlighted ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-700'
            }`}
            aria-hidden
          >
            +
          </span>
        </div>
      </button>
    );
  };

  let dropdownContent: ReactNode = null;
  if (props.mode === 'procurement') {
    dropdownContent = procurementList.map((p, idx) => renderProcurementItem(p, idx));
  } else {
    dropdownContent = warehouseList.map((p, idx) => renderWarehouseItem(p, idx));
  }

  const emptyMessage =
    props.mode === 'warehouse'
      ? `No transferable products at this warehouse match "${debouncedSearch}"`
      : `No products found for "${debouncedSearch}"`;

  const searchDisabled =
    disabled || (props.mode === 'warehouse' ? !storeLocationId : false);

  return (
    <div className={`relative ${className}`}>
      <SearchSoftKeyboardInput
        inputRef={inputElementRef}
        value={search}
        onChange={(next) => {
          setSearch(next);
          setShowDropdown(true);
        }}
        onFocus={() => {
          if (debouncedSearch.length >= minChars) setShowDropdown(true);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full px-3 py-2 pr-11 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
        disabled={searchDisabled}
        autoComplete="off"
        role="combobox"
        aria-expanded={showDropdown && resultCount > 0}
        aria-haspopup="listbox"
        aria-activedescendant={
          highlightedIndex >= 0 ? `enterprise-search-item-${highlightedIndex}` : undefined
        }
      />

      {isLoading && shouldSearch && (
        <div className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg p-3 text-sm text-gray-500">
          Searching...
        </div>
      )}

      {showDropdown && !isLoading && shouldSearch && resultCount > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-80 overflow-y-auto"
          role="listbox"
        >
          {isFetching && (
            <div className="sticky top-0 z-10 px-3 py-1 text-[10px] text-gray-500 bg-gray-50 border-b border-gray-100">
              Updating…
            </div>
          )}
          {dropdownContent}
        </div>
      )}

      {showDropdown && !isLoading && shouldSearch && resultCount === 0 && !isFetching && (
        <div className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg p-3 text-sm text-gray-500">
          {emptyMessage}
        </div>
      )}

      {showDropdown && resultCount > 0 && (
        <div className="mt-1 text-[10px] text-gray-400">
          ↑↓ Navigate · Enter add line · Esc close · Tab to quantity
        </div>
      )}
    </div>
  );
}
