/**
 * Shared Inventory Components
 * 
 * These components ensure consistency across all inventory-related pages:
 * - Purchase Orders
 * - Manual Goods Receipt
 * - Goods Receipts
 * - Stock Adjustments
 * 
 * All components follow the Copilot instructions principle:
 * "All products with similar functionality should work consistently"
 */

export { SupplierSelector } from "./SupplierSelector";
export { NotesField } from "./NotesField";
export { ProductSearchBar, type SearchableProduct } from "./ProductSearchBar";
export { BusinessRulesInfo, PURCHASE_ORDER_RULES, GOODS_RECEIPT_RULES } from "./BusinessRulesInfo";
export { TotalsSummary } from "./TotalsSummary";
export { ModalHeader } from "./ModalHeader";
export { ModalFooter } from "./ModalFooter";
export { ModalContainer } from "./ModalContainer";
