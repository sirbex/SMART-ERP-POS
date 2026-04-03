import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/utils/api";
import { productKeys } from "@/hooks/useProducts";

export interface SearchableProduct {
  id: string;
  name: string;
  sku?: string;
  barcode?: string;
  trackExpiry?: boolean;
  [key: string]: unknown;
}

interface ProductSearchBarProps {
  onProductSelect: (product: SearchableProduct) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}

/**
 * Shared Product Search Bar Component
 * Used in: Purchase Orders, Manual Goods Receipt
 * Provides unified product search with server-side filtering
 */
export function ProductSearchBar({
  onProductSelect,
  disabled = false,
  className = "",
  placeholder = "Search products to add (name or SKU)...",
}: ProductSearchBarProps) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search input (300ms)
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 300);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [search]);

  // Server-side search: only fetch when there's a query (min 2 chars)
  const shouldSearch = debouncedSearch.length >= 2;
  const searchParams = { search: debouncedSearch, limit: 20 };
  const { data: productsData, isLoading } = useQuery({
    queryKey: productKeys.list(searchParams),
    queryFn: async () => {
      const response = await api.products.list(searchParams);
      return response.data;
    },
    enabled: shouldSearch,
    staleTime: 30000,
  });

  // Extract products
  const allProducts = useMemo(() => {
    if (!productsData) return [];
    if (productsData.data && Array.isArray(productsData.data)) return productsData.data;
    return Array.isArray(productsData) ? productsData : [];
  }, [productsData]);

  const handleSelect = (product: SearchableProduct) => {
    onProductSelect(product);
    setSearch("");
    setShowDropdown(false);
  };

  return (
    <div className={className}>
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setShowDropdown(true);
            }}
            onFocus={() => setShowDropdown(true)}
            placeholder={placeholder}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={disabled}
          />
          {/* Loading indicator */}
          {isLoading && debouncedSearch.length >= 2 && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg p-3 text-sm text-gray-500">
              Searching...
            </div>
          )}
          {/* Product Dropdown */}
          {showDropdown && !isLoading && debouncedSearch.length >= 2 && allProducts.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {allProducts.slice(0, 20).map((product: SearchableProduct) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => handleSelect(product)}
                  className="w-full px-4 py-2 text-left hover:bg-blue-50 border-b border-gray-100 last:border-b-0"
                >
                  <div className="flex items-center gap-2">
                    <div className="font-medium text-gray-900">{product.name}</div>
                    {product.trackExpiry && (
                      <span className="inline-flex px-2 py-0.5 text-[10px] font-semibold rounded-full bg-purple-100 text-purple-800" aria-label="Perishable">
                        Perishable
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    {product.sku && (
                      <div className="text-xs text-gray-500">SKU: {product.sku}</div>
                    )}
                    {product.barcode && (
                      <div className="text-xs text-gray-400">Barcode: {product.barcode}</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
          {/* No results */}
          {showDropdown && !isLoading && debouncedSearch.length >= 2 && allProducts.length === 0 && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg p-3 text-sm text-gray-500">
              No products found for &quot;{debouncedSearch}&quot;
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            setSearch("");
            setShowDropdown(false);
          }}
          className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          disabled={disabled}
        >
          Clear
        </button>
      </div>
    </div>
  );
}
