/**
 * @module InventoryAdjustmentsPage
 * @description Manual inventory adjustment interface - creates ADJUSTMENT_IN/ADJUSTMENT_OUT movements
 * @requires ADMIN or MANAGER role
 * @architecture Uses unified StockMovementHandler on backend
 * @note Audit trail view is in StockMovementsPage to avoid duplication
 *
 * REFACTORED: Now uses productId instead of batchId
 * Backend automatically handles batch selection (MAIN batch)
 */

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ResponsiveTableWrapper } from '../../components/ui/ResponsiveTableWrapper';
import { ResponsiveGrid } from '../../components/ui/ResponsiveGrid';
import { useStockLevels, useAdjustInventory } from '../../hooks/useInventory';
import { useProducts } from '../../hooks/useProducts';
import { useStockMovements } from '../../hooks/useStockMovements';
import { InventoryAdjustmentSchema } from '@shared/zod/inventory';
import apiClient from '../../utils/api';
import { handleApiError } from '../../utils/errorHandler';
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

// Batch type from backend response
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

// (types inferred from API; dedicated interfaces removed to avoid unused warnings)

// Product item for physical count (can have zero stock)
interface PhysicalCountItem {
  id: string;
  product_id: string;
  product_name: string;
  sku: string;
  expected_quantity: number;
  has_stock: boolean;
}

// Product row from products hook
interface ProductRow {
  id: string;
  name: string;
  sku?: string;
  status?: string;
  category?: string;
}

// Stock level row from API (snake_case)
interface StockLevelRow {
  product_id: string;
  product_name: string;
  sku?: string;
  total_stock?: string | number;
  total_quantity?: string | number;
  nearest_expiry?: string | null;
  average_cost?: string | number;
}

// Helper to format date to YYYY-MM-DD in local timezone
const formatLocalDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function InventoryAdjustmentsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: stockLevelsData, isLoading, error } = useStockLevels();
  const adjustInventoryMutation = useAdjustInventory();
  const { data: productsData } = useProducts();

  // Get recent adjustment movements for quick reference (today only)
  const todayStr = formatLocalDate(new Date());
  const { data: recentAdjustmentsData } = useStockMovements({
    movementType: 'ADJUSTMENT_IN,ADJUSTMENT_OUT',
    startDate: todayStr,
    limit: 10,
  });

  const ITEMS_PER_PAGE = 50;
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [physicalCountPage, setPhysicalCountPage] = useState(1);
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);
  const [showAdjustModal, setShowAdjustModal] = useState(false);

  // Adjustment form state
  const [adjustmentType, setAdjustmentType] = useState<'increase' | 'decrease'>('increase');
  const [movementCategory, setMovementCategory] = useState<'ADJUSTMENT' | 'DAMAGE' | 'EXPIRY'>(
    'ADJUSTMENT'
  );
  const [adjustmentQuantity, setAdjustmentQuantity] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('');

  // Physical Count modal state
  const [showPhysicalCountModal, setShowPhysicalCountModal] = useState(false);
  const [countedQuantities, setCountedQuantities] = useState<Record<string, string>>({});
  const [physicalCountReason, setPhysicalCountReason] = useState('Physical inventory count - ' + formatLocalDate(new Date()));
  const [isProcessingCount, setIsProcessingCount] = useState(false);
  const [physicalCountSearchTerm, setPhysicalCountSearchTerm] = useState('');
  const [showOnlyDiscrepancies, setShowOnlyDiscrepancies] = useState(false);
  const [showOnlyUncounted, setShowOnlyUncounted] = useState(false);

  // Refs for keyboard navigation
  const quantityInputRef = useRef<HTMLInputElement>(null);
  const reasonInputRef = useRef<HTMLTextAreaElement>(null);

  // Get current user from localStorage
  const currentUser = useMemo(() => {
    try {
      const userStr = localStorage.getItem('user');
      return userStr ? JSON.parse(userStr) : null;
    } catch {
      return null;
    }
  }, []);

  // Keyboard shortcuts for modal
  useEffect(() => {
    if (!showAdjustModal) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape to close
      if (e.key === 'Escape') {
        setShowAdjustModal(false);
      }
      // Enter to submit (if not in textarea)
      if (e.key === 'Enter' && !e.shiftKey && e.target !== reasonInputRef.current) {
        e.preventDefault();
        if (adjustmentQuantity && adjustmentReason && !adjustInventoryMutation.isPending) {
          handleSubmitAdjustment();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAdjustModal, adjustmentQuantity, adjustmentReason, adjustInventoryMutation.isPending]);

  // Auto-focus quantity input when modal opens
  useEffect(() => {
    if (showAdjustModal && quantityInputRef.current) {
      setTimeout(() => quantityInputRef.current?.focus(), 100);
    }
  }, [showAdjustModal]);

  // Check if user has ADMIN or MANAGER role
  const canAdjust = useMemo(() => {
    return currentUser && (currentUser.role === 'ADMIN' || currentUser.role === 'MANAGER');
  }, [currentUser]);

  // Extract stock levels and create batch list
  const batches = useMemo(() => {
    if (!stockLevelsData?.data) return [];
    const levels = Array.isArray(stockLevelsData.data) ? stockLevelsData.data : [];

    // For now, create mock batches from stock levels
    // In production, this would come from a dedicated batches endpoint
    return levels.flatMap(
      (level: {
        product_id: string;
        product_name: string;
        sku?: string;
        total_stock?: string;
        total_quantity?: string;
        nearest_expiry?: string | null;
        average_cost?: string;
      }) => {
        // Mock: Assume single batch per product for simplicity
        return [
          {
            id: `batch-${level.product_id}`, // Mock batch ID
            product_id: level.product_id,
            product_name: level.product_name,
            batch_number: level.sku || 'MAIN',
            remaining_quantity: parseFloat(
              String(level.total_stock || level.total_quantity || '0')
            ),
            expiry_date: level.nearest_expiry || null,
            cost_price: parseFloat(String(level.average_cost || '0')),
            status: 'ACTIVE',
            created_at: new Date().toISOString(),
          },
        ];
      }
    );
  }, [stockLevelsData]);

  // Product category lookup by product_id
  const productCategoryMap = useMemo(() => {
    const map = new Map<string, string>();
    if (productsData) {
      const prods = (productsData as { data?: ProductRow[] }).data || (Array.isArray(productsData) ? productsData as ProductRow[] : []);
      prods.forEach((p: ProductRow) => {
        if (p.category) map.set(p.id, p.category);
      });
    }
    return map;
  }, [productsData]);

  // Filter batches based on search
  const filteredBatches = useMemo(() => {
    if (!searchTerm) return batches;

    const term = searchTerm.toLowerCase();
    return batches.filter(
      (batch: Batch) =>
        batch.product_name.toLowerCase().includes(term) ||
        batch.batch_number.toLowerCase().includes(term) ||
        (productCategoryMap.get(batch.product_id) || '').toLowerCase().includes(term)
    );
  }, [batches, searchTerm, productCategoryMap]);

  // Pagination for batch table
  const batchTotalPages = Math.max(1, Math.ceil(filteredBatches.length / ITEMS_PER_PAGE));
  const paginatedBatches = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredBatches.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredBatches, currentPage]);

  // Reset batch page on search change
  useEffect(() => { setCurrentPage(1); }, [searchTerm]);

  // Products for physical count (includes ALL active products, even with zero stock)
  const products = useMemo(() => {
    if (!productsData) return [];
    if (productsData.data && Array.isArray(productsData.data)) {
      return productsData.data;
    }
    return Array.isArray(productsData) ? productsData : [];
  }, [productsData]);

  // Stock level lookup by product_id
  const stockLevelMap = useMemo(() => {
    const map = new Map<string, number>();
    if (stockLevelsData?.data) {
      const levels = Array.isArray(stockLevelsData.data) ? stockLevelsData.data : [];
      levels.forEach((level: StockLevelRow) => {
        map.set(level.product_id, parseFloat(String(level.total_stock || level.total_quantity || 0)));
      });
    }
    return map;
  }, [stockLevelsData]);

  // Product-based list for physical counting
  const physicalCountItems = useMemo((): PhysicalCountItem[] => {
    const activeProducts = products.filter((p: ProductRow) => p.status === 'ACTIVE' || !p.status);
    return activeProducts.map((product: ProductRow) => {
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

  // Physical count statistics
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

  // Filter physical count items
  const physicalCountFilteredItems = useMemo(() => {
    let filtered = [...physicalCountItems];
    if (physicalCountSearchTerm.trim()) {
      const searchLower = physicalCountSearchTerm.toLowerCase();
      filtered = filtered.filter(item =>
        String(item.product_name || '').toLowerCase().includes(searchLower) ||
        String(item.sku || '').toLowerCase().includes(searchLower)
      );
    }
    if (showOnlyDiscrepancies) {
      filtered = filtered.filter(item => {
        const countedValue = countedQuantities[item.id];
        return countedValue !== undefined && countedValue !== '' && parseFloat(countedValue) !== item.expected_quantity;
      });
    }
    if (showOnlyUncounted) {
      filtered = filtered.filter(item =>
        countedQuantities[item.id] === undefined || countedQuantities[item.id] === ''
      );
    }
    return filtered;
  }, [physicalCountItems, physicalCountSearchTerm, showOnlyDiscrepancies, showOnlyUncounted, countedQuantities]);

  // Pagination for physical count items
  const physicalCountTotalPages = Math.max(1, Math.ceil(physicalCountFilteredItems.length / ITEMS_PER_PAGE));
  const paginatedPhysicalCountItems = useMemo(() => {
    const start = (physicalCountPage - 1) * ITEMS_PER_PAGE;
    return physicalCountFilteredItems.slice(start, start + ITEMS_PER_PAGE);
  }, [physicalCountFilteredItems, physicalCountPage]);

  // Reset physical count page on filter changes
  useEffect(() => { setPhysicalCountPage(1); }, [physicalCountSearchTerm, showOnlyDiscrepancies, showOnlyUncounted]);

  // Handle counted quantity change
  const handleCountedQtyChange = (itemId: string, value: string) => {
    setCountedQuantities(prev => ({ ...prev, [itemId]: value }));
  };

  // Handle Physical Count submission
  const handleSubmitPhysicalCount = async () => {
    if (!currentUser) return;
    setIsProcessingCount(true);

    try {
      const adjustments = physicalCountItems
        .filter(item => {
          const counted = countedQuantities[item.id];
          return counted !== undefined && counted !== '' && parseFloat(counted) !== item.expected_quantity;
        })
        .map(item => {
          const counted = parseFloat(countedQuantities[item.id]);
          const current = item.expected_quantity;
          return {
            productId: item.product_id,
            adjustment: counted - current,
            reason: `${physicalCountReason} | SKU: ${item.sku} | Expected: ${current.toFixed(2)}, Counted: ${counted.toFixed(2)}`,
            userId: currentUser.id,
            productName: item.product_name,
          };
        });

      if (adjustments.length === 0) {
        alert('No differences found. All counted quantities match expected quantities.');
        setIsProcessingCount(false);
        return;
      }

      const confirmMsg = `Process physical count?\n\n${adjustments.length} adjustment(s) will be created:\n${adjustments.slice(0, 5).map(a => `• ${a.productName}: ${a.adjustment > 0 ? '+' : ''}${a.adjustment.toFixed(2)}`).join('\n')}${adjustments.length > 5 ? `\n... and ${adjustments.length - 5} more` : ''}`;
      if (!window.confirm(confirmMsg)) {
        setIsProcessingCount(false);
        return;
      }

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
          await adjustInventoryMutation.mutateAsync(validatedData);
          successCount++;
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          errors.push(`${adj.productName}: ${errorMsg}`);
          errorCount++;
        }
      }

      let resultMessage = `Physical count complete!\n✅ ${successCount} adjustment(s) created`;
      if (errorCount > 0) {
        resultMessage += `\n\n❌ ${errorCount} failed:\n${errors.slice(0, 3).join('\n')}${errors.length > 3 ? `\n... and ${errors.length - 3} more` : ''}`;
      }
      alert(resultMessage);

      setShowPhysicalCountModal(false);
      setCountedQuantities({});
      setPhysicalCountReason('Physical inventory count - ' + formatLocalDate(new Date()));
      queryClient.invalidateQueries({ queryKey: ['stockLevels'] });
      queryClient.invalidateQueries({ queryKey: ['stockMovements'] });
    } catch (err) {
      alert(`Failed to process physical count: ${(err as Error).message}`);
    } finally {
      setIsProcessingCount(false);
    }
  };

  // Recent adjustments for display
  const recentAdjustments = useMemo(() => {
    if (!recentAdjustmentsData?.data) return [];
    return Array.isArray(recentAdjustmentsData.data) ? recentAdjustmentsData.data : [];
  }, [recentAdjustmentsData]);

  // Handle adjustment modal open
  const handleOpenAdjustModal = (batch: Batch) => {
    if (!canAdjust) {
      alert('You do not have permission to adjust inventory. ADMIN or MANAGER role required.');
      return;
    }

    setSelectedBatch(batch);
    setMovementCategory('ADJUSTMENT');
    setAdjustmentType('increase');
    setAdjustmentQuantity('');
    setAdjustmentReason('');
    // Validation done via Zod schema
    setShowAdjustModal(true);
  };

  // Handle adjustment submission
  const handleSubmitAdjustment = useCallback(async () => {
    console.log('🚀 handleSubmitAdjustment called!');
    console.log('📦 selectedBatch:', selectedBatch);
    console.log('👤 currentUser:', currentUser);

    if (!selectedBatch || !currentUser) {
      console.error('❌ Missing required data:', { selectedBatch, currentUser });
      alert('Missing required data. Please try again.');
      return;
    }

    console.log('✅ Starting adjustment submission...', {
      product_id: selectedBatch.product_id,
      product_name: selectedBatch.product_name,
      adjustmentType,
      adjustmentQuantity,
      adjustmentReason,
      userId: currentUser.id,
    });

    try {
      if (movementCategory === 'DAMAGE' || movementCategory === 'EXPIRY') {
        // Use stock-movements API for DAMAGE/EXPIRY
        const qty = new Decimal(adjustmentQuantity || 0).toNumber();
        // Send with movementType as backend RecordMovementSchema expects
        await apiClient.post('stock-movements', {
          productId: selectedBatch.product_id,
          movementType: movementCategory,
          quantity: qty,
          notes: adjustmentReason,
          createdBy: currentUser.id,
        });
        // Invalidate queries for fresh data
        queryClient.invalidateQueries({ queryKey: ['stockLevels'] });
        queryClient.invalidateQueries({ queryKey: ['stockMovements'] });
        queryClient.invalidateQueries({ queryKey: ['offline', 'stock-levels'] });
      } else {
        // ADJUSTMENT_IN / ADJUSTMENT_OUT via existing adjust endpoint
        const qtyDecimal = new Decimal(adjustmentQuantity || 0);
        const adjustment =
          adjustmentType === 'increase' ? qtyDecimal.toNumber() : qtyDecimal.times(-1).toNumber();

        const validatedData = InventoryAdjustmentSchema.parse({
          productId: selectedBatch.product_id,
          adjustment,
          reason: adjustmentReason,
          userId: currentUser.id,
        });

        await adjustInventoryMutation.mutateAsync(validatedData);
      }

      // Success
      const typeLabel =
        movementCategory === 'DAMAGE'
          ? 'Damage recorded'
          : movementCategory === 'EXPIRY'
            ? 'Expiry write-off recorded'
            : 'Inventory adjusted';
      alert(`${typeLabel} successfully!`);
      setShowAdjustModal(false);
      setSelectedBatch(null);
      setAdjustmentQuantity('');
      setAdjustmentReason('');
      setMovementCategory('ADJUSTMENT');
    } catch (error) {
      console.error('❌ Adjustment failed:', error);
      if (error instanceof z.ZodError) {
        const errors: Record<string, string> = {};
        error.issues.forEach((issue) => {
          if (issue.path[0]) {
            errors[issue.path[0].toString()] = issue.message;
          }
        });
        // Validation errors removed
        console.error('❌ Validation errors:', errors);
      } else {
        console.error('❌ Error details:', error);
        handleApiError(error, { fallback: 'Failed to adjust inventory' });
      }
    }
  }, [
    selectedBatch,
    currentUser,
    adjustmentQuantity,
    adjustmentType,
    adjustmentReason,
    movementCategory,
    adjustInventoryMutation,
    queryClient,
  ]);

  // View full audit trail in Stock Movements page
  const handleViewAllMovements = () => {
    navigate('/inventory/stock-movements?type=ADJUSTMENT_IN,ADJUSTMENT_OUT,DAMAGE,EXPIRY');
  };

  // Calculate new quantity for preview with real-time validation
  const previewNewQuantity = useMemo(() => {
    if (!selectedBatch || !adjustmentQuantity) return null;

    const current = new Decimal(selectedBatch.remaining_quantity);
    const adjustment = new Decimal(adjustmentQuantity || 0);

    // DAMAGE and EXPIRY always decrease stock
    if (movementCategory === 'DAMAGE' || movementCategory === 'EXPIRY') {
      return current.minus(adjustment).toNumber();
    }

    const newQty =
      adjustmentType === 'increase' ? current.plus(adjustment) : current.minus(adjustment);

    return newQty.toNumber();
  }, [selectedBatch, adjustmentQuantity, adjustmentType, movementCategory]);

  // Real-time form validation
  const formValidation = useMemo(() => {
    const errors: Record<string, string> = {};

    if (adjustmentQuantity && parseFloat(adjustmentQuantity) <= 0) {
      errors.quantity = 'Quantity must be greater than zero';
    }

    if (previewNewQuantity !== null && previewNewQuantity < 0) {
      errors.quantity = 'Resulting quantity cannot be negative';
    }

    if (adjustmentReason && adjustmentReason.length < 5) {
      errors.reason = 'Reason must be at least 5 characters';
    }

    return {
      errors,
      isValid: Object.keys(errors).length === 0 && adjustmentQuantity && adjustmentReason,
    };
  }, [adjustmentQuantity, adjustmentReason, previewNewQuantity]);

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-blue-800">Loading inventory batches...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Failed to load inventory. Please try again.</p>
        </div>
      </div>
    );
  }

  if (!canAdjust) {
    return (
      <div className="p-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-yellow-900 mb-2">⚠️ Access Restricted</h3>
          <p className="text-yellow-800">
            You do not have permission to access inventory adjustments.
            <br />
            Required role: <strong>ADMIN</strong> or <strong>MANAGER</strong>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Adjustments & Stock Count</h2>
          <p className="text-gray-600 mt-1">
            Record stock adjustments, damages, expiry write-offs, and physical counts
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowPhysicalCountModal(true)}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
          >
            🔍 Physical Count
          </button>
          <button
            onClick={handleViewAllMovements}
            className="px-4 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            📊 Movement History
          </button>
          <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full font-medium text-sm">
            {currentUser?.role}
          </span>
        </div>
      </div>

      {/* Recent Adjustments Summary */}
      {recentAdjustments.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-semibold text-blue-900">
              📝 Today&apos;s Adjustments ({recentAdjustments.length})
            </h3>
            <button
              onClick={handleViewAllMovements}
              className="text-sm text-blue-700 hover:text-blue-900 font-medium"
            >
              View All →
            </button>
          </div>
          <div className="space-y-2">
            {recentAdjustments
              .slice(0, 5)
              .map(
                (adj: {
                  id: string;
                  movementType?: string;
                  movement_type?: string;
                  productName?: string;
                  product_name?: string;
                  quantity?: number;
                  createdAt?: string;
                  created_at?: string;
                }) => {
                  const movementType = adj.movementType || adj.movement_type || '';
                  const productName = adj.productName || adj.product_name || 'Unknown';
                  const createdAt = adj.createdAt || adj.created_at || '';
                  return (
                    <div
                      key={adj.id}
                      className="flex items-center justify-between text-sm bg-white rounded px-3 py-2"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={
                            movementType === 'ADJUSTMENT_IN'
                              ? 'text-green-600 font-bold'
                              : 'text-red-600 font-bold'
                          }
                        >
                          {movementType === 'ADJUSTMENT_IN' ? '➕' : '➖'}
                        </span>
                        <span className="font-medium text-gray-900">
                          {productName}
                        </span>
                        <span className="text-gray-600">
                          {movementType === 'ADJUSTMENT_IN' ? '+' : '-'}
                          {Math.abs(adj.quantity || 0).toFixed(2)}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">
                        {createdAt?.includes('T')
                          ? `${formatDisplayDate(createdAt)} ${createdAt.split('T')[1].substring(0, 8)}`
                          : formatDisplayDate(createdAt)}
                      </div>
                    </div>
                  );
                }
              )}
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-2">
          Search Batches
        </label>
        <input
          id="search"
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by product name or batch number..."
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {/* Batches Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <ResponsiveTableWrapper>
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Product
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Batch Number
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Quantity
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Expiry Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredBatches.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                    {searchTerm ? 'No batches match your search' : 'No inventory batches found'}
                  </td>
                </tr>
              ) : (
                paginatedBatches.map((batch: Batch) => (
                  <tr key={batch.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">{batch.product_name}</div>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {productCategoryMap.get(batch.product_id) ? (
                        <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-blue-50 text-blue-700">
                          {productCategoryMap.get(batch.product_id)}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">{batch.batch_number}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      <span className="font-semibold">{batch.remaining_quantity.toFixed(2)}</span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {batch.expiry_date ? formatDisplayDate(batch.expiry_date) : 'N/A'}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${batch.status === 'ACTIVE'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                          }`}
                      >
                        {batch.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm space-x-2">
                      <button
                        onClick={() => handleOpenAdjustModal(batch)}
                        className="text-blue-600 hover:text-blue-900 font-medium"
                      >
                        Adjust
                      </button>
                      <button
                        onClick={() => {
                          handleOpenAdjustModal(batch);
                          // Set category after modal opens
                          setTimeout(() => {
                            setMovementCategory('DAMAGE');
                            setAdjustmentType('decrease');
                          }, 0);
                        }}
                        className="text-orange-600 hover:text-orange-900 font-medium"
                      >
                        Damage
                      </button>
                      <button
                        onClick={() =>
                          navigate(`/inventory/stock-movements?product=${batch.product_id}`)
                        }
                        className="text-gray-600 hover:text-gray-900 font-medium"
                      >
                        History
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </ResponsiveTableWrapper>
      </div>

      {/* Batch Table Pagination */}
      {filteredBatches.length > ITEMS_PER_PAGE && (
        <div className="mt-4 flex justify-between items-center">
          <div className="text-sm text-gray-600">
            Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filteredBatches.length)} of {filteredBatches.length} batches
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ← Previous
            </button>
            <span className="px-3 py-2 text-sm text-gray-700">
              Page {currentPage} of {batchTotalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(batchTotalPages, p + 1))}
              disabled={currentPage === batchTotalPages}
              className="px-4 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Adjustment Modal */}
      {showAdjustModal && selectedBatch && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={(e) => {
            console.log('🔵 Overlay clicked', e.target);
            // Only close if clicking the overlay itself, not its children
            if (e.target === e.currentTarget) {
              console.log('🔵 Closing modal from overlay click');
              setShowAdjustModal(false);
            }
          }}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4"
            onClick={(e) => {
              console.log('🟢 Modal content clicked', e.target);
              e.stopPropagation(); // Prevent overlay click
            }}
          >
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                {movementCategory === 'DAMAGE'
                  ? '⚠️ Record Damage'
                  : movementCategory === 'EXPIRY'
                    ? '⏰ Record Expiry Write-Off'
                    : '⚖️ Adjust Inventory'}
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

              {/* Movement Category */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Movement Category
                </label>
                <ResponsiveGrid cols={3} className="gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMovementCategory('ADJUSTMENT');
                      setAdjustmentType('increase');
                    }}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${movementCategory === 'ADJUSTMENT'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                  >
                    ⚖️ Adjustment
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMovementCategory('DAMAGE');
                      setAdjustmentType('decrease');
                    }}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${movementCategory === 'DAMAGE'
                      ? 'bg-orange-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                  >
                    ⚠️ Damage
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMovementCategory('EXPIRY');
                      setAdjustmentType('decrease');
                    }}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${movementCategory === 'EXPIRY'
                      ? 'bg-red-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                  >
                    ⏰ Expiry
                  </button>
                </ResponsiveGrid>
              </div>

              {/* Adjustment Type - only for ADJUSTMENT category */}
              {movementCategory === 'ADJUSTMENT' && (
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
              )}

              {/* Quantity */}
              <div>
                <label
                  htmlFor="adj-quantity"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Adjustment Quantity *
                </label>
                <input
                  ref={quantityInputRef}
                  id="adj-quantity"
                  type="number"
                  min="0"
                  step="0.01"
                  value={adjustmentQuantity}
                  onChange={(e) => setAdjustmentQuantity(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      reasonInputRef.current?.focus();
                    }
                  }}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${formValidation.errors.quantity ? 'border-red-500' : 'border-gray-300'
                    }`}
                  placeholder="0.00"
                />
                {formValidation.errors.quantity && (
                  <p className="text-red-600 text-sm mt-1">{formValidation.errors.quantity}</p>
                )}
              </div>

              {/* Preview New Quantity */}
              {previewNewQuantity !== null && (
                <div
                  className={`border rounded-lg p-3 ${previewNewQuantity < 0
                    ? 'bg-red-50 border-red-300'
                    : 'bg-blue-50 border-blue-200'
                    }`}
                >
                  <div
                    className={`text-sm ${previewNewQuantity < 0 ? 'text-red-800' : 'text-blue-800'
                      }`}
                  >
                    <strong>New Quantity:</strong> {previewNewQuantity.toFixed(2)}
                    {previewNewQuantity < 0 && (
                      <span className="ml-2">⚠️ Negative quantity not allowed</span>
                    )}
                  </div>
                </div>
              )}

              {/* Reason */}
              <div>
                <label
                  htmlFor="adj-reason"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Reason * (min 5 characters)
                </label>
                <textarea
                  ref={reasonInputRef}
                  id="adj-reason"
                  value={adjustmentReason}
                  onChange={(e) => setAdjustmentReason(e.target.value)}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${formValidation.errors.reason ? 'border-red-500' : 'border-gray-300'
                    }`}
                  rows={3}
                  placeholder={
                    movementCategory === 'DAMAGE'
                      ? 'Describe the damage: broken packaging, water damage, etc.'
                      : movementCategory === 'EXPIRY'
                        ? 'Expired batch disposal, date: ...'
                        : 'Physical count correction, damaged goods, etc.'
                  }
                />
                {formValidation.errors.reason && (
                  <p className="text-red-600 text-sm mt-1">{formValidation.errors.reason}</p>
                )}
                <p
                  className={`text-xs mt-1 ${adjustmentReason.length >= 5 ? 'text-green-600' : 'text-gray-500'
                    }`}
                >
                  {adjustmentReason.length}/5 characters minimum
                </p>
              </div>

              {/* Keyboard Shortcuts Hint */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-2">
                <p className="text-xs text-gray-600">
                  <strong>Keyboard shortcuts:</strong> Enter to submit | Esc to cancel
                </p>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => {
                  console.log('Cancel button clicked');
                  setShowAdjustModal(false);
                }}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium"
                disabled={adjustInventoryMutation.isPending}
              >
                Cancel (Esc)
              </button>
              <button
                type="button"
                onClick={(e) => {
                  console.log('Save button clicked!', e);
                  e.preventDefault();
                  e.stopPropagation();
                  handleSubmitAdjustment();
                }}
                disabled={adjustInventoryMutation.isPending || !formValidation.isValid}
                className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg font-medium disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {adjustInventoryMutation.isPending
                  ? 'Saving...'
                  : movementCategory === 'DAMAGE'
                    ? 'Record Damage'
                    : movementCategory === 'EXPIRY'
                      ? 'Record Expiry'
                      : 'Save Adjustment (Enter)'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Physical Count Modal */}
      {showPhysicalCountModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setShowPhysicalCountModal(false)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-[95vw] sm:max-w-6xl max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 bg-purple-600">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-xl font-semibold text-white">Physical Inventory Count</h3>
                  <p className="text-purple-100 text-sm mt-1">
                    Enter actual counted quantities for each product
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
              <ResponsiveGrid cols={4} className="gap-4 text-center">
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
              </ResponsiveGrid>
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
                placeholder="e.g., Monthly physical count - March 2026"
              />
            </div>

            {/* Search and Filters */}
            <div className="px-6 py-3 bg-white border-b border-gray-200">
              <div className="mb-3">
                <input
                  type="text"
                  value={physicalCountSearchTerm}
                  onChange={(e) => setPhysicalCountSearchTerm(e.target.value)}
                  placeholder="🔍 Search by product name or SKU..."
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
                  No items match your search or filter criteria.
                </div>
              ) : (
                <ResponsiveTableWrapper>
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Expected Qty</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Counted Qty</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Difference</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {paginatedPhysicalCountItems.map((item) => {
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
                            <td className="px-4 py-3 text-sm text-gray-600">{item.sku}</td>
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
                </ResponsiveTableWrapper>
              )}
            </div>

            {/* Physical Count Pagination */}
            {physicalCountFilteredItems.length > ITEMS_PER_PAGE && (
              <div className="px-6 py-3 border-t border-gray-200 flex justify-between items-center">
                <div className="text-sm text-gray-600">
                  Showing {((physicalCountPage - 1) * ITEMS_PER_PAGE) + 1}–{Math.min(physicalCountPage * ITEMS_PER_PAGE, physicalCountFilteredItems.length)} of {physicalCountFilteredItems.length} items
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPhysicalCountPage(p => Math.max(1, p - 1))}
                    disabled={physicalCountPage === 1}
                    className="px-3 py-1 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ← Previous
                  </button>
                  <span className="px-2 py-1 text-sm text-gray-700">
                    Page {physicalCountPage} of {physicalCountTotalPages}
                  </span>
                  <button
                    onClick={() => setPhysicalCountPage(p => Math.min(physicalCountTotalPages, p + 1))}
                    disabled={physicalCountPage === physicalCountTotalPages}
                    className="px-3 py-1 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}

            {/* Info */}
            <div className="px-6 py-3 bg-blue-50 border-t border-blue-200">
              <p className="text-sm text-blue-800">
                <strong>💡 How it works:</strong> Enter the actual counted quantity for each product.
                When you submit, adjustments will be created for all items with discrepancies.
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

      {/* Info Box */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-blue-900 mb-2">
          ℹ️ About Adjustments & Stock Count
        </h3>
        <ul className="text-xs text-blue-800 space-y-1">
          <li>
            • <strong>Adjustment:</strong> Increase or decrease stock for corrections
          </li>
          <li>
            • <strong>Damage:</strong> Record stock lost due to physical damage
          </li>
          <li>
            • <strong>Expiry:</strong> Write off expired stock
          </li>
          <li>
            • <strong>Physical Count:</strong> Compare physical stock vs system, auto-create adjustments for discrepancies
          </li>
          <li>• All records create immutable stock movement entries for full audit trail</li>
          <li>• View <strong>Movement History</strong> for the complete audit trail</li>
          <li>
            • <strong>Role Required:</strong> ADMIN or MANAGER
          </li>
        </ul>
      </div>
    </div>
  );
}
