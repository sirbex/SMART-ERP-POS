import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { useState } from "react";
import { useCreateGoodsReceipt } from "@/hooks/useGoodsReceipts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/utils/api";
import { Loader2, Trash2, Plus } from "lucide-react";
import Decimal from "decimal.js";
import ProductForm, { ProductFormValues, ProductFormField } from "@/components/products/ProductForm";
import { validateProductValues, ProductValidationErrors } from "@/validation/product";
import type { CreateProductInput } from "@/types/inputs";
import type { Product } from "@/types/business";
import type { ApiResponse } from "@/types/api";
import { AxiosError } from "axios";
import { UomSelector } from "./UomSelector";
import { convertQtyToBase, convertCostToBase } from "@/utils/uom";
import {
  SupplierSelector,
  NotesField,
  ProductSearchBar,
  BusinessRulesInfo,
  GOODS_RECEIPT_RULES,
  type SearchableProduct,
} from "./shared";

interface ManualGRItem {
  productId: string;
  productName: string;
  receivedQuantity: number;
  unitCost: number;
  productCostPrice: number; // For variance calculation
  batchNumber?: string;
  expiryDate?: string;
  trackExpiry?: boolean; // Whether this product requires expiry tracking
  selectedUomId?: string | null; // Selected UoM for this item
  conversionFactor?: string; // Conversion factor for selected UoM
}

interface ManualGRModalProps {
  open: boolean;
  onClose: () => void;
}

export default function ManualGRModal({ open, onClose }: ManualGRModalProps) {
  const [selectedItems, setSelectedItems] = useState<ManualGRItem[]>([]);
  const [notes, setNotes] = useState("");
  const [supplierId, setSupplierId] = useState<string>("");
  const [showCreateProductModal, setShowCreateProductModal] = useState(false);
  const [newProduct, setNewProduct] = useState<ProductFormValues>({
    name: "",
    sku: "",
    barcode: "",
    description: "",
    category: "",
    costPrice: "",
    sellingPrice: "",
    costingMethod: "FIFO",
    isTaxable: true,
    taxRate: "18",
    pricingFormula: "",
    autoUpdatePrice: false,
    reorderLevel: "10",
    trackExpiry: false,
    isActive: true,
    genericName: "",
    minDaysBeforeExpirySale: "0",
  });
  const [productValidationErrors, setProductValidationErrors] = useState<ProductValidationErrors>({});

  const createGRMutation = useCreateGoodsReceipt();
  const queryClient = useQueryClient();

  // Create product mutation
  const createProductMutation = useMutation({
    mutationFn: (productData: CreateProductInput) => api.products.create(productData),
    onSuccess: (response) => {
      // Invalidate products query to refresh the list
      queryClient.invalidateQueries({ queryKey: ["products"] });

      // Add the newly created product to selected items
      const responseData = response.data as ApiResponse<Product>;
      const product = responseData?.data ?? (responseData as unknown as Product);
      const newItem: ManualGRItem = {
        productId: product.id,
        productName: product.name,
        receivedQuantity: 1,
        unitCost: Number(product.costPrice || 0),
        productCostPrice: Number(product.costPrice || 0),
        batchNumber: "",
        expiryDate: "",
        trackExpiry: product.trackExpiry || false,
        selectedUomId: null,
      };
      setSelectedItems((prev) => [...prev, newItem]);

      // Reset form and close modal
      setNewProduct({
        name: "",
        sku: "",
        barcode: "",
        description: "",
        category: "",
        costPrice: "",
        sellingPrice: "",
        costingMethod: "FIFO",
        isTaxable: true,
        taxRate: "18",
        pricingFormula: "",
        autoUpdatePrice: false,
        reorderLevel: "10",
        trackExpiry: false,
        isActive: true,
        genericName: "",
        minDaysBeforeExpirySale: "0",
      });
      setShowCreateProductModal(false);
    },
    onError: (error: Error) => {
      console.error("Failed to create product:", error.message);
    }
  });

  const handleAddProduct = (product: SearchableProduct) => {
    // Check if already added
    if (selectedItems.some(item => item.productId === product.id)) {
      console.warn("Product already added");
      return;
    }

    const costPrice = product.costPrice ?? product.cost_price ?? 0;
    const newItem: ManualGRItem = {
      productId: product.id,
      productName: product.name,
      receivedQuantity: 1,
      unitCost: Number(costPrice),
      productCostPrice: Number(costPrice),
      batchNumber: "",
      expiryDate: "",
      trackExpiry: !!(product.trackExpiry ?? false),
      selectedUomId: null,
    };

    setSelectedItems((prev) => [...prev, newItem]);
  };

  const updateItem = (index: number, field: keyof ManualGRItem, value: ManualGRItem[keyof ManualGRItem]) => {
    setSelectedItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      )
    );
  };

  const removeItem = (index: number) => {
    setSelectedItems((prev) => prev.filter((_, i) => i !== index));
  };

  const calculateVariance = (item: ManualGRItem) => {
    if (item.productCostPrice === 0) return { percent: 0, color: "text-gray-600" };

    const current = new Decimal(item.unitCost);
    const baseline = new Decimal(item.productCostPrice);
    const diff = current.minus(baseline);
    const percent = diff.div(baseline).times(100);

    if (percent.gt(0)) {
      return { percent: percent.toNumber(), color: "text-red-600", prefix: "+" };
    } else if (percent.lt(0)) {
      return { percent: percent.toNumber(), color: "text-green-600", prefix: "" };
    }
    return { percent: 0, color: "text-gray-600", prefix: "" };
  };

  const hasValidationErrors = () => {
    return selectedItems.some((item) => {
      if (item.receivedQuantity <= 0) return true;
      if (item.unitCost < 0) return true;

      // Only validate expiry if product tracks expiry
      if (item.trackExpiry) {
        if (!item.expiryDate || item.expiryDate.trim() === "") {
          return true; // Expiry is required for tracked products
        }
        const expiry = new Date(item.expiryDate);
        if (expiry < new Date()) return true; // Cannot be in the past
      }

      return false;
    });
  };

  const handleSubmit = async () => {
    if (!supplierId) {
      console.error("Please select a supplier");
      return;
    }

    if (selectedItems.length === 0) {
      console.error("Please add at least one product");
      return;
    }

    if (hasValidationErrors()) {
      console.error("Please fix validation errors before saving");
      return;
    }

    try {
      const user = JSON.parse(localStorage.getItem("user") || "{}") as { id?: string };

      const payload = {
        supplierId: supplierId, // Send supplierId instead of purchaseOrderId
        purchaseOrderId: null, // Explicitly null
        receiptDate: new Date().toISOString(),
        receivedBy: user.id,
        notes: notes || null,
        source: "MANUAL",
        items: selectedItems.map((item) => {
          // Convert quantity to base units if UoM is selected
          let baseQuantity = Number(item.receivedQuantity);
          let baseUnitCost = Number(item.unitCost);
          if (item.selectedUomId && item.conversionFactor) {
            baseQuantity = parseFloat(convertQtyToBase(item.receivedQuantity, item.conversionFactor));
            baseUnitCost = parseFloat(convertCostToBase(item.unitCost, item.conversionFactor));
          }

          return {
            poItemId: undefined,
            productId: String(item.productId),
            productName: item.productName,
            orderedQuantity: baseQuantity,
            receivedQuantity: baseQuantity,
            unitCost: baseUnitCost,
            batchNumber: item.batchNumber || undefined,
            expiryDate: item.expiryDate && item.expiryDate.trim() !== "" ? item.expiryDate : undefined,
          };
        }),
      };

      console.log("Submitting manual GR payload:", JSON.stringify(payload, null, 2));
      await createGRMutation.mutateAsync(payload);
      console.log("Manual goods receipt created successfully!");

      // Reset form
      setSupplierId("");
      setSelectedItems([]);
      setNotes("");

      onClose();
    } catch (err: unknown) {
      const axiosErr = err as AxiosError<ApiResponse>;
      console.error("Failed to create goods receipt:", axiosErr?.response?.data?.error || axiosErr.message);
      if (axiosErr?.response?.data) {
        console.error("Validation details:", axiosErr.response.data);
      }
    }
  };

  const handleCreateProduct = async () => {
    // Zod validation using shared schema
    const z = validateProductValues(newProduct);
    if (!z.valid) {
      setProductValidationErrors(z.errors);
      return;
    }
    setProductValidationErrors({});

    const productData = z.data;

    try {
      await createProductMutation.mutateAsync(productData as CreateProductInput);
    } catch (err: unknown) {
      const axiosErr = err as AxiosError<ApiResponse>;
      console.error("Failed to create product:", axiosErr?.response?.data?.error || axiosErr.message);
    }
  };

  // Check if there's unsaved data
  const hasUnsavedData = selectedItems.length > 0 || supplierId || notes.trim() !== "";

  const handleCloseAttempt = () => {
    if (hasUnsavedData) {
      const confirmed = window.confirm(
        "You have unsaved changes. Are you sure you want to close?"
      );
      if (confirmed) {
        // Reset form
        setSupplierId("");
        setSelectedItems([]);
        setNotes("");
        onClose();
      }
    } else {
      onClose();
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(isOpen) => {
          if (!isOpen) handleCloseAttempt();
        }}
      >
        <DialogContent
          className="max-w-5xl"
          onEscapeKeyDown={(e) => {
            if (hasUnsavedData) {
              e.preventDefault();
              handleCloseAttempt();
            }
          }}
          onPointerDownOutside={(e) => {
            if (hasUnsavedData) {
              e.preventDefault();
              handleCloseAttempt();
            }
          }}
          onInteractOutside={(e) => {
            if (hasUnsavedData) {
              e.preventDefault();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Manual Goods Receipt</DialogTitle>
            <DialogDescription>
              Record received goods without a purchase order. Add existing or new products.
            </DialogDescription>
          </DialogHeader>

          {/* Supplier and Notes */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <SupplierSelector
                value={supplierId}
                onChange={setSupplierId}
                className="md:col-span-1"
              />
              <NotesField
                value={notes}
                onChange={setNotes}
                placeholder="Optional notes..."
                className="md:col-span-2"
              />
            </div>

            {/* Product Search */}
            <div className="border-t pt-4">
              <div className="flex items-center gap-2 mb-3">
                <ProductSearchBar
                  onProductSelect={handleAddProduct}
                  placeholder="Search products by name, SKU, or barcode"
                  className="flex-1"
                />
                <Button type="button" variant="outline" onClick={() => setShowCreateProductModal(true)}>
                  <Plus className="w-4 h-4 mr-2" /> New Product
                </Button>
              </div>
            </div>

            {/* Selected Items */}
            <div className="border-t pt-4">
              <h4 className="font-medium text-gray-900 mb-3">Selected Items</h4>
              {selectedItems.length === 0 ? (
                <div className="text-sm text-gray-500">No items added yet.</div>
              ) : (
                <div className="space-y-3">
                  {selectedItems.map((item, idx) => {
                    const variance = calculateVariance(item);
                    return (
                      <div key={idx} className="p-3 border rounded-lg grid grid-cols-1 md:grid-cols-6 gap-3 items-center">
                        <div className="md:col-span-2">
                          <div className="text-sm font-medium flex items-center gap-2">
                            <span>{item.productName}</span>
                            <UomSelector
                              productId={item.productId}
                              baseCost={item.productCostPrice}
                              selectedUomId={item.selectedUomId}
                              onChange={(params) => {
                                updateItem(idx, "unitCost", parseFloat(params.newCost));
                                updateItem(idx, "selectedUomId", params.uomId);
                                updateItem(idx, "conversionFactor", params.conversionFactor);
                              }}
                              className="text-xs"
                            />
                          </div>
                        </div>
                        <div>
                          <label htmlFor={`qty-${idx}`} className="block text-xs text-gray-600 mb-1">Qty</label>
                          <input
                            id={`qty-${idx}`}
                            type="number"
                            min={0}
                            className="w-full px-2 py-1.5 border rounded"
                            value={item.receivedQuantity}
                            onChange={(e) => updateItem(idx, "receivedQuantity", Number(e.target.value))}
                            placeholder="0"
                          />
                        </div>
                        <div>
                          <label htmlFor={`unitcost-${idx}`} className="block text-xs text-gray-600 mb-1">Unit Cost</label>
                          <input
                            id={`unitcost-${idx}`}
                            type="number"
                            min={0}
                            step="0.01"
                            className="w-full px-2 py-1.5 border rounded"
                            value={item.unitCost}
                            onChange={(e) => updateItem(idx, "unitCost", Number(e.target.value))}
                            placeholder="0.00"
                          />
                          <div className={`text-xs mt-1 ${variance.color}`}>
                            {variance.prefix}
                            {Number.isFinite(variance.percent) ? variance.percent.toFixed(1) : 0}% vs cost
                          </div>
                        </div>
                        <div>
                          <label htmlFor={`batch-${idx}`} className="block text-xs text-gray-600 mb-1">Batch</label>
                          <input
                            id={`batch-${idx}`}
                            type="text"
                            className="w-full px-2 py-1.5 border rounded"
                            value={item.batchNumber || ""}
                            onChange={(e) => updateItem(idx, "batchNumber", e.target.value)}
                            placeholder="Batch number"
                          />
                        </div>
                        {item.trackExpiry && (
                          <div>
                            <label htmlFor={`expiry-${idx}`} className="block text-xs text-gray-600 mb-1">Expiry</label>
                            <DatePicker
                              value={item.expiryDate || ''}
                              onChange={(date) => updateItem(idx, "expiryDate", date)}
                              placeholder="Expiry date"
                              minDate={new Date()}
                            />
                          </div>
                        )}
                        <div className="flex justify-end">
                          <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(idx)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Business Rules Info */}
            <BusinessRulesInfo rules={GOODS_RECEIPT_RULES} className="mt-4" />

            {/* Footer Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={!supplierId || selectedItems.length === 0 || hasValidationErrors() || createGRMutation.isPending}
              >
                {createGRMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save as Draft"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Product Modal */}
      <Dialog open={showCreateProductModal} onOpenChange={setShowCreateProductModal}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Product</DialogTitle>
            <DialogDescription>Register a new product and add it to this receipt.</DialogDescription>
          </DialogHeader>

          <div className="p-1 space-y-4">
            <ProductForm
              values={newProduct}
              onChange={(field: ProductFormField, value: ProductFormValues[ProductFormField]) => setNewProduct({ ...newProduct, [field]: value })}
              validationErrors={productValidationErrors}
            />

            <div className="flex justify-end gap-3 pt-3 border-t">
              <Button
                type="button"
                variant="outline"
                disabled={createProductMutation.isPending}
                onClick={() => {
                  setShowCreateProductModal(false);
                  setNewProduct({
                    name: "",
                    sku: "",
                    barcode: "",
                    description: "",
                    category: "",
                    costPrice: "",
                    sellingPrice: "",
                    costingMethod: "FIFO",
                    isTaxable: true,
                    taxRate: "18",
                    pricingFormula: "",
                    autoUpdatePrice: false,
                    reorderLevel: "10",
                    trackExpiry: false,
                    isActive: true,
                    genericName: "",
                    minDaysBeforeExpirySale: "0",
                  });
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleCreateProduct}
                disabled={!newProduct.name.trim() || !newProduct.costPrice || !newProduct.sellingPrice || createProductMutation.isPending}
              >
                {createProductMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create & Add Product"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}


