/**
 * Inventory worklist column visibility SSOT.
 * Users tick which columns to show; prefs persist per page in localStorage.
 * Required columns cannot be hidden. resolveVisibleColumnIds never returns empty.
 */

export type InventoryWorklistId =
  | 'products'
  | 'adjustments'
  | 'stock-levels'
  | 'stock-movements'
  | 'goods-receipts'
  | 'purchase-orders'
  | 'supplier-returns'
  | 'batch-management';

export type InventoryColumnDef = {
  id: string;
  label: string;
  /** Shown by default when no prefs saved */
  default?: boolean;
  /** Cannot be unchecked */
  required?: boolean;
};

const STORAGE_PREFIX = 'inventory.worklist.columns.v2.';

export function inventoryColumnStorageKey(worklistId: InventoryWorklistId): string {
  return `${STORAGE_PREFIX}${worklistId}`;
}

export const INVENTORY_WORKLIST_COLUMNS: Record<InventoryWorklistId, InventoryColumnDef[]> = {
  products: [
    { id: 'product', label: 'Product', default: true, required: true },
    { id: 'category', label: 'Category', default: true },
    { id: 'sku', label: 'SKU', default: true },
    { id: 'pricing', label: 'Pricing', default: true },
    { id: 'margin', label: 'Margin', default: true },
    { id: 'store', label: 'Store', default: true },
    { id: 'stock', label: 'Stock', default: true },
    { id: 'expiry', label: 'Expiry', default: true },
    { id: 'status', label: 'Status', default: true },
    { id: 'actions', label: 'Actions', default: true, required: true },
  ],
  adjustments: [
    { id: 'product', label: 'Product', default: true, required: true },
    { id: 'category', label: 'Category', default: true },
    { id: 'batchNumber', label: 'Batch Number', default: true },
    { id: 'quantity', label: 'Quantity', default: true },
    { id: 'expiryDate', label: 'Expiry Date', default: true },
    { id: 'status', label: 'Status', default: true },
  ],
  'stock-levels': [
    { id: 'product', label: 'Product', default: true, required: true },
    { id: 'category', label: 'Category', default: true },
    { id: 'store', label: 'Store', default: true },
    { id: 'quantity', label: 'Quantity', default: true },
    { id: 'price', label: 'Price', default: true },
    { id: 'reorderLevel', label: 'Reorder Level', default: true },
    { id: 'expiry', label: 'Expiry', default: true },
    { id: 'status', label: 'Status', default: true },
  ],
  'stock-movements': [
    { id: 'dateTime', label: 'Date & Time', default: true, required: true },
    { id: 'product', label: 'Product', default: true, required: true },
    { id: 'category', label: 'Category', default: true },
    { id: 'type', label: 'Type', default: true },
    { id: 'quantity', label: 'Quantity', default: true },
    { id: 'unitCost', label: 'Unit Cost', default: true },
    { id: 'totalValue', label: 'Total Value', default: true },
    { id: 'balanceAfter', label: 'Balance After', default: true },
    { id: 'reference', label: 'Reference', default: true },
    { id: 'notes', label: 'Notes', default: true },
  ],
  'goods-receipts': [
    { id: 'grNumber', label: 'GR Number', default: true, required: true },
    { id: 'poNumber', label: 'PO Number', default: true },
    { id: 'supplier', label: 'Supplier', default: true },
    { id: 'receivedDate', label: 'Received Date', default: true },
    { id: 'receiptStatus', label: 'Receipt', default: true },
    { id: 'invoiceStatus', label: 'Invoice', default: true },
    { id: 'actions', label: 'Actions', default: true, required: true },
  ],
  'purchase-orders': [
    { id: 'poNumber', label: 'PO Number', default: true, required: true },
    { id: 'supplier', label: 'Supplier', default: true },
    { id: 'orderDate', label: 'Order Date', default: true },
    { id: 'expectedDelivery', label: 'Expected Delivery', default: true },
    { id: 'status', label: 'Status', default: true },
    { id: 'totalAmount', label: 'Total Amount', default: true },
    { id: 'actions', label: 'Actions', default: true, required: true },
  ],
  'supplier-returns': [
    { id: 'return', label: 'Return', default: true, required: true },
    { id: 'date', label: 'Date', default: true },
    { id: 'supplier', label: 'Supplier', default: true },
    { id: 'sourceGr', label: 'Source GR', default: true },
    { id: 'amount', label: 'Amount', default: true },
    { id: 'nextStep', label: 'Next step', default: true },
    { id: 'billScn', label: 'Bill / SCN', default: true },
    { id: 'actions', label: 'Actions', default: true, required: true },
  ],
  'batch-management': [
    { id: 'fefo', label: 'FEFO Order', default: true },
    { id: 'product', label: 'Product', default: true, required: true },
    { id: 'sku', label: 'SKU', default: true },
    { id: 'batchNumber', label: 'Batch Number', default: true },
    { id: 'quantity', label: 'Quantity', default: true },
    { id: 'expiryDate', label: 'Expiry Date', default: true },
    { id: 'urgency', label: 'Urgency', default: true },
    { id: 'value', label: 'Value', default: true },
    { id: 'status', label: 'Status', default: true },
    { id: 'actions', label: 'Actions', default: true, required: true },
  ],
};

export function catalogForWorklist(
  worklistId: InventoryWorklistId,
  options?: { includeStore?: boolean },
): InventoryColumnDef[] {
  const catalog = INVENTORY_WORKLIST_COLUMNS[worklistId] ?? [];
  if (options?.includeStore === false) {
    return catalog.filter((c) => c.id !== 'store');
  }
  return catalog;
}

export function defaultsForWorklist(
  worklistId: InventoryWorklistId,
  options?: { includeStore?: boolean },
): string[] {
  return catalogForWorklist(worklistId, options)
    .filter((c) => c.default !== false)
    .map((c) => c.id);
}

/** Drop unknown ids; keep catalog order; always include required; never empty. */
export function resolveVisibleColumnIds(
  worklistId: InventoryWorklistId,
  selected: string[] | null | undefined,
  options?: { includeStore?: boolean },
): string[] {
  const catalog = catalogForWorklist(worklistId, options);
  if (!selected || selected.length === 0) {
    return defaultsForWorklist(worklistId, options);
  }
  const allowed = new Set(catalog.map((c) => c.id));
  const required = catalog.filter((c) => c.required).map((c) => c.id);
  const picked = selected
    .map((id) => String(id || '').trim())
    .filter((id) => allowed.has(id));
  const withRequired = [...new Set([...required, ...picked])];
  const ordered = catalog.map((c) => c.id).filter((id) => withRequired.includes(id));
  if (ordered.length === 0) return defaultsForWorklist(worklistId, options);
  return ordered;
}

export function isColumnVisible(visibleIds: string[], columnId: string): boolean {
  return visibleIds.includes(columnId);
}
