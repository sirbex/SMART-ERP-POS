import { useState, useMemo, useEffect } from 'react';
import { useOfflineStockLevels, useOfflineProducts } from '../../hooks/useOfflineData';
import { useOfflineContext } from '../../contexts/OfflineContext';
import { formatMultiUomQuantity } from '../../utils/formatQuantity';
import { formatCurrency } from '../../utils/currency';

interface StockLevelItem {
  product_id: string;
  product_name: string;
  total_stock?: string | number;
  total_quantity?: string | number;
  reorder_level: string | number;
  needs_reorder: boolean;
  selling_price: string | number;
  nearest_expiry?: string | null;
}

interface ProductItem {
  id: string;
  sku?: string;
  name?: string;
  baseUom?: string;
  additionalUoms?: Array<{ unitName: string; conversionFactor: number }>;
  // Fields used by formatMultiUomQuantity
  product_uoms?: Array<{
    conversionFactor: number;
    isDefault?: boolean;
    uomSymbol?: string;
    uom_symbol?: string;
    uomName?: string;
    uom_name?: string;
  }>;
  productUoms?: Array<{
    conversionFactor: number;
    isDefault?: boolean;
    uomSymbol?: string;
    uom_symbol?: string;
    uomName?: string;
    uom_name?: string;
  }>;
  unitOfMeasure?: string;
}

export default function StockLevelsPage() {
  const { isOnline } = useOfflineContext();

  // Use offline-aware hooks that cache to IndexedDB and fall back when offline
  const { data: stockLevelsData, isLoading, error, refetch } = useOfflineStockLevels();
  const { data: productsData } = useOfflineProducts({ limit: 10000 });

  const ITEMS_PER_PAGE = 50;
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'low' | 'expiring'>('all');

  // Helper: calculate days until expiry from a date string
  const getDaysUntilExpiry = (expiryDate: string | null | undefined): number | null => {
    if (!expiryDate) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(expiryDate + 'T00:00:00');
    return Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  // Helper: get expiry badge style and label
  const getExpiryBadge = (days: number | null): { className: string; label: string } => {
    if (days === null) return { className: 'bg-gray-100 text-gray-500', label: 'N/A' };
    if (days < 0)
      return { className: 'bg-red-100 text-red-800', label: `Expired ${Math.abs(days)}d ago` };
    if (days === 0) return { className: 'bg-red-100 text-red-800', label: 'Expires TODAY' };
    if (days <= 7) return { className: 'bg-red-100 text-red-800', label: `${days}d left` };
    if (days <= 30) return { className: 'bg-yellow-100 text-yellow-800', label: `${days}d left` };
    if (days <= 90) return { className: 'bg-blue-100 text-blue-800', label: `${days}d left` };
    return { className: 'bg-green-100 text-green-800', label: `${days}d left` };
  };

  // Extract stock levels from API response
  const stockLevels = useMemo(() => {
    if (!stockLevelsData) return [];
    if (stockLevelsData.data && Array.isArray(stockLevelsData.data)) {
      return stockLevelsData.data;
    }
    return Array.isArray(stockLevelsData) ? stockLevelsData : [];
  }, [stockLevelsData]);

  const products = useMemo(() => {
    if (!productsData) return [];
    if (productsData.data && Array.isArray(productsData.data)) {
      return productsData.data;
    }
    return Array.isArray(productsData) ? productsData : [];
  }, [productsData]);

  // Create product map for quick lookup
  const productMap = useMemo(() => {
    const map = new Map<string, ProductItem>();
    products.forEach((p: ProductItem) => {
      map.set(p.id, p);
    });
    return map;
  }, [products]);

  // Filter stock levels
  const filteredStockLevels = useMemo(() => {
    let filtered = stockLevels;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (item: StockLevelItem) =>
          item.product_name?.toLowerCase().includes(term) ||
          item.product_id?.toLowerCase().includes(term)
      );
    }

    if (filterStatus === 'low') {
      filtered = filtered.filter((item: StockLevelItem) => item.needs_reorder === true);
    } else if (filterStatus === 'expiring') {
      filtered = filtered.filter((item: StockLevelItem) => {
        const days = getDaysUntilExpiry(item.nearest_expiry);
        return days !== null && days <= 30;
      });
    }

    return filtered;
  }, [stockLevels, searchTerm, filterStatus]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterStatus]);

  // Paginated stock levels
  const totalPages = Math.max(1, Math.ceil(filteredStockLevels.length / ITEMS_PER_PAGE));
  const paginatedStockLevels = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredStockLevels.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredStockLevels, currentPage]);

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-blue-800">Loading stock levels...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div
          className={`${!isOnline ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'} border rounded-lg p-4`}
        >
          <p className={!isOnline ? 'text-amber-800' : 'text-red-800'}>
            {!isOnline
              ? 'No cached data available. Please connect to the internet and load this page at least once.'
              : 'Failed to load stock levels. Please try again.'}
          </p>
          <button
            onClick={() => refetch()}
            className="mt-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Offline notice */}
      {!isOnline && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-2 text-amber-800 text-sm">
          <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          Offline — showing cached stock levels. Data may not reflect the latest changes.
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Stock Levels</h2>
          <p className="text-gray-600 mt-1">
            {isOnline ? 'Real-time inventory from database' : 'Cached inventory data (offline)'}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          🔄 Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Search Products</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="filter-status" className="block text-sm font-medium text-gray-700 mb-2">
              Filter Status
            </label>
            <select
              id="filter-status"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as 'all' | 'low' | 'expiring')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Products</option>
              <option value="low">Low Stock Only</option>
              <option value="expiring">Expiring Soon (≤ 30 days)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Stock Table */}
      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Product
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Quantity
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Price
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Reorder Level
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Expiry
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {paginatedStockLevels.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                  {searchTerm || filterStatus !== 'all'
                    ? 'No products match your filters'
                    : 'No inventory data. Create products on the Products page.'}
                </td>
              </tr>
            ) : (
              paginatedStockLevels.map((item: StockLevelItem) => {
                const product = productMap.get(item.product_id);
                // Backend returns total_stock, not total_quantity
                const totalQty =
                  parseFloat(String(item.total_stock || item.total_quantity || 0)) || 0;
                const reorderLevel = parseFloat(String(item.reorder_level)) || 0;
                const needsReorder = item.needs_reorder === true;
                const sellingPrice = parseFloat(String(item.selling_price)) || 0;

                return (
                  <tr key={item.product_id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        <div className="text-sm font-medium text-gray-900">{item.product_name}</div>
                        {product && (
                          <div className="text-xs text-gray-500 mt-1">SKU: {product.sku}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-col gap-1">
                        <div className="text-sm font-bold text-blue-600">
                          {formatMultiUomQuantity(totalQty, product)}
                        </div>
                        <div className="text-xs text-gray-500">{totalQty.toFixed(2)} base</div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right whitespace-nowrap">
                      <div className="text-sm font-semibold text-gray-900">
                        {formatCurrency(sellingPrice)}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center whitespace-nowrap">
                      <span className="text-sm text-gray-700 font-medium">
                        {reorderLevel.toFixed(0)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center whitespace-nowrap">
                      {(() => {
                        const days = getDaysUntilExpiry(item.nearest_expiry);
                        const badge = getExpiryBadge(days);
                        return (
                          <div className="flex flex-col items-center gap-1">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full ${badge.className}`}
                            >
                              {badge.label}
                            </span>
                            {item.nearest_expiry && (
                              <span className="text-xs text-gray-400">{item.nearest_expiry}</span>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-4 text-center whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-3 py-1 text-xs font-semibold rounded-full ${needsReorder
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-green-100 text-green-800'
                          }`}
                      >
                        {needsReorder ? '⚠️ Low Stock' : '✓ Normal'}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {filteredStockLevels.length > ITEMS_PER_PAGE && (
        <div className="flex items-center justify-between px-4 py-4 bg-white rounded-lg shadow mt-4">
          <p className="text-sm text-gray-600">
            Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filteredStockLevels.length)} of {filteredStockLevels.length} products
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="text-sm text-gray-700">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">Total Products</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{stockLevels.length}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">Low Stock Items</div>
          <div className="text-2xl font-bold text-yellow-600 mt-1">
            {stockLevels.filter((item: StockLevelItem) => item.needs_reorder).length}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">Expiring Soon (≤ 30d)</div>
          <div className="text-2xl font-bold text-red-600 mt-1">
            {
              stockLevels.filter((item: StockLevelItem) => {
                const days = getDaysUntilExpiry(item.nearest_expiry);
                return days !== null && days <= 30;
              }).length
            }
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">Filtered Results</div>
          <div className="text-2xl font-bold text-blue-600 mt-1">{filteredStockLevels.length}</div>
        </div>
      </div>
    </div>
  );
}
