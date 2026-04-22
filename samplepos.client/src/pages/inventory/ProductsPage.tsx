import { useState, useMemo, useEffect } from 'react';
import ProductForm, { ProductFormField } from '@/components/products/ProductForm';
import { formatCurrency, parseCurrency } from '../../utils/currency';
import { BUSINESS_RULES } from '../../utils/constants';
// Zod-based form validation
import { validateProductValues } from '@/validation/product';
import { useCreateProduct, useUpdateProduct, useDeleteProduct, productKeys } from '../../hooks/useProducts';
import { useSuppliers } from '../../hooks/useSuppliers';
import { useOfflineProducts } from '../../hooks/useOfflineData';
import { useOfflineContext } from '../../contexts/OfflineContext';
import { getErrorMessage, api } from '../../utils/api';
import Decimal from 'decimal.js';
import { computeUomPrices } from '@shared/utils/uom-pricing';
import { useQueryClient } from '@tanstack/react-query';
import { DatePicker } from '../../components/ui/date-picker';
import {
  useProductHistory,
  getHistoryTypeVariant,
  formatQuantityChange,
  isExpiringSoon,
  formatHistoryReference,
  type ProductHistoryType
} from '../../hooks/useProductHistory';
import { useSubmitOnEnter } from '../../hooks/useSubmitOnEnter';

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

interface ProductUomRow {
  id: string;
  uomId: string;
  uomName?: string;
  uomSymbol?: string | null;
  uom_name?: string;
  uom_symbol?: string | null;
  conversionFactor: number | string;
  isDefault: boolean;
  overrideCost?: number | string;
  overridePrice?: number | string;
  priceOverride?: number | string;
  costOverride?: number | string;
  uom?: { name?: string; symbol?: string | null };
}

interface ProductListItem extends ProductFormData {
  productUoms?: ProductUomRow[];
  product_uoms?: ProductUomRow[];
}

interface ProductFormData {
  id?: string;
  name: string;
  sku: string;
  barcode: string;
  description: string;
  category: string;
  genericName: string;
  conversionFactor: string;
  costPrice: string;
  sellingPrice: string;
  costingMethod: string;
  averageCost: string;
  lastCost: string;
  pricingFormula: string;
  autoUpdatePrice: boolean;
  quantityOnHand: string;
  reorderLevel: string;
  isTaxable: boolean;
  taxRate: string;
  isActive: boolean;
  trackExpiry: boolean;
  minDaysBeforeExpirySale: string;
  // Procurement fields
  preferredSupplierId: string;
  supplierProductCode: string;
  purchaseUomId: string;
  leadTimeDays: string;
  reorderQuantity: string;
}

interface ProductUomFormData {
  id?: string;
  uomId: string;
  uomName?: string;
  uomSymbol?: string | null;
  conversionFactor: string;
  isDefault: boolean;
  priceOverride?: string;
  costOverride?: string;
}

interface MasterUom {
  id: string;
  name: string;
  symbol?: string | null;
  type: string;
}

const initialFormData: ProductFormData = {
  name: '',
  sku: '',
  barcode: '',
  description: '',
  category: '',
  genericName: '',
  conversionFactor: '1',
  costPrice: '',
  sellingPrice: '',
  costingMethod: 'FIFO',
  averageCost: '0',
  lastCost: '0',
  pricingFormula: '',
  autoUpdatePrice: false,
  quantityOnHand: '0',
  reorderLevel: '10',
  isTaxable: false,
  taxRate: '18',
  isActive: true,
  trackExpiry: false,
  minDaysBeforeExpirySale: '0',
  preferredSupplierId: '',
  supplierProductCode: '',
  purchaseUomId: '',
  leadTimeDays: '0',
  reorderQuantity: '0',
};

export default function ProductsPage() {
  // Offline-awareness
  const { isOnline } = useOfflineContext();

  // API Hooks — use offline-aware hook for reading, standard hooks for mutations
  const queryClient = useQueryClient();
  const { data: productsResponse, isLoading, error, refetch } = useOfflineProducts({ includeUoms: true, limit: 5000 });
  const createProductMutation = useCreateProduct();
  const updateProductMutation = useUpdateProduct();
  const deleteProductMutation = useDeleteProduct();

  // Suppliers for Procurement tab
  const { data: suppliersData } = useSuppliers();
  const suppliersList = useMemo(() => {
    const raw = suppliersData?.data;
    return (Array.isArray(raw) ? raw : []) as Array<{ id: string; name: string }>;
  }, [suppliersData]);

  // Pagination
  const ITEMS_PER_PAGE = 50;
  const [currentPage, setCurrentPage] = useState(1);

  // Local State
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [formData, setFormData] = useState<ProductFormData>(initialFormData);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [productToDelete, setProductToDelete] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedProductForHistory, setSelectedProductForHistory] = useState<string | null>(null);
  const [historyFilters, setHistoryFilters] = useState<{
    type?: ProductHistoryType;
    startDate?: string;
    endDate?: string;
  }>({});

  // Product UoM State
  const [productUoms, setProductUoms] = useState<ProductUomFormData[]>([]);
  const [masterUoms, setMasterUoms] = useState<MasterUom[]>([]);
  const [showAddUomForm, setShowAddUomForm] = useState(false);
  const [editingUomIndex, setEditingUomIndex] = useState<number | null>(null);
  const [uomFormData, setUomFormData] = useState<ProductUomFormData>({
    uomId: '',
    conversionFactor: '1',
    isDefault: false,
  });
  const [uomAutoApplied, setUomAutoApplied] = useState(false);

  // Map master UoMs by id for quick lookups and inline validation
  const masterUomById = useMemo(() => {
    const map: Record<string, MasterUom> = {};
    for (const m of masterUoms) map[m.id] = m;
    return map;
  }, [masterUoms]);

  const invalidUomIndexes = useMemo(() => {
    return productUoms
      .map((u, i) => (!u.uomId || !masterUomById[u.uomId] ? i : -1))
      .filter(i => i >= 0);
  }, [productUoms, masterUomById]);

  // Helper: Autofill all missing/invalid UoMs with the first available master UoM
  const handleFixAllMissingUnits = () => {
    if (!invalidUomIndexes.length) return;
    if (!masterUoms || masterUoms.length === 0) {
      setApiError('No master units available. Please add master UoMs first.');
      return;
    }
    const firstMaster = masterUoms[0];
    const prev = productUoms;
    const next = prev.map((u) => (
      !u.uomId || !masterUomById[u.uomId]
        ? {
          ...u,
          uomId: firstMaster.id,
          uomName: firstMaster.name,
          uomSymbol: firstMaster.symbol ?? null,
        }
        : u
    ));
    // Focus the editor on the first previously invalid row for user confirmation
    const firstInvalid = prev.findIndex((u) => !u.uomId || !masterUomById[u.uomId]);
    setProductUoms(next);
    if (firstInvalid >= 0) {
      setEditingUomIndex(firstInvalid);
      setShowAddUomForm(true);
      const fixed = next[firstInvalid];
      setUomFormData({
        uomId: fixed.uomId || '',
        conversionFactor: fixed.conversionFactor || '1',
        isDefault: !!fixed.isDefault,
        priceOverride: fixed.priceOverride || '',
        costOverride: fixed.costOverride || '',
      });
    }
  };

  // Extract products from API response
  const products = useMemo(() => {
    if (!productsResponse?.success || !productsResponse?.data) return [];
    return Array.isArray(productsResponse.data) ? productsResponse.data : [];
  }, [productsResponse]);

  // Helper function to format quantity with multi-UOM breakdown
  const formatMultiUomQuantity = (product: ProductListItem): string => {
    const baseQuantity = parseFloat(product.quantityOnHand) || 0;

    // Get product UOMs if available
    const productUoms = product.product_uoms || product.productUoms || [];

    if (!productUoms || productUoms.length === 0) {
      // No UOMs defined, show base quantity only
      return `${baseQuantity}`;
    }

    // Sort UOMs by conversion factor (descending) to show largest units first
    const sortedUoms = [...productUoms]
      .filter((uom: ProductUomRow) => Number(uom.conversionFactor) > 1)
      .sort((a: ProductUomRow, b: ProductUomRow) => parseFloat(String(b.conversionFactor)) - parseFloat(String(a.conversionFactor)));

    if (sortedUoms.length === 0) {
      // Only base unit exists
      const baseUom = productUoms.find((u: ProductUomRow) => u.isDefault) || productUoms[0];
      const uomSymbol = baseUom?.uomSymbol || baseUom?.uom_symbol || baseUom?.uomName || baseUom?.uom_name || 'PC';
      return `${baseQuantity} ${uomSymbol}`;
    }

    // Calculate breakdown
    let remainingQty = baseQuantity;
    const breakdown: string[] = [];

    for (const uom of sortedUoms) {
      const conversionFactor = parseFloat(String(uom.conversionFactor));
      if (remainingQty >= conversionFactor) {
        const units = Math.floor(remainingQty / conversionFactor);
        remainingQty = remainingQty % conversionFactor;
        const uomSymbol = uom.uomSymbol || uom.uom_symbol || uom.uomName || uom.uom_name || '';
        breakdown.push(`${units} ${uomSymbol}`);
      }
    }

    // Add remaining base units
    if (remainingQty > 0 || breakdown.length === 0) {
      const baseUom = productUoms.find((u: ProductUomRow) => u.isDefault) || productUoms[0];
      const uomSymbol = baseUom?.uomSymbol || baseUom?.uom_symbol || baseUom?.uomName || baseUom?.uom_name || 'PC';
      breakdown.push(`${remainingQty} ${uomSymbol}`);
    }

    return breakdown.join(' + ');
  };

  // Product history query (only when modal is open)
  const { data: historyData, isLoading: historyLoading, error: historyError } = useProductHistory(
    selectedProductForHistory || '',
    {
      page: 1,
      limit: 50,
      ...historyFilters
    }
  );

  // Load master UoMs when modal opens
  useEffect(() => {
    if (showModal && masterUoms.length === 0) {
      api.products.getMasterUoms()
        .then(response => {
          if (response.data.success && response.data.data) {
            setMasterUoms(response.data.data as MasterUom[]);
          }
        })
        .catch(error => {
          console.error('Failed to load master UoMs:', error);
        });
    }
  }, [showModal, masterUoms.length]);

  // Load product UoMs when editing a product
  useEffect(() => {
    if (showModal && modalMode === 'edit' && formData.id) {
      api.products.getProductUoms(formData.id)
        .then(response => {
          if (response.data.success && response.data.data) {
            const uoms = (response.data.data as ProductUomRow[]).map((uom: ProductUomRow) => ({
              id: uom.id,
              uomId: uom.uomId,
              // Prefer flat fields from API; fall back to nested shape if present
              uomName: uom.uomName ?? uom.uom?.name,
              uomSymbol: uom.uomSymbol ?? uom.uom?.symbol,
              conversionFactor: uom.conversionFactor.toString(),
              isDefault: uom.isDefault,
              priceOverride: uom.priceOverride?.toString(),
              costOverride: uom.costOverride?.toString(),
            }));
            setProductUoms(uoms);
          }
        })
        .catch(error => {
          console.error('Failed to load product UoMs:', error);
        });
    } else if (showModal && modalMode === 'create') {
      // Clear UoMs for new product
      setProductUoms([]);
    }
  }, [showModal, modalMode, formData.id]);

  // Calculate profit margin
  const calculateMargin = (cost: string, selling: string): string => {
    if (!cost || !selling) return '0.00';
    try {
      const costDecimal = new Decimal(cost);
      const sellingDecimal = new Decimal(selling);
      if (costDecimal.equals(0)) return '0.00';
      const margin = sellingDecimal.minus(costDecimal).dividedBy(costDecimal).times(100);
      return margin.toFixed(2);
    } catch {
      return '0.00';
    }
  };

  // Generate SKU
  const generateSKU = (): string => {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `PRD-${timestamp}-${random}`;
  };

  // Derive unique categories from loaded products
  const uniqueCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const p of products) {
      if (p.category) cats.add(p.category);
    }
    return Array.from(cats).sort((a, b) => a.localeCompare(b));
  }, [products]);

  // Filter products
  const filteredProducts = useMemo(() => {
    let filtered = products;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter((p: ProductListItem) =>
        String(p.name ?? '').toLowerCase().includes(term) ||
        String(p.sku ?? '').toLowerCase().includes(term) ||
        String(p.barcode ?? '').toLowerCase().includes(term) ||
        String(p.category ?? '').toLowerCase().includes(term)
      );
    }

    if (filterStatus !== 'all') {
      filtered = filtered.filter((p: ProductListItem) =>
        filterStatus === 'active' ? p.isActive : !p.isActive
      );
    }

    if (filterCategory !== 'all') {
      filtered = filtered.filter((p: ProductListItem) =>
        p.category === filterCategory
      );
    }

    return filtered;
  }, [products, searchTerm, filterStatus, filterCategory]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterStatus, filterCategory]);

  // Paginated products
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / ITEMS_PER_PAGE));
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredProducts.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredProducts, currentPage]);

  // Validate form (Zod + duplicate SKU check + UOM check)
  const validateForm = (): boolean => {
    const z = validateProductValues({
      name: formData.name,
      sku: formData.sku,
      barcode: formData.barcode,
      description: formData.description,
      category: formData.category,
      costPrice: formData.costPrice,
      sellingPrice: formData.sellingPrice,
      costingMethod: formData.costingMethod,
      isTaxable: formData.isTaxable,
      taxRate: formData.taxRate,
      pricingFormula: formData.pricingFormula,
      autoUpdatePrice: formData.autoUpdatePrice,
      reorderLevel: formData.reorderLevel,
      trackExpiry: formData.trackExpiry,
      isActive: formData.isActive,
      genericName: formData.genericName,
      minDaysBeforeExpirySale: formData.minDaysBeforeExpirySale,
      preferredSupplierId: formData.preferredSupplierId,
      supplierProductCode: formData.supplierProductCode,
      purchaseUomId: formData.purchaseUomId,
      leadTimeDays: formData.leadTimeDays,
      reorderQuantity: formData.reorderQuantity,
    });

    const errors: Record<string, string> = { ...(z.valid ? {} : z.errors) };

    // Duplicate SKU (client-side check)
    const duplicateSKU = products.find(p =>
      String(p.sku ?? '').toLowerCase() === String(formData.sku ?? '').toLowerCase() && p.id !== formData.id
    );
    if (duplicateSKU) {
      errors.sku = 'SKU already exists';
    }

    // Require at least one product UOM
    if (modalMode === 'create' && productUoms.length === 0) {
      errors.productUoms = 'Please add at least one unit of measure';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle create
  const handleCreate = () => {
    setModalMode('create');
    setFormData({
      ...initialFormData,
      sku: generateSKU()
    });
    setValidationErrors({});
    setShowModal(true);
  };

  // Handle edit
  const handleEdit = (product: ProductListItem) => {
    setModalMode('edit');
    // Normalize possible null/undefined fields from API into safe defaults for controlled inputs
    // Use String() for all text fields as they may come from DB as non-string types
    setFormData({
      ...initialFormData,
      ...product,
      name: String(product.name ?? ''),
      sku: String(product.sku ?? ''),
      barcode: String(product.barcode ?? ''),
      description: String(product.description ?? ''),
      category: String(product.category ?? ''),
      genericName: String(product.genericName ?? ''),
      conversionFactor: String(product.conversionFactor ?? initialFormData.conversionFactor),
      costPrice: String(product.costPrice ?? ''),
      sellingPrice: String(product.sellingPrice ?? ''),
      costingMethod: product.costingMethod ?? initialFormData.costingMethod,
      averageCost: String(product.averageCost ?? initialFormData.averageCost),
      lastCost: String(product.lastCost ?? initialFormData.lastCost),
      pricingFormula: String(product.pricingFormula ?? ''),
      autoUpdatePrice: product.autoUpdatePrice ?? initialFormData.autoUpdatePrice,
      quantityOnHand: String(product.quantityOnHand ?? initialFormData.quantityOnHand),
      reorderLevel: String(product.reorderLevel ?? initialFormData.reorderLevel),
      isTaxable: product.isTaxable ?? false,
      taxRate: String(product.taxRate ?? initialFormData.taxRate),
      isActive: product.isActive ?? true,
      trackExpiry: product.trackExpiry ?? false,
      minDaysBeforeExpirySale: String(product.minDaysBeforeExpirySale ?? '0'),
      preferredSupplierId: String(product.preferredSupplierId ?? ''),
      supplierProductCode: String(product.supplierProductCode ?? ''),
      purchaseUomId: String(product.purchaseUomId ?? ''),
      leadTimeDays: String(product.leadTimeDays ?? '0'),
      reorderQuantity: String(product.reorderQuantity ?? '0'),
    });
    setValidationErrors({});
    setShowModal(true);
  };

  // Handle save
  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }

    // Block saving if any Product UoM rows are invalid (missing or deleted master UoM)
    if (invalidUomIndexes.length > 0) {
      setApiError('Some units are invalid or missing. Please select a valid unit for all rows.');
      return;
    }

    try {
      setApiError('');

      // Convert form data to API format matching backend schema
      const productData = {
        name: formData.name,
        sku: formData.sku,
        barcode: formData.barcode || undefined,
        description: formData.description || undefined,
        category: formData.category || undefined,
        conversionFactor: parseFloat(formData.conversionFactor) || 1.0,
        costPrice: parseFloat(formData.costPrice) || 0,
        sellingPrice: parseFloat(formData.sellingPrice) || 0,
        isTaxable: !!formData.isTaxable,
        taxRate: parseFloat(formData.taxRate) || 0,
        costingMethod: formData.costingMethod as 'FIFO' | 'AVCO' | 'STANDARD',
        averageCost: parseFloat(formData.averageCost) || 0,
        lastCost: parseFloat(formData.lastCost) || 0,
        pricingFormula: formData.pricingFormula || undefined,
        autoUpdatePrice: !!formData.autoUpdatePrice,
        quantityOnHand: parseFloat(formData.quantityOnHand) || 0,
        reorderLevel: parseFloat(formData.reorderLevel) || 0,
        trackExpiry: !!formData.trackExpiry,
        genericName: formData.genericName || undefined,
        minDaysBeforeExpirySale: parseInt(formData.minDaysBeforeExpirySale) || 0,
        preferredSupplierId: formData.preferredSupplierId || undefined,
        supplierProductCode: formData.supplierProductCode || undefined,
        purchaseUomId: formData.purchaseUomId || undefined,
        leadTimeDays: parseInt(formData.leadTimeDays) || 0,
        reorderQuantity: parseFloat(formData.reorderQuantity) || 0,
      };

      let productId: string;

      if (modalMode === 'create') {
        const createResponse = await createProductMutation.mutateAsync(productData);
        const createdProduct = createResponse.data as { id: string } | undefined;
        productId = createdProduct?.id || '';

        // Save product UoMs for new product (one at a time to avoid pool exhaustion)
        if (productUoms.length > 0 && productId) {
          for (const uom of productUoms) {
            await api.products.addProductUom(productId, {
              uomId: uom.uomId,
              conversionFactor: parseFloat(uom.conversionFactor),
              isDefault: uom.isDefault,
              overrideCost: uom.costOverride ? parseFloat(uom.costOverride) : undefined,
              overridePrice: uom.priceOverride ? parseFloat(uom.priceOverride) : undefined,
            });
          }
          // Invalidate product detail to refresh UoM data
          queryClient.invalidateQueries({ queryKey: productKeys.detail(productId) });
        }

        setSuccessMessage('Product created successfully!');
      } else {
        productId = formData.id!;
        await updateProductMutation.mutateAsync({
          id: productId,
          data: productData
        });

        // Close modal immediately after successful product update
        setShowModal(false);
        setFormData(initialFormData);
        setSuccessMessage('Product updated successfully!');
        setTimeout(() => setSuccessMessage(''), 3000);

        // Handle UoM changes in background (non-blocking, serialized to avoid pool exhaustion)
        try {
          const existingUoms = await api.products.getProductUoms(productId);
          const existingUomIds = existingUoms.data.success && existingUoms.data.data
            ? (existingUoms.data.data as ProductUomRow[]).map((u: ProductUomRow) => u.id)
            : [];

          // Delete removed UoMs (one at a time)
          const currentUomIds = productUoms.filter(u => u.id && u.id.trim() !== '').map(u => u.id);
          const toDelete = existingUomIds.filter((id: string) => id && !currentUomIds.includes(id));
          for (const id of toDelete) {
            await api.products.deleteProductUom(productId, id);
          }

          // Update existing and add new UoMs (one at a time) - filter out entries with empty uomId
          const validUoms = productUoms.filter(uom => uom.uomId && uom.uomId.trim() !== '');
          for (const uom of validUoms) {
            if (uom.id && uom.id.trim() !== '') {
              const updateData = {
                conversionFactor: parseFloat(uom.conversionFactor),
                isDefault: uom.isDefault,
                overrideCost: uom.costOverride ? parseFloat(uom.costOverride) : undefined,
                overridePrice: uom.priceOverride ? parseFloat(uom.priceOverride) : undefined,
              };
              await api.products.updateProductUom(productId, uom.id, updateData);
            } else {
              const addData = {
                uomId: uom.uomId,
                conversionFactor: parseFloat(uom.conversionFactor),
                isDefault: uom.isDefault,
                overrideCost: uom.costOverride ? parseFloat(uom.costOverride) : undefined,
                overridePrice: uom.priceOverride ? parseFloat(uom.priceOverride) : undefined,
              };
              await api.products.addProductUom(productId, addData);
            }
          }
        } catch (uomError) {
          const uomErrorMsg = getErrorMessage(uomError);
          console.error('Failed to update UoMs:', uomErrorMsg);
          alert(`Product saved, but failed to update Units of Measure: ${uomErrorMsg}`);
        }

        // Invalidate product detail to refresh UoM data immediately
        queryClient.invalidateQueries({ queryKey: productKeys.detail(productId) });
        queryClient.invalidateQueries({ queryKey: productKeys.lists() });
        setProductUoms([]);
        return; // Exit early since we already handled everything
      }

      setShowModal(false);
      setFormData(initialFormData);
      setProductUoms([]);

      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      const errorMsg = getErrorMessage(error);
      setApiError(errorMsg);
      console.error('Failed to save product:', errorMsg);
    }
  };

  // Handle delete
  const handleDeleteClick = (productId: string) => {
    setProductToDelete(productId);
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!productToDelete) return;

    try {
      setApiError('');
      await deleteProductMutation.mutateAsync(productToDelete);
      setSuccessMessage('Product deleted successfully!');
      setProductToDelete(null);
      setShowDeleteConfirm(false);

      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      const errorMsg = getErrorMessage(error);
      setApiError(errorMsg);
      console.error('Failed to delete product:', errorMsg);
      setShowDeleteConfirm(false);
    }
  };

  // Handle view history
  const handleViewHistory = (productId: string) => {
    setSelectedProductForHistory(productId);
    setShowHistoryModal(true);
    setHistoryFilters({});
  };

  // Get product name for history modal
  const selectedProductName = useMemo(() => {
    if (!selectedProductForHistory) return '';
    const product = products.find(p => p.id === selectedProductForHistory);
    return product?.name || '';
  }, [selectedProductForHistory, products]);

  const selectedProductWithUom = useMemo(() => {
    if (!selectedProductForHistory) return null;
    return products.find(p => p.id === selectedProductForHistory);
  }, [selectedProductForHistory, products]);

  // Handle form field change
  const handleFieldChange = (field: keyof ProductFormData, value: string | boolean) => {
    setFormData({ ...formData, [field]: value });
    // Clear validation error for this field
    if (validationErrors[field]) {
      setValidationErrors({ ...validationErrors, [field]: '' });
    }
  };

  // Product UoM Handlers
  const handleAddUomClick = () => {
    setUomFormData({
      uomId: '',
      conversionFactor: '1',
      isDefault: false,
    });
    setUomAutoApplied(false);
    setEditingUomIndex(null);
    setShowAddUomForm(true);
  };

  const handleEditUomClick = (index: number) => {
    const uom = productUoms[index];
    // Format values to reduce decimal places when populating form
    setUomFormData({
      ...uom,
      conversionFactor: parseFloat(uom.conversionFactor).toString(),
      costOverride: uom.costOverride ? Math.round(parseFloat(uom.costOverride)).toString() : undefined,
      priceOverride: uom.priceOverride ? Math.round(parseFloat(uom.priceOverride)).toString() : undefined,
    });
    setUomAutoApplied(false);
    setEditingUomIndex(index);
    setShowAddUomForm(true);
  };

  const handleDeleteUomClick = async (index: number) => {
    const uomToDelete = productUoms[index];

    // If editing an existing product and UoM has an ID, delete from database immediately
    if (formData.id && uomToDelete.id) {
      if (!confirm(`Delete unit "${uomToDelete.uomName}"? This cannot be undone.`)) {
        return;
      }

      try {
        await api.products.deleteProductUom(formData.id, uomToDelete.id);

        // Update local state
        setProductUoms(productUoms.filter((_, i) => i !== index));

        // Invalidate cache to refresh immediately
        queryClient.invalidateQueries({ queryKey: productKeys.detail(formData.id) });
        queryClient.invalidateQueries({ queryKey: productKeys.lists() });

        setSuccessMessage('Unit of measure deleted successfully!');
        setTimeout(() => setSuccessMessage(''), 3000);
      } catch (error) {
        const errorMsg = getErrorMessage(error);
        setApiError(errorMsg);
        console.error('Failed to delete UoM:', errorMsg);
      }
    } else {
      // Just remove from local state (for new products or unsaved UoMs)
      setProductUoms(productUoms.filter((_, i) => i !== index));
    }
  };

  const handleSaveUom = async () => {
    // Validation
    if (!uomFormData.uomId) {
      setApiError('Please select a unit of measure');
      return;
    }

    const conversionFactor = parseFloat(uomFormData.conversionFactor);
    if (isNaN(conversionFactor) || conversionFactor <= 0) {
      setApiError('Conversion factor must be greater than 0');
      return;
    }

    // Check for duplicates
    const isDuplicate = productUoms.some((uom, index) =>
      uom.uomId === uomFormData.uomId && index !== editingUomIndex
    );
    if (isDuplicate) {
      setApiError('This unit of measure is already configured');
      return;
    }

    // Get master UoM details
    const masterUom = masterUoms.find(m => m.id === uomFormData.uomId);
    const uomWithDetails = {
      ...uomFormData,
      uomName: masterUom?.name,
      uomSymbol: masterUom?.symbol,
    };

    if (editingUomIndex !== null) {
      // Update existing
      const updated = [...productUoms];
      updated[editingUomIndex] = uomWithDetails;
      setProductUoms(updated);

      // If editing an existing product (has formData.id), save UoM change immediately
      if (formData.id && uomWithDetails.id) {
        try {
          await api.products.updateProductUom(formData.id, uomWithDetails.id, {
            conversionFactor: parseFloat(uomWithDetails.conversionFactor),
            isDefault: uomWithDetails.isDefault,
            overrideCost: uomWithDetails.costOverride ? parseFloat(uomWithDetails.costOverride) : undefined,
            overridePrice: uomWithDetails.priceOverride ? parseFloat(uomWithDetails.priceOverride) : undefined,
          });

          // Invalidate cache to refresh immediately
          queryClient.invalidateQueries({ queryKey: productKeys.detail(formData.id) });
          queryClient.invalidateQueries({ queryKey: productKeys.lists() });

          setSuccessMessage('Unit of measure updated successfully!');
          setTimeout(() => setSuccessMessage(''), 3000);
        } catch (error) {
          const errorMsg = getErrorMessage(error);
          setApiError(errorMsg);
          console.error('Failed to update UoM:', errorMsg);
          return;
        }
      }
    } else {
      // Add new
      setProductUoms([...productUoms, uomWithDetails]);

      // If editing an existing product (has formData.id), save new UoM immediately
      if (formData.id) {
        try {
          const response = await api.products.addProductUom(formData.id, {
            uomId: uomWithDetails.uomId,
            conversionFactor: parseFloat(uomWithDetails.conversionFactor),
            isDefault: uomWithDetails.isDefault,
            overrideCost: uomWithDetails.costOverride ? parseFloat(uomWithDetails.costOverride) : undefined,
            overridePrice: uomWithDetails.priceOverride ? parseFloat(uomWithDetails.priceOverride) : undefined,
          });

          // Update local state with returned ID
          const addedUomData = response.data?.data as { id?: string } | undefined;
          const newUomWithId = {
            ...uomWithDetails,
            id: addedUomData?.id,
          };
          setProductUoms([...productUoms, newUomWithId]);

          // Invalidate cache to refresh immediately
          queryClient.invalidateQueries({ queryKey: productKeys.detail(formData.id) });
          queryClient.invalidateQueries({ queryKey: productKeys.lists() });

          setSuccessMessage('Unit of measure added successfully!');
          setTimeout(() => setSuccessMessage(''), 3000);
        } catch (error) {
          const errorMsg = getErrorMessage(error);
          setApiError(errorMsg);
          console.error('Failed to add UoM:', errorMsg);
          return;
        }
      }
    }

    setShowAddUomForm(false);
    setApiError('');
  };

  const handleCancelUom = () => {
    setShowAddUomForm(false);
    setEditingUomIndex(null);
    setUomFormData({
      uomId: '',
      conversionFactor: '1',
      isDefault: false,
    });
    setUomAutoApplied(false);
  };

  const handleSetDefaultUom = (index: number) => {
    const updated = productUoms.map((uom, i) => ({
      ...uom,
      isDefault: i === index,
    }));
    setProductUoms(updated);
  };

  // Persist auto-calculated MUoM values into overrides when empty
  useEffect(() => {
    if (!showAddUomForm) return;
    const baseCost = parseFloat(formData.costPrice || '0') || 0;
    const selling = parseFloat(formData.sellingPrice || '0') || 0;
    const factor = parseFloat(uomFormData.conversionFactor || '0');
    if (!baseCost || !factor || factor <= 0) return;

    const defaultMultiplier = baseCost > 0 && selling > 0 ? selling / baseCost : 1.2;
    // Only apply if overrides are empty to avoid clobbering user input
    const needsCost = !uomFormData.costOverride || uomFormData.costOverride === '';
    const needsPrice = !uomFormData.priceOverride || uomFormData.priceOverride === '';
    if (!needsCost && !needsPrice && uomAutoApplied) return;

    try {
      // Get base UOM name from first productUom or use fallback
      const baseUomName = productUoms[0]?.uomName || 'UNIT';

      const result = computeUomPrices({
        baseCost,
        baseUomName,
        units: [{ name: 'UNIT', factor }],
        defaultMultiplier,
        currencyDecimals: 0,
      });
      const row = result.rows[0];
      const next: ProductUomFormData = { ...uomFormData };
      if (needsCost) next.costOverride = String(row.unitCost);
      if (needsPrice) next.priceOverride = String(row.sellingPrice);
      if (needsCost || needsPrice) {
        setUomFormData(next);
        setUomAutoApplied(true);
      }
    } catch { }
  }, [showAddUomForm, uomFormData.conversionFactor, formData.costPrice, formData.sellingPrice, productUoms]);

  useSubmitOnEnter(showModal, !createProductMutation.isPending && !updateProductMutation.isPending, handleSave);

  return (
    <div className="p-6">
      {/* Offline notice */}
      {!isOnline && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-2 text-amber-800 text-sm">
          <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          Offline — showing cached products (read-only). Create/edit/delete require an internet connection.
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Products Management</h2>
          <p className="text-gray-600 mt-1">
            {isOnline ? 'Manage product catalog with bank-grade precision' : 'Viewing cached product catalog (offline)'}
          </p>
        </div>
        <button
          onClick={handleCreate}
          disabled={!isOnline}
          className={`px-4 py-2 rounded-lg transition-colors ${isOnline
            ? 'bg-blue-600 text-white hover:bg-blue-700'
            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
        >
          ➕ Add Product
        </button>
      </div>

      {/* Success/Error Messages */}
      {successMessage && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm text-green-800">✓ {successMessage}</p>
        </div>
      )}

      {apiError && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800">❌ {apiError}</p>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">Loading products...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800">Failed to load products: {getErrorMessage(error)}</p>
          <button
            onClick={() => refetch()}
            className="mt-2 text-sm text-red-600 hover:text-red-800 font-medium"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="search-products" className="block text-sm font-medium text-gray-700 mb-2">
              Search Products
            </label>
            <input
              id="search-products"
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name, SKU, barcode, or category..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label htmlFor="filter-category" className="block text-sm font-medium text-gray-700 mb-2">
              Category
            </label>
            <select
              id="filter-category"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
              onChange={(e) => setFilterStatus(e.target.value as 'all' | 'active' | 'inactive')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Products</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {/* Mobile Card View */}
        <div className="block sm:hidden space-y-3 p-3">
          {paginatedProducts.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {searchTerm || filterStatus !== 'all' || filterCategory !== 'all'
                ? 'No products match your filters'
                : 'No products yet. Click "Add Product" to create your first product.'}
            </div>
          ) : (
            paginatedProducts.map((product: ProductListItem) => {
              const margin = calculateMargin(product.costPrice, product.sellingPrice);
              return (
                <div key={product.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-900 text-sm">{product.name}</span>
                        {product.trackExpiry && (
                          <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-purple-100 text-purple-800">Perishable</span>
                        )}
                      </div>
                      {product.category && (
                        <span className="inline-flex px-2 py-0.5 mt-1 text-xs font-medium rounded-full bg-blue-50 text-blue-700">{product.category}</span>
                      )}
                    </div>
                    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${product.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                      {product.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center mb-3">
                    <div>
                      <div className="text-xs text-gray-500">Cost</div>
                      <div className="text-sm text-gray-900">{formatCurrency(parseCurrency(product.costPrice))}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Sell</div>
                      <div className="text-sm font-medium text-gray-900">{formatCurrency(parseCurrency(product.sellingPrice))}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Margin</div>
                      <div className={`text-sm font-medium ${parseFloat(margin) >= 30 ? 'text-green-600' : parseFloat(margin) >= 15 ? 'text-yellow-600' : 'text-red-600'}`}>{margin}%</div>
                    </div>
                  </div>
                  <div className="text-xs text-gray-600 mb-2">Stock: {formatMultiUomQuantity(product)} | Reorder: {product.reorderLevel}</div>
                  <div className="flex gap-3 border-t border-gray-100 pt-2">
                    <button onClick={() => handleViewHistory(product.id!)} className="text-xs text-purple-600 hover:text-purple-800 font-medium">History</button>
                    <button onClick={() => handleEdit(product)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Edit</button>
                    <button onClick={() => handleDeleteClick(product.id!)} className="text-xs text-red-600 hover:text-red-800 font-medium">Delete</button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SKU/Barcode</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pricing</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Margin</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stock Levels</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedProducts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                    {searchTerm || filterStatus !== 'all' || filterCategory !== 'all'
                      ? 'No products match your filters'
                      : 'No products yet. Click "Add Product" to create your first product.'}
                  </td>
                </tr>
              ) : (
                paginatedProducts.map((product: ProductListItem) => {
                  const margin = calculateMargin(product.costPrice, product.sellingPrice);
                  return (
                    <tr key={product.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-medium text-gray-900">{product.name}</div>
                          {product.trackExpiry && (
                            <span
                              aria-label="Perishable product - expiry tracked"
                              className="inline-flex px-2 py-0.5 text-[10px] font-semibold rounded-full bg-purple-100 text-purple-800"
                            >
                              Perishable
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-500">{product.description || 'No description'}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${product.category
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-gray-400'
                          }`}>
                          {product.category || '—'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">SKU: {product.sku}</div>
                        {product.barcode && (
                          <div className="text-sm text-gray-500">Barcode: {product.barcode}</div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">
                          Cost: {formatCurrency(parseCurrency(product.costPrice))}
                        </div>
                        <div className="text-sm font-medium text-gray-900">
                          Sell: {formatCurrency(parseCurrency(product.sellingPrice))}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className={`text-sm font-medium ${parseFloat(margin) >= 30 ? 'text-green-600' :
                          parseFloat(margin) >= 15 ? 'text-yellow-600' : 'text-red-600'
                          }`}>
                          {margin}%
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-xs text-gray-600">
                          <div>On Hand: {formatMultiUomQuantity(product)}</div>
                          <div>Reorder: {product.reorderLevel}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${product.isActive
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                          }`}>
                          {product.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleViewHistory(product.id!)}
                            className="text-purple-600 hover:text-purple-800 text-sm font-medium"
                            title="View product history"
                          >
                            📊 History
                          </button>
                          <button
                            onClick={() => handleEdit(product)}
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteClick(product.id!)}
                            className="text-red-600 hover:text-red-800 text-sm font-medium"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {filteredProducts.length > ITEMS_PER_PAGE && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200">
            <p className="text-sm text-gray-600">
              Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filteredProducts.length)} of {filteredProducts.length} products
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
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-lg shadow-xl max-w-[95vw] sm:max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b px-6 py-4">
              <h3 className="text-xl font-bold text-gray-900">
                {modalMode === 'create' ? 'Add New Product' : 'Edit Product'}
              </h3>
            </div>

            <div className="p-6 space-y-4">
              <ProductForm
                values={{
                  name: formData.name,
                  sku: formData.sku,
                  barcode: formData.barcode,
                  description: formData.description,
                  category: formData.category,
                  costPrice: formData.costPrice,
                  sellingPrice: formData.sellingPrice,
                  costingMethod: formData.costingMethod,
                  isTaxable: formData.isTaxable,
                  taxRate: formData.taxRate,
                  pricingFormula: formData.pricingFormula,
                  autoUpdatePrice: formData.autoUpdatePrice,
                  reorderLevel: formData.reorderLevel,
                  trackExpiry: formData.trackExpiry,
                  isActive: formData.isActive,
                  genericName: formData.genericName,
                  minDaysBeforeExpirySale: formData.minDaysBeforeExpirySale,
                  preferredSupplierId: formData.preferredSupplierId,
                  supplierProductCode: formData.supplierProductCode,
                  purchaseUomId: formData.purchaseUomId,
                  leadTimeDays: formData.leadTimeDays,
                  reorderQuantity: formData.reorderQuantity,
                }}
                onChange={(field: ProductFormField, value: string | boolean) => handleFieldChange(field as keyof ProductFormData, value)}
                validationErrors={validationErrors as Partial<Record<ProductFormField, string>>}
                suppliers={suppliersList}
                masterUoms={masterUoms}
                lastPurchasePrice={formData.lastCost !== '0' ? formData.lastCost : undefined}
              />

              {/* Cost Tracking (Read-only for AVCO/FIFO) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div>
                  <label htmlFor="average-cost" className="block text-sm font-medium text-gray-700 mb-1">
                    Average Cost (Read-only)
                  </label>
                  <input
                    id="average-cost"
                    type="number"
                    step="0.01"
                    value={formData.averageCost}
                    readOnly
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600"
                    placeholder="0.00"
                  />
                  <p className="text-xs text-gray-500 mt-1">Calculated by system for AVCO method</p>
                </div>

                <div>
                  <label htmlFor="last-cost" className="block text-sm font-medium text-gray-700 mb-1">
                    Last Cost (Read-only)
                  </label>
                  <input
                    id="last-cost"
                    type="number"
                    step="0.01"
                    value={formData.lastCost}
                    readOnly
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600"
                    placeholder="0.00"
                  />
                  <p className="text-xs text-gray-500 mt-1">Last purchase cost from goods receipt</p>
                </div>
              </div>

              {/* Margin Display */}
              {formData.costPrice && formData.sellingPrice && (
                <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                  <div className="text-sm text-gray-700">
                    <strong>Profit Margin:</strong>{' '}
                    <span className="text-blue-600 font-semibold">
                      {calculateMargin(formData.costPrice, formData.sellingPrice)}%
                    </span>
                  </div>
                </div>
              )}

              {/* BR-PRC-001 Warning */}
              <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded">
                <p className="text-xs text-yellow-800">
                  <strong>⚠️ {BUSINESS_RULES.PRC_001}</strong>: Selling price must be greater than cost price
                </p>
              </div>

              {/* Inventory Snapshot */}
              <div className="border-t pt-4">
                <h4 className="font-medium text-gray-900 mb-3">Inventory Snapshot</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label htmlFor="quantity-on-hand" className="block text-sm font-medium text-gray-700 mb-1">
                      Quantity On Hand (Read-only)
                    </label>
                    <input
                      id="quantity-on-hand"
                      type="number"
                      step="0.01"
                      value={formData.quantityOnHand}
                      readOnly
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600"
                      placeholder="0"
                    />
                    <p className="text-xs text-gray-500 mt-1">Current stock from inventory</p>
                  </div>
                </div>
              </div>

              {/* Multi-Unit of Measure */}
              <div className="border-t pt-4">
                <div className="flex justify-between items-center mb-3">
                  <div>
                    <h4 className="font-medium text-gray-900">Multi-Unit of Measure</h4>
                    <p className="text-xs text-gray-500 mt-1">
                      Configure alternate units for this product with automatic conversion factors
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddUomClick}
                    className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    + Add Unit
                  </button>
                </div>

                {invalidUomIndexes.length > 0 && (
                  <div className="mb-3 p-3 rounded border border-yellow-300 bg-yellow-50 text-sm text-yellow-800 flex items-center justify-between gap-2">
                    <span>Some units are missing or invalid. Please select a valid unit for highlighted rows before saving.</span>
                    <button
                      type="button"
                      onClick={handleFixAllMissingUnits}
                      disabled={!masterUoms || masterUoms.length === 0}
                      className={`px-2.5 py-1 text-xs rounded border ${(!masterUoms || masterUoms.length === 0) ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' : 'bg-white text-yellow-900 border-yellow-300 hover:bg-yellow-100'}`}
                      title={(!masterUoms || masterUoms.length === 0) ? 'No master units available' : 'Autofill missing units'}
                      aria-label="Fix all missing units"
                    >
                      Fix all missing units
                    </button>
                  </div>
                )}

                {/* UoM List */}
                {productUoms.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Unit</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Symbol</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">Conversion</th>
                          <th className="px-3 py-2 text-center text-xs font-medium text-gray-700">Default</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {productUoms.map((uom, index) => {
                          const master = uom.uomId ? masterUomById[uom.uomId] : undefined;
                          const isInvalid = !master;
                          const name = master ? master.name : null;
                          const symbol = master ? (master.symbol ?? null) : null;
                          return (
                            <tr key={index} className={isInvalid ? 'bg-yellow-50' : 'hover:bg-gray-50'}>
                              <td className="px-3 py-2 text-gray-900">
                                {isInvalid ? (
                                  <button
                                    type="button"
                                    onClick={() => handleEditUomClick(index)}
                                    className="text-red-600 underline"
                                    title="Select a valid unit"
                                    aria-label="Select a valid unit of measure"
                                  >
                                    Select unit…
                                  </button>
                                ) : (
                                  <span>{name}{symbol ? ` (${symbol})` : ''}</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-gray-600">{symbol || '-'}</td>
                              <td className="px-3 py-2 text-right text-gray-900">
                                {parseFloat(uom.conversionFactor).toFixed(1)}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {uom.isDefault ? (
                                  <span className="inline-block px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded">
                                    Default
                                  </span>
                                ) : isInvalid ? (
                                  <span className="inline-block px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded" title="Select unit first">
                                    Set Default
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleSetDefaultUom(index)}
                                    className="text-xs text-blue-600 hover:underline"
                                  >
                                    Set Default
                                  </button>
                                )}
                              </td>
                              <td className="px-3 py-2 text-right space-x-2">
                                <button
                                  type="button"
                                  onClick={() => handleEditUomClick(index)}
                                  className="text-blue-600 hover:underline"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteUomClick(index)}
                                  className="text-red-600 hover:underline"
                                >
                                  Delete
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-6 bg-gray-50 rounded border border-dashed border-gray-300">
                    <p className="text-sm text-gray-500">No alternate units configured</p>
                    <p className="text-xs text-gray-400 mt-1">Click "Add Unit" to configure conversion factors</p>
                  </div>
                )}
              </div>

              {/* Status handled within shared ProductForm */}
            </div>

            {/* Modal Actions */}
            <div className="sticky bottom-0 bg-gray-50 px-6 py-4 border-t flex gap-3">
              <button
                onClick={() => {
                  setShowModal(false);
                  setFormData(initialFormData);
                  setValidationErrors({});
                  setApiError('');
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                disabled={createProductMutation.isPending || updateProductMutation.isPending}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={createProductMutation.isPending || updateProductMutation.isPending}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {(createProductMutation.isPending || updateProductMutation.isPending)
                  ? 'Saving...'
                  : modalMode === 'create' ? 'Create Product' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => { setShowDeleteConfirm(false); setProductToDelete(null); }}>
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-gray-900 mb-4">Confirm Delete</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete this product? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setProductToDelete(null);
                }}
                disabled={deleteProductMutation.isPending}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:bg-gray-100 disabled:cursor-not-allowed transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={deleteProductMutation.isPending}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {deleteProductMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product History Modal */}
      {showHistoryModal && selectedProductForHistory && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => { setShowHistoryModal(false); setSelectedProductForHistory(null); setHistoryFilters({}); }}>
          <div className="bg-white rounded-lg shadow-xl max-w-[95vw] sm:max-w-5xl w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center rounded-t-lg">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Product History</h3>
                <p className="text-sm text-gray-600 mt-1">{selectedProductName}</p>
              </div>
              <button
                onClick={() => {
                  setShowHistoryModal(false);
                  setSelectedProductForHistory(null);
                  setHistoryFilters({});
                }}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                ×
              </button>
            </div>

            {/* Filters */}
            <div className="px-6 py-4 bg-gray-50 border-b">
              {/* Quick type toggles */}
              <div className="flex flex-wrap items-center gap-2 mb-3" role="group" aria-label="History quick filters">
                <button
                  className={`px-3 py-1.5 text-xs rounded border ${!historyFilters.type ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'}`}
                  onClick={() => setHistoryFilters({ ...historyFilters, type: undefined })}
                >All</button>
                <button
                  className={`px-3 py-1.5 text-xs rounded border ${historyFilters.type === 'GOODS_RECEIPT' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'}`}
                  onClick={() => setHistoryFilters({ ...historyFilters, type: 'GOODS_RECEIPT' })}
                >Purchases</button>
                <button
                  className={`px-3 py-1.5 text-xs rounded border ${historyFilters.type === 'SALE' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'}`}
                  onClick={() => setHistoryFilters({ ...historyFilters, type: 'SALE' })}
                >Sales</button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="history-event-type" className="block text-sm font-medium text-gray-700 mb-1">
                    Event Type
                  </label>
                  <select
                    id="history-event-type"
                    value={historyFilters.type || ''}
                    onChange={(e) => setHistoryFilters({ ...historyFilters, type: e.target.value as ProductHistoryType || undefined })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="">All Types</option>
                    <option value="GOODS_RECEIPT">Goods Receipt</option>
                    <option value="SALE">Sale</option>
                    <option value="ADJUSTMENT_IN">Adjustment In</option>
                    <option value="ADJUSTMENT_OUT">Adjustment Out</option>
                    <option value="TRANSFER_IN">Transfer In</option>
                    <option value="TRANSFER_OUT">Transfer Out</option>
                    <option value="RETURN">Return</option>
                    <option value="DAMAGE">Damage</option>
                    <option value="EXPIRY">Expiry</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="history-start-date" className="block text-sm font-medium text-gray-700 mb-1">
                    Start Date
                  </label>
                  <DatePicker
                    value={historyFilters.startDate || ''}
                    onChange={(date) => setHistoryFilters({ ...historyFilters, startDate: date || undefined })}
                    placeholder="Start date"
                    maxDate={historyFilters.endDate ? new Date(historyFilters.endDate) : undefined}
                  />
                </div>
                <div>
                  <label htmlFor="history-end-date" className="block text-sm font-medium text-gray-700 mb-1">
                    End Date
                  </label>
                  <DatePicker
                    value={historyFilters.endDate || ''}
                    onChange={(date) => setHistoryFilters({ ...historyFilters, endDate: date || undefined })}
                    placeholder="End date"
                    minDate={historyFilters.startDate ? new Date(historyFilters.startDate) : undefined}
                  />
                </div>
              </div>
            </div>

            {/* Summary Stats */}
            {historyData?.summary && (
              <div className="px-6 py-4 bg-gradient-to-r from-blue-50 to-purple-50 border-b">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <div className="text-xs text-gray-600 font-medium">Total IN</div>
                    <div className="text-lg font-bold text-green-600">
                      {historyData.summary.totalInQuantity.toFixed(2)}
                    </div>
                    <div className="text-xs text-gray-500">
                      {formatCurrency(historyData.summary.totalInValue)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600 font-medium">Total OUT</div>
                    <div className="text-lg font-bold text-orange-600">
                      {historyData.summary.totalOutQuantity.toFixed(2)}
                    </div>
                    <div className="text-xs text-gray-500">
                      {formatCurrency(historyData.summary.totalOutValue)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600 font-medium">Net Change</div>
                    <div className={`text-lg font-bold ${historyData.summary.netQuantityChange >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                      {formatQuantityChange(historyData.summary.netQuantityChange)} ({Math.abs(historyData.summary.netQuantityChange).toFixed(2)})
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600 font-medium">Current Valuation</div>
                    <div className="text-lg font-bold text-blue-600">
                      {formatCurrency(historyData.summary.currentValuation || 0)}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* History Timeline */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {historyLoading && (
                <div className="text-center py-8 text-gray-500">
                  Loading history...
                </div>
              )}

              {historyError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                  <p className="text-red-800">Failed to load history</p>
                  <p className="text-sm text-red-600 mt-1">{getErrorMessage(historyError)}</p>
                </div>
              )}

              {historyData && historyData.items.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No history found for this product
                </div>
              )}

              {historyData && historyData.items.length > 0 && (
                <div className="space-y-3">
                  {historyData.items.map((item, idx) => {
                    const variant = getHistoryTypeVariant(item.type);
                    const expiring = isExpiringSoon(item.expiryDate);

                    return (
                      <div
                        key={idx}
                        className={`bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow border-l-4`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            {/* Type and Badges */}
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${variant.bgColor} ${variant.color}`}>
                                {variant.label}
                              </span>

                              {item.batchNumber && (
                                <span className="px-2 py-1 rounded text-xs font-medium bg-purple-100 text-purple-700">
                                  Batch: {item.batchNumber}
                                </span>
                              )}

                              {item.expiryDate && (
                                <span className={`px-2 py-1 rounded text-xs font-medium ${expiring ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                                  }`}>
                                  {expiring ? '⚠️ Expiring Soon' : `Exp: ${formatDisplayDate(item.expiryDate)}`}
                                </span>
                              )}
                            </div>

                            {/* Date */}
                            <div className="text-sm text-gray-600 mb-1">
                              {item.eventDate?.includes('T') ? `${formatDisplayDate(item.eventDate)} ${item.eventDate.split('T')[1].substring(0, 8)}` : formatDisplayDate(item.eventDate)}
                            </div>

                            {/* Reference */}
                            {item.reference && (
                              <div className="text-sm text-gray-700 mb-2">
                                {formatHistoryReference(item)}
                              </div>
                            )}

                            {/* Financial Details */}
                            <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                              {item.unitCost !== undefined && (
                                <div>Cost: {formatCurrency(item.unitCost)}</div>
                              )}
                              {item.unitPrice !== undefined && (
                                <div>Price: {formatCurrency(item.unitPrice)}</div>
                              )}
                              {item.averageCost !== undefined && (
                                <div>Avg Cost: {formatCurrency(item.averageCost)}</div>
                              )}
                              {item.runningValuation !== undefined && (
                                <div>Valuation: {formatCurrency(item.runningValuation)}</div>
                              )}
                            </div>

                            {/* Enhanced Details by Type */}
                            {item.reference && item.type === 'GOODS_RECEIPT' && (() => {
                              const defaultUom = selectedProductWithUom?.productUoms?.find((u: ProductUomRow) => u.isDefault);
                              const fallbackUom = defaultUom?.uomSymbol || defaultUom?.uomName || '';

                              return (
                                <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-gray-600">
                                  {item.reference.grStatus && (
                                    <div><span className="text-gray-500">GR Status:</span> {item.reference.grStatus}</div>
                                  )}
                                  {item.reference.receivedDate && (
                                    <div><span className="text-gray-500">Received:</span> {formatDisplayDate(item.reference.receivedDate)}</div>
                                  )}
                                  {typeof item.reference.orderedQuantity === 'number' && (
                                    <div><span className="text-gray-500">Ordered:</span> {item.reference.orderedQuantity}</div>
                                  )}
                                  {typeof item.quantityChange === 'number' && (
                                    <div><span className="text-gray-500">Received:</span> {item.quantityChange} {item.uomName || fallbackUom}</div>
                                  )}
                                  {typeof item.reference.poUnitPrice === 'number' && (
                                    <div><span className="text-gray-500">PO Unit:</span> {formatCurrency(item.reference.poUnitPrice)}</div>
                                  )}
                                  {typeof item.unitCost === 'number' && (
                                    <div><span className="text-gray-500">GR Unit:</span> {formatCurrency(item.unitCost)}</div>
                                  )}
                                  {typeof item.reference.qtyVariance === 'number' && item.reference.qtyVariance !== 0 && (
                                    <div className={`${item.reference.qtyVariance > 0 ? 'text-orange-700' : 'text-green-700'}`}>
                                      <span className="text-gray-500">Qty Var:</span> {formatQuantityChange(item.reference.qtyVariance)}
                                    </div>
                                  )}
                                  {typeof item.reference.costVariance === 'number' && item.reference.costVariance !== 0 && (
                                    <div className={`${item.reference.costVariance > 0 ? 'text-orange-700' : 'text-green-700'}`}>
                                      <span className="text-gray-500">Cost Var:</span> {formatCurrency(item.reference.costVariance)}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}

                            {item.reference && item.type === 'SALE' && (
                              <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-gray-600">
                                {item.reference.saleStatus && (
                                  <div><span className="text-gray-500">Status:</span> {item.reference.saleStatus}</div>
                                )}
                                {item.reference.paymentMethod && (
                                  <div><span className="text-gray-500">Method:</span> {item.reference.paymentMethod}</div>
                                )}
                                {typeof item.reference.totalAmount === 'number' && (
                                  <div><span className="text-gray-500">Total:</span> {formatCurrency(item.reference.totalAmount)}</div>
                                )}
                                {typeof item.reference.paymentReceived === 'number' && (
                                  <div><span className="text-gray-500">Paid:</span> {formatCurrency(item.reference.paymentReceived)}</div>
                                )}
                                {typeof item.reference.changeAmount === 'number' && (
                                  <div><span className="text-gray-500">Change:</span> {formatCurrency(item.reference.changeAmount)}</div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Quantity Display */}
                          {(() => {
                            const defaultUom = selectedProductWithUom?.productUoms?.find((u: ProductUomRow) => u.isDefault);
                            const fallbackUom = defaultUom?.uomSymbol || defaultUom?.uomName || '';

                            return (
                              <div className="text-right ml-4">
                                <div className={`text-xl font-bold ${item.quantityChange >= 0 ? 'text-green-600' : 'text-orange-600'
                                  }`}>
                                  {formatQuantityChange(item.quantityChange)} {item.uomName || fallbackUom}
                                </div>
                                {item.runningQuantity !== undefined && (
                                  <div className="text-sm text-gray-500">
                                    Balance: {item.runningQuantity} {item.uomName || fallbackUom}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Pagination Info */}
              {historyData?.pagination && historyData.pagination.total > 0 && (
                <div className="mt-4 text-center text-sm text-gray-600">
                  Showing {historyData.items.length} of {historyData.pagination.total} events
                  {historyData.pagination.totalPages > 1 && (
                    <span> (Page {historyData.pagination.page} of {historyData.pagination.totalPages})</span>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-gray-50 px-6 py-4 border-t rounded-b-lg">
              <button
                onClick={() => {
                  setShowHistoryModal(false);
                  setSelectedProductForHistory(null);
                  setHistoryFilters({});
                }}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* UoM Add/Edit Modal */}
      {showAddUomForm && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={handleCancelUom}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-[95vw] sm:max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="uom-modal-title"
          >
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b px-6 py-4 rounded-t-lg z-10">
              <h3 id="uom-modal-title" className="text-lg font-semibold text-gray-900">
                {editingUomIndex !== null ? 'Edit Unit of Measure' : 'Add Unit of Measure'}
              </h3>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Unit <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={uomFormData.uomId}
                    onChange={(e) => setUomFormData({ ...uomFormData, uomId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    aria-label="Select unit of measure"
                  >
                    <option value="">Select unit...</option>
                    {masterUoms
                      .filter(m => !productUoms.some((p, i) => p.uomId === m.id && i !== editingUomIndex))
                      .map(m => (
                        <option key={m.id} value={m.id}>
                          {m.name} {m.symbol ? `(${m.symbol})` : ''}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Conversion Factor <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={uomFormData.conversionFactor}
                    onChange={(e) => setUomFormData({ ...uomFormData, conversionFactor: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="1.0"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    How many base units = 1 of this unit
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cost Override (optional)
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={uomFormData.costOverride || ''}
                    onChange={(e) => setUomFormData({ ...uomFormData, costOverride: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Leave blank for auto-calc"
                  />
                  {uomFormData.costOverride && parseFloat(uomFormData.costOverride) > 0 && (
                    <p className="text-xs text-orange-600 font-medium mt-1">
                      ⚠️ Override active - Auto-calculation (below) will be ignored!
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Price Override (optional)
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={uomFormData.priceOverride || ''}
                    onChange={(e) => setUomFormData({ ...uomFormData, priceOverride: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Leave blank for auto-calc"
                  />
                </div>
              </div>

              {/* MUoM auto-calculation preview */}
              {(() => {
                const baseCost = parseFloat(formData.costPrice || '0') || 0;
                const factor = parseFloat(uomFormData.conversionFactor || '0');
                const selling = parseFloat(formData.sellingPrice || '0') || 0;
                const defaultMultiplier = baseCost > 0 && selling > 0
                  ? selling / baseCost
                  : 1.25; // fallback 25% markup
                if (!baseCost || !factor || factor <= 0) return null;

                // Get base UOM name from first productUom or use 'UNIT' fallback
                const baseUomName = productUoms[0]?.uomName || 'UNIT';

                const result = computeUomPrices({
                  baseCost,
                  baseUomName,
                  units: [{ name: 'UNIT', factor }],
                  defaultMultiplier,
                  currencyDecimals: 0,
                });
                const row = result.rows[0];
                const markupPct = Math.round((row.usedMultiplier - 1) * 100);
                return (
                  <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded">
                    <div className="text-xs text-gray-600">
                      <span className="font-medium">Auto cost:</span> {formatCurrency(row.unitCost)}
                    </div>
                    <div className="text-xs text-gray-600">
                      <span className="font-medium">Auto price:</span> {formatCurrency(row.sellingPrice)}{' '}
                      <span className="text-gray-500">(markup {markupPct}%)</span>
                    </div>
                    <div className="text-[11px] text-gray-500 mt-1">
                      Uses base {baseUomName} cost × factor ({parseFloat(factor.toString()).toFixed(1)}). Override fields above take precedence.
                    </div>
                  </div>
                );
              })()}

              <div className="mt-4 flex items-center gap-2">
                <input
                  id="uom-default"
                  type="checkbox"
                  checked={uomFormData.isDefault}
                  onChange={(e) => setUomFormData({ ...uomFormData, isDefault: e.target.checked })}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="uom-default" className="text-sm text-gray-700">
                  Set as default unit for this product
                </label>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-gray-50 px-6 py-4 border-t flex gap-3 rounded-b-lg">
              <button
                type="button"
                onClick={handleCancelUom}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveUom}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                {editingUomIndex !== null ? 'Update' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


