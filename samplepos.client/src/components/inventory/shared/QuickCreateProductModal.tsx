import { useState } from 'react';
import ProductForm, { type ProductFormValues, type ProductFormField } from '@/components/products/ProductForm';
import { validateProductValues } from '@/validation/product';
import { useCreateProduct } from '@/hooks/useProducts';
import { getErrorMessage } from '@/utils/api';
import type { CreateProductInput } from '@/types/inputs';

const initialValues: ProductFormValues = {
  name: '',
  sku: '',
  barcode: '',
  description: '',
  category: '',
  genericName: '',
  costPrice: '',
  sellingPrice: '',
  costingMethod: 'FIFO',
  isTaxable: false,
  taxRate: '18',
  pricingFormula: '',
  autoUpdatePrice: false,
  reorderLevel: '10',
  trackExpiry: false,
  minDaysBeforeExpirySale: '0',
  isActive: true,
  preferredSupplierId: '',
  supplierProductCode: '',
  purchaseUomId: '',
  leadTimeDays: '0',
  reorderQuantity: '0',
};

interface QuickCreateProductModalProps {
  onClose: () => void;
  onCreated: (product: { id: string; name: string }) => void;
  /** Pre-fill suggested name from search text */
  suggestedName?: string;
}

export function QuickCreateProductModal({ onClose, onCreated, suggestedName }: QuickCreateProductModalProps) {
  const [values, setValues] = useState<ProductFormValues>(() => ({
    ...initialValues,
    name: suggestedName || '',
    sku: `PRD-${Date.now().toString(36).toUpperCase().slice(-5)}`,
  }));
  const [validationErrors, setValidationErrors] = useState<Partial<Record<ProductFormField, string>>>({});
  const [error, setError] = useState('');

  const createMutation = useCreateProduct();

  const handleChange = (field: ProductFormField, value: string | boolean) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    // Clear field error on change
    if (validationErrors[field]) {
      setValidationErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const result = validateProductValues(values);
    if (!result.valid) {
      setValidationErrors(result.errors);
      return;
    }

    try {
      const productData: CreateProductInput = {
        name: values.name.trim(),
        sku: values.sku.trim(),
        barcode: values.barcode?.trim() || undefined,
        description: values.description?.trim() || undefined,
        category: values.category?.trim() || undefined,
        costPrice: parseFloat(values.costPrice) || 0,
        sellingPrice: parseFloat(values.sellingPrice) || 0,
        costingMethod: values.costingMethod as 'FIFO' | 'AVCO' | 'STANDARD',
        isTaxable: values.isTaxable,
        taxRate: parseFloat(values.taxRate) || 0,
        reorderLevel: parseFloat(values.reorderLevel) || 0,
        trackExpiry: values.trackExpiry,
        isActive: values.isActive,
      };

      const response = await createMutation.mutateAsync(productData);
      const created = response?.data as { id: string; name: string } | undefined;

      if (created?.id) {
        onCreated({ id: created.id, name: created.name || values.name.trim() });
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-[60]"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b px-5 py-3 flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-900">Quick Add Product</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <div className="p-5">
          {error && (
            <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <ProductForm
              values={values}
              onChange={handleChange}
              validationErrors={validationErrors}
            />

            <div className="flex justify-end gap-2 pt-4 mt-4 border-t">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {createMutation.isPending ? 'Creating...' : 'Create Product'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
