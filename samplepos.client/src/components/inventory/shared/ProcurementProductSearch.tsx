import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/utils/api';
import { formatCurrency } from '@/utils/currency';

// ── Types ──────────────────────────────────────────────────────────────

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
  supplierLastPrice: number | null;
  supplierPurchaseCount: number | null;
  supplierName: string | null;
}

interface ProcurementProductSearchProps {
  supplierId: string;
  onProductSelect: (product: ProcurementProduct) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  /** Ref to the input element for external focus control */
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

// ── Component ──────────────────────────────────────────────────────────

export function ProcurementProductSearch({
  supplierId,
  onProductSelect,
  disabled = false,
  className = '',
  placeholder = 'Search products by name, SKU, barcode, or supplier code...',
  inputRef: externalInputRef,
}: ProcurementProductSearchProps) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const internalInputRef = useRef<HTMLInputElement>(null);
  const inputElementRef = externalInputRef || internalInputRef;
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Debounce search input (200ms — faster for power users)
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 200);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [search]);

  // Server-side procurement search
  const shouldSearch = debouncedSearch.length >= 2;
  const { data: searchResults, isLoading } = useQuery({
    queryKey: ['procurement-search', debouncedSearch, supplierId],
    queryFn: async () => {
      const response = await api.products.procurementSearch({
        q: debouncedSearch,
        supplierId: supplierId || undefined,
        limit: 20,
      });
      return (response.data as { data: ProcurementProduct[] }).data || [];
    },
    enabled: shouldSearch,
    staleTime: 30000,
  });

  const results: ProcurementProduct[] = searchResults || [];

  // Reset highlight when results change
  useEffect(() => {
    setHighlightedIndex(results.length > 0 ? 0 : -1);
  }, [results]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && dropdownRef.current) {
      const items = dropdownRef.current.querySelectorAll('[data-procurement-item]');
      items[highlightedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex]);

  const handleSelect = useCallback(
    (product: ProcurementProduct) => {
      onProductSelect(product);
      setSearch('');
      setDebouncedSearch('');
      setShowDropdown(false);
      setHighlightedIndex(-1);
    },
    [onProductSelect]
  );

  // Keyboard navigation: ↑↓ navigate, Enter selects, Esc closes
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!showDropdown || results.length === 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setHighlightedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
          break;
        case 'Enter':
          e.preventDefault();
          if (highlightedIndex >= 0 && highlightedIndex < results.length) {
            handleSelect(results[highlightedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setShowDropdown(false);
          setHighlightedIndex(-1);
          break;
      }
    },
    [showDropdown, results, highlightedIndex, handleSelect]
  );

  // Close dropdown when clicking outside
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

  /** Resolve the best unit cost for display: supplier history > last_cost > cost_price */
  const getBestCost = (p: ProcurementProduct): { value: number; source: string } => {
    if (p.supplierLastPrice && p.supplierLastPrice > 0) {
      return { value: p.supplierLastPrice, source: 'Supplier' };
    }
    if (p.lastCost > 0) return { value: p.lastCost, source: 'Last' };
    if (p.costPrice > 0) return { value: p.costPrice, source: 'Cost' };
    return { value: 0, source: '—' };
  };

  const needsReorder = (p: ProcurementProduct) =>
    p.quantityOnHand <= p.reorderLevel;

  return (
    <div className={`relative ${className}`}>
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <input
            ref={inputElementRef}
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setShowDropdown(true);
            }}
            onFocus={() => {
              if (debouncedSearch.length >= 2) setShowDropdown(true);
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            disabled={disabled}
            autoComplete="off"
            role="combobox"
            aria-expanded={showDropdown && results.length > 0}
            aria-haspopup="listbox"
            aria-activedescendant={
              highlightedIndex >= 0 ? `procurement-item-${highlightedIndex}` : undefined
            }
          />

          {/* Loading */}
          {isLoading && shouldSearch && (
            <div className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg p-3 text-sm text-gray-500">
              Searching...
            </div>
          )}

          {/* Results dropdown */}
          {showDropdown && !isLoading && shouldSearch && results.length > 0 && (
            <div
              ref={dropdownRef}
              className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-80 overflow-y-auto"
              role="listbox"
            >
              {results.map((product, idx) => {
                const cost = getBestCost(product);
                const reorder = needsReorder(product);
                const isHighlighted = idx === highlightedIndex;

                return (
                  <button
                    key={product.id}
                    id={`procurement-item-${idx}`}
                    data-procurement-item
                    type="button"
                    role="option"
                    aria-selected={isHighlighted}
                    onClick={() => handleSelect(product)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={`w-full px-3 py-2 text-left border-b border-gray-50 last:border-b-0 transition-colors ${
                      isHighlighted ? 'bg-blue-50 border-blue-100' : 'hover:bg-gray-50'
                    }`}
                  >
                    {/* Row 1: Name + badges */}
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 text-sm truncate">
                        {product.name}
                      </span>
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
                    </div>

                    {/* Row 2: SKU / Barcode / Supplier code */}
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                      {product.sku && <span>SKU: {product.sku}</span>}
                      {product.barcode && <span>BC: {product.barcode}</span>}
                      {product.supplierProductCode && (
                        <span className="text-blue-600">
                          Sup: {product.supplierProductCode}
                        </span>
                      )}
                    </div>

                    {/* Row 3: Inventory + Cost intelligence */}
                    <div className="flex items-center gap-4 mt-1 text-xs">
                      <span
                        className={`font-medium ${
                          reorder ? 'text-red-600' : 'text-green-600'
                        }`}
                      >
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
                          {product.supplierPurchaseCount
                            ? ` (×${product.supplierPurchaseCount})`
                            : ''}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* No results */}
          {showDropdown && !isLoading && shouldSearch && results.length === 0 && (
            <div className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg p-3 text-sm text-gray-500">
              No products found for &quot;{debouncedSearch}&quot;
            </div>
          )}
        </div>
      </div>

      {/* Keyboard hint */}
      {showDropdown && results.length > 0 && (
        <div className="mt-1 text-[10px] text-gray-400">
          ↑↓ Navigate &middot; Enter Select &middot; Esc Close
        </div>
      )}
    </div>
  );
}
