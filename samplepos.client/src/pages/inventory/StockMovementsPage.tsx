import { useState, useMemo } from 'react';
import { useStockMovements, exportStockMovementsCSV } from '../../hooks/useStockMovements';
import { useProducts } from '../../hooks/useProducts';
import { useStockLevels, useAdjustInventory } from '../../hooks/useInventory';
import { InventoryAdjustmentSchema } from '@shared/zod/inventory';
import { formatCurrency } from '../../utils/currency';
import { DatePicker } from '../../components/ui/date-picker';
import Decimal from 'decimal.js';
import { z } from 'zod';

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
} as const;

type MovementType = keyof typeof MOVEMENT_TYPES;

// Batch type from stock levels
interface Batch {
  id: string;
  product_id: string;
  product_name: string;
  batch_number: string;
  remaining_quantity: number;
  expiry_date?: string | null;
  cost_price: number;
  status: string;
  created_at: string;
}

// Product item for physical count (can have zero stock)
interface PhysicalCountItem {
  id: string;
  product_id: string;
  product_name: string;
  sku: string;
  expected_quantity: number;
  has_stock: boolean;
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
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<MovementType | 'ALL'>('ALL');
  const [dateRangePreset, setDateRangePreset] = useState<DateRangePreset>('today');
  const [startDate, setStartDate] = useState(() => getDateRange('today').start);
  const [endDate, setEndDate] = useState(() => getDateRange('today').end);
  const [page, setPage] = useState(1);
  const limit = 50;

  // Adjustment modal state
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showBatchSelector, setShowBatchSelector] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);
  const [adjustmentType, setAdjustmentType] = useState<'increase' | 'decrease'>('increase');
  const [adjustmentQuantity, setAdjustmentQuantity] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [batchSearchTerm, setBatchSearchTerm] = useState('');

  // Physical Count modal state
  const [showPhysicalCountModal, setShowPhysicalCountModal] = useState(false);
  const [countedQuantities, setCountedQuantities] = useState<Record<string, string>>({});
  const [physicalCountReason, setPhysicalCountReason] = useState('Physical inventory count - ' + formatLocalDate(new Date()));
  const [isProcessingCount, setIsProcessingCount] = useState(false);
  const [physicalCountSearchTerm, setPhysicalCountSearchTerm] = useState('');
  const [showOnlyDiscrepancies, setShowOnlyDiscrepancies] = useState(false);
  const [showOnlyUncounted, setShowOnlyUncounted] = useState(false);

  // API queries
  const { data: movementsData, isLoading, error, refetch } = useStockMovements({
    page,
    limit,
    movementType: selectedType !== 'ALL' ? selectedType : undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  });

  const { data: productsData } = useProducts();
  const { data: stockLevelsData } = useStockLevels();
  const adjustInventoryMutation = useAdjustInventory();

  // Get current user for role check
  const currentUser = useMemo(() => {
    try {
      const userStr = localStorage.getItem('user');
      return userStr ? JSON.parse(userStr) : null;
    } catch {
      return null;
    }
  }, []);

  // Check if user can adjust inventory
  const canAdjust = useMemo(() => {
    return currentUser && (currentUser.role === 'ADMIN' || currentUser.role === 'MANAGER');
  }, [currentUser]);

  // Extract movements from API response
  const movements = useMemo(() => {
    if (!movementsData) return [];
    if (movementsData.data && Array.isArray(movementsData.data)) {
      return movementsData.data;
    }
    if (Array.isArray(movementsData)) return movementsData;
    return [];
  }, [movementsData]);

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

  // Create batch list from stock levels
  const batches = useMemo((): Batch[] => {
    if (!stockLevelsData?.data) return [];
    const levels = Array.isArray(stockLevelsData.data) ? stockLevelsData.data : [];

    return levels.map((level: any) => ({
      id: `batch-${level.product_id}`,
      product_id: level.product_id,
      product_name: level.product_name,
      batch_number: level.sku || 'MAIN',
      remaining_quantity: parseFloat(level.total_stock || level.total_quantity || 0),
      expiry_date: level.nearest_expiry || null,
      cost_price: parseFloat(level.average_cost || 0),
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
    }));
  }, [stockLevelsData]);

  // Create stock level lookup by product_id for physical count
  const stockLevelMap = useMemo(() => {
    const map = new Map<string, number>();
    if (stockLevelsData?.data) {
      const levels = Array.isArray(stockLevelsData.data) ? stockLevelsData.data : [];
      levels.forEach((level: any) => {
        map.set(level.product_id, parseFloat(level.total_stock || level.total_quantity || 0));
      });
    }
    return map;
  }, [stockLevelsData]);

  // Create product-based list for physical counting (includes ALL active products, even with zero stock)
  const physicalCountItems = useMemo((): PhysicalCountItem[] => {
    // Filter only active products
    const activeProducts = products.filter((p: any) => p.status === 'ACTIVE' || !p.status);

    return activeProducts.map((product: any) => {
      const currentStock = stockLevelMap.get(product.id) || 0;
      return {
        id: `product-${product.id}`,
        product_id: product.id,
        product_name: product.name,
        sku: product.sku || 'N/A',
        expected_quantity: currentStock,
        has_stock: currentStock > 0,
      };
    });
  }, [products, stockLevelMap]);

  // Filter batches for selector
  const filteredBatches = useMemo(() => {
    if (!batchSearchTerm) return batches;

    const term = batchSearchTerm.toLowerCase();
    return batches.filter((batch: Batch) =>
      batch.product_name.toLowerCase().includes(term) ||
      batch.batch_number.toLowerCase().includes(term)
    );
  }, [batches, batchSearchTerm]);

  // Filter movements by search term
  const filteredMovements = useMemo(() => {
    if (!searchTerm) return movements;

    const term = searchTerm.toLowerCase();
    return movements.filter((m: any) => {
      const product = productMap.get(m.productId);
      return (
        m.productName?.toLowerCase().includes(term) ||
        product?.name?.toLowerCase().includes(term) ||
        product?.sku?.toLowerCase().includes(term) ||
        m.batchNumber?.toLowerCase().includes(term) ||
        m.referenceId?.toLowerCase().includes(term) ||
        m.notes?.toLowerCase().includes(term)
      );
    });
  }, [movements, searchTerm, productMap]);

  // Calculate summary statistics (for filtered movements)
  const stats = useMemo(() => {
    const totalMovements = filteredMovements.length;
    const byType: Record<string, number> = {};
    let totalValue = new Decimal(0);
    let totalQuantityIn = new Decimal(0);
    let totalQuantityOut = new Decimal(0);

    filteredMovements.forEach((m: any) => {
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

    movements.forEach((m: any) => {
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
      link.download = `stock-movements-${new Date().toISOString().split('T')[0]}.csv`;
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

  // Open batch selector for adjustment
  const handleOpenBatchSelector = () => {
    if (!canAdjust) {
      alert('You do not have permission to adjust inventory. ADMIN or MANAGER role required.');
      return;
    }
    setBatchSearchTerm('');
    setShowBatchSelector(true);
  };

  // Select batch and open adjustment modal
  const handleSelectBatch = (batch: Batch) => {
    setSelectedBatch(batch);
    setAdjustmentType('increase');
    setAdjustmentQuantity('');
    setAdjustmentReason('');
    setValidationErrors({});
    setShowBatchSelector(false);
    setShowAdjustModal(true);
  };

  // Submit adjustment
  const handleSubmitAdjustment = async () => {
    if (!selectedBatch || !currentUser) return;

    try {
      // Calculate actual adjustment value
      const qtyDecimal = new Decimal(adjustmentQuantity || 0);
      const adjustment = adjustmentType === 'increase'
        ? qtyDecimal.toNumber()
        : qtyDecimal.times(-1).toNumber();

      // Validate with Zod schema
      const validatedData = InventoryAdjustmentSchema.parse({
        batchId: selectedBatch.id,
        adjustment,
        reason: adjustmentReason,
        userId: currentUser.id,
      });

      // Call API
      await adjustInventoryMutation.mutateAsync(validatedData);

      // Success
      alert('Inventory adjusted successfully!');
      setShowAdjustModal(false);
      setSelectedBatch(null);
      setAdjustmentQuantity('');
      setAdjustmentReason('');
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors: Record<string, string> = {};
        error.issues.forEach((issue) => {
          if (issue.path[0]) {
            errors[issue.path[0].toString()] = issue.message;
          }
        });
        setValidationErrors(errors);
      } else {
        alert(`Failed to adjust inventory: ${(error as Error).message}`);
      }
    }
  };

  // Calculate preview of new quantity
  const previewNewQuantity = useMemo(() => {
    if (!selectedBatch || !adjustmentQuantity) return null;

    const current = new Decimal(selectedBatch.remaining_quantity);
    const adjustment = new Decimal(adjustmentQuantity || 0);
    const newQty = adjustmentType === 'increase'
      ? current.plus(adjustment)
      : current.minus(adjustment);

    return newQty.toNumber();
  }, [selectedBatch, adjustmentQuantity, adjustmentType]);

  // Handle Physical Count submission
  const handleSubmitPhysicalCount = async () => {
    if (!currentUser) return;

    setIsProcessingCount(true);

    try {
      // Filter products with counted quantities that differ from expected (product-based, not batch-based)
      const adjustments = physicalCountItems
        .filter(item => {
          const counted = countedQuantities[item.id];
          return counted !== undefined && counted !== '' && parseFloat(counted) !== item.expected_quantity;
        })
        .map(item => {
          const counted = parseFloat(countedQuantities[item.id]);
          const current = item.expected_quantity;
          const difference = counted - current;

          return {
            productId: item.product_id,
            adjustment: difference,
            reason: `${physicalCountReason} | SKU: ${item.sku} | Expected: ${current.toFixed(2)}, Counted: ${counted.toFixed(2)}`,
            userId: currentUser.id,
            productName: item.product_name,
            sku: item.sku,
          };
        });

      if (adjustments.length === 0) {
        alert('No differences found. All counted quantities match expected quantities.');
        setIsProcessingCount(false);
        return;
      }

      // Confirm before processing
      const confirm_msg = `Process physical count?\n\n${adjustments.length} adjustment(s) will be created:\n${adjustments.slice(0, 5).map(a => `• ${a.productName}: ${a.adjustment > 0 ? '+' : ''}${a.adjustment.toFixed(2)}`).join('\n')}${adjustments.length > 5 ? `\n... and ${adjustments.length - 5} more` : ''}`;

      if (!window.confirm(confirm_msg)) {
        setIsProcessingCount(false);
        return;
      }

      // Process each adjustment
      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      for (const adj of adjustments) {
        try {
          const validatedData = InventoryAdjustmentSchema.parse({
            productId: adj.productId,
            adjustment: adj.adjustment,
            reason: adj.reason,
            userId: adj.userId,
          });

          console.log('Submitting adjustment:', validatedData);
          const result = await adjustInventoryMutation.mutateAsync(validatedData);
          console.log('Adjustment successful:', result);
          successCount++;
        } catch (error) {
          console.error(`Failed to adjust ${adj.productName}:`, error);
          const errorMsg = error instanceof Error ? error.message : String(error);
          errors.push(`${adj.productName}: ${errorMsg}`);
          errorCount++;
        }
      }

      // Show results with detailed error messages
      let resultMessage = `Physical count complete!\n✅ ${successCount} adjustment(s) created`;
      if (errorCount > 0) {
        resultMessage += `\n\n❌ ${errorCount} failed:\n${errors.slice(0, 3).join('\n')}${errors.length > 3 ? `\n... and ${errors.length - 3} more` : ''}`;
      }
      alert(resultMessage);

      // Reset and close
      setShowPhysicalCountModal(false);
      setCountedQuantities({});
      setPhysicalCountReason('Physical inventory count - ' + formatLocalDate(new Date()));
      refetch();

    } catch (error) {
      alert(`Failed to process physical count: ${(error as Error).message}`);
    } finally {
      setIsProcessingCount(false);
    }
  };

  // Handle counted quantity change
  const handleCountedQtyChange = (batchId: string, value: string) => {
    setCountedQuantities(prev => ({
      ...prev,
      [batchId]: value,
    }));
  };

  // Calculate physical count statistics
  const physicalCountStats = useMemo(() => {
    const counted = physicalCountItems.filter(item => countedQuantities[item.id] !== undefined && countedQuantities[item.id] !== '').length;
    const discrepancies = physicalCountItems.filter(item => {
      const countedValue = countedQuantities[item.id];
      return countedValue !== undefined && countedValue !== '' && parseFloat(countedValue) !== item.expected_quantity;
    }).length;

    return {
      total: physicalCountItems.length,
      counted,
      remaining: physicalCountItems.length - counted,
      discrepancies,
    };
  }, [physicalCountItems, countedQuantities]);

  // Filter items for physical count modal (product-based, not batch-based)
  const physicalCountFilteredItems = useMemo(() => {
    let filtered = [...physicalCountItems];

    // Apply search filter
    if (physicalCountSearchTerm.trim()) {
      const searchLower = physicalCountSearchTerm.toLowerCase();
      filtered = filtered.filter(item =>
        String(item.product_name || '').toLowerCase().includes(searchLower) ||
        String(item.sku || '').toLowerCase().includes(searchLower)
      );
    }

    // Apply discrepancy filter
    if (showOnlyDiscrepancies) {
      filtered = filtered.filter(item => {
        const countedValue = countedQuantities[item.id];
        return countedValue !== undefined && countedValue !== '' && parseFloat(countedValue) !== item.expected_quantity;
      });
    }

    // Apply uncounted filter
    if (showOnlyUncounted) {
      filtered = filtered.filter(item =>
        countedQuantities[item.id] === undefined || countedQuantities[item.id] === ''
      );
    }

    return filtered;
  }, [physicalCountItems, physicalCountSearchTerm, showOnlyDiscrepancies, showOnlyUncounted, countedQuantities]);

  // Loading state
  if (isLoading) {
    return (
      <div className="p-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-blue-800">Loading stock movements...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
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
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Stock Movements & Adjustments</h2>
          <p className="text-gray-600 mt-1">Complete audit trail and manual inventory adjustments</p>
        </div>
        <div className="flex gap-2">
          {canAdjust && (
            <>
              <button
                onClick={handleOpenBatchSelector}
                className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors flex items-center gap-2"
              >
                ⚙️ Create Adjustment
              </button>
              <button
                onClick={() => setShowPhysicalCountModal(true)}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
              >
                🔍 Physical Count
              </button>
            </>
          )}
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
            Showing {filteredMovements.length} of {movements.length} movements
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
                  <td colSpan={9} className="px-6 py-8 text-center text-gray-500">
                    {searchTerm || selectedType !== 'ALL' || startDate || endDate
                      ? 'No movements match your filters'
                      : 'No stock movements recorded yet'}
                  </td>
                </tr>
              ) : (
                filteredMovements.map((movement: any) => {
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
                  const balanceAfter = new Decimal(movement.balanceAfter || 0);

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
                          {product?.unitOfMeasure || 'PCS'}
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
                        <div className="text-sm font-medium text-gray-900">
                          {balanceAfter.toFixed(2)}
                        </div>
                        <div className="text-xs text-gray-500">
                          after movement
                        </div>
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
      {filteredMovements.length > 0 && (
        <div className="mt-6 flex justify-between items-center">
          <div className="text-sm text-gray-600">
            Page {page} • Showing {Math.min(page * limit, filteredMovements.length)} of {filteredMovements.length}
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
              disabled={page * limit >= filteredMovements.length}
              className="px-4 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Business Rules Info */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-blue-900 mb-2">📋 About Stock Movements & Adjustments</h3>
        <ul className="text-xs text-blue-800 space-y-1">
          <li>• <strong>Audit Trail:</strong> Read-only view of ALL inventory movements (immutable records)</li>
          <li>• <strong>Create Adjustments:</strong> Use "Create Adjustment" button to manually adjust stock (ADMIN/MANAGER only)</li>
          <li>• All stock movements are immutable - they cannot be edited or deleted once recorded</li>
          <li>• Each movement updates the running balance automatically</li>
          <li>• <strong>Stock Increases (+):</strong> GOODS_RECEIPT, ADJUSTMENT_IN, TRANSFER_IN, RETURN</li>
          <li>• <strong>Stock Decreases (-):</strong> SALE, ADJUSTMENT_OUT, TRANSFER_OUT, DAMAGE, EXPIRY</li>
          <li>• All movements are linked to source documents (PO, Sales, etc.) for full traceability</li>
          <li>• All adjustments require a reason (minimum 5 characters) and are logged with user ID and timestamp</li>
          <li>• Balance after each movement provides complete audit trail</li>
        </ul>
      </div>

      {/* Batch Selector Modal */}
      {showBatchSelector && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowBatchSelector(false)}>
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Select Product to Adjust</h3>
              <p className="text-sm text-gray-600 mt-1">Choose a product batch to create an adjustment</p>
            </div>

            <div className="px-6 py-4 border-b border-gray-200">
              <input
                type="text"
                value={batchSearchTerm}
                onChange={(e) => setBatchSearchTerm(e.target.value)}
                placeholder="Search by product name or batch number..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                autoFocus
              />
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Batch</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Quantity</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Expiry</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredBatches.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                        {batchSearchTerm ? 'No batches match your search' : 'No inventory batches found'}
                      </td>
                    </tr>
                  ) : (
                    filteredBatches.map((batch) => (
                      <tr key={batch.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">
                          {batch.product_name}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 font-mono">
                          {batch.batch_number}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">
                          {batch.remaining_quantity.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {formatDisplayDate(batch.expiry_date)}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleSelectBatch(batch)}
                            className="text-blue-600 hover:text-blue-900 font-medium text-sm"
                          >
                            Select →
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
              <button
                onClick={() => setShowBatchSelector(false)}
                className="px-4 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Adjustment Modal */}
      {showAdjustModal && selectedBatch && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowAdjustModal(false)}>
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                Adjust Inventory
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                {selectedBatch.product_name} - {selectedBatch.batch_number}
              </p>
            </div>

            <div className="px-6 py-4 space-y-4">
              {/* Current Quantity */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Current Quantity
                </label>
                <div className="text-2xl font-bold text-gray-900">
                  {selectedBatch.remaining_quantity.toFixed(2)}
                </div>
              </div>

              {/* Adjustment Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Adjustment Type
                </label>
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => setAdjustmentType('increase')}
                    className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${adjustmentType === 'increase'
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                  >
                    ➕ Increase
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustmentType('decrease')}
                    className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${adjustmentType === 'decrease'
                      ? 'bg-red-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                  >
                    ➖ Decrease
                  </button>
                </div>
              </div>

              {/* Quantity */}
              <div>
                <label htmlFor="adj-quantity" className="block text-sm font-medium text-gray-700 mb-1">
                  Adjustment Quantity *
                </label>
                <input
                  id="adj-quantity"
                  type="number"
                  min="0"
                  step="0.01"
                  value={adjustmentQuantity}
                  onChange={(e) => setAdjustmentQuantity(e.target.value)}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${validationErrors.adjustment ? 'border-red-500' : 'border-gray-300'
                    }`}
                  placeholder="0.00"
                />
                {validationErrors.adjustment && (
                  <p className="text-red-600 text-sm mt-1">{validationErrors.adjustment}</p>
                )}
              </div>

              {/* Preview New Quantity */}
              {previewNewQuantity !== null && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="text-sm text-blue-800">
                    <strong>New Quantity:</strong> {previewNewQuantity.toFixed(2)}
                    {previewNewQuantity < 0 && (
                      <span className="text-red-600 ml-2">⚠️ Negative quantity not allowed</span>
                    )}
                  </div>
                </div>
              )}

              {/* Reason */}
              <div>
                <label htmlFor="adj-reason" className="block text-sm font-medium text-gray-700 mb-1">
                  Reason * (min 5 characters)
                </label>
                <textarea
                  id="adj-reason"
                  value={adjustmentReason}
                  onChange={(e) => setAdjustmentReason(e.target.value)}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${validationErrors.reason ? 'border-red-500' : 'border-gray-300'
                    }`}
                  rows={3}
                  placeholder="Physical count correction, damaged goods, etc."
                />
                {validationErrors.reason && (
                  <p className="text-red-600 text-sm mt-1">{validationErrors.reason}</p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  {adjustmentReason.length}/5 characters minimum
                </p>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setShowAdjustModal(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium"
                disabled={adjustInventoryMutation.isPending}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitAdjustment}
                disabled={adjustInventoryMutation.isPending || !adjustmentQuantity || !adjustmentReason}
                className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg font-medium disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {adjustInventoryMutation.isPending ? 'Saving...' : 'Save Adjustment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Physical Count Modal */}
      {showPhysicalCountModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setShowPhysicalCountModal(false)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 bg-purple-600">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-xl font-semibold text-white">Physical Inventory Count</h3>
                  <p className="text-purple-100 text-sm mt-1">
                    Enter actual counted quantities for each product/batch
                  </p>
                </div>
                <button
                  onClick={() => setShowPhysicalCountModal(false)}
                  className="text-white hover:text-purple-200 text-2xl leading-none"
                  disabled={isProcessingCount}
                >
                  ×
                </button>
              </div>
            </div>

            {/* Statistics Bar */}
            <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
              <div className="grid grid-cols-4 gap-4 text-center">
                <div>
                  <div className="text-sm text-gray-600">Total Items</div>
                  <div className="text-xl font-bold text-gray-900">{physicalCountStats.total}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Counted</div>
                  <div className="text-xl font-bold text-blue-600">{physicalCountStats.counted}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Remaining</div>
                  <div className="text-xl font-bold text-yellow-600">{physicalCountStats.remaining}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Discrepancies</div>
                  <div className="text-xl font-bold text-red-600">{physicalCountStats.discrepancies}</div>
                </div>
              </div>
            </div>

            {/* Count Reason */}
            <div className="px-6 py-3 bg-white border-b border-gray-200">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Count Reference / Reason
              </label>
              <input
                type="text"
                value={physicalCountReason}
                onChange={(e) => setPhysicalCountReason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                placeholder="e.g., Monthly physical count - November 2025"
              />
            </div>

            {/* Search and Filters */}
            <div className="px-6 py-3 bg-white border-b border-gray-200">
              <div className="mb-3">
                <input
                  type="text"
                  value={physicalCountSearchTerm}
                  onChange={(e) => setPhysicalCountSearchTerm(e.target.value)}
                  placeholder="🔍 Search by product name or batch number..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showOnlyUncounted}
                    onChange={(e) => setShowOnlyUncounted(e.target.checked)}
                    className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                  />
                  <span className="text-sm text-gray-700">Show only uncounted</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showOnlyDiscrepancies}
                    onChange={(e) => setShowOnlyDiscrepancies(e.target.checked)}
                    className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                  />
                  <span className="text-sm text-gray-700">Show only discrepancies</span>
                </label>
              </div>
            </div>

            {/* Products Table */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {physicalCountItems.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  No products found. Please add products first.
                </div>
              ) : physicalCountFilteredItems.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  No items match your search or filter criteria. Try adjusting your filters.
                </div>
              ) : (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Expected Qty (Base Unit)</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Counted Qty (Base Unit)</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Difference</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {physicalCountFilteredItems.map((item) => {
                      const countedValue = countedQuantities[item.id];
                      const counted = countedValue !== undefined && countedValue !== '' ? parseFloat(countedValue) : null;
                      const difference = counted !== null ? counted - item.expected_quantity : null;
                      const hasDifference = difference !== null && Math.abs(difference) > 0.001;

                      return (
                        <tr key={item.id} className={hasDifference ? 'bg-yellow-50' : !item.has_stock ? 'bg-gray-50' : ''}>
                          <td className="px-4 py-3 text-sm">
                            <div className="font-medium text-gray-900">{item.product_name}</div>
                            {!item.has_stock && (
                              <div className="text-xs text-gray-500">No stock on record</div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {item.sku}
                          </td>
                          <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">
                            {item.expected_quantity.toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-sm text-right">
                            <input
                              type="number"
                              value={countedValue || ''}
                              onChange={(e) => handleCountedQtyChange(item.id, e.target.value)}
                              step="0.01"
                              min="0"
                              placeholder="0.00"
                              className="w-32 px-2 py-1 border border-gray-300 rounded text-right focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                              disabled={isProcessingCount}
                            />
                          </td>
                          <td className="px-4 py-3 text-sm text-right">
                            {difference !== null ? (
                              <span className={`font-medium ${Math.abs(difference) < 0.001 ? 'text-green-600' :
                                difference > 0 ? 'text-blue-600' : 'text-red-600'
                                }`}>
                                {difference > 0 ? '+' : ''}{difference.toFixed(2)}
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Info Box */}
            <div className="px-6 py-3 bg-blue-50 border-t border-blue-200">
              <p className="text-sm text-blue-800">
                <strong>💡 How it works:</strong> All quantities are displayed and counted in the <strong>BASE UNIT</strong>.
                Enter the actual counted quantity you physically verified. Products with no stock show expected quantity as 0.
                When you submit, adjustments will be created for all items with discrepancies.
                Stock will be automatically created for products with zero current stock.
              </p>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-between items-center">
              <div className="text-sm text-gray-600">
                {physicalCountStats.discrepancies > 0 ? (
                  <span className="text-yellow-600 font-medium">
                    ⚠️ {physicalCountStats.discrepancies} item(s) with discrepancies will be adjusted
                  </span>
                ) : physicalCountStats.counted > 0 ? (
                  <span className="text-green-600 font-medium">
                    ✅ All counted quantities match expected
                  </span>
                ) : (
                  <span>Enter counted quantities to see discrepancies</span>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowPhysicalCountModal(false)}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg font-medium"
                  disabled={isProcessingCount}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitPhysicalCount}
                  disabled={isProcessingCount || physicalCountStats.counted === 0 || !physicalCountReason.trim()}
                  className="px-4 py-2 bg-purple-600 text-white hover:bg-purple-700 rounded-lg font-medium disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isProcessingCount ? (
                    <>
                      <span className="animate-spin">⏳</span>
                      <span>Processing...</span>
                    </>
                  ) : (
                    <>
                      <span>✅</span>
                      <span>Process Count ({physicalCountStats.discrepancies} adjustments)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
