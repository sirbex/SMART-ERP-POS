/**
 * @module InventoryAdjustmentsPage
 * @description Manual inventory adjustment interface - creates ADJUSTMENT_IN/ADJUSTMENT_OUT movements
 * @requires inventory.adjust OR inventory.approve permission
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
import {
  AdaptivePage,
  AdaptiveToolbar,
  AdaptiveSearch,
  AdaptiveDataGrid,
  AdaptiveKpiStrip,
  type AdaptiveDataColumn,
} from '../../components/adaptive';
import {
  ADAPTIVE_PAGE_PAD_CLASS,
  ADAPTIVE_TOOLBAR_CARD_CLASS,
  ADAPTIVE_WORKLIST_DENSITY,
} from '../../lib/adaptiveDashboard';
import { AdaptiveRowActions } from '../../components/adaptive';
import { InventoryColumnPicker } from '../../components/inventory/InventoryColumnPicker';
import { useInventoryColumnPrefs } from '../../hooks/useInventoryColumnPrefs';
import { useStockLevels, useAdjustInventory, useAdjustBatch } from '../../hooks/useInventory';
import { useMultistoreEnabled } from '../../hooks/useMultistore';
import { useStoreLocations, useStockLevelsByStore, useStoreLotsAtStore } from '../../hooks/useWarehouse';
import { StoreLocationSelect } from '../../components/inventory/StoreLocationSelect';
import { useProducts } from '../../hooks/useProducts';
import { useStockMovements } from '../../hooks/useStockMovements';
import { BatchAdjustmentSchema } from '@shared/zod/inventory';
import { INVENTORY_STOCK_ADJUST_PERMISSIONS } from '@shared/authorization/inventoryAdjustPermissions';
import apiClient from '../../utils/api';
import { handleApiError } from '../../utils/errorHandler';
import { useHasAnyPermission } from '../../authorization/useAuthorization';
import Decimal from 'decimal.js';
import { z } from 'zod';
import { getBusinessDate } from '../../utils/businessDate';
import { SortableTableHeader } from '../../components/ui/SortableTableHeader';
import { MobileSortSelect } from '../../components/ui/MobileSortSelect';
import { useColumnSort } from '../../hooks/useColumnSort';
import { applyTableSort } from '../../lib/tableSortUtils';
import SlideDrawer from '../../components/ui/SlideDrawer';
import { WorkflowHelpTrigger } from '../../components/inventory/shared';

type AdjustmentBatchSortField =
  | 'product'
  | 'category'
  | 'batchNumber'
  | 'quantity'
  | 'expiryDate'
  | 'status';

const ADJUSTMENT_BATCH_DESC_DEFAULT = new Set<AdjustmentBatchSortField>([
  'quantity',
  'expiryDate',
]);

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
  batch_id?: string;
  product_lot_id?: string;
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

export default function InventoryAdjustmentsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isMultistoreEnabled } = useMultistoreEnabled();
  const { data: stores = [] } = useStoreLocations(isMultistoreEnabled);
  const mainStore = stores.find((s) => s.storeType === 'MAIN') ?? stores.find((s) => s.isDefaultReceiving);
  const [adjustmentStoreId, setAdjustmentStoreId] = useState<string>('');

  useEffect(() => {
    if (mainStore?.id && !adjustmentStoreId) {
      setAdjustmentStoreId(mainStore.id);
    }
  }, [mainStore?.id, adjustmentStoreId]);

  const { data: stockLevelsData, isLoading, error } = useStockLevels();
  const { data: storeStockLevels = [] } = useStockLevelsByStore(
    adjustmentStoreId || null,
    isMultistoreEnabled && !!adjustmentStoreId,
  );
  const { data: storeLots = [] } = useStoreLotsAtStore(
    adjustmentStoreId || null,
    isMultistoreEnabled && !!adjustmentStoreId,
  );
  const adjustInventoryMutation = useAdjustInventory();
  void adjustInventoryMutation;
  const adjustBatchMutation = useAdjustBatch();
  // Load products for category map (static, for batch search)
  const { data: productsData } = useProducts({ limit: 500 });

  // Get recent adjustment movements for quick reference (today only)
  const todayStr = getBusinessDate();
  const { data: recentAdjustmentsData } = useStockMovements({
    movementType: 'ADJUSTMENT_IN,ADJUSTMENT_OUT',
    startDate: todayStr,
    limit: 10,
  });

  const ITEMS_PER_PAGE = 50;
  const [searchTerm, setSearchTerm] = useState('');
  const columnPrefs = useInventoryColumnPrefs('adjustments');
  const { show: showCol } = columnPrefs;
  const [currentPage, setCurrentPage] = useState(1);
  const [filterQtyOnly, setFilterQtyOnly] = useState(false);
  const { sortField, sortOrder, handleSort, setSortOrder } =
    useColumnSort<AdjustmentBatchSortField>('product', 'asc');
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
  const [physicalCountReason, setPhysicalCountReason] = useState('Physical inventory count - ' + getBusinessDate());
  const [isProcessingCount, setIsProcessingCount] = useState(false);
  const [physicalCountSearchTerm, setPhysicalCountSearchTerm] = useState('');
  const [showOnlyDiscrepancies, setShowOnlyDiscrepancies] = useState(false);
  const [showOnlyUncounted, setShowOnlyUncounted] = useState(false);

  // Physical count: server-side search so all products are reachable (DB has >500 products)
  // When search term ≥2 chars, API filters server-side; otherwise loads first 500.
  const pcSearchParam = physicalCountSearchTerm.trim().length >= 2 ? physicalCountSearchTerm.trim() : undefined;
  const { data: pcProductsData } = useProducts({ search: pcSearchParam, limit: 500 });

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
      // Enter to submit (if not in textarea)
      if (e.key === 'Enter' && !e.shiftKey && e.target !== reasonInputRef.current) {
        e.preventDefault();
        if (adjustmentQuantity && adjustmentReason && !adjustBatchMutation.isPending) {
          handleSubmitAdjustment();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAdjustModal, adjustmentQuantity, adjustmentReason, adjustBatchMutation.isPending]);

  // Keyboard shortcuts for physical count modal
  useEffect(() => {
    if (!showPhysicalCountModal) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Enter submits Process Count (only when not in an input/textarea to avoid conflicts)
      if (e.key === 'Enter' && !e.shiftKey) {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        const hasCounted = Object.values(countedQuantities).some(v => v !== '');
        const canSubmit = !isProcessingCount && hasCounted && physicalCountReason.trim();
        if (canSubmit) handleSubmitPhysicalCount();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPhysicalCountModal, isProcessingCount, countedQuantities, physicalCountReason]);

  // Auto-focus quantity input when modal opens
  useEffect(() => {
    if (showAdjustModal && quantityInputRef.current) {
      setTimeout(() => quantityInputRef.current?.focus(), 100);
    }
  }, [showAdjustModal]);

  const canAdjust = useHasAnyPermission([...INVENTORY_STOCK_ADJUST_PERMISSIONS]);

  const adjustmentStores = useMemo(
    () => stores.filter((s) => s.isActive && ['MAIN', 'SELLING', 'DAMAGE', 'EXPIRED', 'RETURN'].includes(s.storeType)),
    [stores],
  );

  // Extract stock levels and create batch list
  const batches = useMemo(() => {
    if (isMultistoreEnabled && storeLots.length > 0) {
      return storeLots.map((lot) => ({
        id: lot.productLotId,
        product_lot_id: lot.productLotId,
        batch_id: undefined,
        product_id: lot.productId,
        product_name: lot.productName,
        batch_number: lot.lotNumber,
        remaining_quantity: lot.availableQuantity,
        expiry_date: lot.expiryDate,
        cost_price: 0,
        status: 'ACTIVE',
        created_at: getBusinessDate(),
      }));
    }

    const levelsSource = isMultistoreEnabled
      ? (Array.isArray(storeStockLevels) ? storeStockLevels : [])
      : (stockLevelsData?.data ? (Array.isArray(stockLevelsData.data) ? stockLevelsData.data : []) : []);

    if (!levelsSource.length && !isMultistoreEnabled) return [];

    return levelsSource.flatMap(
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
            id: level.product_id, // Placeholder — stock level rows have no real batch ID; real batches fetched on demand
            batch_id: undefined,
            product_lot_id: undefined,
            product_id: level.product_id,
            product_name: level.product_name,
            batch_number: level.sku || 'MAIN',
            remaining_quantity: parseFloat(
              String(level.total_stock || level.total_quantity || '0')
            ),
            expiry_date: level.nearest_expiry || null,
            cost_price: parseFloat(String(level.average_cost || '0')),
            status: 'ACTIVE',
            created_at: getBusinessDate(),
          },
        ];
      }
    );
  }, [stockLevelsData, isMultistoreEnabled, storeLots, storeStockLevels]);

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

  const batchSortAccessors = useMemo(
    () => ({
      product: (batch: Batch) => batch.product_name ?? '',
      category: (batch: Batch) => productCategoryMap.get(batch.product_id) ?? '',
      batchNumber: (batch: Batch) => batch.batch_number ?? '',
      quantity: (batch: Batch) => batch.remaining_quantity ?? 0,
      expiryDate: (batch: Batch) => batch.expiry_date ?? '',
      status: (batch: Batch) => batch.status ?? '',
    }),
    [productCategoryMap],
  );

  const handleColumnSort = (field: string) => {
    const f = field as AdjustmentBatchSortField;
    if (f === 'quantity') {
      setFilterQtyOnly(true);
      handleSort(f, { defaultOrder: 'desc' });
      return;
    }
    setFilterQtyOnly(false);
    handleSort(f, {
      defaultOrder: ADJUSTMENT_BATCH_DESC_DEFAULT.has(f) ? 'desc' : 'asc',
    });
  };

  const mobileSortOptions = [
    { value: 'product', label: 'Sort by Product' },
    { value: 'category', label: 'Sort by Category' },
    { value: 'batchNumber', label: 'Sort by Batch Number' },
    { value: 'quantity', label: 'Sort by Quantity' },
    { value: 'expiryDate', label: 'Sort by Expiry Date' },
    { value: 'status', label: 'Sort by Status' },
  ];

  const sortedBatches = useMemo(() => {
    let rows = [...filteredBatches];
    if (filterQtyOnly) {
      rows = rows.filter((batch) => (batch.remaining_quantity ?? 0) > 0);
    }
    return applyTableSort(rows, sortField, sortOrder, batchSortAccessors);
  }, [filteredBatches, filterQtyOnly, sortField, sortOrder, batchSortAccessors]);

  // Pagination for batch table
  const batchTotalPages = Math.max(1, Math.ceil(sortedBatches.length / ITEMS_PER_PAGE));
  const paginatedBatches = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return sortedBatches.slice(start, start + ITEMS_PER_PAGE);
  }, [sortedBatches, currentPage]);

  // Reset batch page on search or sort change
  useEffect(() => { setCurrentPage(1); }, [searchTerm, filterQtyOnly, sortField, sortOrder]);

  // Products for physical count (uses pcProductsData — server-side search-aware)
  const products = useMemo(() => {
    if (!pcProductsData) return [];
    if (pcProductsData.data && Array.isArray(pcProductsData.data)) {
      return pcProductsData.data;
    }
    return Array.isArray(pcProductsData) ? pcProductsData : [];
  }, [pcProductsData]);

  // Stock level lookup by product_id
  const stockLevelMap = useMemo(() => {
    const map = new Map<string, number>();
    const levels = isMultistoreEnabled
      ? (Array.isArray(storeStockLevels) ? storeStockLevels : [])
      : (stockLevelsData?.data ? (Array.isArray(stockLevelsData.data) ? stockLevelsData.data : []) : []);
    levels.forEach((level: StockLevelRow) => {
      map.set(level.product_id, parseFloat(String(level.total_stock || level.total_quantity || 0)));
    });
    return map;
  }, [stockLevelsData, isMultistoreEnabled, storeStockLevels]);

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
  // Text filtering is handled server-side (see pcProductsData / pcSearchParam).
  // Client-side filters only apply to discrepancy/uncounted toggles.
  const physicalCountFilteredItems = useMemo(() => {
    let filtered = [...physicalCountItems];
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
  }, [physicalCountItems, showOnlyDiscrepancies, showOnlyUncounted, countedQuantities]);

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
      // Build enterprise adjustment records — explicit direction, reason = PHYSICAL_COUNT
      const adjustments = physicalCountItems
        .filter(item => {
          const counted = countedQuantities[item.id];
          return counted !== undefined && counted !== '' && parseFloat(counted) !== item.expected_quantity;
        })
        .map(item => {
          const counted = parseFloat(countedQuantities[item.id]);
          const current = item.expected_quantity;
          const diff = counted - current;
          return {
            productId: item.product_id,
            quantity: Math.abs(diff),
            direction: diff > 0 ? 'IN' as const : 'OUT' as const,
            notes: `${physicalCountReason} | SKU: ${item.sku} | Expected: ${current.toFixed(2)}, Counted: ${counted.toFixed(2)}`,
            productName: item.product_name,
          };
        });

      if (adjustments.length === 0) {
        alert('No differences found. All counted quantities match expected quantities.');
        setIsProcessingCount(false);
        return;
      }

      const confirmMsg = `Process physical count?\n\n${adjustments.length} adjustment(s) will be created:\n${adjustments.slice(0, 5).map(a => `• ${a.productName}: ${a.direction === 'IN' ? '+' : '-'}${a.quantity.toFixed(2)}`).join('\n')}${adjustments.length > 5 ? `\n... and ${adjustments.length - 5} more` : ''}`;
      if (!window.confirm(confirmMsg)) {
        setIsProcessingCount(false);
        return;
      }

      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      for (const adj of adjustments) {
        try {
          const validatedData = BatchAdjustmentSchema.parse({
            productId: adj.productId,
            storeLocationId: isMultistoreEnabled ? adjustmentStoreId || undefined : undefined,
            quantity: adj.quantity,
            direction: adj.direction,
            reason: 'PHYSICAL_COUNT',
            notes: adj.notes,
            userId: currentUser.id,
          });
          await adjustBatchMutation.mutateAsync(validatedData);
          successCount++;
        } catch (err) {
          const apiErr = err as { response?: { data?: { error_code?: string; details?: { remaining?: number; requested?: number } } }; message?: string };
          const errCode = apiErr?.response?.data?.error_code;
          const details = apiErr?.response?.data?.details;
          const msg = errCode === 'INSUFFICIENT_BATCH_QTY'
            ? `Has ${details?.remaining ?? 0} remaining, requested ${details?.requested ?? adj.quantity}`
            : (err instanceof Error ? err.message : String(err));
          errors.push(`${adj.productName}: ${msg}`);
          errorCount++;
        }
      }

      let resultMessage = `Physical count complete!\n✅ ${successCount} PHYSICAL_COUNT adjustment(s) created`;
      if (errorCount > 0) {
        resultMessage += `\n\n❌ ${errorCount} failed:\n${errors.slice(0, 3).join('\n')}${errors.length > 3 ? `\n... and ${errors.length - 3} more` : ''}`;
      }
      alert(resultMessage);

      setShowPhysicalCountModal(false);
      setCountedQuantities({});
      setPhysicalCountReason('Physical inventory count - ' + getBusinessDate());
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

  // Handle adjustment modal open — resolve a real inventory_batches row (FEFO) for GL/batch coupling
  const handleOpenAdjustModal = async (batch: Batch) => {
    if (!canAdjust) {
      alert(
        'You do not have permission to adjust inventory. Need inventory.adjust or inventory.approve.',
      );
      return;
    }

    let resolved = batch;
    try {
      const res = await apiClient.get('/inventory/batches', {
        params: { productId: batch.product_id },
      });
      const rows = (res.data?.data ?? []) as Array<{
        id: string;
        batch_number: string;
        remaining_quantity: number | string;
        cost_price?: number | string;
        expiry_date?: string | null;
        status?: string;
      }>;
      const withStock = rows.filter((b) => Number(b.remaining_quantity) > 0);
      const pick = withStock[0] ?? rows[0];
      if (pick?.id) {
        resolved = {
          ...batch,
          batch_id: pick.id,
          batch_number: pick.batch_number ?? batch.batch_number,
          remaining_quantity: Number(pick.remaining_quantity),
          cost_price: parseFloat(String(pick.cost_price ?? batch.cost_price ?? 0)),
          expiry_date: pick.expiry_date ?? batch.expiry_date,
          status: pick.status ?? batch.status,
        };
      }
    } catch {
      // Fall back to stock-level row; backend will FEFO-select when batchId omitted
    }

    setSelectedBatch(resolved);
    setMovementCategory('ADJUSTMENT');
    setAdjustmentType('increase');
    setAdjustmentQuantity('');
    setAdjustmentReason('');
    setShowAdjustModal(true);
  };

  // Handle adjustment submission
  const handleSubmitAdjustment = useCallback(async () => {
    if (!selectedBatch || !currentUser) {
      alert('Missing required data. Please try again.');
      return;
    }

    const qty = new Decimal(adjustmentQuantity || 0).toNumber();
    if (qty <= 0) {
      alert('Quantity must be a positive number.');
      return;
    }

    // Map UI category + direction to enterprise reason + direction
    type AdjReason = 'ADJUSTMENT' | 'DAMAGE' | 'EXPIRY' | 'PHYSICAL_COUNT' | 'WRITE_OFF';
    type AdjDir = 'IN' | 'OUT';

    const reason: AdjReason =
      movementCategory === 'DAMAGE'
        ? 'DAMAGE'
        : movementCategory === 'EXPIRY'
          ? 'EXPIRY'
          : 'ADJUSTMENT';

    const direction: AdjDir =
      movementCategory === 'DAMAGE' || movementCategory === 'EXPIRY'
        ? 'OUT'
        : adjustmentType === 'increase'
          ? 'IN'
          : 'OUT';

    try {
      const validatedData = BatchAdjustmentSchema.parse({
        batchId:
          selectedBatch.batch_id
          ?? (selectedBatch.id && selectedBatch.id !== selectedBatch.product_id && !selectedBatch.product_lot_id
            ? selectedBatch.id
            : undefined),
        productLotId: selectedBatch.product_lot_id,
        productId: selectedBatch.product_id,
        storeLocationId: isMultistoreEnabled ? adjustmentStoreId || undefined : undefined,
        quantity: qty,
        direction,
        reason,
        notes: adjustmentReason,
        userId: currentUser.id,
      });

      await adjustBatchMutation.mutateAsync(validatedData);

      const isPartialQuarantine =
        (reason === 'DAMAGE' || reason === 'EXPIRY') &&
        qty > 0 &&
        qty < Number(selectedBatch.remaining_quantity) - 0.0001;

      const typeLabel =
        reason === 'DAMAGE'
          ? isPartialQuarantine
            ? `Partial damage quarantined (${qty} units; remainder stays sellable). Dispose from Inventory → Quarantine (DAMAGE band).`
            : 'Damage quarantined (no P&L yet). Dispose from Inventory → Quarantine (DAMAGE band).'
          : reason === 'EXPIRY'
            ? isPartialQuarantine
              ? `Partial expiry quarantined (${qty} units; remainder stays sellable). Dispose from Inventory → Quarantine (EXPIRED band).`
              : 'Expiry quarantined (no P&L yet). Dispose from Inventory → Quarantine (EXPIRED band).'
            : direction === 'IN'
              ? 'Stock increased'
              : 'Stock decreased';

      alert(`${typeLabel} successfully!`);
      setShowAdjustModal(false);
      setSelectedBatch(null);
      setAdjustmentQuantity('');
      setAdjustmentReason('');
      setMovementCategory('ADJUSTMENT');
      setAdjustmentType('increase');
    } catch (error) {
      if (error instanceof z.ZodError) {
        const first = error.issues[0];
        alert(`Validation: ${first?.message ?? 'Invalid input'}`);
        return;
      }
      // Parse domain errors from the backend
      const apiErr = error as {
        response?: {
          data?: {
            error?: string;
            error_code?: string;
            details?: {
              remaining?: number;
              requested?: number;
              deltaGap?: number;
              batchNumber?: string;
            };
          };
        };
      };
      const errorCode = apiErr?.response?.data?.error_code;
      const details = apiErr?.response?.data?.details;
      if (errorCode === 'INSUFFICIENT_BATCH_QTY') {
        alert(
          `Cannot reduce stock.\nBatch has ${details?.remaining ?? 0} unit(s) remaining, but ${details?.requested ?? qty} unit(s) were requested.`
        );
        return;
      }
      if (errorCode === 'ERR_INVENTORY_BATCH_NO_COST') {
        alert(
          apiErr?.response?.data?.error ??
            'This batch has no unit cost. Repair batch valuation or receive stock with cost before reducing inventory.'
        );
        return;
      }
      if (errorCode === 'ERR_WAREHOUSE_LAYER_COUPLING') {
        alert(
          apiErr?.response?.data?.error ??
            'Warehouse batch and store balances are out of sync for this product. Retry the adjustment; if it persists, contact support.',
        );
        return;
      }
      if (errorCode === 'ERR_INVENTORY_GL_COUPLING') {
        alert(
          apiErr?.response?.data?.error ??
            `Inventory and GL would drift by ${details?.deltaGap ?? 'unknown'} UGX. Use Repair Valuation or contact support.`
        );
        return;
      }
      console.error('Adjustment failed:', error);
      handleApiError(error, { fallback: 'Failed to adjust inventory' });
    }
  }, [
    selectedBatch,
    currentUser,
    adjustmentQuantity,
    adjustmentType,
    adjustmentReason,
    movementCategory,
    adjustBatchMutation,
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

    // DAMAGE/EXPIRY quarantine:
    // - full batch: remaining unchanged until dispose (LQ-INV-1)
    // - partial: lot split — this batch keeps (current − qty) sellable
    if (movementCategory === 'DAMAGE' || movementCategory === 'EXPIRY') {
      if (adjustment.gt(0) && adjustment.lt(current)) {
        return current.minus(adjustment).toNumber();
      }
      return current.toNumber();
    }

    const newQty =
      adjustmentType === 'increase' ? current.plus(adjustment) : current.minus(adjustment);

    return newQty.toNumber();
  }, [selectedBatch, adjustmentQuantity, adjustmentType, movementCategory]);

  const quarantinePreviewHint = useMemo(() => {
    if (
      (movementCategory !== 'DAMAGE' && movementCategory !== 'EXPIRY') ||
      !selectedBatch ||
      !adjustmentQuantity
    ) {
      return null;
    }
    const current = Number(selectedBatch.remaining_quantity);
    const qty = Number(adjustmentQuantity);
    if (!(qty > 0) || qty > current + 0.0001) return null;
    if (Math.abs(qty - current) <= 0.0001) {
      return 'Full batch will be quarantined (non-sellable). No P&L until Dispose.';
    }
    return `Partial: ${qty} quarantined; ${(current - qty).toFixed(2)} stays sellable on this batch (lot split). No P&L until Dispose.`;
  }, [movementCategory, selectedBatch, adjustmentQuantity]);

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

  // Must stay above loading/error/permission early returns — hooks order SSOT.
  const adjustmentBatchColumns: AdaptiveDataColumn<Batch>[] = useMemo(() => {
    const all: AdaptiveDataColumn<Batch>[] = [
    {
      id: 'product',
      header: 'Product',
      priority: 'primary',
      cardRole: 'title',
      cell: (batch) => (
        <span className="text-sm font-medium text-gray-900">{batch.product_name}</span>
      ),
    },
    {
      id: 'category',
      header: 'Category',
      priority: 'secondary',
      cardRole: 'subtitle',
      cell: (batch) => {
        const cat = productCategoryMap.get(batch.product_id);
        return cat ? (
          <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-blue-50 text-blue-700">
            {cat}
          </span>
        ) : (
          <span className="text-gray-400">—</span>
        );
      },
    },
    {
      id: 'batchNumber',
      header: 'Batch Number',
      priority: 'secondary',
      cardRole: 'meta',
      cell: (batch) => <span className="text-sm text-gray-900">{batch.batch_number}</span>,
    },
    {
      id: 'quantity',
      header: 'Quantity',
      priority: 'primary',
      cardRole: 'amount',
      align: 'right',
      cell: (batch) => (
        <span className="font-semibold tabular-nums">{batch.remaining_quantity.toFixed(2)}</span>
      ),
    },
    {
      id: 'expiryDate',
      header: 'Expiry Date',
      priority: 'secondary',
      cardRole: 'meta',
      cell: (batch) => (
        <span className="text-sm text-gray-600">
          {batch.expiry_date ? formatDisplayDate(batch.expiry_date) : 'N/A'}
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      priority: 'secondary',
      cardRole: 'status',
      cell: (batch) => (
        <span
          className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${
            batch.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
          }`}
        >
          {batch.status}
        </span>
      ),
    },
  ];
    return all.filter((c) => showCol(c.id));
  }, [productCategoryMap, showCol]);

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
            Required permission: <strong>inventory.adjust</strong> or{' '}
            <strong>inventory.approve</strong>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div data-inventory-adjustments-page="true">
      <AdaptivePage
        className={ADAPTIVE_PAGE_PAD_CLASS}
        title={
          <span className="inline-flex items-center gap-2">
            Adjustments & Stock Count
            <WorkflowHelpTrigger title="About Adjustments & Stock Count">
              <ul className="space-y-1">
                <li>• <strong>Adjustment:</strong> Increase or decrease stock for corrections</li>
                <li>• <strong>Damage:</strong> Record stock lost due to physical damage</li>
                <li>• <strong>Damage / Expiry:</strong> Quarantine first (no P&amp;L) — dispose from Quarantine workqueue</li>
                <li>• <strong>Physical Count:</strong> Compare physical stock vs system, auto-create adjustments for discrepancies</li>
                <li>• All records create immutable stock movement entries for full audit trail</li>
                <li>• View <strong>Movement History</strong> for the complete audit trail</li>
                <li>
                  • <strong>Permission Required:</strong> inventory.adjust or inventory.approve
                </li>
              </ul>
            </WorkflowHelpTrigger>
          </span>
        }
        description="Record stock adjustments, damages, expiry quarantine, and physical counts"
        densityOverride={ADAPTIVE_WORKLIST_DENSITY}
        toolbarInline
        toolbar={
          <div className={`${ADAPTIVE_TOOLBAR_CARD_CLASS} space-y-3`} data-adj-filters="true">
            {isMultistoreEnabled && adjustmentStores.length > 0 ? (
              <div className="max-w-sm">
                <StoreLocationSelect
                  id="adjustment-store"
                  label="Adjust at store"
                  stores={adjustmentStores}
                  value={adjustmentStoreId}
                  onChange={setAdjustmentStoreId}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Stock changes apply to the selected location&apos;s lot balances.
                </p>
              </div>
            ) : null}
            <AdaptiveToolbar
              modeOverride="compact"
              actionsBeforeLeading
              leading={
                <AdaptiveSearch
                  value={searchTerm}
                  onChange={(v) => {
                    setSearchTerm(v);
                    setCurrentPage(1);
                  }}
                  placeholder="Product name or batch number…"
                  label="Search batches"
                  presentationOverride="compact"
                />
              }
              secondaryLabel="Options"
              secondary={({ close }) => (
                <div className="space-y-3 w-full" data-adj-options-panel="true">
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={filterQtyOnly}
                      onChange={(e) => {
                        setFilterQtyOnly(e.target.checked);
                        setCurrentPage(1);
                        close();
                      }}
                    />
                    Batches with quantity only
                  </label>
                  <button
                    type="button"
                    onClick={() => close()}
                    className="w-full rounded-md bg-stone-900 px-3 py-2 text-sm font-medium text-white min-h-[var(--layout-touch-target)]"
                  >
                    Done
                  </button>
                </div>
              )}
              more={
                <>
                  <MobileSortSelect
                    presentation="menu"
                    sortField={sortField}
                    sortOrder={sortOrder}
                    options={mobileSortOptions}
                    onFieldChange={handleColumnSort}
                    onToggleOrder={() => setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}
                  />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleViewAllMovements}
                    data-adj-movements-link="true"
                  >
                    Movement History
                  </button>
                  <InventoryColumnPicker
                    presentation="menu"
                    catalog={columnPrefs.catalog}
                    visibleIds={columnPrefs.visibleIds}
                    visibleCount={columnPrefs.visibleCount}
                    totalCount={columnPrefs.totalCount}
                    onToggle={columnPrefs.toggle}
                    onResetDefaults={columnPrefs.resetDefaults}
                  />
                </>
              }
            >
              <button
                type="button"
                onClick={() => setShowPhysicalCountModal(true)}
                className="inline-flex items-center justify-center rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-700 min-h-[var(--layout-touch-target)]"
                data-adj-primary-cta="true"
              >
                Physical Count
              </button>
            </AdaptiveToolbar>
          </div>
        }
      >

      {/* Recent Adjustments Summary */}
      {recentAdjustments.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-semibold text-blue-900">
              Today&apos;s Adjustments ({recentAdjustments.length})
            </h3>
            <button
              type="button"
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
                      className="flex items-center justify-between text-sm bg-white rounded px-3 py-2 gap-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={
                            movementType === 'ADJUSTMENT_IN'
                              ? 'text-green-600 font-bold shrink-0'
                              : 'text-red-600 font-bold shrink-0'
                          }
                        >
                          {movementType === 'ADJUSTMENT_IN' ? '+' : '−'}
                        </span>
                        <span className="font-medium text-gray-900 truncate">
                          {productName}
                        </span>
                        <span className="text-gray-600 shrink-0 tabular-nums">
                          {movementType === 'ADJUSTMENT_IN' ? '+' : '-'}
                          {Math.abs(adj.quantity || 0).toFixed(2)}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 shrink-0">
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

      {filterQtyOnly && (
        <div className="px-3 py-2 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-900 flex items-center justify-between gap-2">
          <span>Showing batches with remaining quantity only ({sortedBatches.length})</span>
          <button
            type="button"
            className="text-amber-800 underline shrink-0"
            onClick={() => {
              setFilterQtyOnly(false);
              handleSort('product', { defaultOrder: 'asc' });
            }}
          >
            Clear filter
          </button>
        </div>
      )}

      {/* Batches — AdaptiveDataGrid cards on phone / table on desktop */}
      <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-100">
        <AdaptiveDataGrid
          rows={paginatedBatches}
          getRowId={(batch) => batch.id}
          emptyMessage={searchTerm ? 'No batches match your search' : 'No inventory batches found'}
          columns={adjustmentBatchColumns}
          renderRowActions={(batch) => (
            <AdaptiveRowActions
              actions={[
                {
                  id: 'adjust',
                  label: 'Adjust',
                  tone: 'primary',
                  onClick: () => handleOpenAdjustModal(batch),
                },
                {
                  id: 'damage',
                  label: 'Damage',
                  tone: 'warning',
                  onClick: () => {
                    handleOpenAdjustModal(batch);
                    setTimeout(() => {
                      setMovementCategory('DAMAGE');
                      setAdjustmentType('decrease');
                    }, 0);
                  },
                },
                {
                  id: 'history',
                  label: 'History',
                  tone: 'muted',
                  onClick: () =>
                    navigate(`/inventory/stock-movements?product=${batch.product_id}`),
                },
              ]}
            />
          )}
        />
      </div>

      {/* Batch Table Pagination */}
      {sortedBatches.length > ITEMS_PER_PAGE && (
        <div className="mt-4 flex justify-between items-center">
          <div className="text-sm text-gray-600">
            Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, sortedBatches.length)} of {sortedBatches.length} batches
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

      </AdaptivePage>

      {/* Adjustment workspace */}
      {showAdjustModal && selectedBatch && (
        <SlideDrawer
          open
          onClose={() => setShowAdjustModal(false)}
          title={
            movementCategory === 'DAMAGE'
              ? 'Record Damage'
              : movementCategory === 'EXPIRY'
                ? 'Quarantine Expired Stock'
                : 'Adjust Inventory'
          }
          subtitle={`${selectedBatch.product_name} — ${selectedBatch.batch_number}`}
          width="xl"
          transactional
          cancellable={false}
          guardLabel="Stock adjustment"
          footer={
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowAdjustModal(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium"
                disabled={adjustBatchMutation.isPending}
              >
                Cancel (Esc)
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSubmitAdjustment();
                }}
                disabled={adjustBatchMutation.isPending || !formValidation.isValid}
                className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg font-medium disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {adjustBatchMutation.isPending
                  ? 'Saving...'
                  : movementCategory === 'DAMAGE'
                    ? 'Record Damage'
                    : movementCategory === 'EXPIRY'
                      ? 'Quarantine expired'
                      : 'Save Adjustment (Enter)'}
              </button>
            </div>
          }
        >
            <div className="space-y-4 -mt-2">
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
                    <strong>
                      {(movementCategory === 'DAMAGE' || movementCategory === 'EXPIRY') &&
                      selectedBatch &&
                      Number(adjustmentQuantity) > 0 &&
                      Number(adjustmentQuantity) < Number(selectedBatch.remaining_quantity)
                        ? 'Sellable left on this batch:'
                        : 'New Quantity:'}
                    </strong>{' '}
                    {previewNewQuantity.toFixed(2)}
                    {previewNewQuantity < 0 && (
                      <span className="ml-2">⚠️ Negative quantity not allowed</span>
                    )}
                  </div>
                  {quarantinePreviewHint && (
                    <p className="text-xs text-blue-700 mt-1">{quarantinePreviewHint}</p>
                  )}
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
        </SlideDrawer>
      )}

      {/* Physical count workspace */}
      <SlideDrawer
        open={showPhysicalCountModal}
        onClose={() => {
          if (!isProcessingCount) setShowPhysicalCountModal(false);
        }}
        title="Physical Inventory Count"
        subtitle="Enter actual counted quantities for each product"
        width="full"
        transactional
        cancellable={false}
        guardLabel="Physical stock count"
        footer={
          <div className="flex justify-between items-center gap-4 flex-wrap">
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
        }
      >
            {/* Statistics Bar — global AdaptiveKpiStrip (2-up phone) */}
            <div className="px-4 sm:px-6 py-3 bg-gray-50 border-b border-gray-200">
              <AdaptiveKpiStrip
                items={[
                  { id: 'pc-total', label: 'Total Items', value: physicalCountStats.total },
                  {
                    id: 'pc-counted',
                    label: 'Counted',
                    value: physicalCountStats.counted,
                    valueClassName: 'text-blue-600',
                  },
                  {
                    id: 'pc-remaining',
                    label: 'Remaining',
                    value: physicalCountStats.remaining,
                    valueClassName: 'text-yellow-600',
                  },
                  {
                    id: 'pc-disc',
                    label: 'Discrepancies',
                    value: physicalCountStats.discrepancies,
                    valueClassName: 'text-red-600',
                  },
                ]}
              />
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

      </SlideDrawer>

    </div>
  );
}
