import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStockMovements, exportStockMovementsCSV } from '../../hooks/useStockMovements';
import { useProducts } from '../../hooks/useProducts';
import { formatCurrency } from '../../utils/currency';
import { DatePicker } from '../../components/ui/date-picker';
import Decimal from 'decimal.js';

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

// Movement types with colors and icons (matching backend types)
const MOVEMENT_TYPES = {
  GOODS_RECEIPT: { label: 'Goods Receipt', color: 'bg-green-100 text-green-800', icon: '📦', sign: '+' },
  SALE: { label: 'Sale', color: 'bg-blue-100 text-blue-800', icon: '🛒', sign: '-' },
  ADJUSTMENT_IN: { label: 'Adjustment In', color: 'bg-yellow-100 text-yellow-800', icon: '⚖️', sign: '+' },
  ADJUSTMENT_OUT: { label: 'Adjustment Out', color: 'bg-orange-100 text-orange-800', icon: '⚖️', sign: '-' },
  TRANSFER_IN: { label: 'Transfer In', color: 'bg-purple-100 text-purple-800', icon: '🔄', sign: '+' },
  TRANSFER_OUT: { label: 'Transfer Out', color: 'bg-pink-100 text-pink-800', icon: '🔄', sign: '-' },
  RETURN: { label: 'Return', color: 'bg-indigo-100 text-indigo-800', icon: '↩️', sign: '+' },
  DAMAGE: { label: 'Damage', color: 'bg-red-100 text-red-800', icon: '⚠️', sign: '-' },
  EXPIRY: { label: 'Expiry', color: 'bg-gray-100 text-gray-800', icon: '⏰', sign: '-' },
  OPENING_BALANCE: { label: 'Opening Balance', color: 'bg-cyan-100 text-cyan-800', icon: '📋', sign: '+' },
} as const;

type MovementType = keyof typeof MOVEMENT_TYPES;



// Row shape returned by the stock movements API
interface StockMovementRow {
  id: string;
  productId: string;
  productName?: string;
  productCategory?: string | null;
  productUom?: string | null;
  movementType: string;
  quantity: number | string;
  unitCost: number | string;
  balanceAfter: number | string | null;
  batchNumber?: string;
  referenceId?: string;
  referenceType?: string;
  notes?: string;
  createdAt: string;
  saleNumber?: string;
  grNumber?: string;
  supplierName?: string | null;
  userName?: string;
}

// Product row shape used in this page
interface ProductRow {
  id: string;
  name: string;
  sku?: string;
  category?: string;
  status?: string;
  unitOfMeasure?: string;
}

// Date range preset options
type DateRangePreset = 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'custom';

// Helper to format date to YYYY-MM-DD in local timezone
const formatLocalDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Helper function to get date range based on preset
const getDateRange = (preset: DateRangePreset): { start: string; end: string } => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (preset) {
    case 'today': {
      const start = formatLocalDate(today);
      const end = formatLocalDate(today);
      return { start, end };
    }
    case 'yesterday': {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const start = formatLocalDate(yesterday);
      const end = formatLocalDate(yesterday);
      return { start, end };
    }
    case 'this_week': {
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay()); // Start of week (Sunday)
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6); // End of week (Saturday)
      return {
        start: formatLocalDate(weekStart),
        end: formatLocalDate(weekEnd)
      };
    }
    case 'last_week': {
      const lastWeekStart = new Date(today);
      lastWeekStart.setDate(today.getDate() - today.getDay() - 7); // Last week Sunday
      const lastWeekEnd = new Date(lastWeekStart);
      lastWeekEnd.setDate(lastWeekStart.getDate() + 6); // Last week Saturday
      return {
        start: formatLocalDate(lastWeekStart),
        end: formatLocalDate(lastWeekEnd)
      };
    }
    case 'this_month': {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return {
        start: formatLocalDate(monthStart),
        end: formatLocalDate(monthEnd)
      };
    }
    case 'last_month': {
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      return {
        start: formatLocalDate(lastMonthStart),
        end: formatLocalDate(lastMonthEnd)
      };
    }
    case 'custom':
    default:
      return { start: '', end: '' };
  }
};

export default function StockMovementsPage() {
  const navigate = useNavigate();

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedType, setSelectedType] = useState<MovementType | 'ALL'>('ALL');
  const [dateRangePreset, setDateRangePreset] = useState<DateRangePreset>('today');
  const [startDate, setStartDate] = useState(() => getDateRange('today').start);
  const [endDate, setEndDate] = useState(() => getDateRange('today').end);
  const [page, setPage] = useState(1);
  const limit = 50;

  // Debounce search term (300ms) so we don't fire a request on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Reset to page 1 when search changes
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  // API queries
  const { data: movementsData, isLoading, isFetching, error, refetch } = useStockMovements({
    page,
    limit,
    movementType: selectedType !== 'ALL' ? selectedType : undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    search: debouncedSearch || undefined,
  });

  const { data: productsData } = useProducts();

  // Extract movements from API response
  const movements = useMemo(() => {
    if (!movementsData) return [];
    if (movementsData.data && Array.isArray(movementsData.data)) {
      return movementsData.data;
    }
    if (Array.isArray(movementsData)) return movementsData;
    return [];
  }, [movementsData]);

  // Total count from API pagination (for accurate "showing X of Y" display)
  const totalCount: number = useMemo(() => {
    if (!movementsData) return 0;
    return movementsData.pagination?.total ?? movements.length;
  }, [movementsData, movements.length]);

  const products = useMemo(() => {
    if (!productsData) return [];
    if (productsData.data && Array.isArray(productsData.data)) {
      return productsData.data;
    }
    return Array.isArray(productsData) ? productsData : [];
  }, [productsData]);

  // Create product map for quick lookup
  const productMap = useMemo(() => {
    const map = new Map<string, ProductRow>();
    products.forEach((p: ProductRow) => {
      map.set(p.id, p);
    });
    return map;
  }, [products]);

  // Server already filtered by search — use movements directly
  const filteredMovements = movements;

  // Calculate summary statistics (for filtered movements)
  const stats = useMemo(() => {
    const totalMovements = filteredMovements.length;
    const byType: Record<string, number> = {};
    let totalValue = new Decimal(0);
    let totalQuantityIn = new Decimal(0);
    let totalQuantityOut = new Decimal(0);

    filteredMovements.forEach((m: StockMovementRow) => {
      const type = m.movementType as MovementType;
      byType[type] = (byType[type] || 0) + 1;

      const qty = new Decimal(m.quantity || 0);
      const cost = new Decimal(m.unitCost || 0);
      const value = qty.times(cost);

      // Determine if this movement increases or decreases stock using movement type config
      const movementConfig = MOVEMENT_TYPES[type];
      const isInbound = movementConfig?.sign === '+';

      if (isInbound) {
        totalQuantityIn = totalQuantityIn.plus(qty.abs());
        totalValue = totalValue.plus(value.abs());
      } else {
        totalQuantityOut = totalQuantityOut.plus(qty.abs());
      }
    });

    return {
      total: totalMovements,
      byType,
      totalValue: totalValue.toNumber(),
      totalQuantityIn: totalQuantityIn.toNumber(),
      totalQuantityOut: totalQuantityOut.toNumber(),
      netQuantity: totalQuantityIn.minus(totalQuantityOut).toNumber(),
    };
  }, [filteredMovements]);

  // Calculate movement counts by type for ALL movements (date-filtered only)
  const allMovementsByType = useMemo(() => {
    const byType: Record<string, number> = {};

    movements.forEach((m: StockMovementRow) => {
      const type = m.movementType as MovementType;
      byType[type] = (byType[type] || 0) + 1;
    });

    return byType;
  }, [movements]);

  // Export to CSV
  const handleExportCSV = async () => {
    try {
      const url = await exportStockMovementsCSV({
        movementType: selectedType !== 'ALL' ? selectedType : undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });

      // Trigger download
      const link = document.createElement('a');
      link.href = url;
      link.download = `stock-movements-${new Date().toLocaleDateString('en-CA')}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export CSV. Please try again.');
    }
  };

  // Reset filters
  const handleResetFilters = () => {
    setSearchTerm('');
    setDebouncedSearch('');
    setSelectedType('ALL');
    setDateRangePreset('today');
    const todayRange = getDateRange('today');
    setStartDate(todayRange.start);
    setEndDate(todayRange.end);
    setPage(1);
  };

  // Handle date range preset change
  const handleDateRangePresetChange = (preset: DateRangePreset) => {
    setDateRangePreset(preset);
    if (preset !== 'custom') {
      const range = getDateRange(preset);
      setStartDate(range.start);
      setEndDate(range.end);
    }
    setPage(1);
  };

  // Handle custom date change
  const handleCustomDateChange = (start: string, end: string) => {
    setDateRangePreset('custom');
    setStartDate(start);
    setEndDate(end);
    setPage(1);
  };

  // Initial load only — never show while user is typing a search term
  const hasData = !!movementsData;
  if (isLoading && !hasData) {
    return (
      <div className="p-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-blue-800">Loading stock movements...</p>
        </div>
      </div>
    );
  }

  // Error state (only when no previous data to show)
  if (error && !hasData) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Failed to load stock movements. Please try again.</p>
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
      {/* Subtle fetching indicator — does NOT unmount or disrupt focus */}
      {isFetching && (
        <div className="fixed top-0 left-0 right-0 h-1 bg-blue-500 animate-pulse z-50" />
      )}
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Movement History</h2>
          <p className="text-gray-600 mt-1">Complete audit trail of all inventory movements</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate('/inventory/adjustments')}
            className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors flex items-center gap-2"
          >
            ⚖️ Adjustments & Stock Count
          </button>
          <button
            onClick={handleExportCSV}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
          >
            📥 Export CSV
          </button>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Summary Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">Total Movements</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">Quantity In</div>
          <div className="text-2xl font-bold text-green-600 mt-1">
            +{stats.totalQuantityIn.toFixed(2)}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">Quantity Out</div>
          <div className="text-2xl font-bold text-red-600 mt-1">
            -{stats.totalQuantityOut.toFixed(2)}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">Net Change</div>
          <div className={`text-2xl font-bold mt-1 ${stats.netQuantity >= 0 ? 'text-green-600' : 'text-red-600'
            }`}>
            {stats.netQuantity >= 0 ? '+' : ''}{stats.netQuantity.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Search
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Product, batch, reference..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Movement Type */}
          <div>
            <label htmlFor="movement-type" className="block text-sm font-medium text-gray-700 mb-2">
              Movement Type
            </label>
            <select
              id="movement-type"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as MovementType | 'ALL')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="ALL">All Types</option>
              {Object.entries(MOVEMENT_TYPES).map(([key, { label, icon }]) => (
                <option key={key} value={key}>
                  {icon} {label}
                </option>
              ))}
            </select>
          </div>

          {/* Date Range Preset */}
          <div>
            <label htmlFor="date-preset" className="block text-sm font-medium text-gray-700 mb-2">
              Date Range
            </label>
            <select
              id="date-preset"
              value={dateRangePreset}
              onChange={(e) => handleDateRangePresetChange(e.target.value as DateRangePreset)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="today">📅 Today</option>
              <option value="yesterday">📅 Yesterday</option>
              <option value="this_week">📅 This Week</option>
              <option value="last_week">📅 Last Week</option>
              <option value="this_month">📅 This Month</option>
              <option value="last_month">📅 Last Month</option>
              <option value="custom">🗓️ Custom Range</option>
            </select>
          </div>

          {/* Start Date - Always visible for custom adjustments */}
          <div>
            <label htmlFor="start-date" className="block text-sm font-medium text-gray-700 mb-2">
              Start Date
            </label>
            <DatePicker
              value={startDate}
              onChange={(date) => handleCustomDateChange(date, endDate)}
              placeholder="Select start date"
              maxDate={endDate ? new Date(endDate) : undefined}
            />
          </div>

          {/* End Date - Always visible for custom adjustments */}
          <div>
            <label htmlFor="end-date" className="block text-sm font-medium text-gray-700 mb-2">
              End Date
            </label>
            <DatePicker
              value={endDate}
              onChange={(date) => handleCustomDateChange(startDate, date)}
              placeholder="Select end date"
              minDate={startDate ? new Date(startDate) : undefined}
            />
          </div>
        </div>

        {/* Active Date Range Info */}
        {startDate && endDate && (
          <div className="mt-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="text-sm text-blue-800">
                <span className="font-medium">Showing movements from:</span>{' '}
                <span className="font-semibold">{formatDisplayDate(startDate)}</span>
                {' '}<span className="text-blue-600">to</span>{' '}
                <span className="font-semibold">{formatDisplayDate(endDate)}</span>
                {dateRangePreset !== 'custom' && (
                  <span className="ml-2 text-xs bg-blue-200 px-2 py-0.5 rounded-full">
                    {dateRangePreset.replace('_', ' ').toUpperCase()}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Filter Actions */}
        <div className="flex justify-between items-center mt-4 pt-4 border-t">
          <div className="text-sm text-gray-600">
            Showing {filteredMovements.length} of {totalCount} movements
          </div>
          <button
            onClick={handleResetFilters}
            className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Reset Filters
          </button>
        </div>
      </div>

      {/* Movement Type Summary - Shows ALL types from date-filtered data */}
      {movements.length > 0 && (
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <h3 className="text-sm font-medium text-gray-700 mb-3">
            Movements by Type
            <span className="ml-2 text-xs text-gray-500 font-normal">
              (for selected date range)
            </span>
          </h3>
          <div className="flex flex-wrap gap-3">
            {Object.entries(MOVEMENT_TYPES).map(([key, { label, color, icon }]) => {
              const count = allMovementsByType[key] || 0;
              const filteredCount = stats.byType[key] || 0;
              const isFiltered = selectedType !== 'ALL' || searchTerm;

              // Show all types that have data in the date range
              if (count === 0) return null;

              return (
                <div
                  key={key}
                  className={`px-3 py-2 rounded-lg ${color} flex items-center gap-2 ${isFiltered && filteredCount === 0 ? 'opacity-50' : ''
                    }`}
                >
                  <span>{icon}</span>
                  <span className="font-medium">{label}</span>
                  <span className="font-bold">
                    {isFiltered && filteredCount !== count ? (
                      <>
                        <span className="text-sm">×{filteredCount}</span>
                        <span className="text-xs opacity-60"> / {count}</span>
                      </>
                    ) : (
                      <>×{count}</>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
          {selectedType !== 'ALL' && (
            <div className="mt-3 text-xs text-gray-600">
              <span className="font-medium">Note:</span> Showing filtered count / total count for selected date range
            </div>
          )}
        </div>
      )}

      {/* Movements Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date & Time
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Product
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Quantity
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Unit Cost
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total Value
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Balance After
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Reference
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Notes
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredMovements.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-8 text-center text-gray-500">
                    {searchTerm || selectedType !== 'ALL' || startDate || endDate
                      ? 'No movements match your filters'
                      : 'No stock movements recorded yet'}
                  </td>
                </tr>
              ) : (
                filteredMovements.map((movement: StockMovementRow) => {
                  const product = productMap.get(movement.productId);
                  const movementConfig = MOVEMENT_TYPES[movement.movementType as MovementType] || {
                    label: movement.movementType,
                    color: 'bg-gray-100 text-gray-800',
                    icon: '📋',
                    sign: '+',
                  };

                  const quantity = new Decimal(movement.quantity || 0);
                  const unitCost = new Decimal(movement.unitCost || 0);
                  const totalValue = quantity.times(unitCost);

                  return (
                    <tr key={movement.id} className="hover:bg-gray-50">
                      {/* Date & Time */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {formatDisplayDate(movement.createdAt)}
                        </div>
                        <div className="text-xs text-gray-500">
                          {movement.createdAt?.includes('T') ? movement.createdAt.split('T')[1].substring(0, 8) : 'N/A'}
                        </div>
                      </td>

                      {/* Product */}
                      <td className="px-4 py-4">
                        <div className="text-sm font-medium text-gray-900">
                          {movement.productName || product?.name || 'Unknown'}
                        </div>
                        {product && (
                          <div className="text-xs text-gray-500">
                            SKU: {product.sku}
                          </div>
                        )}
                        {movement.batchNumber && (
                          <div className="text-xs text-gray-500">
                            Batch: {movement.batchNumber}
                          </div>
                        )}
                      </td>

                      {/* Category */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        {(() => {
                          const cat = movement.productCategory || product?.category;
                          return (
                            <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                              cat ? 'bg-blue-50 text-blue-700' : 'text-gray-400'
                            }`}>
                              {cat || '\u2014'}
                            </span>
                          );
                        })()}
                      </td>

                      {/* Type */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${movementConfig.color}`}>
                          {movementConfig.icon} {movementConfig.label}
                        </span>
                      </td>

                      {/* Quantity with sign based on movement type */}
                      <td className="px-4 py-4 whitespace-nowrap text-right">
                        <div className={`text-sm font-medium ${movementConfig.sign === '+' ? 'text-green-600' : 'text-red-600'
                          }`}>
                          {movementConfig.sign}{quantity.toFixed(2)}
                        </div>
                        <div className="text-xs text-gray-500">
                          {movement.productUom || product?.unitOfMeasure || 'PCS'}
                        </div>
                      </td>

                      {/* Unit Cost */}
                      <td className="px-4 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                        {unitCost.greaterThan(0) ? formatCurrency(unitCost.toNumber()) : '-'}
                      </td>

                      {/* Total Value */}
                      <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">
                        {totalValue.greaterThan(0) ? formatCurrency(totalValue.toNumber()) : '-'}
                      </td>

                      {/* Balance After */}
                      <td className="px-4 py-4 whitespace-nowrap text-right">
                        {movement.balanceAfter != null ? (
                          <>
                            <div className="text-sm font-medium text-gray-900">
                              {new Decimal(movement.balanceAfter).toFixed(2)}
                            </div>
                            <div className="text-xs text-gray-500">
                              after movement
                            </div>
                          </>
                        ) : (
                          <div className="text-sm text-gray-400">—</div>
                        )}
                      </td>

                      {/* Reference */}
                      <td className="px-4 py-4">
                        {movement.referenceType && movement.referenceId ? (
                          <div className="text-sm text-blue-600">
                            {movement.referenceType === 'SALE' && movement.saleNumber
                              ? movement.saleNumber
                              : movement.referenceType === 'GOODS_RECEIPT' && movement.grNumber
                                ? movement.grNumber
                                : `${movement.referenceType}-${movement.referenceId}`}
                          </div>
                        ) : (
                          <div className="text-sm text-gray-400">-</div>
                        )}
                        {movement.referenceType === 'GOODS_RECEIPT' && movement.supplierName && (
                          <div className="text-xs text-indigo-600 font-medium">
                            {movement.supplierName}
                          </div>
                        )}
                        {movement.userName && (
                          <div className="text-xs text-gray-500">
                            by {movement.userName}
                          </div>
                        )}
                      </td>

                      {/* Notes */}
                      <td className="px-4 py-4">
                        <div className="text-sm text-gray-600 max-w-xs truncate">
                          {movement.notes || '-'}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Controls */}
      {totalCount > 0 && (
        <div className="mt-6 flex justify-between items-center">
          <div className="text-sm text-gray-600">
            Page {page} • Showing {((page - 1) * limit) + 1}–{Math.min(page * limit, totalCount)} of {totalCount}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="px-4 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ← Previous
            </button>
            <button
              onClick={() => setPage(page + 1)}
              disabled={page * limit >= totalCount}
              className="px-4 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Business Rules Info */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-blue-900 mb-2">📋 About Movement History</h3>
        <ul className="text-xs text-blue-800 space-y-1">
          <li>• <strong>Audit Trail:</strong> Read-only view of ALL inventory movements (immutable records)</li>
          <li>• All stock movements are immutable — they cannot be edited or deleted once recorded</li>
          <li>• Each movement updates the running balance automatically</li>
          <li>• <strong>Stock Increases (+):</strong> GOODS_RECEIPT, ADJUSTMENT_IN, TRANSFER_IN, RETURN</li>
          <li>• <strong>Stock Decreases (-):</strong> SALE, ADJUSTMENT_OUT, TRANSFER_OUT, DAMAGE, EXPIRY</li>
          <li>• All movements are linked to source documents (PO, Sales, etc.) for full traceability</li>
          <li>• To create adjustments, record damages, or run a physical count, go to <strong>Adjustments &amp; Stock Count</strong></li>
        </ul>
      </div>
    </div>
  );
}
