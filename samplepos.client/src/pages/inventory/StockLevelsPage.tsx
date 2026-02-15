import { useState, useMemo } from 'react';
import { useStockLevels } from '../../hooks/useInventory';
import { useProducts } from '../../hooks/useProducts';
import { formatMultiUomQuantity } from '../../utils/formatQuantity';

export default function StockLevelsPage() {
  const { data: stockLevelsData, isLoading, error, refetch } = useStockLevels();
  const { data: productsData } = useProducts();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'low'>('all');

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
    const map = new Map();
    products.forEach((p: any) => {
      map.set(p.id, p);
    });
    return map;
  }, [products]);

  // Filter stock levels
  const filteredStockLevels = useMemo(() => {
    let filtered = stockLevels;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter((item: any) =>
        item.product_name?.toLowerCase().includes(term) ||
        item.product_id?.toLowerCase().includes(term)
      );
    }

    if (filterStatus === 'low') {
      filtered = filtered.filter((item: any) => item.needs_reorder === true);
    }

    return filtered;
  }, [stockLevels, searchTerm, filterStatus]);

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
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Failed to load stock levels. Please try again.</p>
          <button onClick={() => refetch()} className="mt-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Stock Levels</h2>
          <p className="text-gray-600 mt-1">Real-time inventory from database</p>
        </div>
        <button onClick={() => refetch()} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
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
            <label htmlFor="filter-status" className="block text-sm font-medium text-gray-700 mb-2">Filter Status</label>
            <select
              id="filter-status"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as 'all' | 'low')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Products</option>
              <option value="low">Low Stock Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* Stock Table */}
      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Reorder Level</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredStockLevels.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                  {searchTerm || filterStatus !== 'all'
                    ? 'No products match your filters'
                    : 'No inventory data. Create products on the Products page.'}
                </td>
              </tr>
            ) : (
              filteredStockLevels.map((item: any) => {
                const product = productMap.get(item.product_id);
                // Backend returns total_stock, not total_quantity
                const totalQty = parseFloat(item.total_stock || item.total_quantity) || 0;
                const reorderLevel = parseFloat(item.reorder_level) || 0;
                const needsReorder = item.needs_reorder === true;
                const sellingPrice = parseFloat(item.selling_price) || 0;

                return (
                  <tr key={item.product_id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        <div className="text-sm font-medium text-gray-900">{item.product_name}</div>
                        {product && (
                          <div className="text-xs text-gray-500 mt-1">
                            SKU: {product.sku}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-col gap-1">
                        <div className="text-sm font-bold text-blue-600">
                          {formatMultiUomQuantity(totalQty, product)}
                        </div>
                        <div className="text-xs text-gray-500">
                          {totalQty.toFixed(2)} base
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right whitespace-nowrap">
                      <div className="text-sm font-semibold text-gray-900">
                        {new Intl.NumberFormat('en-UG', {
                          style: 'currency',
                          currency: 'UGX',
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        }).format(sellingPrice)}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center whitespace-nowrap">
                      <span className="text-sm text-gray-700 font-medium">
                        {reorderLevel.toFixed(0)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center whitespace-nowrap">
                      <span className={`inline-flex items-center px-3 py-1 text-xs font-semibold rounded-full ${needsReorder ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'
                        }`}>
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

      {/* Stats */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">Total Products</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{stockLevels.length}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">Low Stock Items</div>
          <div className="text-2xl font-bold text-yellow-600 mt-1">
            {stockLevels.filter((item: any) => item.needs_reorder).length}
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
