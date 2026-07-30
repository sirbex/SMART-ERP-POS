/**
 * Inventory List (spec: InventoryList.tsx) — route `/inventory/stock-levels`
 * Multistore: Location filter + Store column gated by is_multistore_enabled.
 */
import { useEffect, useMemo, useState } from 'react';
import { useOfflineStockLevels, useOfflineProducts } from '../../hooks/useOfflineData';
import { useOfflineContext } from '../../contexts/OfflineContext';
import { useMultistoreEnabled } from '../../hooks/useMultistore';
import { useAuth } from '../../hooks/useAuth';
import { hasWarehouseNetworkAccess } from '../../../../shared/utils/warehouseRbac';
import { useStoreLocations, useStockLevelsByStore } from '../../hooks/useWarehouse';
import { StoreLocationSelect } from '../../components/inventory/StoreLocationSelect';
import { StockViewModeToggle } from '../../components/inventory/StockViewModeToggle';
import {
  readStockViewMode,
  writeStockViewMode,
  type StockViewMode,
} from '../../components/inventory/stockViewPrefs';
import { formatMultiUomQuantity, productFromApiUoms } from '../../utils/formatQuantity';
import { formatCurrency } from '../../utils/currency';
import { SortableTableHeader } from '../../components/ui/SortableTableHeader';
import { MobileSortSelect } from '../../components/ui/MobileSortSelect';
import { useColumnSort } from '../../hooks/useColumnSort';
import { applyTableSort } from '../../lib/tableSortUtils';
import {
  AdaptivePage,
  AdaptiveSearch,
  AdaptiveToolbar,
} from '../../components/adaptive';

function unwrapStockListPayload(payload: unknown): unknown[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  const record = payload as { data?: unknown };
  if (Array.isArray(record.data)) return record.data;
  if (record.data && typeof record.data === 'object') {
    const nested = record.data as { data?: unknown };
    if (Array.isArray(nested.data)) return nested.data;
  }
  return [];
}

type StockLevelSortField =
  | 'product'
  | 'category'
  | 'quantity'
  | 'price'
  | 'reorderLevel'
  | 'expiry'
  | 'status';

const STOCK_LEVEL_DESC_DEFAULT = new Set<StockLevelSortField>([
  'quantity',
  'price',
  'reorderLevel',
  'expiry',
  'status',
]);

interface StockLevelItem {
  product_id: string;
  product_name: string;
  total_stock?: string | number;
  total_quantity?: string | number;
  reorder_level: string | number;
  needs_reorder: boolean;
  selling_price: string | number;
  nearest_expiry?: string | null;
  store_location_id?: string;
  store_location_name?: string;
  store_location_code?: string;
  /** Pre-flattened display label (multistore only). */
  storeDisplayLabel?: string;
  uoms?: unknown;
}

interface ProductItem {
  id: string;
  sku?: string;
  name?: string;
  category?: string;
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
  const { isMultistoreEnabled } = useMultistoreEnabled();
  const { permissions } = useAuth();
  const canUseStoreFilter = useMemo(() => {
    if (!isMultistoreEnabled) return false;
    return hasWarehouseNetworkAccess(permissions);
  }, [isMultistoreEnabled, permissions]);
  const [stockViewMode, setStockViewMode] = useState<StockViewMode>(() => readStockViewMode());
  const byStoreView = canUseStoreFilter && stockViewMode === 'store';
  const { data: storeLocations = [] } = useStoreLocations(byStoreView && isOnline);
  const [storeFilterId, setStoreFilterId] = useState('');

  const useMultistoreStock = byStoreView && isOnline;

  useEffect(() => {
    if (!useMultistoreStock || storeFilterId || storeLocations.length === 0) return;
    const defaultStore =
      storeLocations.find((s) => s.isDefaultReceiving) ||
      storeLocations.find((s) => s.storeType === 'MAIN') ||
      storeLocations[0];
    if (defaultStore) setStoreFilterId(defaultStore.id);
  }, [useMultistoreStock, storeFilterId, storeLocations]);

  // Use offline-aware hooks that cache to IndexedDB and fall back when offline
  const {
    data: stockLevelsData,
    isLoading: offlineLoading,
    error: offlineError,
    refetch: offlineRefetch,
  } = useOfflineStockLevels();
  const {
    data: storeStockData,
    isLoading: storeLoading,
    error: storeError,
    refetch: storeRefetch,
  } = useStockLevelsByStore(storeFilterId, useMultistoreStock && !!storeFilterId);

  const isLoading = useMultistoreStock ? storeLoading : offlineLoading;
  const error = useMultistoreStock ? storeError : offlineError;
  const refetch = useMultistoreStock ? storeRefetch : offlineRefetch;
  const rawStockData = useMultistoreStock ? storeStockData : stockLevelsData;
  const { data: productsData } = useOfflineProducts({ limit: 10000, includeUoms: true });

  const ITEMS_PER_PAGE = 50;
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'low' | 'expiring'>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterQtyOnly, setFilterQtyOnly] = useState(false);
  const { sortField, sortOrder, handleSort, setSortOrder } =
    useColumnSort<StockLevelSortField>('product', 'asc');

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
  const stockLevels = useMemo(
    () => unwrapStockListPayload(rawStockData) as StockLevelItem[],
    [rawStockData],
  );

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

  // Derive unique categories from products
  const uniqueCategories = useMemo(() => {
    const cats = new Set<string>();
    products.forEach((p: ProductItem) => {
      if (p.category) cats.add(p.category);
    });
    return Array.from(cats).sort((a, b) => a.localeCompare(b));
  }, [products]);

  const selectedStoreLabel = useMemo(() => {
    if (!storeFilterId) return '';
    const store = storeLocations.find((s) => s.id === storeFilterId);
    return store ? `${store.name} (${store.code})` : '';
  }, [storeFilterId, storeLocations]);

  const stockLevelsWithStoreLabel = useMemo(() => {
    if (!byStoreView) return stockLevels;
    return stockLevels.map((item: StockLevelItem) => ({
      ...item,
      storeDisplayLabel: item.store_location_name
        ? `${item.store_location_name}${item.store_location_code ? ` (${item.store_location_code})` : ''}`
        : selectedStoreLabel || '—',
    }));
  }, [stockLevels, byStoreView, selectedStoreLabel]);

  const handleStockViewModeChange = (mode: StockViewMode) => {
    setStockViewMode(mode);
    writeStockViewMode(mode);
    setCurrentPage(1);
  };

  // Filter stock levels
  const filteredStockLevels = useMemo(() => {
    let filtered = stockLevelsWithStoreLabel;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (item: StockLevelItem) => {
          const product = productMap.get(item.product_id);
          return (
            item.product_name?.toLowerCase().includes(term) ||
            item.product_id?.toLowerCase().includes(term) ||
            (product?.category ?? '').toLowerCase().includes(term)
          );
        }
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

    if (filterCategory !== 'all') {
      filtered = filtered.filter((item: StockLevelItem) => {
        const product = productMap.get(item.product_id);
        return product?.category === filterCategory;
      });
    }

    return filtered;
  }, [stockLevelsWithStoreLabel, searchTerm, filterStatus, filterCategory, productMap]);

  const stockLevelSortAccessors = useMemo(
    () => ({
      product: (item: StockLevelItem) => item.product_name ?? '',
      category: (item: StockLevelItem) => productMap.get(item.product_id)?.category ?? '',
      quantity: (item: StockLevelItem) =>
        parseFloat(String(item.total_stock || item.total_quantity || 0)) || 0,
      price: (item: StockLevelItem) => parseFloat(String(item.selling_price)) || 0,
      reorderLevel: (item: StockLevelItem) => parseFloat(String(item.reorder_level)) || 0,
      expiry: (item: StockLevelItem) => item.nearest_expiry ?? '',
      status: (item: StockLevelItem) => (item.needs_reorder ? 1 : 0),
    }),
    [productMap],
  );

  const handleColumnSort = (field: string) => {
    const f = field as StockLevelSortField;
    if (f === 'quantity') {
      setFilterQtyOnly(true);
      handleSort(f, { defaultOrder: 'desc' });
      return;
    }
    setFilterQtyOnly(false);
    handleSort(f, {
      defaultOrder: STOCK_LEVEL_DESC_DEFAULT.has(f) ? 'desc' : 'asc',
    });
  };

  const mobileSortOptions = [
    { value: 'product', label: 'Sort by Product' },
    { value: 'category', label: 'Sort by Category' },
    { value: 'quantity', label: 'Sort by Quantity' },
    { value: 'price', label: 'Sort by Price' },
    { value: 'reorderLevel', label: 'Sort by Reorder Level' },
    { value: 'expiry', label: 'Sort by Expiry' },
    { value: 'status', label: 'Sort by Status' },
  ];

  const sortedStockLevels = useMemo(() => {
    let rows = [...filteredStockLevels];
    if (filterQtyOnly) {
      rows = rows.filter(
        (item) =>
          (parseFloat(String(item.total_stock || item.total_quantity || 0)) || 0) > 0,
      );
    }
    return applyTableSort(rows, sortField, sortOrder, stockLevelSortAccessors);
  }, [filteredStockLevels, filterQtyOnly, sortField, sortOrder, stockLevelSortAccessors]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterStatus, filterCategory, filterQtyOnly, sortField, sortOrder, storeFilterId]);

  const tableColSpan = byStoreView ? 8 : 7;

  // Paginated stock levels
  const totalPages = Math.max(1, Math.ceil(sortedStockLevels.length / ITEMS_PER_PAGE));
  const paginatedStockLevels = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return sortedStockLevels.slice(start, start + ITEMS_PER_PAGE);
  }, [sortedStockLevels, currentPage]);

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
    <AdaptivePage
      className="p-6"
      title="Stock Levels"
      description={isOnline ? 'Real-time inventory from database' : 'Cached inventory data (offline)'}
      primaryActions={
        <button
          type="button"
          onClick={() => refetch()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 min-h-[var(--layout-touch-target)]"
        >
          🔄 Refresh
        </button>
      }
      toolbar={
        <div className="space-y-3" data-stock-filters="true">
          {!isOnline && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-2 text-amber-800 text-sm">
              <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              Offline — showing cached stock levels. Data may not reflect the latest changes.
            </div>
          )}
          {canUseStoreFilter && (
            <StockViewModeToggle mode={stockViewMode} onChange={handleStockViewModeChange} />
          )}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <AdaptiveToolbar
              leading={
                <AdaptiveSearch
                  value={searchTerm}
                  onChange={setSearchTerm}
                  placeholder="Search by name or category..."
                  label="Search products"
                />
              }
              secondaryLabel="Filters"
              secondary={
                <div className={`grid grid-cols-1 gap-3 min-w-[14rem] ${byStoreView ? 'sm:grid-cols-2' : ''}`}>
                  {byStoreView && (
                    <StoreLocationSelect
                      id="filter-store-location"
                      label="Location"
                      stores={storeLocations}
                      value={storeFilterId}
                      onChange={setStoreFilterId}
                    />
                  )}
                  <div>
                    <label htmlFor="filter-category" className="block text-sm font-medium text-gray-700 mb-2">
                      Category
                    </label>
                    <select
                      id="filter-category"
                      value={filterCategory}
                      onChange={(e) => setFilterCategory(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 min-h-[var(--layout-touch-target)]"
                    >
                      <option value="all">All Categories</option>
                      {uniqueCategories.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="filter-status" className="block text-sm font-medium text-gray-700 mb-2">
                      Status
                    </label>
                    <select
                      id="filter-status"
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value as 'all' | 'low' | 'expiring')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 min-h-[var(--layout-touch-target)]"
                    >
                      <option value="all">All Products</option>
                      <option value="low">Low Stock Only</option>
                      <option value="expiring">Expiring Soon (≤ 30 days)</option>
                    </select>
                  </div>
                </div>
              }
            />
            <MobileSortSelect
              className="mt-4"
              sortField={sortField}
              sortOrder={sortOrder}
              options={mobileSortOptions}
              onFieldChange={handleColumnSort}
              onToggleOrder={() => setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}
            />
          </div>
        </div>
      }
    >
      {/* Stock Table */}
      <div className="bg-white rounded-lg shadow overflow-x-auto">
        {filterQtyOnly && (
          <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 text-xs text-amber-900 flex items-center justify-between">
            <span>Showing products with stock on hand only ({sortedStockLevels.length})</span>
            <button
              type="button"
              className="text-amber-800 underline"
              onClick={() => {
                setFilterQtyOnly(false);
                handleSort('product', { defaultOrder: 'asc' });
              }}
            >
              Clear filter
            </button>
          </div>
        )}
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <SortableTableHeader
                label="Product"
                field="product"
                activeField={sortField}
                direction={sortOrder}
                onSort={handleColumnSort}
              />
              <SortableTableHeader
                label="Category"
                field="category"
                activeField={sortField}
                direction={sortOrder}
                onSort={handleColumnSort}
              />
              {byStoreView && (
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Store
                </th>
              )}
              <SortableTableHeader
                label="Quantity"
                field="quantity"
                activeField={sortField}
                direction={sortOrder}
                onSort={handleColumnSort}
                filtered={filterQtyOnly}
              />
              <SortableTableHeader
                label="Price"
                field="price"
                activeField={sortField}
                direction={sortOrder}
                onSort={handleColumnSort}
                align="right"
              />
              <SortableTableHeader
                label="Reorder Level"
                field="reorderLevel"
                activeField={sortField}
                direction={sortOrder}
                onSort={handleColumnSort}
                align="center"
              />
              <SortableTableHeader
                label="Expiry"
                field="expiry"
                activeField={sortField}
                direction={sortOrder}
                onSort={handleColumnSort}
                align="center"
              />
              <SortableTableHeader
                label="Status"
                field="status"
                activeField={sortField}
                direction={sortOrder}
                onSort={handleColumnSort}
                align="center"
              />
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {paginatedStockLevels.length === 0 ? (
              <tr>
                <td colSpan={tableColSpan} className="px-6 py-8 text-center text-gray-500">
                  {searchTerm || filterStatus !== 'all' || filterCategory !== 'all'
                    ? 'No products match your filters'
                    : 'No inventory data. Create products on the Products page.'}
                </td>
              </tr>
            ) : (
              paginatedStockLevels.map((item: StockLevelItem) => {
                const product = productMap.get(item.product_id);
                const uomProduct =
                  product && (product.product_uoms?.length || product.productUoms?.length)
                    ? product
                    : productFromApiUoms(item.uoms, product?.unitOfMeasure ?? product?.baseUom);
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
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${product?.category
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-400'
                        }`}>
                        {product?.category || '\u2014'}
                      </span>
                    </td>
                    {byStoreView && (
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-700">
                        {item.storeDisplayLabel ?? '—'}
                      </td>
                    )}
                    <td className="px-4 py-4">
                      <div className="flex flex-col gap-1">
                        <div className="text-sm font-bold text-blue-600">
                          {formatMultiUomQuantity(totalQty, uomProduct)}
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
      {sortedStockLevels.length > ITEMS_PER_PAGE && (
        <div className="flex items-center justify-between px-4 py-4 bg-white rounded-lg shadow mt-4">
          <p className="text-sm text-gray-600">
            Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, sortedStockLevels.length)} of {sortedStockLevels.length} products
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
    </AdaptivePage>
  );
}
