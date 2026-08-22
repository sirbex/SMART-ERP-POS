import { useState, useRef, useEffect, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react';
import Decimal from 'decimal.js';
import POSSearchBar from '../../components/pos/POSSearchBar';
import POSButton from '../../components/pos/POSButton';
import POSModal from '../../components/pos/POSModal';
import { formatCurrency } from '../../utils/currency';
import { getStockInSellingUom } from '../../utils/posCartUom';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import {
  searchCachedProducts,
  syncProductCatalog,
  getLastSyncTime,
  isCatalogStale,
  isCatalogAvailable,
  POS_CATALOG_SYNCED_EVENT,
  CATALOG_STALE_MS,
} from '../../services/offlineCatalogService';
import type { CachedProduct } from '../../services/offlineCatalogService';

const formatDisplayDate = (dateString: string | null | undefined): string => {
  if (!dateString) return 'N/A';
  if (dateString.includes('T')) {
    return dateString.split('T')[0];
  }
  return dateString;
};

function marginToneClass(marginPct: number): string {
  if (marginPct < 10) return 'text-red-600 font-semibold';
  if (marginPct < 20) return 'text-amber-600 font-semibold';
  return 'text-emerald-600 font-semibold';
}

interface ProductSearchResult {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  category?: string;
  uoms: Array<{
    uomId: string;
    name: string;
    symbol?: string;
    conversionFactor: number;
    price: number;
    cost: number;
    isDefault: boolean;
  }>;
  selectedUom?: {
    uomId: string;
    name: string;
    symbol?: string;
    conversionFactor: number;
    price: number;
    cost: number;
    isDefault: boolean;
  };
  stockOnHand: number;
  expiryDate?: string;
  costPrice: number;
  sellingPrice: number;
  marginPct: number;
  isTaxable: boolean;
  taxRate: number;
}

interface POSProductSearchProps {
  onSelect: (product: ProductSearchResult) => void;
  isOnline?: boolean;
}

export interface POSProductSearchHandle {
  focusSearch: () => void;
  clearSearch: () => void;
}

function transformCachedToSearchResult(cached: CachedProduct): ProductSearchResult {
  const defaultUom = cached.uoms.find((u) => u.isDefault) || cached.uoms[0];
  const marginPct =
    cached.sellingPrice > 0
      ? new Decimal(cached.sellingPrice)
          .minus(cached.costPrice)
          .dividedBy(cached.sellingPrice)
          .times(100)
          .toNumber()
      : 0;
  return {
    id: cached.id,
    name: cached.name,
    sku: cached.sku,
    barcode: cached.barcode,
    category: cached.category,
    uoms: cached.uoms,
    selectedUom: defaultUom,
    stockOnHand: cached.stockOnHand,
    expiryDate: cached.nearestExpiry,
    costPrice: cached.costPrice,
    sellingPrice: cached.sellingPrice,
    marginPct,
    isTaxable: cached.isTaxable,
    taxRate: cached.taxRate,
  };
}

/** Input updates instantly; catalog scan debounced so soft keyboard stays responsive. */
const POS_SEARCH_FILTER_DEBOUNCE_MS = 120;

const POSProductSearch = forwardRef<POSProductSearchHandle, POSProductSearchProps>(
  ({ onSelect, isOnline = true }, ref) => {
    const [search, setSearch] = useState('');
    const filterQuery = useDebouncedValue(search, POS_SEARCH_FILTER_DEBOUNCE_MS);
    const [selected, setSelected] = useState<ProductSearchResult | null>(null);
    const [selectedIndex, setSelectedIndex] = useState<number>(0);
    const [highlightedUomIndex, setHighlightedUomIndex] = useState<number>(0);
    const [catalogRev, setCatalogRev] = useState(getLastSyncTime);
    const [catalogSyncing, setCatalogSyncing] = useState(false);
    const catalogSyncingRef = useRef(false);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const productListRef = useRef<HTMLDivElement>(null);
    const uomButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);

    useImperativeHandle(ref, () => ({
      focusSearch: () => {
        searchInputRef.current?.focus();
      },
      clearSearch: () => {
        setSearch('');
        setSelected(null);
        setSelectedIndex(0);
        setHighlightedUomIndex(0);
      },
    }));

    const refreshCatalogIfNeeded = useCallback(async () => {
      if (!isOnline || catalogSyncingRef.current) return;
      if (isCatalogAvailable() && !isCatalogStale()) return;
      catalogSyncingRef.current = true;
      setCatalogSyncing(true);
      try {
        await syncProductCatalog();
        setCatalogRev(getLastSyncTime());
      } finally {
        catalogSyncingRef.current = false;
        setCatalogSyncing(false);
      }
    }, [isOnline]);

    useEffect(() => {
      void refreshCatalogIfNeeded();
    }, [refreshCatalogIfNeeded]);

    useEffect(() => {
      if (!isOnline) return;
      const timer = window.setInterval(() => {
        if (isCatalogStale()) void refreshCatalogIfNeeded();
      }, CATALOG_STALE_MS);
      return () => window.clearInterval(timer);
    }, [isOnline, refreshCatalogIfNeeded]);

    useEffect(() => {
      const onSynced = () => setCatalogRev(getLastSyncTime());
      window.addEventListener(POS_CATALOG_SYNCED_EVENT, onSynced);
      return () => window.removeEventListener(POS_CATALOG_SYNCED_EVENT, onSynced);
    }, []);

    const data = useMemo<ProductSearchResult[]>(
      () =>
        filterQuery
          ? searchCachedProducts(filterQuery).map(transformCachedToSearchResult)
          : [],
      [filterQuery, catalogRev],
    );

    const isLoading = catalogSyncing && !isCatalogAvailable();

    useEffect(() => {
      searchInputRef.current?.focus();
    }, []);

    useEffect(() => {
      setSelectedIndex(0);
    }, [data]);

    const scrollItemIntoView = useCallback((index: number, direction: 'up' | 'down') => {
      requestAnimationFrame(() => {
        const container = productListRef.current;
        const item = container?.children[index] as HTMLElement | undefined;
        if (!item || !container) return;
        const containerRect = container.getBoundingClientRect();
        const itemRect = item.getBoundingClientRect();
        if (direction === 'down' && itemRect.bottom > containerRect.bottom) {
          item.scrollIntoView({ block: 'nearest' });
        } else if (direction === 'up' && itemRect.top < containerRect.top) {
          item.scrollIntoView({ block: 'nearest' });
        }
      });
    }, []);

    const selectHighlightedProduct = useCallback(() => {
      if (!data || data.length === 0 || selectedIndex < 0 || selectedIndex >= data.length) return;
      const product = data[selectedIndex];
      setSearch('');
      setSelectedIndex(0);

      if (!product.uoms || product.uoms.length <= 1) {
        onSelect(product);
        requestAnimationFrame(() => searchInputRef.current?.focus());
      } else {
        setSelected(product);
      }
    }, [data, selectedIndex, onSelect]);

    const handleSearchInputKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (selected) return;

        if (e.key === 'Escape') {
          e.preventDefault();
          setSearch('');
          setSelectedIndex(0);
          searchInputRef.current?.focus();
          return;
        }

        if (!data || data.length === 0) return;

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIndex((prev) => {
            const newIndex = Math.min(prev + 1, data.length - 1);
            scrollItemIntoView(newIndex, 'down');
            return newIndex;
          });
          return;
        }

        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIndex((prev) => {
            const newIndex = Math.max(prev - 1, 0);
            scrollItemIntoView(newIndex, 'up');
            return newIndex;
          });
          return;
        }

        if (e.key === 'ArrowRight' || e.key === 'Enter') {
          e.preventDefault();
          selectHighlightedProduct();
        }
      },
      [data, selected, scrollItemIntoView, selectHighlightedProduct],
    );

    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (selected) return;
        if (document.querySelectorAll('[data-radix-dialog-overlay]').length > 0) return;

        if (e.key === '/' && document.activeElement !== searchInputRef.current) {
          e.preventDefault();
          searchInputRef.current?.focus();
          return;
        }

        if (e.key === 'Escape') {
          e.preventDefault();
          setSearch('');
          setSelectedIndex(0);
          searchInputRef.current?.focus();
          return;
        }

        if (document.activeElement === searchInputRef.current) return;
        if (!data || data.length === 0) return;

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIndex((prev) => {
            const newIndex = Math.min(prev + 1, data.length - 1);
            scrollItemIntoView(newIndex, 'down');
            return newIndex;
          });
          return;
        }

        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIndex((prev) => {
            const newIndex = Math.max(prev - 1, 0);
            scrollItemIntoView(newIndex, 'up');
            return newIndex;
          });
          return;
        }

        if (e.key === 'ArrowRight' || e.key === 'Enter') {
          e.preventDefault();
          selectHighlightedProduct();
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }, [data, selected, scrollItemIntoView, selectHighlightedProduct]);

    useEffect(() => {
      if (!selected || !selected.uoms || selected.uoms.length === 0) return;
      setHighlightedUomIndex(0);

      const handleUomKeyDown = (e: KeyboardEvent) => {
        if (!selected) return;
        if (e.key === 'Escape') {
          e.preventDefault();
          setSelected(null);
          window.setTimeout(() => searchInputRef.current?.focus(), 100);
        }
      };

      window.addEventListener('keydown', handleUomKeyDown);
      return () => window.removeEventListener('keydown', handleUomKeyDown);
    }, [selected]);

    return (
      <div className="relative">
        <POSSearchBar
          value={search}
          onChange={setSearch}
          onKeyDown={handleSearchInputKeyDown}
          autoFocus
          inputRef={searchInputRef}
        />
        {isLoading && <div className="mt-2 text-xs text-gray-500">Searching...</div>}
        {!isOnline && search && (
          <div className="mt-1 text-xs text-amber-600 flex items-center gap-1">
            <span>⚡</span> Offline — searching local catalog
          </div>
        )}
        {search && (
          <div
            ref={productListRef}
            className="mt-2 divide-y divide-gray-200 border border-gray-200 rounded-lg bg-white shadow-lg max-h-[55vh] sm:max-h-[60vh] overflow-y-auto overscroll-contain touch-pan-y absolute left-0 right-0 z-30 lg:relative"
          >
            {data.length === 0 ? (
              <div className="p-4 text-sm text-gray-500 text-center">
                {filterQuery === search ? 'No products found' : 'Searching…'}
              </div>
            ) : (
              data.map((p, index) => (
                <button
                  key={p.id}
                  type="button"
                  className={`w-full text-left px-3 py-3 sm:px-4 sm:py-3.5 hover:bg-blue-50 focus:bg-blue-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                    index === selectedIndex ? 'bg-blue-50 ring-1 ring-inset ring-blue-200' : ''
                  }`}
                  onClick={() => {
                    setSearch('');
                    setSelectedIndex(0);
                    if (!p.uoms || p.uoms.length <= 1) {
                      onSelect(p);
                      requestAnimationFrame(() => searchInputRef.current?.focus());
                    } else {
                      setSelected(p);
                    }
                  }}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm sm:text-base text-gray-900 leading-snug line-clamp-2">
                        {p.name}
                      </div>
                      {p.category && (
                        <span className="mt-1.5 inline-flex max-w-full items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs sm:text-sm font-medium text-slate-700 truncate">
                          {p.category}
                        </span>
                      )}
                    </div>
                    <div className="shrink-0 text-left sm:text-right">
                      <div className="text-base sm:text-lg font-bold text-blue-700 tabular-nums">
                        {formatCurrency(p.sellingPrice)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm text-gray-600">
                    <span>
                      Qty:{' '}
                      <span
                        className={`tabular-nums ${p.stockOnHand <= 5 ? 'text-red-600 font-semibold' : 'text-gray-900 font-medium'}`}
                      >
                        {p.stockOnHand}
                      </span>
                    </span>
                    <span>
                      Margin:{' '}
                      <span className={`tabular-nums ${marginToneClass(p.marginPct)}`}>
                        {p.marginPct.toFixed(1)}%
                      </span>
                    </span>
                    {p.expiryDate && (
                      <span
                        className={
                          new Date(p.expiryDate + 'T00:00:00') <
                          new Date(Date.now() + 7 * 24 * 3600 * 1000)
                            ? 'rounded bg-amber-100 px-2 py-0.5 font-medium text-amber-900'
                            : 'text-gray-500'
                        }
                      >
                        Exp: {formatDisplayDate(p.expiryDate)}
                      </span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        )}
        {selected && (
          <POSModal
            open={!!selected}
            onOpenChange={(open) => {
              setSelected(null);
              if (!open) {
                window.setTimeout(() => searchInputRef.current?.focus(), 100);
              }
            }}
            title="Select Unit of Measure"
            description={`Choose the unit of measure for ${selected.name}`}
            ariaLabel="Select Unit of Measure"
          >
            <div className="mb-3 font-semibold text-lg text-gray-900">{selected.name}</div>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
              {selected.category && (
                <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                  {selected.category}
                </span>
              )}
              <span className="font-bold text-blue-700 tabular-nums">
                {formatCurrency(selected.sellingPrice)}
              </span>
            </div>
            <div className="mb-2 text-sm text-gray-600">
              Total stock (base units):{' '}
              <span className="font-medium text-gray-900 tabular-nums">{selected.stockOnHand}</span>
            </div>
            {selected.expiryDate && (
              <div className="mb-2 text-xs text-yellow-800 bg-yellow-100 px-2 py-1 rounded">
                Expiring: {formatDisplayDate(selected.expiryDate)}
              </div>
            )}
            <div className="mb-2 text-sm text-gray-600">
              Margin:{' '}
              <span className={marginToneClass(selected.marginPct)}>
                {selected.marginPct.toFixed(1)}%
              </span>
            </div>
            <div className="mb-4">
              <div className="font-medium text-gray-700 mb-1">Select Unit of Measure</div>
              <div className="flex flex-col gap-2">
                {selected.uoms.map((uom, index) => (
                  <POSButton
                    key={uom.uomId}
                    ref={(el) => {
                      uomButtonRefs.current[index] = el;
                    }}
                    variant={index === highlightedUomIndex ? 'primary' : 'secondary'}
                    onClick={() => {
                      onSelect({ ...selected, selectedUom: uom });
                      setSelected(null);
                      window.setTimeout(() => searchInputRef.current?.focus(), 100);
                    }}
                    onFocus={() => setHighlightedUomIndex(index)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        onSelect({ ...selected, selectedUom: uom });
                        setSelected(null);
                        window.setTimeout(() => searchInputRef.current?.focus(), 100);
                      }
                    }}
                    className={
                      index === highlightedUomIndex ? 'ring-2 ring-blue-500 ring-offset-2' : ''
                    }
                    autoFocus={index === 0}
                  >
                    {uom.symbol || uom.name} - {formatCurrency(uom.price)}
                    {uom.isDefault && <span className="ml-2 text-xs">(Default)</span>}
                    <span className="ml-2 text-xs text-gray-500">
                      Stock: {getStockInSellingUom(selected.stockOnHand, uom.conversionFactor)}{' '}
                      {uom.symbol || uom.name}
                    </span>
                  </POSButton>
                ))}
              </div>
            </div>
          </POSModal>
        )}
      </div>
    );
  },
);

POSProductSearch.displayName = 'POSProductSearch';

export default POSProductSearch;
