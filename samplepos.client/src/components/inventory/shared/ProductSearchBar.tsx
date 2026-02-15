import { useState, useMemo } from "react";
import { useProducts } from "@/hooks/useProducts";

interface ProductSearchBarProps {
  onProductSelect: (product: any) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}

/**
 * Shared Product Search Bar Component
 * Used in: Purchase Orders, Manual Goods Receipt
 * Provides unified product search with dropdown results
 */
export function ProductSearchBar({
  onProductSelect,
  disabled = false,
  className = "",
  placeholder = "Search products to add (name or SKU)...",
}: ProductSearchBarProps) {
  const [search, setSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);

  const { data: productsData } = useProducts();

  // Extract products
  const allProducts = useMemo(() => {
    if (!productsData) return [];
    if (productsData.data && Array.isArray(productsData.data)) return productsData.data;
    return Array.isArray(productsData) ? productsData : [];
  }, [productsData]);

  // Filter products by search
  const filteredProducts = useMemo(() => {
    if (!search) return allProducts;
    const query = search.toLowerCase();
    return allProducts.filter((p: any) => {
      try {
        // Safely handle potential null/undefined/non-string values
        const name = p.name ? String(p.name).toLowerCase() : '';
        const sku = p.sku ? String(p.sku).toLowerCase() : '';
        const barcode = p.barcode ? String(p.barcode).toLowerCase() : '';

        return name.includes(query) || sku.includes(query) || barcode.includes(query);
      } catch (error) {
        console.error('Error filtering product:', error, p);
        return false;
      }
    });
  }, [allProducts, search]);

  const handleSelect = (product: any) => {
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
          {/* Product Dropdown */}
          {showDropdown && search && filteredProducts.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {filteredProducts.slice(0, 10).map((product: any) => (
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
