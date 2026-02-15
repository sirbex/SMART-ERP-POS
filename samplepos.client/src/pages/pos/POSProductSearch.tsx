import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useQuery } from '@tanstack/react-query';
import POSSearchBar from '../../components/pos/POSSearchBar';
import POSButton from '../../components/pos/POSButton';
import POSModal from '../../components/pos/POSModal';
import { formatCurrency } from '../../utils/currency';
import { api } from '../../utils/api';
import { searchCachedProducts } from '../../services/offlineCatalogService';
import type { CachedProduct } from '../../services/offlineCatalogService';

// TIMEZONE STRATEGY: Display dates without conversion
// Backend returns DATE as YYYY-MM-DD string (no timezone)
// Frontend displays as-is without parsing to Date object
const formatDisplayDate = (dateString: string | null | undefined): string => {
  if (!dateString) return 'N/A';

  // If it's an ISO string, extract the date part
  if (dateString.includes('T')) {
    return dateString.split('T')[0];
  }

  return dateString;
};

interface ProductSearchResult {
  id: string;
  name: string;
  sku: string;
  barcode: string;
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

const POSProductSearch = forwardRef<POSProductSearchHandle, POSProductSearchProps>(({ onSelect, isOnline = true }, ref) => {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ProductSearchResult | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [highlightedUomIndex, setHighlightedUomIndex] = useState<number>(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const productListRef = useRef<HTMLDivElement>(null);
  const uomButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Expose focus and clear methods to parent via ref
  useImperativeHandle(ref, () => ({
    focusSearch: () => {
      searchInputRef.current?.focus();
    },
    clearSearch: () => {
      setSearch('');
      setSelected(null);
      setSelectedIndex(0);
      setHighlightedUomIndex(0);
    }
  }));

  // ── Transform cached products to ProductSearchResult format ──
  const transformCachedToSearchResult = (cached: CachedProduct): ProductSearchResult => {
    const defaultUom = cached.uoms.find(u => u.isDefault) || cached.uoms[0];
    const marginPct = cached.sellingPrice > 0
      ? ((cached.sellingPrice - cached.costPrice) / cached.sellingPrice * 100)
      : 0;
    return {
      id: cached.id,
      name: cached.name,
      sku: cached.sku,
      barcode: cached.barcode,
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
  };

  // Query inventory stock levels to get only products with available stock
  // Disabled when offline – falls back to local cache
  const { data: onlineData, isLoading: isOnlineLoading } = useQuery({
    queryKey: ['pos-search', search],
    queryFn: async () => {
      if (!search) return [];

      // Get products with stock from inventory API
      const stockRes = await api.inventory.stockLevels();
      if (!stockRes.data.success) return [];

      const stockLevels = stockRes.data.data || [];

      // Filter products with available stock that match search term
      const term = search.toLowerCase();
      return stockLevels.filter((item: any) => {
        // Only show products with stock > 0
        if (!item.total_stock || item.total_stock <= 0) return false;

        // Match search term against product name, SKU, or barcode
        return (
          item.product_name?.toLowerCase().includes(term) ||
          item.sku?.toLowerCase().includes(term) ||
          item.barcode?.toLowerCase().includes(term)
        );
      }).map((item: any) => {
        const sellingPrice = parseFloat(item.selling_price || 0);
        const averageCost = parseFloat(item.average_cost || 0);
        const marginPct = sellingPrice > 0
          ? ((sellingPrice - averageCost) / sellingPrice * 100)
          : 0;

        // Parse UoMs from backend (already in correct format)
        let uoms = item.uoms || [];

        // If no UoMs defined, create a default fallback
        if (!uoms || uoms.length === 0) {
          uoms = [{
            uomId: `default-${item.product_id}`,
            name: 'PIECE',
            symbol: 'PIECE',
            conversionFactor: 1,
            isDefault: true,
            price: sellingPrice,
            cost: averageCost
          }];
        }

        // Get default UOM for display
        const defaultUom = uoms.find((u: any) => u.isDefault) || uoms[0];

        return {
          id: item.product_id,
          name: item.product_name,
          sku: item.sku || '',
          barcode: item.barcode || '',
          unitOfMeasure: defaultUom?.symbol || defaultUom?.name || 'PIECE',
          uoms: uoms,
          stockOnHand: parseFloat(item.total_stock || 0),
          expiryDate: item.nearest_expiry,
          costPrice: averageCost,
          sellingPrice: sellingPrice,
          marginPct: marginPct,
          isTaxable: item.is_taxable ?? false,
          taxRate: parseFloat(item.tax_rate || 0)
        };
      });
    },
    staleTime: 10_000, // Refresh every 10 seconds for accurate stock
    enabled: isOnline && !!search, // Disable when offline
  });

  // ── Offline search: use cached catalog ──
  const offlineResults: ProductSearchResult[] = !isOnline && search
    ? searchCachedProducts(search).map(transformCachedToSearchResult)
    : [];

  // Unified data source
  const data = isOnline ? onlineData : offlineResults;
  const isLoading = isOnline ? isOnlineLoading : false;

  // Auto-focus search bar on mount
  useEffect(() => {
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, []);

  // Reset selected index when search results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [data]);

  // Global keyboard navigation handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle keyboard if any modal is open
      // Check our own modal first
      if (selected) return;

      // Check if POSPage's modal is open (or any other Radix Dialog)
      // Count the number of overlays - if there are any, a modal is open somewhere
      const overlays = document.querySelectorAll('[data-radix-dialog-overlay]');
      if (overlays.length > 0) return;

      // "/" key refocuses search bar
      if (e.key === '/' && document.activeElement !== searchInputRef.current) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      // Only handle arrow keys and Enter when search has results
      if (!data || data.length === 0) return;

      // Arrow Down: Navigate down the product list
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => {
          const newIndex = Math.min(prev + 1, data.length - 1);
          // Scroll selected item into view
          setTimeout(() => {
            const container = productListRef.current;
            const selectedItem = container?.children[newIndex] as HTMLElement;
            if (selectedItem && container) {
              const containerRect = container.getBoundingClientRect();
              const itemRect = selectedItem.getBoundingClientRect();
              if (itemRect.bottom > containerRect.bottom) {
                selectedItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
              }
            }
          }, 0);
          return newIndex;
        });
        return;
      }

      // Arrow Up: Navigate up the product list
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => {
          const newIndex = Math.max(prev - 1, 0);
          // Scroll selected item into view
          setTimeout(() => {
            const container = productListRef.current;
            const selectedItem = container?.children[newIndex] as HTMLElement;
            if (selectedItem && container) {
              const containerRect = container.getBoundingClientRect();
              const itemRect = selectedItem.getBoundingClientRect();
              if (itemRect.top < containerRect.top) {
                selectedItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
              }
            }
          }, 0);
          return newIndex;
        });
        return;
      }

      // Arrow Right or Enter: Add selected product to cart
      if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault();
        if (data && data.length > 0 && selectedIndex >= 0 && selectedIndex < data.length) {
          const selectedProduct = data[selectedIndex];

          // Clear search immediately after selection
          setSearch('');
          setSelectedIndex(0);

          // If product has 0 or 1 UoM, directly select it
          // If product has multiple UoMs, show selection modal
          if (!selectedProduct.uoms || selectedProduct.uoms.length <= 1) {
            onSelect(selectedProduct);
            // Restore focus to search input after adding to cart
            setTimeout(() => searchInputRef.current?.focus(), 0);
          } else {
            setSelected(selectedProduct);
            // Focus will be managed by UoM modal's useEffect
          }
        }
        return;
      }

      // Escape: Clear search
      if (e.key === 'Escape') {
        e.preventDefault();
        setSearch('');
        setSelectedIndex(0);
        searchInputRef.current?.focus();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [data, selectedIndex, onSelect]);

  // Keyboard navigation for UoM selection modal
  useEffect(() => {
    if (!selected || !selected.uoms || selected.uoms.length === 0) return;

    // Reset highlighted index when modal opens
    setHighlightedUomIndex(0);

    const handleUomKeyDown = (e: KeyboardEvent) => {
      // Only handle keys when OUR UoM modal is open
      if (!selected) return;

      // Escape: Close modal without selection
      if (e.key === 'Escape') {
        e.preventDefault();
        setSelected(null);
        // Restore focus to search input
        setTimeout(() => searchInputRef.current?.focus(), 100);
        return;
      }
    };

    window.addEventListener('keydown', handleUomKeyDown);
    return () => window.removeEventListener('keydown', handleUomKeyDown);
  }, [selected, onSelect]);

  return (
    <div>
      <POSSearchBar
        value={search}
        onChange={setSearch}
        autoFocus
        inputRef={searchInputRef}
      />
      {isLoading && <div className="mt-2 text-xs text-gray-500">Searching...</div>}
      {!isOnline && search && (
        <div className="mt-1 text-xs text-amber-600 flex items-center gap-1">
          <span>⚡</span> Searching offline catalog
        </div>
      )}
      {search && Array.isArray(data) && (
        <div
          ref={productListRef}
          className="mt-2 divide-y border rounded bg-white shadow max-h-[60vh] overflow-y-auto"
        >
          {data.length === 0 ? (
            <div className="p-3 text-xs text-gray-500">No products found</div>
          ) : (
            data.map((p: ProductSearchResult, index: number) => (
              <button
                key={p.id}
                className={`w-full text-left px-3 py-2 hover:bg-blue-50 focus:bg-blue-100 flex flex-col gap-1 transition-colors ${index === selectedIndex
                  ? 'bg-blue-100 dark:bg-blue-800'
                  : ''
                  }`}
                onClick={() => {
                  // If product has 0 or 1 UoM, directly select it
                  // If product has multiple UoMs, show selection modal
                  if (!p.uoms || p.uoms.length <= 1) {
                    onSelect(p);
                    // Restore focus to search input after adding to cart
                    setTimeout(() => searchInputRef.current?.focus(), 0);
                  } else {
                    setSelected(p);
                  }
                }}
              >
                <div className="font-semibold text-gray-900">{p.name}</div>
                <div className="text-xs text-gray-500">SKU: {p.sku} | Barcode: {p.barcode}</div>
                <div className="flex gap-2 text-xs">
                  <span>Stock: <span className={p.stockOnHand <= 5 ? 'text-red-600' : 'text-gray-700'}>{p.stockOnHand}</span></span>
                  {p.expiryDate && (
                    <span className={new Date(p.expiryDate) < new Date(Date.now() + 7 * 24 * 3600 * 1000) ? 'bg-yellow-100 text-yellow-800 px-2 rounded' : 'text-gray-500'}>
                      Exp: {formatDisplayDate(p.expiryDate)}
                    </span>
                  )}
                  <span>Margin: <span className={p.marginPct < 10 ? 'text-red-600' : p.marginPct < 20 ? 'text-yellow-600' : 'text-green-600'}>{p.marginPct.toFixed(1)}%</span></span>
                </div>
              </button>
            ))
          )}
        </div>
      )}
      {/* UoM options modal (shown after select) */}
      {selected && (
        <POSModal
          open={!!selected}
          onOpenChange={(open) => {
            setSelected(null);
            // Restore focus to search input when modal closes
            if (!open) {
              setTimeout(() => searchInputRef.current?.focus(), 100);
            }
          }}
          title="Select Unit of Measure"
          description={`Choose the unit of measure for ${selected.name}`}
          ariaLabel="Select Unit of Measure"
        >
          <div className="mb-3 font-semibold text-lg text-gray-900">{selected.name}</div>
          <div className="mb-2 text-xs text-gray-500">SKU: {selected.sku} | Barcode: {selected.barcode}</div>
          <div className="mb-2 text-xs text-gray-500">Stock: {selected.stockOnHand}</div>
          {selected.expiryDate && (
            <div className="mb-2 text-xs text-yellow-800 bg-yellow-100 px-2 py-1 rounded">Expiring: {formatDisplayDate(selected.expiryDate)}</div>
          )}
          <div className="mb-2 text-xs text-gray-500">Margin: <span className={selected.marginPct < 10 ? 'text-red-600' : selected.marginPct < 20 ? 'text-yellow-600' : 'text-green-600'}>{selected.marginPct.toFixed(1)}%</span></div>

          {/* Keyboard navigation hint */}
          <div className="mb-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800">
            <div className="font-medium mb-1">⌨️ Keyboard Shortcuts:</div>
            <div className="space-y-0.5 text-blue-700">
              <div>Tab - Navigate between options</div>
              <div>Enter - Select focused option</div>
              <div>Esc - Cancel</div>
            </div>
          </div>

          <div className="mb-4">
            <div className="font-medium text-gray-700 mb-1">Select Unit of Measure</div>
            <div className="flex flex-col gap-2">
              {selected.uoms.map((uom, index) => (
                <POSButton
                  key={uom.uomId}
                  ref={(el) => { uomButtonRefs.current[index] = el; }}
                  variant={index === highlightedUomIndex ? 'primary' : 'secondary'}
                  onClick={() => {
                    // Pass product with selected UoM
                    onSelect({ ...selected, selectedUom: uom });
                    setSelected(null);
                    // Restore focus to search input after adding to cart
                    setTimeout(() => searchInputRef.current?.focus(), 100);
                  }}
                  onFocus={() => setHighlightedUomIndex(index)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      onSelect({ ...selected, selectedUom: uom });
                      setSelected(null);
                      setTimeout(() => searchInputRef.current?.focus(), 100);
                    }
                  }}
                  className={index === highlightedUomIndex ? 'ring-2 ring-blue-500 ring-offset-2' : ''}
                  autoFocus={index === 0}
                >
                  {uom.symbol || uom.name} - {formatCurrency(uom.price)}
                  {uom.isDefault && <span className="ml-2 text-xs">(Default)</span>}
                  <span className="ml-2 text-xs text-gray-500">Stock: {selected.stockOnHand}</span>
                </POSButton>
              ))}
            </div>
          </div>
        </POSModal>
      )}
    </div>
  );
});

POSProductSearch.displayName = 'POSProductSearch';

export default POSProductSearch;
