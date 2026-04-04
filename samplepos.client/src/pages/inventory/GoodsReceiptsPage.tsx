import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Decimal from 'decimal.js';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  useGoodsReceipts,
  useFinalizeGoodsReceipt,
  useGoodsReceipt,
  useUpdateGRItem,
  useCreateGoodsReceipt,
} from '../../hooks/useGoodsReceipts';
import {
  useReturnableItems,
  useReturnGrnsByGrn,
  useCreateReturnGrn,
  usePostReturnGrn,
} from '../../hooks/useReturnGrn';
import type { ReturnableItem } from '../../hooks/useReturnGrn';
import { useAuth } from '../../hooks/useAuth';
import { useTenant } from '../../contexts/TenantContext';
import { formatCurrency } from '../../utils/currency';
import { api } from '../../utils/api';
import { handleApiError } from '../../utils/errorHandler';
import { DocumentFlowButton } from '../../components/shared/DocumentFlowButton';
import { ResponsiveTableWrapper } from '../../components/ui/ResponsiveTableWrapper';
import ManualGRButton from '../../components/inventory/ManualGRButton';
import { useProductWithUoms, findUom, getDefaultUom } from '../../hooks/useProductWithUoms';
import { inventoryKeys } from '../../hooks/useInventory';
// DatePicker removed — GR uses native date input for keyboard-driven receiving

// Configure Decimal for financial calculations
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// TIMEZONE STRATEGY: Display dates without conversion
// Backend returns DATE as YYYY-MM-DD string (no timezone)
// Frontend displays as-is without parsing to Date object
const formatDisplayDate = (dateString: string | null | undefined): string => {
  if (!dateString) return '-';

  // If it's an ISO string, extract the date part
  if (dateString.includes('T')) {
    return dateString.split('T')[0];
  }

  return dateString;
};

interface CostAlert {
  type: string;
  severity: 'HIGH' | 'MEDIUM';
  productId: string;
  productName: string;
  message: string;
  details: {
    previousCost: string;
    newCost: string;
    changeAmount: string;
    changePercentage: string;
    batchNumber: string;
  };
}

interface GRRow {
  id: string;
  receiptNumber?: string;
  receipt_number?: string;
  grNumber?: string;
  gr_number?: string;
  purchaseOrderId?: string;
  purchase_order_id?: string;
  poNumber?: string;
  po_number?: string;
  supplierName?: string;
  supplier_name?: string;
  status: string;
  receivedDate?: string;
  received_date?: string;
  receivedByName?: string;
  received_by_name?: string;
  supplierDeliveryNote?: string;
  supplier_delivery_note?: string;
  deliveryNote?: string;
  delivery_note?: string;
  finalizedAt?: string;
  finalized_at?: string;
  notes?: string;
  createdAt?: string;
  created_at?: string;
  items?: GRItemRow[];
  totalValue?: number | string;
}

interface GRItemRow {
  id: string;
  productId?: string;
  product_id?: string;
  productName?: string;
  product_name?: string;
  orderedQuantity?: number | string;
  ordered_quantity?: number | string;
  receivedQuantity?: number | string;
  received_quantity?: number | string;
  unitCost?: number | string;
  unit_cost?: number | string;
  batchNumber?: string;
  batch_number?: string;
  expiryDate?: string;
  expiry_date?: string;
  notes?: string;
  totalCost?: number | string;
  isBonus?: boolean;
  is_bonus?: boolean;
  po_unit_price?: number | string;
  poUnitPrice?: number | string;
  product_cost_price?: number | string;
  productCostPrice?: number | string;
  uomSymbol?: string;
  uom_symbol?: string;
  uomName?: string;
  uom_name?: string;
  conversionFactor?: number | string;
  conversion_factor?: number | string;
}

interface PORow {
  id: string;
  order_number?: string;
  poNumber?: string;
  po_number?: string;
  supplier_name?: string;
  supplierName?: string;
  status: string;
  order_date?: string;
  orderDate?: string;
  total_amount?: number | string;
  totalAmount?: number | string;
}

interface POItemData {
  id: string;
  product_id?: string;
  productId?: string;
  product_name?: string;
  productName?: string;
  ordered_quantity?: number | string;
  quantity?: number | string;
  unit_price?: number | string;
  unitCost?: number | string;
  product_cost_price?: number | string;
  productCostPrice?: number | string;
}

interface POData {
  po: { id: string };
  items: POItemData[];
}

interface EditItemState {
  batchNumber?: string | null;
  expiryDate?: string | null;
  receivedQuantity?: number;
  unitCost?: number;
  isBonus?: boolean;
  selectedUomId?: string;
  receivedUomQty?: number;
  receivedLooseQty?: number;
}

interface GRItemUpdatePayload {
  receivedQuantity?: number;
  unitCost?: number;
  batchNumber?: string | null;
  expiryDate?: string | null;
  isBonus?: boolean;
}

interface GRDetailData {
  gr?: GRRow;
  items?: GRItemRow[];
}

export default function GoodsReceiptsPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selectedGR, setSelectedGR] = useState<GRRow | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAlertsModal, setShowAlertsModal] = useState(false);
  const [costAlerts, setCostAlerts] = useState<CostAlert[]>([]);
  const [baseline, setBaseline] = useState<'PO' | 'PRODUCT'>('PO');
  const [poSearch, setPoSearch] = useState('');
  const [poPage, setPoPage] = useState(1);
  const [selectedPoId, setSelectedPoId] = useState('');
  const [focusedPoIndex, setFocusedPoIndex] = useState(0);
  const poRadioRefs = useRef<HTMLInputElement[]>([]);
  const [poQuickView, setPoQuickView] = useState<Record<string, { itemsCount: number }>>({});
  const [editItems, setEditItems] = useState<Record<string, EditItemState>>({});
  const [batchWarnings, setBatchWarnings] = useState<Record<string, string>>({});
  const validationTimeout = useRef<Record<string, NodeJS.Timeout>>({});
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnReason, setReturnReason] = useState('');
  const [returnQuantities, setReturnQuantities] = useState<Record<string, number>>({});
  const [returnSubmitting, setReturnSubmitting] = useState(false);

  const limit = 20;

  // Check for duplicate batch numbers
  const checkBatchDuplicate = async (itemId: string, batchNumber: string) => {
    if (!batchNumber || batchNumber.trim() === '') {
      setBatchWarnings((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
      return;
    }

    try {
      const response = await fetch(
        `/api/inventory/batches/exists?batchNumber=${encodeURIComponent(batchNumber)}`
      );
      const data = await response.json();

      if (data.exists) {
        setBatchWarnings((prev) => ({
          ...prev,
          [itemId]: '⚠️ This batch number already exists in the system',
        }));
      } else {
        // Also check within current GR items
        const currentItems = Object.entries(editItems);
        const duplicateInCurrent =
          currentItems.filter(([id, item]) => id !== itemId && item.batchNumber === batchNumber)
            .length > 0;

        if (duplicateInCurrent) {
          setBatchWarnings((prev) => ({
            ...prev,
            [itemId]: '⚠️ Duplicate batch number in this goods receipt',
          }));
        } else {
          setBatchWarnings((prev) => {
            const next = { ...prev };
            delete next[itemId];
            return next;
          });
        }
      }
    } catch (error) {
      console.error('Failed to check batch duplicate:', error);
    }
  };

  // Fetch goods receipts
  const { data, isLoading, error } = useGoodsReceipts({
    page,
    limit,
    status: statusFilter || undefined,
  });

  const finalizeMutation = useFinalizeGoodsReceipt();
  const createReturnGrnMutation = useCreateReturnGrn();
  const postReturnGrnMutation = usePostReturnGrn();

  // Return GRN data for selected GRN
  const selectedGRId = selectedGR?.id || '';
  const isFinalized = selectedGR?.status === 'COMPLETED' || selectedGR?.status === 'FINALIZED';
  const { data: returnableData, isLoading: returnableLoading } = useReturnableItems(
    showReturnModal ? selectedGRId : ''
  );
  const { data: returnGrnData } = useReturnGrnsByGrn(isFinalized ? selectedGRId : '');

  const returnableItems: ReturnableItem[] = useMemo(() => {
    const raw = (returnableData as { data?: { data?: ReturnableItem[] } })?.data?.data;
    return Array.isArray(raw) ? raw.filter((i) => i.returnableQuantity > 0) : [];
  }, [returnableData]);

  const existingReturns = useMemo(() => {
    const raw = (returnGrnData as { data?: { data?: Array<{ id: string; returnGrnNumber: string; return_grn_number?: string; status: string; totalAmount?: number; total_amount?: number }> } })?.data?.data;
    return Array.isArray(raw) ? raw : [];
  }, [returnGrnData]);

  // PDF Export for Goods Receipt
  const handleExportGRPDF = (gr: GRRow, grItems: GRItemRow[]) => {
    const doc = new jsPDF();

    // Header
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(brandName, 14, 20);

    doc.setFontSize(14);
    doc.text('Goods Receipt', 14, 30);

    // GR Number and Status
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    const grNumber = gr.grNumber || gr.receiptNumber || gr.receipt_number || 'N/A';
    const poNumber = gr.poNumber || gr.po_number || 'N/A';
    const supplierName = gr.supplierName || gr.supplier_name || 'N/A';
    const status = gr.status || 'DRAFT';

    doc.text(`GR Number: ${grNumber}`, 14, 42);
    doc.text(`PO Number: ${poNumber}`, 14, 50);
    doc.text(`Supplier: ${supplierName}`, 14, 58);

    // Status badge simulation
    const statusColors: Record<string, { r: number; g: number; b: number }> = {
      DRAFT: { r: 245, g: 158, b: 11 },
      PENDING: { r: 59, g: 130, b: 246 },
      COMPLETED: { r: 16, g: 185, b: 129 },
      FINALIZED: { r: 16, g: 185, b: 129 },
    };
    const statusColor = statusColors[status] || { r: 107, g: 114, b: 128 };
    doc.setFillColor(statusColor.r, statusColor.g, statusColor.b);
    doc.roundedRect(130, 38, 60, 8, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.text(status, 160, 44, { align: 'center' });
    doc.setTextColor(0, 0, 0);

    // Receipt details
    doc.setFontSize(10);
    const receivedDate = gr.received_date || gr.receivedDate || '-';
    const receivedBy = gr.received_by_name || gr.receivedByName || '-';
    const deliveryNote = gr.delivery_note || gr.deliveryNote || '-';

    doc.text(`Received Date: ${formatDisplayDate(receivedDate)}`, 14, 70);
    doc.text(`Received By: ${receivedBy}`, 14, 78);
    doc.text(`Delivery Note: ${deliveryNote}`, 14, 86);

    // Items table
    const tableData = grItems.map((item: GRItemRow) => {
      const productName = item.productName || item.product_name || 'Unknown';
      // Get UoM and conversion factor from item data
      const uomSymbol =
        item.uomSymbol || item.uom_symbol || item.uomName || item.uom_name || 'base';
      const conversionFactor = parseFloat(
        String(item.conversionFactor || item.conversion_factor || 1)
      );

      // Base quantities from database
      const baseOrderedQty = parseFloat(String(item.orderedQuantity || item.ordered_quantity || 0));
      const baseReceivedQty = parseFloat(
        String(item.receivedQuantity || item.received_quantity || 0)
      );
      const baseUnitCost = parseFloat(String(item.unitCost || item.unit_cost || 0));

      // Convert to ordering UoM quantities
      const orderedQty =
        conversionFactor > 0
          ? new Decimal(baseOrderedQty).div(conversionFactor).toNumber()
          : baseOrderedQty;
      const receivedQty =
        conversionFactor > 0
          ? new Decimal(baseReceivedQty).div(conversionFactor).toNumber()
          : baseReceivedQty;
      // Unit cost in ordering UoM = base cost * conversion factor
      const unitCost = new Decimal(baseUnitCost).times(conversionFactor).toNumber();

      const batchNumber = item.batchNumber || item.batch_number || '-';
      const expiryDate = item.expiryDate || item.expiry_date || '-';
      const totalCost = new Decimal(baseReceivedQty).times(baseUnitCost).toNumber();
      const qtyVariance =
        baseOrderedQty > 0
          ? (((baseReceivedQty - baseOrderedQty) / baseOrderedQty) * 100).toFixed(2)
          : '0.00';

      return [
        productName,
        uomSymbol,
        orderedQty.toString(),
        receivedQty.toString(),
        formatCurrency(unitCost),
        formatCurrency(totalCost),
        batchNumber,
        formatDisplayDate(expiryDate),
        `${parseFloat(qtyVariance) >= 0 ? '+' : ''}${qtyVariance}%`,
      ];
    });

    autoTable(doc, {
      startY: 95,
      head: [
        [
          'Product',
          'UoM',
          'Ordered',
          'Received',
          'Unit Cost',
          'Total Cost',
          'Batch #',
          'Expiry',
          'Qty Var',
        ],
      ],
      body: tableData,
      theme: 'striped',
      headStyles: {
        fillColor: [59, 130, 246],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9,
      },
      styles: {
        fontSize: 8,
        cellPadding: 3,
      },
      columnStyles: {
        0: { cellWidth: 35 },
        1: { cellWidth: 18 },
        4: { halign: 'right' },
        5: { halign: 'right' },
        8: { halign: 'center' },
      },
    });

    // Calculate total
    const totalValue = grItems.reduce((sum: number, item: GRItemRow) => {
      const receivedQty = parseFloat(String(item.receivedQuantity || item.received_quantity || 0));
      const unitCost = parseFloat(String(item.unitCost || item.unit_cost || 0));
      return sum + new Decimal(receivedQty).times(unitCost).toNumber();
    }, 0);

    // Get final Y position after table
    const finalY =
      (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 150;

    // Total box
    doc.setFillColor(240, 240, 240);
    doc.rect(130, finalY + 10, 65, 10, 'F');
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Total Value:', 132, finalY + 17);
    doc.text(formatCurrency(totalValue), 193, finalY + 17, { align: 'right' });

    // Footer
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text(`Generated on ${new Date().toLocaleString()}`, 14, 285);
    doc.text(`${brandName} - Goods Receipt Document`, 196, 285, { align: 'right' });

    // Save
    doc.save(`GoodsReceipt_${grNumber}.pdf`);
  };
  const updateItemMutation = useUpdateGRItem();
  const createGRMutation = useCreateGoodsReceipt();
  const { user } = useAuth();
  const { config } = useTenant();
  const brandName = config.branding.companyName || config.name || 'SMART ERP';
  const queryClient = useQueryClient();

  // Persist baseline selection
  useEffect(() => {
    const saved = localStorage.getItem('gr_cost_baseline');
    if (saved === 'PO' || saved === 'PRODUCT') setBaseline(saved);
  }, []);
  useEffect(() => {
    localStorage.setItem('gr_cost_baseline', baseline);
  }, [baseline]);

  // Load GR details when modal opens
  const detailsQuery = useGoodsReceipt(selectedGR?.id || '');
  const grDetail = detailsQuery.data?.data?.data as GRDetailData | undefined;
  const items = useMemo(() => grDetail?.items || [], [grDetail]);

  // Determine if GR is linked to a PO (strict discipline applies)
  const isFromPO = !!(selectedGR?.purchaseOrderId || selectedGR?.purchase_order_id);

  // Receive All Remaining: set every line's receivedQuantity = orderedQuantity
  const handleReceiveAllRemaining = () => {
    const updates = { ...editItems };
    items.forEach((it: GRItemRow) => {
      const ordered = Number(it.orderedQuantity ?? it.ordered_quantity ?? 0);
      updates[it.id] = {
        ...(updates[it.id] || {}),
        receivedQuantity: ordered,
        receivedUomQty: undefined,
        receivedLooseQty: undefined,
      };
    });
    setEditItems(updates);
  };

  // Accounting preview: live DR Inventory (1300) / CR GRNI (2200) totals
  const accountingPreview = useMemo(() => {
    let total = 0;
    items.forEach((it: GRItemRow) => {
      const es = editItems[it.id] || {};
      const qty = Number(es.receivedQuantity ?? it.receivedQuantity ?? it.received_quantity ?? 0);
      const cost = Number(es.unitCost ?? it.unitCost ?? it.unit_cost ?? 0);
      const bonus = !!(es.isBonus ?? it.isBonus ?? it.is_bonus ?? false);
      if (!bonus && qty > 0) {
        total += qty * cost;
      }
    });
    return total;
  }, [items, editItems]);

  useEffect(() => {
    if (showDetailsModal && items.length > 0) {
      // initialize edit state with current values
      const init: Record<string, EditItemState> = {};
      items.forEach((it: GRItemRow) => {
        const ordered = Number(it.orderedQuantity ?? it.ordered_quantity ?? 0);
        const currentReceived = Number(it.receivedQuantity ?? it.received_quantity ?? 0);
        // Problem 7: Auto-fill received = ordered for DRAFT GR from PO when not yet received
        const shouldAutoFill = isFromPO && selectedGR?.status === 'DRAFT' && currentReceived === 0 && ordered > 0;
        init[it.id] = {
          batchNumber: it.batchNumber ?? it.batch_number ?? '',
          expiryDate:
            it.expiryDate || it.expiry_date
              ? new Date(String(it.expiryDate || it.expiry_date)).toISOString().slice(0, 10)
              : '',
          receivedQuantity: shouldAutoFill ? ordered : currentReceived,
          unitCost: Number(it.unitCost ?? it.unit_cost ?? 0),
          isBonus: !!(it.isBonus ?? it.is_bonus ?? false),
        };
      });
      setEditItems(init);
    }
  }, [showDetailsModal, items, isFromPO, selectedGR?.status]);

  const handleFinalize = async (id: string) => {
    // ── Part 4: Required field enforcement ──
    if (isFromPO) {
      const validationErrors: string[] = [];
      let anyReceived = false;

      items.forEach((it: GRItemRow) => {
        const es = editItems[it.id] || {};
        const productName = it.productName || it.product_name || 'Unknown';
        const qty = Number(es.receivedQuantity ?? it.receivedQuantity ?? it.received_quantity ?? 0);
        const batch = es.batchNumber ?? it.batchNumber ?? it.batch_number ?? '';
        const expiry = es.expiryDate ?? it.expiryDate ?? it.expiry_date ?? '';

        if (qty > 0) {
          anyReceived = true;
          if (!batch || String(batch).trim() === '') {
            validationErrors.push(`${productName}: Batch number is required`);
          }
          if (!expiry || String(expiry).trim() === '') {
            validationErrors.push(`${productName}: Expiry date is required`);
          }
        }
      });

      if (!anyReceived) {
        alert('Cannot finalize: At least one line must have a received quantity greater than zero.');
        return;
      }

      if (validationErrors.length > 0) {
        alert(`Cannot finalize. Please fix the following:\n\n${validationErrors.join('\n')}`);
        return;
      }
    }

    if (
      !confirm(
        'Finalize this goods receipt? This will create inventory batches and update stock levels.'
      )
    ) {
      return;
    }

    try {
      // Auto-save all pending edits before finalizing
      const savePromises = items.map(async (item: GRItemRow) => {
        const itemId = item.id;
        const edits = editItems[itemId];

        if (edits) {
          // Check if there are any changes
          const hasChanges =
            (edits.batchNumber !== undefined &&
              edits.batchNumber !== (item.batchNumber || item.batch_number)) ||
            (edits.expiryDate !== undefined &&
              edits.expiryDate !==
              (item.expiryDate ? new Date(item.expiryDate).toISOString().slice(0, 10) : '')) ||
            (edits.receivedQuantity !== undefined &&
              edits.receivedQuantity !== (item.receivedQuantity || item.received_quantity)) ||
            (edits.unitCost !== undefined &&
              edits.unitCost !== (item.unitCost || item.unit_cost)) ||
            (edits.isBonus !== undefined && edits.isBonus !== !!(item.isBonus ?? item.is_bonus));

          if (hasChanges) {
            const payload: GRItemUpdatePayload = {};
            if (edits.receivedQuantity !== undefined)
              payload.receivedQuantity = Number(edits.receivedQuantity);
            if (edits.unitCost !== undefined) payload.unitCost = Number(edits.unitCost);
            if (edits.batchNumber !== undefined) payload.batchNumber = edits.batchNumber || null;
            if (edits.expiryDate !== undefined)
              payload.expiryDate = edits.expiryDate
                ? new Date(edits.expiryDate).toISOString()
                : null;
            if (edits.isBonus !== undefined) payload.isBonus = !!edits.isBonus;

            await updateItemMutation.mutateAsync({ grId: id, itemId, data: payload });
          }
        }
      });

      await Promise.all(savePromises);

      // Refresh GR details after saving
      await detailsQuery.refetch();

      const response = await finalizeMutation.mutateAsync(id);

      // Invalidate stock levels to refresh On Hand badges
      queryClient.invalidateQueries({ queryKey: inventoryKeys.stockLevels() });
      items.forEach((it: GRItemRow) => {
        const productId = it.productId || it.product_id;
        if (productId) {
          queryClient.invalidateQueries({ queryKey: inventoryKeys.stockLevelByProduct(productId) });
        }
      });

      // Check for cost alerts (suppress alerts that are likely pure UoM conversions)
      const alerts = (response.data.alerts as CostAlert[]) || [];
      const filtered = alerts.filter((a) => {
        const prev = parseFloat(a.details.previousCost);
        const next = parseFloat(a.details.newCost);
        if (!isFinite(prev) || prev <= 0 || !isFinite(next) || next <= 0) return true;
        const ratio = next / prev;
        const rounded = Math.round(ratio);
        const isIntegerish = Math.abs(ratio - rounded) < 1e-6;
        // Likely UoM conversion if ratio is a small-ish integer (e.g., pack size 2..200)
        if (isIntegerish && rounded >= 2 && rounded <= 200) {
          return false; // suppress
        }
        return true;
      });
      if (filtered.length > 0) {
        setCostAlerts(filtered);
        setShowAlertsModal(true);
      } else {
        alert('Goods receipt finalized successfully!');
      }

      setShowDetailsModal(false);
    } catch (err: unknown) {
      handleApiError(err, { fallback: 'Failed to finalize goods receipt' });
    }
  };

  const handleViewDetails = (gr: GRRow) => {
    setSelectedGR(gr);
    setShowDetailsModal(true);
  };

  const handleOpenReturnModal = () => {
    setReturnReason('');
    setReturnQuantities({});
    setShowReturnModal(true);
  };

  const handleSubmitReturn = async () => {
    if (!selectedGR) return;
    const lines = returnableItems
      .filter((item) => {
        const key = `${item.productId}_${item.batchId || 'no-batch'}`;
        return (returnQuantities[key] || 0) > 0;
      })
      .map((item) => {
        const key = `${item.productId}_${item.batchId || 'no-batch'}`;
        return {
          productId: item.productId,
          batchId: item.batchId || undefined,
          uomId: item.uomId || undefined,
          quantity: returnQuantities[key],
          unitCost: Number(item.unitCost) || 0,
        };
      });

    if (lines.length === 0) {
      alert('Please enter quantities for at least one item to return.');
      return;
    }

    if (!returnReason.trim()) {
      alert('Please provide a reason for the return.');
      return;
    }

    setReturnSubmitting(true);
    try {
      // Create the return GRN (DRAFT)
      const createResp = await createReturnGrnMutation.mutateAsync({
        grnId: selectedGR.id,
        reason: returnReason.trim(),
        lines,
      });

      const respData = (createResp as { data?: { success?: boolean; data?: { returnGrn?: { id: string } } } })?.data;
      const rgrnId = respData?.data?.returnGrn?.id;
      if (!rgrnId) throw new Error('Failed to create Return GRN');

      // Post it immediately (stock reduction)
      await postReturnGrnMutation.mutateAsync(rgrnId);

      alert('Return GRN created and posted successfully. Stock has been reduced.');
      setShowReturnModal(false);
      setShowDetailsModal(false);
    } catch (err: unknown) {
      handleApiError(err, { fallback: 'Failed to process return to supplier' });
    } finally {
      setReturnSubmitting(false);
    }
  };

  const handleItemFieldChange = (
    itemId: string,
    field: string,
    value: string | number | boolean | undefined
  ) => {
    setEditItems((prev) => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] || {}),
        [field]: value,
      } as EditItemState,
    }));
  };

  const openCreateModal = () => {
    setPoSearch('');
    setSelectedPoId('');
    setPoPage(1);
    setShowCreateModal(true);
    // Refetch pending POs to ensure fresh data
    pendingPOsQuery.refetch();
  };

  const handleCreateGR = async () => {
    if (!user?.id) {
      alert('You must be logged in to create a goods receipt.');
      return;
    }
    const poId = selectedPoId.trim();
    if (!poId) {
      alert('Select a Purchase Order');
      return;
    }
    try {
      // Fetch PO to build items
      const poRes = await api.purchaseOrders.getById(poId);
      const poData = poRes.data?.data as POData | undefined;
      if (!poData?.po || !poData?.items) {
        throw new Error('Purchase order not found');
      }
      const payload = {
        purchaseOrderId: poData.po.id,
        receiptDate: new Date().toISOString(),
        notes: null,
        receivedBy: user.id,
        items: poData.items.map((it: POItemData) => {
          // Normalize unit cost to base units if PO unit_price looks like a UoM multiple
          const rawUnit = Number(it.unit_price ?? it.unitCost ?? 0);
          const baseCost = Number(it.product_cost_price ?? it.productCostPrice ?? 0);
          let normalizedUnit = rawUnit;
          if (isFinite(rawUnit) && rawUnit > 0 && isFinite(baseCost) && baseCost > 0) {
            const ratio = rawUnit / baseCost;
            const rounded = Math.round(ratio);
            const isIntegerish = Math.abs(ratio - rounded) < 1e-6;
            if (isIntegerish && rounded >= 2 && rounded <= 200) {
              normalizedUnit = rawUnit / rounded;
            }
          }
          return {
            poItemId: it.id,
            productId: it.product_id || it.productId || '',
            productName: it.product_name || it.productName,
            orderedQuantity: Number(it.ordered_quantity ?? it.quantity ?? 0),
            receivedQuantity: Number(it.ordered_quantity ?? it.quantity ?? 0),
            unitCost: normalizedUnit,
            batchNumber: null,
            expiryDate: null,
          };
        }),
      };
      console.log(
        '🚀 [Frontend] Creating GR from PO with payload:',
        JSON.stringify(payload, null, 2)
      );
      console.log('🔍 [Frontend] User object:', user);
      console.log('🔍 [Frontend] PO Data:', poData);
      await createGRMutation.mutateAsync(payload);

      // Reset modal state after successful creation
      setShowCreateModal(false);
      setSelectedPoId('');
      setPoSearch('');
      setPoPage(1);
      setFocusedPoIndex(0);
    } catch (e: unknown) {
      handleApiError(e, { fallback: 'Failed to create goods receipt' });
    }
  };

  // Pending POs query and client-side filter
  const pendingPOsQuery = useQuery({
    queryKey: ['purchase-orders', 'pending', poPage],
    queryFn: () => api.purchaseOrders.list({ status: 'PENDING', page: poPage, limit: 20 }),
  });
  const pendingPOs = (pendingPOsQuery.data?.data?.data || []) as PORow[];
  const poPagination = pendingPOsQuery.data?.data?.pagination;
  const filteredPOs = useMemo(() => {
    const q = poSearch.trim().toLowerCase();
    if (!q) return pendingPOs;
    return pendingPOs.filter((po: PORow) => {
      const num = (po.order_number || po.poNumber || '').toString().toLowerCase();
      const supplier = (po.supplier_name || po.supplierName || '').toString().toLowerCase();
      return num.includes(q) || supplier.includes(q);
    });
  }, [poSearch, pendingPOs]);

  // Ensure refs length matches list length
  useEffect(() => {
    poRadioRefs.current = poRadioRefs.current.slice(0, filteredPOs.length);
  }, [filteredPOs.length]);

  // Fetch quick-view details (items count) lazily and cache per PO id
  const ensurePoQuickView = async (poId: string) => {
    if (!poId || poQuickView[poId]) return;
    try {
      const res = await api.purchaseOrders.getById(poId);
      const poDetail = res.data?.data as { items?: unknown[] } | undefined;
      const items = poDetail?.items || [];
      setPoQuickView((prev) => ({ ...prev, [poId]: { itemsCount: items.length } }));
    } catch {
      // ignore failures for quick-view
    }
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { bg: string; text: string }> = {
      DRAFT: { bg: 'bg-gray-100', text: 'text-gray-800' },
      FINALIZED: { bg: 'bg-green-100', text: 'text-green-800' },
      CANCELLED: { bg: 'bg-red-100', text: 'text-red-800' },
    };

    const badge = badges[status] || badges.DRAFT;

    return (
      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${badge.bg} ${badge.text}`}>
        {status}
      </span>
    );
  };

  const goodsReceipts = (data?.data?.data || []) as GRRow[];
  const pagination = data?.data?.pagination;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Goods Receipts</h2>
          <p className="text-gray-600 mt-1">
            Receiving workflow with batch creation and cost change alerts
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Cost variance baseline:</span>
            <select
              aria-label="Cost variance baseline"
              title="Cost variance baseline"
              className="border border-gray-300 rounded-lg px-2 py-1 text-sm"
              value={baseline}
              onChange={(e) => setBaseline(e.target.value as 'PO' | 'PRODUCT')}
            >
              <option value="PO">PO Cost</option>
              <option value="PRODUCT">Product Cost</option>
            </select>
          </div>
          <ManualGRButton />
          <button
            onClick={openCreateModal}
            className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
          >
            + Create from PO
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
        <div className="flex gap-4">
          <div>
            <label htmlFor="status-filter" className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All</option>
              <option value="DRAFT">Draft</option>
              <option value="FINALIZED">Finalized</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="text-center py-12">
          <div className="text-gray-600">Loading goods receipts...</div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800">Failed to load goods receipts</p>
        </div>
      )}

      {/* Goods Receipts Table */}
      {!isLoading && !error && (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <ResponsiveTableWrapper>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    GR Number
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    PO Number
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Supplier
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Received Date
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
                {goodsReceipts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                      No goods receipts found
                    </td>
                  </tr>
                ) : (
                  goodsReceipts.map((gr: GRRow) => (
                    <tr key={gr.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {gr.receiptNumber || gr.receipt_number}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {gr.poNumber || gr.po_number || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {gr.supplierName || gr.supplier_name || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDisplayDate(gr.receivedDate || gr.received_date)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">{getStatusBadge(gr.status)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleViewDetails(gr)}
                            className="text-blue-600 hover:text-blue-800 font-medium"
                          >
                            👁️ View
                          </button>
                          {gr.status === 'DRAFT' && (
                            <button
                              onClick={() => handleFinalize(gr.id)}
                              className="text-green-600 hover:text-green-800 font-medium"
                            >
                              ✓ Finalize
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </ResponsiveTableWrapper>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="bg-gray-50 px-6 py-4 flex items-center justify-between border-t border-gray-200">
              <div className="text-sm text-gray-700">
                Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(Math.min(pagination.totalPages, page + 1))}
                  disabled={page === pagination.totalPages}
                  className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Details Modal */}
      {showDetailsModal && selectedGR && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => setShowDetailsModal(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl max-w-[95vw] sm:max-w-4xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900">
                    {selectedGR.receiptNumber || selectedGR.receipt_number}
                  </h3>
                  <p className="text-gray-600 mt-1">
                    PO: {selectedGR.poNumber || selectedGR.po_number} | Supplier:{' '}
                    {selectedGR.supplierName || selectedGR.supplier_name}
                  </p>
                </div>
                <button
                  onClick={() => setShowDetailsModal(false)}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="text-sm font-medium text-gray-700">Received Date</label>
                  <p className="text-gray-900">
                    {formatDisplayDate(selectedGR.receivedDate || selectedGR.received_date)}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Status</label>
                  <div className="mt-1">{getStatusBadge(selectedGR.status)}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Received By</label>
                  <p className="text-gray-900">
                    {selectedGR.receivedByName || selectedGR.received_by_name || '-'}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Delivery Note</label>
                  <p className="text-gray-900">
                    {selectedGR.supplierDeliveryNote || selectedGR.supplier_delivery_note || '-'}
                  </p>
                </div>
              </div>

              {selectedGR.notes && (
                <div className="mb-6">
                  <label className="text-sm font-medium text-gray-700">Notes</label>
                  <p className="text-gray-900 mt-1">{selectedGR.notes}</p>
                </div>
              )}

              {/* Items Table */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h4 className="text-lg font-semibold text-gray-900">Items</h4>
                    {selectedGR.status === 'DRAFT' && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        <kbd className="px-1 py-0.5 bg-gray-100 border rounded text-[10px] font-mono">Enter</kbd> moves: Received → Batch → Expiry → next row
                        {isFromPO && <span className="ml-2 text-green-600">● green = complete</span>}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {selectedGR.status === 'DRAFT' && isFromPO && (
                      <button
                        onClick={handleReceiveAllRemaining}
                        className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium flex items-center gap-1.5"
                        title="Set all lines to ordered quantity"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        Receive All Remaining
                      </button>
                    )}
                    {detailsQuery.isLoading && (
                      <span className="text-sm text-gray-500">Loading items…</span>
                    )}
                  </div>
                </div>
                <div className="overflow-x-auto border rounded-lg">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Product
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          UoM
                        </th>
                        <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Ordered
                        </th>
                        <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Received
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Unit Cost
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Batch # / Expiry
                        </th>
                        <th
                          className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"
                          title="Bonus stock from supplier (zero cost)"
                        >
                          Bonus
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Variance
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {items.length === 0 ? (
                        <tr>
                          <td className="px-4 py-6 text-center text-gray-500" colSpan={8}>
                            No items
                          </td>
                        </tr>
                      ) : (
                        items.map((it: GRItemRow, idx: number) => (
                          <GRItemRow
                            key={it.id}
                            item={it}
                            baseline={baseline}
                            selectedGR={selectedGR}
                            editState={editItems[it.id] || {}}
                            onFieldChange={handleItemFieldChange}
                            batchWarnings={batchWarnings}
                            validationTimeout={validationTimeout}
                            checkBatchDuplicate={checkBatchDuplicate}
                            isFromPO={isFromPO}
                            itemIndex={idx}
                            totalItems={items.length}
                          />
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Accounting Preview Panel */}
              {isFromPO && items.length > 0 && (
                <div className="mb-6 bg-slate-50 border border-slate-200 rounded-lg p-4">
                  <h5 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                    This receipt will post
                  </h5>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center justify-between bg-white rounded-md px-3 py-2 border">
                      <div>
                        <span className="text-xs text-slate-500">DR</span>
                        <span className="ml-2 text-sm font-medium text-slate-900">Inventory (1300)</span>
                      </div>
                      <span className="text-sm font-bold text-green-700">{formatCurrency(accountingPreview)}</span>
                    </div>
                    <div className="flex items-center justify-between bg-white rounded-md px-3 py-2 border">
                      <div>
                        <span className="text-xs text-slate-500">CR</span>
                        <span className="ml-2 text-sm font-medium text-slate-900">Goods Received Not Invoiced (2200)</span>
                      </div>
                      <span className="text-sm font-bold text-red-700">{formatCurrency(accountingPreview)}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleExportGRPDF(selectedGR, items)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
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
                        d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    Export PDF
                  </button>
                  <DocumentFlowButton entityType="GOODS_RECEIPT" entityId={selectedGR.id} size="sm" />
                </div>
                {selectedGR.status === 'DRAFT' && (
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowDetailsModal(false)}
                      className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleFinalize(selectedGR.id)}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                    >
                      ✓ Finalize Goods Receipt
                    </button>
                  </div>
                )}
                {(selectedGR.status === 'COMPLETED' || selectedGR.status === 'FINALIZED') && (
                  <div className="flex items-center gap-3">
                    {existingReturns.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {existingReturns.map((r) => (
                          <span
                            key={r.id}
                            className={`text-xs px-2 py-1 rounded-full ${r.status === 'POSTED'
                              ? 'bg-orange-100 text-orange-800'
                              : 'bg-gray-100 text-gray-600'
                              }`}
                          >
                            {r.returnGrnNumber || r.return_grn_number} ({r.status})
                          </span>
                        ))}
                      </div>
                    )}
                    <button
                      onClick={handleOpenReturnModal}
                      className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                      </svg>
                      Return to Supplier
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Return to Supplier Modal */}
      {showReturnModal && selectedGR && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => !returnSubmitting && setShowReturnModal(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl max-w-[95vw] sm:max-w-3xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Return to Supplier</h3>
                  <p className="text-gray-600 mt-1">
                    GR: {selectedGR.receiptNumber || selectedGR.receipt_number || selectedGR.grNumber || selectedGR.gr_number}
                    {' — '}
                    {selectedGR.supplierName || selectedGR.supplier_name}
                  </p>
                </div>
                <button
                  onClick={() => !returnSubmitting && setShowReturnModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                  aria-label="Close return modal"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-6">
              {/* Reason */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Return Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  rows={2}
                  placeholder="e.g., Damaged goods, Wrong items received, Quality issues..."
                  disabled={returnSubmitting}
                />
              </div>

              {/* Returnable Items Table */}
              {returnableLoading ? (
                <div className="text-center py-8 text-gray-500">Loading returnable items...</div>
              ) : returnableItems.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No returnable items. All received quantities have already been returned.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b">
                        <th className="text-left px-3 py-2">Product</th>
                        <th className="text-left px-3 py-2">Batch</th>
                        <th className="text-right px-3 py-2">Received</th>
                        <th className="text-right px-3 py-2">Already Returned</th>
                        <th className="text-right px-3 py-2">Max Returnable</th>
                        <th className="text-right px-3 py-2">Unit Cost</th>
                        <th className="text-center px-3 py-2">Return Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {returnableItems.map((item) => {
                        const key = `${item.productId}_${item.batchId || 'no-batch'}`;
                        const qty = returnQuantities[key] || 0;
                        return (
                          <tr key={key} className="border-b hover:bg-gray-50">
                            <td className="px-3 py-2">{item.productName}</td>
                            <td className="px-3 py-2 text-xs text-gray-500">
                              {item.batchNumber || '-'}
                              {item.expiryDate && (
                                <span className="ml-1 text-orange-600">
                                  (exp: {formatDisplayDate(item.expiryDate)})
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">{item.receivedQuantity}</td>
                            <td className="px-3 py-2 text-right text-gray-500">{item.returnedQuantity}</td>
                            <td className="px-3 py-2 text-right font-medium">{item.returnableQuantity}</td>
                            <td className="px-3 py-2 text-right">{formatCurrency(item.unitCost)}</td>
                            <td className="px-3 py-2 text-center">
                              <input
                                type="number"
                                min={0}
                                max={item.returnableQuantity}
                                step={1}
                                value={qty || ''}
                                onChange={(e) => {
                                  const val = e.target.value === '' ? 0 : Number(e.target.value);
                                  setReturnQuantities((prev) => ({
                                    ...prev,
                                    [key]: Math.min(Math.max(0, val), item.returnableQuantity),
                                  }));
                                }}
                                className="w-20 border rounded px-2 py-1 text-right"
                                disabled={returnSubmitting}
                                aria-label={`Return quantity for ${item.productName}`}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 font-medium">
                        <td colSpan={6} className="px-3 py-2 text-right">
                          Total Return Value:
                        </td>
                        <td className="px-3 py-2 text-center">
                          {formatCurrency(
                            returnableItems.reduce((sum, item) => {
                              const key = `${item.productId}_${item.batchId || 'no-batch'}`;
                              return sum + (returnQuantities[key] || 0) * item.unitCost;
                            }, 0)
                          )}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setShowReturnModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                disabled={returnSubmitting}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitReturn}
                disabled={returnSubmitting || returnableItems.length === 0}
                className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {returnSubmitting ? (
                  <>
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Processing...
                  </>
                ) : (
                  'Create & Post Return'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cost Alerts Modal */}
      {showAlertsModal && costAlerts.length > 0 && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => setShowAlertsModal(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl max-w-[95vw] sm:max-w-3xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900">⚠️ Cost Price Change Alerts</h3>
                  <p className="text-gray-600 mt-1">
                    {costAlerts.length} product(s) with cost changes
                  </p>
                </div>
                <button
                  onClick={() => setShowAlertsModal(false)}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {costAlerts.map((alert, index) => (
                <div
                  key={index}
                  className={`rounded-lg p-4 border-2 ${alert.severity === 'HIGH'
                    ? 'bg-red-50 border-red-200'
                    : 'bg-yellow-50 border-yellow-200'
                    }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 text-2xl">
                      {alert.severity === 'HIGH' ? '🔴' : '🟡'}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          className={`px-2 py-1 text-xs font-bold rounded ${alert.severity === 'HIGH'
                            ? 'bg-red-600 text-white'
                            : 'bg-yellow-600 text-white'
                            }`}
                        >
                          {alert.severity} SEVERITY
                        </span>
                        <span className="font-semibold text-gray-900">{alert.productName}</span>
                      </div>
                      <p className="text-sm text-gray-700 mb-3">{alert.message}</p>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-gray-600">Previous Cost:</span>
                          <span className="ml-2 font-semibold text-gray-900">
                            {formatCurrency(parseFloat(alert.details.previousCost))}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-600">New Cost:</span>
                          <span className="ml-2 font-semibold text-gray-900">
                            {formatCurrency(parseFloat(alert.details.newCost))}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-600">Change:</span>
                          <span className="ml-2 font-semibold text-gray-900">
                            {parseFloat(alert.details.changeAmount) > 0 ? '+' : ''}
                            {formatCurrency(parseFloat(alert.details.changeAmount))}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-600">Percentage:</span>
                          <span className="ml-2 font-semibold text-gray-900">
                            {parseFloat(alert.details.changePercentage) > 0 ? '+' : ''}
                            {parseFloat(alert.details.changePercentage).toFixed(2)}%
                          </span>
                        </div>
                        {alert.details.batchNumber && (
                          <div className="col-span-2">
                            <span className="text-gray-600">Batch:</span>
                            <span className="ml-2 font-mono text-sm text-gray-900">
                              {alert.details.batchNumber}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6">
                <p className="text-sm text-blue-800">
                  ℹ️ Cost changes have been applied. Pricing formulas will be recalculated
                  automatically.
                </p>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => setShowAlertsModal(false)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Acknowledge
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create GR Modal */}
      {showCreateModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => {
            setShowCreateModal(false);
            setSelectedPoId('');
            setPoSearch('');
            setPoPage(1);
            setFocusedPoIndex(0);
          }}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Create Goods Receipt from PO</h3>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setSelectedPoId('');
                  setPoSearch('');
                  setPoPage(1);
                  setFocusedPoIndex(0);
                }}
                className="text-gray-400 hover:text-gray-600 text-xl"
              >
                ×
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label htmlFor="po-search" className="block text-sm font-medium text-gray-700 mb-1">
                  Search POs (status: PENDING)
                </label>
                <input
                  id="po-search"
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="Search by PO number or supplier"
                  value={poSearch}
                  onChange={(e) => setPoSearch(e.target.value)}
                />
              </div>
              <div
                className="border rounded-lg max-h-64 overflow-y-auto"
                role="radiogroup"
                aria-label="Pending purchase orders"
                onKeyDown={(e) => {
                  if (filteredPOs.length === 0) return;
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    const next = Math.min(filteredPOs.length - 1, focusedPoIndex + 1);
                    setFocusedPoIndex(next);
                    const el = poRadioRefs.current[next];
                    el?.focus();
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    const prev = Math.max(0, focusedPoIndex - 1);
                    setFocusedPoIndex(prev);
                    const el = poRadioRefs.current[prev];
                    el?.focus();
                  } else if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    const current = poRadioRefs.current[focusedPoIndex];
                    if (current) {
                      current.checked = true;
                      const val = current.value;
                      setSelectedPoId(val);
                      ensurePoQuickView(val);
                    }
                  }
                }}
              >
                {pendingPOsQuery.isLoading ? (
                  <div className="p-3 text-sm text-gray-500">Loading pending POs…</div>
                ) : filteredPOs.length === 0 ? (
                  <div className="p-3 text-sm text-gray-500">No pending POs found</div>
                ) : (
                  <ul>
                    {filteredPOs.map((po: PORow, idx: number) => {
                      const orderNumber = po.order_number || po.poNumber;
                      const supplierName = po.supplier_name || po.supplierName;
                      const orderDate = formatDisplayDate(po.order_date || po.orderDate);
                      const totalAmount = po.total_amount ?? po.totalAmount ?? 0;
                      const qv = poQuickView[po.id];
                      return (
                        <li key={po.id} className="border-b last:border-b-0">
                          <label
                            className="flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50"
                            onMouseEnter={() => ensurePoQuickView(po.id)}
                            onFocus={() => ensurePoQuickView(po.id)}
                          >
                            <input
                              ref={(el) => {
                                if (el) poRadioRefs.current[idx] = el;
                              }}
                              type="radio"
                              name="selected-po"
                              value={po.id}
                              checked={selectedPoId === po.id}
                              onChange={() => {
                                setSelectedPoId(po.id);
                                ensurePoQuickView(po.id);
                              }}
                              aria-label={`Select ${orderNumber} from ${supplierName}`}
                            />
                            <div className="flex-1">
                              <div className="text-sm font-medium text-gray-900">{orderNumber}</div>
                              <div className="text-xs text-gray-600">{supplierName}</div>
                              <div className="text-xs text-gray-500 mt-1">
                                {qv
                                  ? `${qv.itemsCount} item${qv.itemsCount === 1 ? '' : 's'}`
                                  : 'items: —'}{' '}
                                • Total {formatCurrency(totalAmount)}
                              </div>
                            </div>
                            <div className="text-xs text-gray-500">{orderDate}</div>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              {poPagination && (
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <div>
                    Page {poPagination.page} of {poPagination.totalPages}
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="px-2 py-1 border rounded"
                      disabled={poPage === 1}
                      onClick={() => setPoPage(Math.max(1, poPage - 1))}
                    >
                      Prev
                    </button>
                    <button
                      className="px-2 py-1 border rounded"
                      disabled={poPage === poPagination.totalPages}
                      onClick={() => setPoPage(Math.min(poPagination.totalPages, poPage + 1))}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setSelectedPoId('');
                    setPoSearch('');
                    setPoPage(1);
                    setFocusedPoIndex(0);
                  }}
                  className="px-4 py-2 border rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateGR}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  disabled={createGRMutation.isPending || !selectedPoId}
                >
                  {createGRMutation.isPending ? 'Creating…' : 'Create GR'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Child row component to satisfy React Hook rules
function GRItemRow({
  item,
  baseline,
  selectedGR,
  editState,
  onFieldChange,
  batchWarnings,
  validationTimeout,
  checkBatchDuplicate,
  isFromPO,
  itemIndex,
  totalItems,
}: {
  item: GRItemRow;
  baseline: 'PO' | 'PRODUCT';
  selectedGR: GRRow;
  editState: EditItemState;
  onFieldChange: (
    itemId: string,
    field: string,
    value: string | number | boolean | undefined
  ) => void;
  batchWarnings: Record<string, string>;
  validationTimeout: React.MutableRefObject<Record<string, NodeJS.Timeout>>;
  checkBatchDuplicate: (itemId: string, batchNumber: string) => Promise<void>;
  isFromPO: boolean;
  itemIndex: number;
  totalItems: number;
}) {
  const es = editState || {};
  const ordered = Number(item.orderedQuantity ?? item.ordered_quantity ?? 0);
  const baseReceived = Number(
    es.receivedQuantity ??
    item.receivedQuantity ??
    item.received_quantity ??
    (selectedGR.status === 'DRAFT' ? ordered : 0)
  );
  const disabled = selectedGR.status !== 'DRAFT';
  const baseUnitCost = Number(es.unitCost ?? item.unitCost ?? item.unit_cost ?? 0);
  const poBase = Number(item.po_unit_price ?? item.poUnitPrice ?? 0);
  const prodBase = Number(item.product_cost_price ?? item.productCostPrice ?? 0);
  const base = baseline === 'PO' ? poBase : prodBase;
  const productId = item.productId || item.product_id;

  // Fetch product with pre-computed UoM details from server
  const { data: productWithUoms, isLoading: uomsLoading } = useProductWithUoms(productId);
  const uomList = productWithUoms?.uoms || [];
  const defaultUom = getDefaultUom(productWithUoms);
  const selectedUomId = es.selectedUomId || defaultUom?.id;
  const selectedUom = findUom(productWithUoms, selectedUomId || '');
  const factor = selectedUom ? new Decimal(selectedUom.conversionFactor).toNumber() : 1;

  const displayedOrdered = new Decimal(ordered || 0).div(factor).toNumber();
  const displayedReceived = new Decimal(baseReceived || 0).div(factor).toNumber();
  const displayedUnitCost = new Decimal(baseUnitCost || 0).mul(factor).toNumber();

  // Calculate variance using BASE UNITS (not displayed UoM values)
  const qtyVariancePct =
    ordered > 0
      ? new Decimal(baseReceived || 0).minus(ordered).div(ordered).mul(100).toNumber()
      : 0;
  let costVarPct: number | null = null;
  let costVarAbs: number | null = null;
  if (base && base > 0) {
    const baselineDisplay = new Decimal(base).mul(factor);
    const dAbs = new Decimal(displayedUnitCost).minus(baselineDisplay);
    costVarAbs = dAbs.toNumber();
    const dPct = dAbs.div(baselineDisplay).mul(100);
    costVarPct = dPct.toNumber();
  }

  const receivedError = ((): string | null => {
    if (es.receivedQuantity == null) return null;
    if (Number(es.receivedQuantity) < 0) return 'Must be ≥ 0';
    if (ordered !== undefined && Number(es.receivedQuantity) > Number(ordered))
      return 'Cannot exceed ordered';
    return null;
  })();
  const unitCostError = ((): string | null => {
    if (es.unitCost == null) return null;
    return Number(es.unitCost) < 0 ? 'Must be ≥ 0' : null;
  })();
  const expiryError = ((): string | null => {
    const v = es.expiryDate;
    if (!v) return null;
    const d = new Date(v);
    if (isNaN(d.getTime())) return 'Invalid date';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return d <= today ? 'Must be a future date' : null;
  })();

  // Line completeness indicator (Problem 6)
  const hasBatch = !!(es.batchNumber ?? '').trim();
  const hasExpiry = !!(es.expiryDate ?? '').trim();
  const hasQty = baseReceived > 0;
  const isComplete = hasBatch && hasExpiry && hasQty;
  const isPartial = hasQty && (!hasBatch || !hasExpiry);
  const rowBorderColor = disabled
    ? ''
    : isComplete
      ? 'border-l-4 border-l-green-500 bg-green-50/30'
      : isPartial
        ? 'border-l-4 border-l-yellow-500 bg-yellow-50/30'
        : 'border-l-4 border-l-red-300';

  return (
    <tr className={`hover:bg-gray-50 ${rowBorderColor}`}>
      {/* Product name */}
      <td className="px-4 py-2 text-sm font-medium text-gray-900">
        {item.productName || item.product_name}
        {isComplete && !disabled && <span className="ml-1 text-green-600">✓</span>}
      </td>
      {/* UoM */}
      <td className="px-4 py-2 text-sm">
        {uomsLoading ? (
          <span className="text-gray-400">…</span>
        ) : uomList.length === 0 ? (
          <span className="text-gray-400">—</span>
        ) : (
          <select
            className="border rounded px-2 py-1 text-sm"
            disabled={disabled || isFromPO}
            value={selectedUomId}
            onChange={(e) => onFieldChange(item.id, 'selectedUomId', e.target.value)}
            aria-label={`Unit of Measure for ${item.productName || item.product_name}`}
            title={isFromPO ? 'UoM locked — defined by Purchase Order' : 'Unit of Measure'}
          >
            {uomList.map((u) => (
              <option key={u.id} value={u.id}>
                {u.uomSymbol || u.uomName}
                {u.isDefault ? ' •' : ''}
              </option>
            ))}
          </select>
        )}
      </td>
      {/* Ordered */}
      <td className="px-4 py-2 text-sm text-center text-gray-700 font-medium">{displayedOrdered}</td>
      {/* Received — single input (Problem 3) */}
      <td className="px-4 py-2 text-sm">
        <input
          type="number"
          min={0}
          data-gr-received-idx={itemIndex}
          className={`w-20 border rounded px-2 py-1 text-center font-medium ${receivedError ? 'border-red-500 bg-red-50' : 'focus:ring-2 focus:ring-blue-400 focus:border-blue-400'}`}
          value={displayedReceived}
          disabled={disabled}
          aria-label={`Received quantity for ${item.productName || item.product_name}`}
          onChange={(e) => {
            const uomQty = e.target.value === '' ? 0 : Number(e.target.value);
            const totalBase = new Decimal(uomQty).mul(factor).toNumber();
            onFieldChange(item.id, 'receivedQuantity', totalBase);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              const batchInput = document.querySelector(`[data-gr-batch-idx="${itemIndex}"]`) as HTMLInputElement;
              batchInput?.focus();
            }
          }}
          autoFocus={itemIndex === 0 && !disabled}
        />
        {receivedError && <div className="text-xs text-red-600 mt-0.5">{receivedError}</div>}
      </td>
      {/* Unit Cost */}
      <td className="px-4 py-2 text-sm">
        {isFromPO ? (
          <div>
            <div className="text-sm font-medium text-gray-900">
              {formatCurrency(displayedUnitCost)}
            </div>
            <div className="text-xs text-blue-600 mt-0.5">PO Agreed</div>
          </div>
        ) : (
          <>
            <input
              type="number"
              min={0}
              step="0.01"
              className={`w-28 border rounded px-2 py-1 ${unitCostError ? 'border-red-500' : ''}`}
              value={Number.isFinite(displayedUnitCost) ? displayedUnitCost : ''}
              disabled={disabled}
              aria-label={`Unit cost for ${item.productName || item.product_name}`}
              onChange={(e) => {
                const v = e.target.value === '' ? undefined : Number(e.target.value);
                if (v === undefined) {
                  onFieldChange(item.id, 'unitCost', undefined);
                } else {
                  const baseVal = new Decimal(v).div(factor).toNumber();
                  onFieldChange(item.id, 'unitCost', baseVal);
                }
              }}
            />
            {unitCostError && <div className="text-xs text-red-600 mt-1">{unitCostError}</div>}
          </>
        )}
      </td>
      {/* Batch + Expiry — horizontal same cell (Problem 5) */}
      <td className="px-4 py-2 text-sm">
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <input
              type="text"
              data-gr-batch-idx={itemIndex}
              className={`w-full border rounded px-2 py-1 text-sm ${batchWarnings[item.id] ? 'border-red-500' : 'focus:ring-2 focus:ring-blue-400 focus:border-blue-400'}`}
              value={es.batchNumber ?? ''}
              disabled={disabled}
              onChange={(e) => {
                const value = e.target.value;
                onFieldChange(item.id, 'batchNumber', value);
                if (validationTimeout.current[item.id]) {
                  clearTimeout(validationTimeout.current[item.id]);
                }
                validationTimeout.current[item.id] = setTimeout(() => {
                  checkBatchDuplicate(item.id, value);
                }, 500);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const expiryInput = document.querySelector(`[data-gr-expiry-idx="${itemIndex}"]`) as HTMLInputElement;
                  expiryInput?.focus();
                }
              }}
              placeholder="Batch #"
            />
            {batchWarnings[item.id] && (
              <div className="text-xs text-red-600 mt-0.5 truncate max-w-[120px]" title={batchWarnings[item.id]}>{batchWarnings[item.id]}</div>
            )}
          </div>
          <div className="flex-1">
            <input
              type="date"
              data-gr-expiry-idx={itemIndex}
              className={`w-full border rounded px-2 py-1 text-sm ${expiryError ? 'border-red-500' : 'focus:ring-2 focus:ring-blue-400 focus:border-blue-400'}`}
              value={es.expiryDate ?? ''}
              disabled={disabled}
              min={new Date().toISOString().split('T')[0]}
              onChange={(e) => onFieldChange(item.id, 'expiryDate', e.target.value || undefined)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (itemIndex + 1 < totalItems) {
                    const nextReceived = document.querySelector(`[data-gr-received-idx="${itemIndex + 1}"]`) as HTMLInputElement;
                    nextReceived?.focus();
                  }
                }
              }}
            />
            {expiryError && <div className="text-xs text-red-600 mt-0.5">{expiryError}</div>}
          </div>
        </div>
      </td>
      {/* Bonus */}
      <td className="px-4 py-2 text-sm text-center">
        <label
          className="inline-flex items-center gap-1 cursor-pointer"
          title="Mark as bonus stock (zero cost)"
        >
          <input
            type="checkbox"
            checked={!!(es.isBonus ?? item.isBonus ?? item.is_bonus ?? false)}
            disabled={disabled}
            onChange={(e) => onFieldChange(item.id, 'isBonus', e.target.checked)}
            className="rounded border-gray-300 text-green-600 focus:ring-green-500"
            aria-label={`Bonus stock for ${item.productName || item.product_name}`}
          />
          {!!(es.isBonus ?? item.isBonus ?? item.is_bonus) && (
            <span className="text-xs text-green-700 font-medium">FREE</span>
          )}
        </label>
      </td>
      {/* Combined Variance column */}
      <td className="px-4 py-2 text-sm">
        <div className="flex flex-col gap-1">
          {displayedOrdered > 0 && (
            <span
              className={`inline-block px-1.5 py-0.5 rounded text-xs font-semibold ${qtyVariancePct > 0 ? 'bg-yellow-100 text-yellow-800' : qtyVariancePct < 0 ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'}`}
              title="Quantity variance"
            >
              Qty {qtyVariancePct > 0 ? '+' : ''}{qtyVariancePct.toFixed(1)}%
            </span>
          )}
          {costVarPct !== null && (
            <span
              className={`inline-block px-1.5 py-0.5 rounded text-xs font-semibold ${costVarPct > 0 ? 'bg-red-100 text-red-800' : costVarPct < 0 ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}
              title={`Cost variance vs ${baseline === 'PO' ? 'PO' : 'product'}: ${costVarAbs !== null ? formatCurrency(Math.abs(costVarAbs)) : ''}`}
            >
              Cost {costVarPct > 0 ? '+' : ''}{costVarPct.toFixed(1)}%
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}
