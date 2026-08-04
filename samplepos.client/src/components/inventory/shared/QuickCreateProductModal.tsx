import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import ProductForm, { type ProductFormValues, type ProductFormField } from '@/components/products/ProductForm';
import {
    buildCreateProductInput,
    focusFirstProductValidationError,
    resolveDefaultStockUomId,
    validateProductValues,
} from '@/validation/product';
import { useCreateProduct } from '@/hooks/useProducts';
import { useSuppliers } from '@/hooks/useSuppliers';
import { api, getErrorMessage } from '@/utils/api';
import { ZINDEX } from '@/hooks/useTransactionGuard';

export type QuickCreatedProduct = {
    id: string;
    name: string;
    costPrice: number;
    trackExpiry: boolean;
    purchaseUomId: string | null;
};

const initialValues: ProductFormValues = {
    name: '',
    sku: '',
    barcode: '',
    description: '',
    category: '',
    productType: 'inventory',
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
    availableInRestaurant: true,
    preferredSupplierId: '',
    supplierProductCode: '',
    purchaseUomId: '',
    leadTimeDays: '0',
    reorderQuantity: '0',
    isPreparedFood: false,
    isBuffetCover: false,
};

interface QuickCreateProductModalProps {
    onClose: () => void;
    onCreated: (product: QuickCreatedProduct) => void;
    /** Pre-fill suggested name from search text */
    suggestedName?: string;
    /** Pre-fill preferred supplier from active PO */
    preferredSupplierId?: string;
}

export function QuickCreateProductModal({
    onClose,
    onCreated,
    suggestedName,
    preferredSupplierId,
}: QuickCreateProductModalProps) {
    const [values, setValues] = useState<ProductFormValues>(() => ({
        ...initialValues,
        name: suggestedName || '',
        sku: `PRD-${Date.now().toString(36).toUpperCase().slice(-5)}`,
        preferredSupplierId: preferredSupplierId || '',
    }));
    const [stockUomId, setStockUomId] = useState('');
    const [purchaseConversionFactor, setPurchaseConversionFactor] = useState('1');
    const [validationErrors, setValidationErrors] = useState<Partial<Record<ProductFormField, string>>>({});
    const [error, setError] = useState('');

    const createMutation = useCreateProduct();
    const { data: suppliersData } = useSuppliers();
    const suppliers = (() => {
        if (!suppliersData) return [];
        if (suppliersData.data && Array.isArray(suppliersData.data)) {
            return suppliersData.data.map((s: { id: string; name?: string; companyName?: string }) => ({
                id: s.id,
                name: s.name || s.companyName || 'Supplier',
            }));
        }
        return Array.isArray(suppliersData)
            ? suppliersData.map((s: { id: string; name?: string; companyName?: string }) => ({
                id: s.id,
                name: s.name || s.companyName || 'Supplier',
            }))
            : [];
    })();

    const { data: masterUomsResponse } = useQuery({
        queryKey: ['uoms', 'master'],
        queryFn: async () => {
            const res = await api.products.getMasterUoms();
            return res.data?.data as Array<{ id: string; name: string; symbol?: string | null }> | undefined;
        },
    });
    const masterUoms = masterUomsResponse ?? [];

    const resolvedStockUomId = resolveDefaultStockUomId(stockUomId, masterUoms);

    const purchaseUomDiffersFromBase =
        !!values.purchaseUomId &&
        !!resolvedStockUomId &&
        values.purchaseUomId !== resolvedStockUomId;

    const handleChange = (field: ProductFormField, value: string | boolean) => {
        setValues((prev) => ({ ...prev, [field]: value }));
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
            focusFirstProductValidationError(result.errors);
            return;
        }

        if (purchaseUomDiffersFromBase) {
            const factor = parseFloat(purchaseConversionFactor);
            if (!Number.isFinite(factor) || factor < 1) {
                setError('Enter how many base units are in one purchase unit (e.g. 12 for 1 BOX = 12 PC).');
                requestAnimationFrame(() => {
                    document.getElementById('purchase-conversion')?.focus();
                });
                return;
            }
        }

        try {
            const built = buildCreateProductInput(values, {
                stockUomId: resolvedStockUomId,
                masterUoms,
                purchaseConversionFactor: purchaseUomDiffersFromBase
                    ? parseFloat(purchaseConversionFactor)
                    : 1,
            });
            if (!built.ok) {
                setValidationErrors(built.errors);
                focusFirstProductValidationError(built.errors);
                return;
            }

            const response = await createMutation.mutateAsync(built.data);
            const created = response?.data as {
                id: string;
                name?: string;
                costPrice?: number;
                trackExpiry?: boolean;
                purchaseUomId?: string | null;
            } | undefined;

            if (created?.id) {
                onCreated({
                    id: created.id,
                    name: created.name || values.name.trim(),
                    costPrice: Number(created.costPrice ?? built.data.costPrice ?? 0),
                    trackExpiry: created.trackExpiry ?? values.trackExpiry,
                    purchaseUomId: created.purchaseUomId ?? values.purchaseUomId ?? null,
                });
            }
        } catch (err: unknown) {
            setError(getErrorMessage(err));
        }
    };

    return createPortal(
        <div
            className="fixed inset-0 bg-black/40 flex items-center justify-center p-4"
            style={{ zIndex: ZINDEX.NESTED_PANEL }}
            onClick={onClose}
            role="presentation"
        >
            <div
                className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[min(90vh,48rem)] flex flex-col"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="quick-add-product-title"
            >
                <div className="shrink-0 border-b px-5 py-3 flex justify-between items-center gap-3">
                    <h3 id="quick-add-product-title" className="text-lg font-semibold text-gray-900">
                        Quick Add Product
                    </h3>
                    <button
                        type="button"
                        onClick={onClose}
                        className="shrink-0 rounded-lg p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                        aria-label="Close"
                    >
                        <span className="text-xl leading-none" aria-hidden>&times;</span>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
                    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5">
                        {error && (
                            <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                                {error}
                            </div>
                        )}

                        <ProductForm
                            values={values}
                            onChange={handleChange}
                            validationErrors={validationErrors}
                            suppliers={suppliers}
                            masterUoms={masterUoms}
                        />

                        {masterUoms.length > 0 && (
                            <div className="mt-4 pt-4 border-t grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="stock-uom" className="block text-sm font-medium text-gray-700 mb-1">
                                        Base stock unit
                                    </label>
                                    <select
                                        id="stock-uom"
                                        value={resolvedStockUomId}
                                        onChange={(e) => setStockUomId(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    >
                                        {masterUoms.map((u) => (
                                            <option key={u.id} value={u.id}>
                                                {u.name}{u.symbol ? ` (${u.symbol})` : ''}
                                            </option>
                                        ))}
                                    </select>
                                    <p className="text-xs text-gray-500 mt-1">
                                        Inventory and cost price are always per this unit.
                                    </p>
                                </div>

                                {purchaseUomDiffersFromBase && (
                                    <div>
                                        <label htmlFor="purchase-conversion" className="block text-sm font-medium text-gray-700 mb-1">
                                            Base units per purchase unit
                                        </label>
                                        <input
                                            id="purchase-conversion"
                                            type="number"
                                            min="1"
                                            step="1"
                                            value={purchaseConversionFactor}
                                            onChange={(e) => setPurchaseConversionFactor(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                            placeholder="e.g. 12"
                                        />
                                        <p className="text-xs text-gray-500 mt-1">
                                            Example: 1 BOX = 12 TABLETS → enter 12. Cost price above is per tablet.
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="shrink-0 flex justify-end gap-2 border-t bg-white px-5 py-3">
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
        </div>,
        document.body,
    );
}
