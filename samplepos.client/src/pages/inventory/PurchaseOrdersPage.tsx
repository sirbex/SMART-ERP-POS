import { useState, useMemo } from 'react';
import {
  usePurchaseOrders,
  useCreatePurchaseOrder,
  useSubmitPurchaseOrder,
  useCancelPurchaseOrder,
  useDeletePurchaseOrder,
  useSendPOToSupplier,
} from '../../hooks/usePurchaseOrders';
import { useSuppliers } from '../../hooks/useSuppliers';
import { useProducts } from '../../hooks/useProducts';
import { formatCurrency } from '../../utils/currency';
import { useAuth } from '../../hooks/useAuth';
import { api } from '../../utils/api';
import { handleApiError } from '../../utils/errorHandler';
import { DocumentFlowButton } from '../../components/shared/DocumentFlowButton';
import Decimal from 'decimal.js';
import { UomSelector } from '../../components/inventory/UomSelector';
import { computeUnitCost, convertQtyToBase, convertCostToBase } from '../../utils/uom';
import { DatePicker } from '../../components/ui/date-picker';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Product, Supplier } from '../../types';
import {
  SupplierSelector,
  NotesField,
  ProductSearchBar,
  BusinessRulesInfo,
  TotalsSummary,
  ModalHeader,
  ModalFooter,
  ModalContainer,
  PURCHASE_ORDER_RULES,
} from '../../components/inventory/shared';

// Configure Decimal for financial calculations
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// PO Status with colors
const PO_STATUSES = {
  DRAFT: { label: 'Draft', color: 'bg-gray-100 text-gray-800', icon: '📝' },
  PENDING: { label: 'Pending', color: 'bg-yellow-100 text-yellow-800', icon: '⏳' },
  APPROVED: { label: 'Approved', color: 'bg-blue-100 text-blue-800', icon: '✓' },
  COMPLETED: { label: 'Completed', color: 'bg-green-100 text-green-800', icon: '✅' },
  CANCELLED: { label: 'Cancelled', color: 'bg-red-100 text-red-800', icon: '❌' },
} as const;

type POStatus = keyof typeof PO_STATUSES;

interface POLineItem {
  id: string;
  productId: string;
  productName: string;
  quantity: string;
  unitCost: string;
  // Optional selected UoM tracking (for display and future conversions)
  selectedUomId?: string | null;
}

/** UoM option for a product */
interface ProductUom {
  id: string;
  uomName?: string;
  conversionFactor: number | string;
  isDefault: boolean;
  costOverride?: number | string | null;
}

/** Product with optional UoM data from API */
interface ProductWithUoms extends Product {
  product_uoms?: ProductUom[];
  productUoms?: ProductUom[];
}

/** PO row — supports both snake_case (raw API) and camelCase (mapped) fields */
interface PORow {
  id: string;
  status: string;
  poNumber?: string;
  order_number?: string;
  orderDate?: string;
  order_date?: string;
  expectedDelivery?: string;
  expected_delivery_date?: string;
  totalAmount?: number | string;
  total_amount?: number | string;
  supplierName?: string;
  supplier_name?: string;
  supplierContact?: string;
  supplierId?: string;
  createdBy?: string;
  created_by_id?: string;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
  sentDate?: string;
  sent_date?: string;
  notes?: string;
  items?: POItemRow[];
}

/** Shape of the data returned when sending a PO to supplier */
interface SendToSupplierData {
  goodsReceipt?: {
    receiptNumber?: string;
    [key: string]: unknown;
  };
}

/** Shape of PO detail response */
interface PODetailData {
  po?: PORow;
  items?: POItemRow[];
  [key: string]: unknown;
}

/** PO line item — supports both snake_case and camelCase fields */
interface POItemRow {
  id?: string;
  productName?: string;
  product_name?: string;
  purchaseOrderId?: string;
  purchase_order_id?: string;
  productId?: string;
  product_id?: string;
  quantity?: number | string;
  ordered_quantity?: number | string;
  unitCost?: number | string;
  unit_price?: number | string;
  receivedQuantity?: number | string;
  received_quantity?: number | string;
  totalPrice?: number | string;
  total_price?: number | string;
  totalCost?: number | string;
  uomName?: string;
  uom_name?: string;
  notes?: string;
}

// Row component to handle UoM selection per product
function LineItemRow({
  item,
  onUpdate,
  onRemove,
  disabled,
  product,
}: {
  item: POLineItem;
  onUpdate: (id: string, field: keyof POLineItem, value: string) => void;
  onRemove: (id: string) => void;
  disabled: boolean;
  product: Product | undefined;
}) {
  // Compute line total
  let lineTotal = new Decimal(0);
  try {
    lineTotal = new Decimal(item.quantity || 0).times(new Decimal(item.unitCost || 0));
  } catch { }

  const handleUomChange = (params: {
    uomId: string | null;
    newCost: string;
    conversionFactor: string;
    uomName: string;
  }) => {
    onUpdate(item.id, 'unitCost', params.newCost);
    onUpdate(item.id, 'selectedUomId', params.uomId || '');
  };

  return (
    <tr>
      <td className="px-4 py-3 text-sm text-gray-900">
        <div className="flex flex-col gap-1">
          <div className="font-medium">{item.productName}</div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-600">UOM:</span>
            <UomSelector
              productId={product?.id ?? ''}
              baseCost={product ? String(product.costPrice) : '0'}
              selectedUomId={item.selectedUomId}
              disabled={disabled}
              onChange={handleUomChange}
              className="px-2 py-1 text-xs border border-blue-300 rounded bg-blue-50 hover:border-blue-500 focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <input
          type="number"
          value={item.quantity}
          onChange={(e) => onUpdate(item.id, 'quantity', e.target.value)}
          step="0.01"
          min="0.01"
          className="w-full px-2 py-1 text-right border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="0"
          disabled={disabled}
        />
      </td>
      <td className="px-4 py-3">
        <input
          type="number"
          value={item.unitCost}
          onChange={(e) => onUpdate(item.id, 'unitCost', e.target.value)}
          step="0.01"
          min="0"
          className="w-full px-2 py-1 text-right border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="0.00"
          disabled={disabled}
        />
      </td>
      <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">
        {formatCurrency(lineTotal.toNumber())}
      </td>
      <td className="px-4 py-3 text-center">
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          className="text-red-600 hover:text-red-900"
          title="Remove item"
          disabled={disabled}
        >
          🗑️
        </button>
      </td>
    </tr>
  );
}

// Create PO Modal Component
interface CreatePOModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

function CreatePOModal({ onClose, onSuccess }: CreatePOModalProps) {
  const { user } = useAuth();
  const [supplierId, setSupplierId] = useState('');
  const [expectedDelivery, setExpectedDelivery] = useState('');
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState<POLineItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: productsData } = useProducts();
  const createPOMutation = useCreatePurchaseOrder();

  // Extract products
  const allProducts = useMemo(() => {
    if (!productsData) return [];
    if (productsData.data && Array.isArray(productsData.data)) return productsData.data;
    return Array.isArray(productsData) ? productsData : [];
  }, [productsData]);

  // Calculate totals with Decimal.js precision
  const totals = useMemo(() => {
    let subtotal = new Decimal(0);
    let itemCount = 0;

    lineItems.forEach((item) => {
      try {
        const qty = new Decimal(item.quantity || 0);
        const cost = new Decimal(item.unitCost || 0);
        subtotal = subtotal.plus(qty.times(cost));
        itemCount++;
      } catch (error) {
        // Invalid number, skip
      }
    });

    return {
      subtotal: subtotal.toNumber(),
      itemCount,
      avgCost: itemCount > 0 ? subtotal.div(itemCount).toNumber() : 0,
    };
  }, [lineItems]);

  // Add line item
  const addLineItem = (product: ProductWithUoms) => {
    // Odoo/SAP pattern: auto-select default purchase UOM, or first UOM with factor > 1
    const productUoms = product.product_uoms || product.productUoms || [];
    const defaultUom = productUoms.find((u: ProductUom) => u.isDefault) ||
      productUoms.find((u: ProductUom) => parseFloat(String(u.conversionFactor || 1)) > 1);

    let initialCost = new Decimal(product.costPrice || 0).toFixed(2);
    let selectedUom = null;

    // Cost = baseCost × factor (or costOverride if set)
    if (defaultUom && parseFloat(String(defaultUom.conversionFactor)) > 1) {
      selectedUom = defaultUom.id;
      initialCost = computeUnitCost(
        parseFloat(String(product.costPrice || 0)),
        defaultUom.conversionFactor,
        defaultUom.costOverride,
      );
    }

    const newItem: POLineItem = {
      id: `temp-${Date.now()}-${Math.random()}`,
      productId: product.id,
      productName: product.name,
      quantity: '1',
      unitCost: initialCost,
      selectedUomId: selectedUom,
    };
    setLineItems([...lineItems, newItem]);
  };

  // Update line item
  const updateLineItem = (id: string, field: keyof POLineItem, value: string) => {
    setLineItems((prevItems) => {
      const updated = prevItems.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      );
      return updated;
    });
  };

  // Remove line item
  const removeLineItem = (id: string) => {
    setLineItems(lineItems.filter((item) => item.id !== id));
  };

  // Validate form
  const validateForm = (): string | null => {
    // BR-PO-001: Supplier required
    if (!supplierId) {
      return 'BR-PO-001: Please select a supplier';
    }

    // BR-PO-002: At least one line item required
    if (lineItems.length === 0) {
      return 'BR-PO-002: Purchase order must have at least one line item';
    }

    // BR-PO-003: Expected delivery date validation
    if (expectedDelivery) {
      const deliveryDate = new Date(expectedDelivery);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (deliveryDate <= today) {
        return 'BR-PO-005: Expected delivery date must be in the future';
      }
    }

    // Validate each line item
    for (const item of lineItems) {
      // Quantity validation
      try {
        const qty = new Decimal(item.quantity);
        if (qty.lte(0)) {
          return `BR-INV-002: ${item.productName} - Quantity must be positive`;
        }
      } catch (error) {
        return `${item.productName} - Invalid quantity format`;
      }

      // Unit cost validation
      try {
        const cost = new Decimal(item.unitCost);
        if (cost.lt(0)) {
          return `BR-PO-004: ${item.productName} - Unit cost cannot be negative`;
        }
      } catch (error) {
        return `${item.productName} - Invalid unit cost format`;
      }
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationError = validateForm();
    if (validationError) {
      alert(validationError);
      return;
    }

    if (!user?.id) {
      alert('User not authenticated');
      return;
    }

    setIsSubmitting(true);

    try {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');

      const poData = {
        supplierId,
        orderDate: `${yyyy}-${mm}-${dd}`,
        expectedDate: expectedDelivery || undefined,
        notes: notes || undefined,
        createdBy: user.id,
        items: await Promise.all(
          lineItems.map(async (item) => {
            // Convert quantity to base units if UoM is selected
            let baseQuantity = parseFloat(item.quantity);
            let baseUnitCost = parseFloat(item.unitCost);

            if (item.selectedUomId) {
              // Fetch UoM data to get conversion factor
              const product = allProducts.find((p: Product) => p.id === item.productId);
              if (product) {
                try {
                  const response = await fetch(`/api/products/${product.id}?includeUoms=true`, {
                    headers: {
                      Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
                    },
                  });
                  const json = await response.json();
                  if (json.success) {
                    const uom = json.data.uoms?.find(
                      (u: ProductUom) => u.id === item.selectedUomId
                    );
                    if (uom) {
                      // Convert: quantity × conversionFactor = base quantity
                      baseQuantity = parseFloat(
                        convertQtyToBase(item.quantity, uom.conversionFactor)
                      );
                      // Convert: unit cost ÷ conversionFactor = base unit cost
                      baseUnitCost = parseFloat(
                        convertCostToBase(item.unitCost, uom.conversionFactor)
                      );
                    }
                  }
                } catch (err) {
                  console.error('Failed to fetch UoM for conversion:', err);
                }
              }
            }

            return {
              productId: item.productId,
              productName: item.productName,
              quantity: baseQuantity,
              unitCost: baseUnitCost,
              uomId: item.selectedUomId || null,
            };
          })
        ),
      };

      await createPOMutation.mutateAsync(poData);
      alert('Purchase Order created successfully!');
      onSuccess();
      onClose();
    } catch (error: unknown) {
      console.error('PO creation error:', error);
      handleApiError(error, { fallback: 'Failed to create purchase order' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalContainer>
      <ModalHeader
        title="Create Purchase Order"
        description="Add products and specify quantities for this order"
        onClose={onClose}
      />

      <form onSubmit={handleSubmit}>
        {/* Header Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Supplier Selection */}
          <SupplierSelector value={supplierId} onChange={setSupplierId} disabled={isSubmitting} />

          {/* Expected Delivery Date */}
          <div>
            <label
              htmlFor="expectedDelivery"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Expected Delivery Date
            </label>
            <DatePicker
              value={expectedDelivery}
              onChange={(date) => setExpectedDelivery(date)}
              placeholder="Select expected delivery date"
              minDate={new Date(Date.now() + 86400000)}
              disabled={isSubmitting}
            />
            <p className="mt-1 text-xs text-gray-500">BR-PO-005: Must be future date</p>
          </div>
        </div>

        {/* Notes */}
        <NotesField
          value={notes}
          onChange={setNotes}
          disabled={isSubmitting}
          placeholder="Optional notes about this purchase order..."
          className="mb-6"
        />

        {/* Line Items Section */}
        <div className="mb-6 border border-gray-300 rounded-lg p-4">
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-sm font-semibold text-gray-900">
              Line Items <span className="text-red-500">*</span>
            </h4>
            <div className="text-xs text-gray-600">BR-PO-002: At least one item required</div>
          </div>

          {/* Product Search/Add */}
          <ProductSearchBar
            onProductSelect={(p) => addLineItem(p as unknown as ProductWithUoms)}
            disabled={isSubmitting}
            className="mb-4"
          />

          {/* Line Items Table */}
          {lineItems.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Product
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase w-32">
                      Quantity
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase w-40">
                      Unit Cost
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase w-40">
                      Line Total
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase w-20">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {lineItems.map((item) => {
                    const product = allProducts.find((p: Product) => p.id === item.productId);
                    return (
                      <LineItemRow
                        key={item.id}
                        item={item}
                        onUpdate={updateLineItem}
                        onRemove={removeLineItem}
                        disabled={isSubmitting}
                        product={product}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
              No line items added yet. Search and add products above.
            </div>
          )}

          {/* Totals Summary */}
          {lineItems.length > 0 && (
            <TotalsSummary
              itemCount={totals.itemCount}
              subtotal={totals.subtotal}
              avgCost={totals.avgCost}
              className="mt-4 pt-4 border-t border-gray-200"
            />
          )}
        </div>

        {/* Business Rules Info */}
        <BusinessRulesInfo rules={PURCHASE_ORDER_RULES} className="mb-6" />

        {/* Form Actions */}
        <ModalFooter
          onCancel={onClose}
          onSubmit={() =>
            handleSubmit(new Event('submit') as unknown as React.FormEvent<HTMLFormElement>)
          }
          submitLabel="Create Purchase Order"
          isSubmitting={isSubmitting}
          submitDisabled={lineItems.length === 0}
        />
      </form>
    </ModalContainer>
  );
}

export default function PurchaseOrdersPage() {
  // State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedPO, setSelectedPO] = useState<PORow | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<POStatus | 'ALL'>('ALL');
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;

  // API queries
  const {
    data: posData,
    isLoading,
    error,
    refetch,
  } = usePurchaseOrders({
    page,
    limit,
    status: selectedStatus !== 'ALL' ? selectedStatus : undefined,
    supplierId: selectedSupplier || undefined,
  });

  const { data: suppliersData } = useSuppliers();
  const submitPOMutation = useSubmitPurchaseOrder();
  const sendToSupplierMutation = useSendPOToSupplier();
  const cancelPOMutation = useCancelPurchaseOrder();
  const deletePOMutation = useDeletePurchaseOrder();

  // Helper to map snake_case DB columns to camelCase
  const mapPOFromDB = (po: PORow): PORow => ({
    ...po,
    poNumber: po.order_number || po.poNumber,
    orderDate: po.order_date || po.orderDate,
    expectedDelivery: po.expected_delivery_date || po.expectedDelivery,
    totalAmount: po.total_amount || po.totalAmount,
    supplierName: po.supplier_name || po.supplierName,
    createdBy: po.created_by_id || po.createdBy,
    createdAt: po.created_at || po.createdAt,
    updatedAt: po.updated_at || po.updatedAt,
    sentDate: po.sent_date || po.sentDate,
  });

  // Extract data
  const purchaseOrders = useMemo(() => {
    if (!posData) return [];
    const rawData =
      posData.data && Array.isArray(posData.data)
        ? posData.data
        : Array.isArray(posData)
          ? posData
          : [];

    // Map and deduplicate by ID to prevent duplicate display
    const mapped = rawData.map(mapPOFromDB);
    const seen = new Set();
    return mapped.filter((po: PORow) => {
      if (seen.has(po.id)) {
        console.warn(`Duplicate PO detected and filtered: ${po.id}`);
        return false;
      }
      seen.add(po.id);
      return true;
    });
  }, [posData]);

  const suppliers = useMemo(() => {
    if (!suppliersData) return [];
    if (suppliersData.data && Array.isArray(suppliersData.data)) return suppliersData.data;
    return Array.isArray(suppliersData) ? suppliersData : [];
  }, [suppliersData]);

  // Calculate statistics - exclude cancelled POs from totals
  const stats = useMemo(() => {
    const total = purchaseOrders.length;
    const draft = purchaseOrders.filter((po: PORow) => po.status === 'DRAFT').length;
    const pending = purchaseOrders.filter((po: PORow) => po.status === 'PENDING').length;
    const completed = purchaseOrders.filter((po: PORow) => po.status === 'COMPLETED').length;
    const cancelled = purchaseOrders.filter((po: PORow) => po.status === 'CANCELLED').length;

    // Only include non-cancelled POs in total value calculation
    let totalValue = new Decimal(0);
    purchaseOrders.forEach((po: PORow) => {
      if (po.status !== 'CANCELLED') {
        totalValue = totalValue.plus(new Decimal(po.totalAmount || 0));
      }
    });

    return { total, draft, pending, completed, cancelled, totalValue: totalValue.toNumber() };
  }, [purchaseOrders]);

  // Handle submit PO - automatically sends to supplier and creates goods receipt
  const handleSubmitPO = async (id: string) => {
    if (
      !confirm(
        'Submit this purchase order?\n\nThis will:\n• Submit PO for approval\n• Send to supplier\n• Create goods receipt draft for receiving department'
      )
    )
      return;
    try {
      // First submit the PO
      await submitPOMutation.mutateAsync(id);

      // Then automatically send to supplier (creates goods receipt)
      const result = await sendToSupplierMutation.mutateAsync(id);
      const resultData = result?.data as SendToSupplierData | undefined;
      const grNumber = resultData?.goodsReceipt?.receiptNumber || 'GR-XXXX-XXXX';

      alert(
        `✅ Purchase Order submitted and sent to supplier!\n\nGoods Receipt ${grNumber} created for receiving department.\n\nNext: Receiving department will confirm quantities when delivery arrives.`
      );
      refetch();
    } catch (error: unknown) {
      handleApiError(error, { fallback: 'Failed to submit purchase order' });
    }
  };

  // Handle cancel PO
  const handleCancelPO = async (id: string) => {
    if (!confirm('Cancel this purchase order? This action cannot be undone.')) return;
    try {
      await cancelPOMutation.mutateAsync(id);
      alert('Purchase order cancelled');
    } catch (error) {
      handleApiError(error, { fallback: 'Failed to cancel purchase order' });
    }
  };

  // Handle delete PO
  const handleDeletePO = async (id: string) => {
    if (!confirm('Delete this draft purchase order? This action cannot be undone.')) return;
    try {
      await deletePOMutation.mutateAsync(id);
      alert('Purchase order deleted');
    } catch (error: unknown) {
      handleApiError(error, { fallback: 'Failed to delete purchase order' });
    }
  };

  // Handle view details - fetch full PO with items
  const handleViewDetails = async (po: PORow) => {
    try {
      // Fetch full PO details with items
      const response = await api.purchaseOrders.getById(po.id);
      console.log('API Response:', response);

      // Response structure: { data: { success: true, data: { po: {...}, items: [...] } } }
      const apiData = response.data;
      console.log('API Data:', apiData);

      // Extract the nested data object
      const responseData = (apiData.data || apiData) as PODetailData;
      console.log('Response Data:', responseData);

      const poData = responseData.po || responseData;
      const items = responseData.items || [];

      console.log('PO Data:', poData);
      console.log('Items:', items);

      // Map items from snake_case to camelCase
      const mappedItems = items.map((item: POItemRow) => ({
        ...item,
        productName: item.product_name || item.productName,
        purchaseOrderId: item.purchase_order_id || item.purchaseOrderId,
        productId: item.product_id || item.productId,
        quantity: item.ordered_quantity || item.quantity,
        unitCost: item.unit_price || item.unitCost,
        receivedQuantity: item.received_quantity || item.receivedQuantity,
        totalPrice: item.total_price || item.totalPrice,
      }));

      const finalPO = {
        ...mapPOFromDB(poData as PORow),
        items: mappedItems,
      };

      console.log('Final PO:', finalPO);

      setSelectedPO(finalPO);
      setShowDetailsModal(true);
    } catch (error: unknown) {
      console.error('Error loading PO details:', error);
      handleApiError(error, { fallback: 'Failed to load purchase order details' });
    }
  };

  // Format date safely
  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return '-';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return '-';
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return '-';
    }
  };

  // Export Purchase Order to PDF
  const handleExportPDF = (po: PORow | null) => {
    if (!po) return;

    const doc = new jsPDF();
    // Use shared formatCurrency for PDF — consistent UGX formatting
    const formatCurrencyPDF = (amount: number) => formatCurrency(amount, true, 2);

    // Title
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('PURCHASE ORDER', 105, 20, { align: 'center' });

    // PO Number
    doc.setFontSize(14);
    doc.setFont('helvetica', 'normal');
    doc.text(po.poNumber || 'N/A', 105, 30, { align: 'center' });

    // Status Badge
    doc.setFontSize(10);
    const statusLabel = PO_STATUSES[po.status as POStatus]?.label || po.status;
    doc.text(`Status: ${statusLabel}`, 105, 38, { align: 'center' });

    // Line separator
    doc.setDrawColor(200, 200, 200);
    doc.line(15, 45, 195, 45);

    let yPos = 55;

    // Supplier Information
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('SUPPLIER', 15, yPos);
    yPos += 7;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(po.supplierName || 'N/A', 15, yPos);
    if (po.supplierContact) {
      yPos += 5;
      doc.text(`Contact: ${po.supplierContact}`, 15, yPos);
    }

    // Order Details (right side)
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('ORDER DETAILS', 110, 55);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Order Date: ${formatDate(po.orderDate)}`, 110, 62);
    doc.text(`Expected Delivery: ${formatDate(po.expectedDelivery)}`, 110, 69);

    yPos = Math.max(yPos + 15, 85);

    // Notes if present
    if (po.notes) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Notes:', 15, yPos);
      doc.setFont('helvetica', 'normal');
      const splitNotes = doc.splitTextToSize(po.notes, 180);
      doc.text(splitNotes, 15, yPos + 5);
      yPos += 5 + splitNotes.length * 5 + 10;
    }

    // Line Items Table
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('LINE ITEMS', 15, yPos);
    yPos += 5;

    if (po.items && po.items.length > 0) {
      const itemTableData = po.items.map((item: POItemRow) => {
        const quantity = new Decimal(item.quantity || 0);
        const unitCost = new Decimal(item.unitCost || 0);
        const total = quantity.times(unitCost);

        return [
          item.productName || 'N/A',
          quantity.toString(),
          item.uomName || item.uom_name || 'Base UoM',
          formatCurrencyPDF(unitCost.toNumber()),
          formatCurrencyPDF(total.toNumber()),
        ];
      });

      autoTable(doc, {
        startY: yPos,
        head: [['Product', 'Quantity', 'UOM', 'Unit Cost', 'Total']],
        body: itemTableData,
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [60, 60, 60], textColor: 255, fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 60 },
          1: { cellWidth: 25, halign: 'right' },
          2: { cellWidth: 30 },
          3: { cellWidth: 35, halign: 'right' },
          4: { cellWidth: 35, halign: 'right' },
        },
        margin: { left: 15, right: 15 },
      });

      yPos = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
    } else {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'italic');
      doc.text('No line items', 15, yPos + 5);
      yPos += 15;
    }

    // Total Amount
    doc.setDrawColor(200, 200, 200);
    doc.line(120, yPos, 195, yPos);
    yPos += 8;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL AMOUNT:', 120, yPos);
    doc.text(formatCurrencyPDF(new Decimal(po.totalAmount || 0).toNumber()), 195, yPos, {
      align: 'right',
    });

    // Footer
    yPos += 20;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(128, 128, 128);
    doc.text(`Generated on ${new Date().toLocaleString()}`, 15, yPos);
    doc.text(
      `Created: ${formatDate(po.createdAt)} | Updated: ${formatDate(po.updatedAt)}`,
      15,
      yPos + 5
    );

    // Save PDF
    doc.save(`PurchaseOrder_${po.poNumber || 'Unknown'}.pdf`);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="p-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-blue-800">Loading purchase orders...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Failed to load purchase orders. Please try again.</p>
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
          <h2 className="text-2xl font-bold text-gray-900">Purchase Orders</h2>
          <p className="text-gray-600 mt-1">Manage supplier orders with full workflow tracking</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          ➕ Create PO
        </button>
      </div>

      {/* Summary Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">Total POs</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">Draft</div>
          <div className="text-2xl font-bold text-gray-600 mt-1">{stats.draft}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">Pending</div>
          <div className="text-2xl font-bold text-yellow-600 mt-1">{stats.pending}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">Completed</div>
          <div className="text-2xl font-bold text-green-600 mt-1">{stats.completed}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">Cancelled</div>
          <div className="text-2xl font-bold text-red-600 mt-1">{stats.cancelled}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">Total Value</div>
          <div className="text-xs text-gray-500 mb-1">(excl. cancelled)</div>
          <div className="text-2xl font-bold text-blue-600">{formatCurrency(stats.totalValue)}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Status Filter */}
          <div>
            <label htmlFor="status-filter" className="block text-sm font-medium text-gray-700 mb-2">
              Status
            </label>
            <select
              id="status-filter"
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value as POStatus | 'ALL');
                setPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="ALL">All Statuses</option>
              {Object.entries(PO_STATUSES).map(([key, { label, icon }]) => (
                <option key={key} value={key}>
                  {icon} {label}
                </option>
              ))}
            </select>
          </div>

          {/* Supplier Filter */}
          <div>
            <label
              htmlFor="supplier-filter"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Supplier
            </label>
            <select
              id="supplier-filter"
              value={selectedSupplier}
              onChange={(e) => {
                setSelectedSupplier(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All Suppliers</option>
              {suppliers.map((supplier: Supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div className="flex items-end gap-2">
            <button
              onClick={() => {
                setSelectedStatus('ALL');
                setSelectedSupplier('');
                setPage(1);
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Clear Filters
            </button>
            <button
              onClick={() => refetch()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              🔄 Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Purchase Orders Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {/* Mobile Card View */}
        <div className="block sm:hidden space-y-3 p-3">
          {purchaseOrders.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {selectedStatus !== 'ALL' || selectedSupplier
                ? 'No purchase orders match your filters'
                : 'No purchase orders yet. Create your first PO to get started!'}
            </div>
          ) : (
            purchaseOrders.map((po: PORow) => {
              const statusConfig = PO_STATUSES[po.status as POStatus] || PO_STATUSES.DRAFT;
              const totalAmount = new Decimal(po.totalAmount || 0);
              return (
                <div key={po.id} className="border border-gray-200 rounded-lg p-4" onClick={() => handleViewDetails(po)}>
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="text-sm font-semibold text-blue-600">{po.poNumber}</div>
                      <div className="text-xs text-gray-600">{po.supplierName}</div>
                    </div>
                    <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${statusConfig.color}`}>
                      {statusConfig.icon} {statusConfig.label}
                    </span>
                  </div>
                  <div className="flex justify-between items-center mb-2">
                    <div className="text-xs text-gray-500">Ordered: {formatDate(po.orderDate)}</div>
                    <div className="text-base font-bold text-gray-900">{formatCurrency(totalAmount.toNumber())}</div>
                  </div>
                  <div className="text-xs text-gray-500 mb-2">Delivery: {formatDate(po.expectedDelivery)}</div>
                  <div className="flex gap-3 border-t border-gray-100 pt-2">
                    {po.status === 'DRAFT' && (
                      <>
                        <button onClick={(e) => { e.stopPropagation(); handleSubmitPO(po.id); }} className="text-xs text-blue-600 font-medium">Submit</button>
                        <button onClick={(e) => { e.stopPropagation(); handleDeletePO(po.id); }} className="text-xs text-red-600 font-medium">Delete</button>
                      </>
                    )}
                    {(po.status === 'PENDING' || po.status === 'APPROVED') && (
                      <button onClick={(e) => { e.stopPropagation(); handleCancelPO(po.id); }} className="text-xs text-orange-600 font-medium">Cancel</button>
                    )}
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
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  PO Number
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Supplier
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Order Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Expected Delivery
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total Amount
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {purchaseOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                    {selectedStatus !== 'ALL' || selectedSupplier
                      ? 'No purchase orders match your filters'
                      : 'No purchase orders yet. Create your first PO to get started!'}
                  </td>
                </tr>
              ) : (
                purchaseOrders.map((po: PORow) => {
                  const statusConfig = PO_STATUSES[po.status as POStatus] || PO_STATUSES.DRAFT;
                  const totalAmount = new Decimal(po.totalAmount || 0);

                  return (
                    <tr key={po.id} className="hover:bg-gray-50">
                      {/* PO Number */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-blue-600">{po.poNumber}</div>
                      </td>

                      {/* Supplier */}
                      <td className="px-4 py-4">
                        <div className="text-sm text-gray-900">{po.supplierName}</div>
                        {po.supplierContact && (
                          <div className="text-xs text-gray-500">{po.supplierContact}</div>
                        )}
                      </td>

                      {/* Order Date */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{formatDate(po.orderDate)}</div>
                      </td>

                      {/* Expected Delivery */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {formatDate(po.expectedDelivery)}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${statusConfig.color}`}
                        >
                          {statusConfig.icon} {statusConfig.label}
                        </span>
                      </td>

                      {/* Total Amount */}
                      <td className="px-4 py-4 whitespace-nowrap text-right">
                        <div className="text-sm font-medium text-gray-900">
                          {formatCurrency(totalAmount.toNumber())}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end gap-2">
                          {po.status === 'DRAFT' && (
                            <>
                              <button
                                onClick={() => handleSubmitPO(po.id)}
                                className="text-blue-600 hover:text-blue-900"
                                title="Submit PO & Send to Receiving"
                              >
                                📤
                              </button>
                              <button
                                onClick={() => handleDeletePO(po.id)}
                                className="text-red-600 hover:text-red-900"
                                title="Delete"
                              >
                                🗑️
                              </button>
                            </>
                          )}
                          {(po.status === 'PENDING' || po.status === 'APPROVED') && (
                            <button
                              onClick={() => handleCancelPO(po.id)}
                              className="text-orange-600 hover:text-orange-900"
                              title="Cancel PO"
                            >
                              ❌
                            </button>
                          )}
                          <button
                            onClick={() => handleViewDetails(po)}
                            className="text-gray-600 hover:text-gray-900"
                            title="View Details"
                          >
                            👁️
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
      </div>

      {/* Pagination */}
      {purchaseOrders.length > 0 && (
        <div className="mt-6 flex justify-between items-center">
          <div className="text-sm text-gray-600">
            Page {page} • Showing {purchaseOrders.length} purchase orders
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
              disabled={purchaseOrders.length < limit}
              className="px-4 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Business Rules Info */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-blue-900 mb-2">📋 Purchase Order Workflow</h3>
        <ul className="text-xs text-blue-800 space-y-1">
          <li>
            • <strong>PO Numbers:</strong> Auto-generated in format PO-YYYY-####
          </li>
          <li>
            • <strong>Status Flow:</strong> DRAFT → PENDING → APPROVED → COMPLETED
          </li>
          <li>
            • <strong>BR-PO-001:</strong> Supplier validation required for all purchase orders
          </li>
          <li>
            • <strong>BR-PO-003:</strong> Expected delivery date must be in the future
          </li>
          <li>
            • <strong>Line Items:</strong> Add products with quantities and unit costs
          </li>
          <li>
            • <strong>Goods Receipts:</strong> Create GR when items are received to update inventory
          </li>
          <li>
            • <strong>DRAFT:</strong> Can edit, submit, or delete
          </li>
          <li>
            • <strong>PENDING/APPROVED:</strong> Can cancel only
          </li>
          <li>
            • <strong>COMPLETED:</strong> Immutable, linked to goods receipts
          </li>
          <li>
            • <strong>CANCELLED:</strong> Excluded from total value calculations
          </li>
        </ul>
      </div>

      {/* Create PO Modal */}
      {showCreateModal && (
        <CreatePOModal onClose={() => setShowCreateModal(false)} onSuccess={() => refetch()} />
      )}

      {/* Details Modal */}
      {showDetailsModal && selectedPO && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowDetailsModal(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-[95vw] sm:max-w-4xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Purchase Order Details</h2>
                <p className="text-sm text-gray-500">{selectedPO.poNumber}</p>
              </div>
              <button
                onClick={() => setShowDetailsModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Status Badge */}
              <div>
                <span
                  className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${PO_STATUSES[selectedPO.status as POStatus]?.color || 'bg-gray-100 text-gray-800'
                    }`}
                >
                  {PO_STATUSES[selectedPO.status as POStatus]?.icon}{' '}
                  {PO_STATUSES[selectedPO.status as POStatus]?.label}
                </span>
              </div>

              {/* General Information */}
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Supplier</h3>
                  <p className="mt-1 text-base font-medium text-gray-900">
                    {selectedPO.supplierName}
                  </p>
                  {selectedPO.supplierContact && (
                    <p className="text-sm text-gray-600">{selectedPO.supplierContact}</p>
                  )}
                </div>

                <div>
                  <h3 className="text-sm font-medium text-gray-500">Order Date</h3>
                  <p className="mt-1 text-base text-gray-900">{formatDate(selectedPO.orderDate)}</p>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-gray-500">Expected Delivery</h3>
                  <p className="mt-1 text-base text-gray-900">
                    {formatDate(selectedPO.expectedDelivery)}
                  </p>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-gray-500">Total Amount</h3>
                  <p className="mt-1 text-base font-bold text-gray-900">
                    {formatCurrency(new Decimal(selectedPO.totalAmount || 0).toNumber())}
                  </p>
                </div>
              </div>

              {/* Notes */}
              {selectedPO.notes && (
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Notes</h3>
                  <p className="mt-1 text-base text-gray-900 whitespace-pre-wrap">
                    {selectedPO.notes}
                  </p>
                </div>
              )}

              {/* Line Items */}
              <div>
                <h3 className="text-base font-semibold text-gray-900 mb-3">Line Items</h3>
                <div className="border rounded-lg overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Product
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                          Quantity
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          UOM
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                          Unit Cost
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {selectedPO.items && selectedPO.items.length > 0 ? (
                        selectedPO.items.map((item: POItemRow, index: number) => {
                          const quantity = new Decimal(item.quantity || 0);
                          const unitCost = new Decimal(item.unitCost || 0);
                          const total = quantity.times(unitCost);

                          return (
                            <tr key={index}>
                              <td className="px-4 py-3 text-sm text-gray-900">
                                {item.productName}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-900 text-right">
                                {quantity.toString()}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600">
                                {item.uomName || item.uom_name || 'Base UoM'}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-900 text-right">
                                {formatCurrency(unitCost.toNumber())}
                              </td>
                              <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">
                                {formatCurrency(total.toNumber())}
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={5} className="px-4 py-3 text-sm text-gray-500 text-center">
                            No line items
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Metadata */}
              <div className="border-t pt-4">
                <div className="grid grid-cols-2 gap-4 text-xs text-gray-500">
                  <div>
                    <span className="font-medium">Created:</span> {formatDate(selectedPO.createdAt)}
                  </div>
                  <div>
                    <span className="font-medium">Updated:</span> {formatDate(selectedPO.updatedAt)}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-gray-50 px-6 py-4 flex justify-between gap-3 border-t">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleExportPDF(selectedPO)}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  Export PDF
                </button>
                {selectedPO && (
                  <DocumentFlowButton entityType="PURCHASE_ORDER" entityId={selectedPO.id} size="sm" />
                )}
              </div>
              <button
                onClick={() => setShowDetailsModal(false)}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
