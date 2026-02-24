import { useState, useRef, useEffect } from 'react';
import POSModal from './POSModal';
import Decimal from 'decimal.js';
import { formatCurrency } from '../../utils/currency';

interface ServiceItemFormData {
    name: string;
    description: string;
    unitPrice: number;
    quantity: number;
    isTaxable: boolean;
    taxRate: number;
}

interface ServiceItemResult {
    id: string;
    name: string;
    sku: string;
    uom: string;
    quantity: number;
    unitPrice: number;
    costPrice: number;
    marginPct: number;
    subtotal: number;
    productType: 'service';
    isTaxable: boolean;
    taxRate: number;
}

interface AddServiceItemDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onAdd: (item: ServiceItemResult) => void;
}

// Common service item presets for quick selection
const SERVICE_PRESETS = [
    { name: 'Transport / Delivery', icon: '🚚' },
    { name: 'Installation', icon: '🔧' },
    { name: 'Labour / Service Fee', icon: '👷' },
    { name: 'Consultation Fee', icon: '💼' },
    { name: 'Packaging', icon: '📦' },
    { name: 'Warranty / Insurance', icon: '🛡️' },
];

export default function AddServiceItemDialog({ open, onOpenChange, onAdd }: AddServiceItemDialogProps) {
    const [formData, setFormData] = useState<ServiceItemFormData>({
        name: '',
        description: '',
        unitPrice: 0,
        quantity: 1,
        isTaxable: false,
        taxRate: 18,
    });
    const [error, setError] = useState<string | null>(null);
    const nameInputRef = useRef<HTMLInputElement>(null);

    // Focus name input when dialog opens
    useEffect(() => {
        if (open) {
            setFormData({ name: '', description: '', unitPrice: 0, quantity: 1, isTaxable: false, taxRate: 18 });
            setError(null);
            setTimeout(() => nameInputRef.current?.focus(), 100);
        }
    }, [open]);

    const subtotal = new Decimal(formData.quantity).times(formData.unitPrice).toNumber();

    const handlePresetClick = (preset: { name: string }) => {
        setFormData(prev => ({ ...prev, name: preset.name }));
        // Focus the price input after selecting a preset
        setTimeout(() => {
            const priceInput = document.getElementById('service-item-price');
            priceInput?.focus();
            (priceInput as HTMLInputElement)?.select();
        }, 50);
    };

    const handleSubmit = () => {
        // Validate
        if (!formData.name.trim()) {
            setError('Please enter a name for the service item');
            nameInputRef.current?.focus();
            return;
        }
        if (formData.unitPrice <= 0) {
            setError('Price must be greater than zero');
            return;
        }
        if (formData.quantity <= 0) {
            setError('Quantity must be greater than zero');
            return;
        }

        const lineTotal = new Decimal(formData.quantity).times(formData.unitPrice).toNumber();

        const serviceItem: ServiceItemResult = {
            id: `custom_svc_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
            name: formData.name.trim(),
            sku: '',
            uom: 'SERVICE',
            quantity: formData.quantity,
            unitPrice: formData.unitPrice,
            costPrice: 0,   // Services have no cost — full amount is revenue
            marginPct: 100,  // 100% margin since zero cost
            subtotal: lineTotal,
            productType: 'service',
            isTaxable: formData.isTaxable,
            taxRate: formData.isTaxable ? formData.taxRate : 0,
        };

        onAdd(serviceItem);
        onOpenChange(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    return (
        <POSModal
            open={open}
            onOpenChange={onOpenChange}
            title="Add Service / Non-Inventory Item"
            description="Add a service charge, transport fee, or other non-inventory item to the sale"
        >
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-auto p-6" onKeyDown={handleKeyDown}>
                {/* Header */}
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">🛠️</span>
                        <div>
                            <h2 className="text-lg font-bold text-gray-900">Add Service Item</h2>
                            <p className="text-xs text-gray-500">Non-inventory charge (no stock deduction)</p>
                        </div>
                    </div>
                    <button
                        onClick={() => onOpenChange(false)}
                        className="text-gray-400 hover:text-gray-600 text-xl"
                    >
                        ✕
                    </button>
                </div>

                {/* Quick Presets */}
                <div className="mb-4">
                    <label className="block text-xs font-medium text-gray-500 mb-2">Quick Select</label>
                    <div className="grid grid-cols-3 gap-2">
                        {SERVICE_PRESETS.map((preset) => (
                            <button
                                key={preset.name}
                                type="button"
                                onClick={() => handlePresetClick(preset)}
                                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-all ${formData.name === preset.name
                                        ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                                        : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'
                                    }`}
                            >
                                <span>{preset.icon}</span>
                                <span className="truncate text-xs">{preset.name}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Error message */}
                {error && (
                    <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                        {error}
                    </div>
                )}

                {/* Form */}
                <div className="space-y-3">
                    {/* Name */}
                    <div>
                        <label htmlFor="service-item-name" className="block text-sm font-medium text-gray-700 mb-1">
                            Item Name <span className="text-red-500">*</span>
                        </label>
                        <input
                            ref={nameInputRef}
                            id="service-item-name"
                            type="text"
                            value={formData.name}
                            onChange={(e) => { setFormData(prev => ({ ...prev, name: e.target.value })); setError(null); }}
                            placeholder="e.g. Transport to Kampala"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            autoComplete="off"
                        />
                    </div>

                    {/* Price & Quantity row */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label htmlFor="service-item-price" className="block text-sm font-medium text-gray-700 mb-1">
                                Unit Price <span className="text-red-500">*</span>
                            </label>
                            <input
                                id="service-item-price"
                                type="number"
                                min="0"
                                step="100"
                                value={formData.unitPrice || ''}
                                onChange={(e) => { setFormData(prev => ({ ...prev, unitPrice: Number(e.target.value) || 0 })); setError(null); }}
                                placeholder="0"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            />
                        </div>
                        <div>
                            <label htmlFor="service-item-qty" className="block text-sm font-medium text-gray-700 mb-1">
                                Quantity
                            </label>
                            <input
                                id="service-item-qty"
                                type="number"
                                min="1"
                                step="1"
                                value={formData.quantity}
                                onChange={(e) => setFormData(prev => ({ ...prev, quantity: Number(e.target.value) || 1 }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            />
                        </div>
                    </div>

                    {/* Description (optional) */}
                    <div>
                        <label htmlFor="service-item-desc" className="block text-sm font-medium text-gray-700 mb-1">
                            Description <span className="text-gray-400">(optional)</span>
                        </label>
                        <input
                            id="service-item-desc"
                            type="text"
                            value={formData.description}
                            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                            placeholder="Additional details"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        />
                    </div>

                    {/* Tax toggle */}
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="flex items-center gap-2">
                            <label htmlFor="service-item-taxable" className="text-sm font-medium text-gray-700 cursor-pointer">
                                Apply Tax (VAT)
                            </label>
                        </div>
                        <div className="flex items-center gap-2">
                            {formData.isTaxable && (
                                <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={formData.taxRate}
                                    onChange={(e) => setFormData(prev => ({ ...prev, taxRate: Number(e.target.value) || 0 }))}
                                    className="w-16 px-2 py-1 border border-gray-300 rounded text-sm text-center"
                                />
                            )}
                            {formData.isTaxable && <span className="text-sm text-gray-500">%</span>}
                            <button
                                id="service-item-taxable"
                                type="button"
                                role="switch"
                                aria-checked={formData.isTaxable}
                                onClick={() => setFormData(prev => ({ ...prev, isTaxable: !prev.isTaxable }))}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${formData.isTaxable ? 'bg-blue-600' : 'bg-gray-300'
                                    }`}
                            >
                                <span
                                    className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${formData.isTaxable ? 'translate-x-6' : 'translate-x-1'
                                        }`}
                                />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Summary */}
                <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-blue-700">Subtotal</span>
                        <span className="text-lg font-bold text-blue-900">{formatCurrency(subtotal)}</span>
                    </div>
                    {formData.isTaxable && formData.taxRate > 0 && subtotal > 0 && (
                        <div className="flex justify-between items-center mt-1">
                            <span className="text-xs text-blue-600">+ VAT ({formData.taxRate}%)</span>
                            <span className="text-sm text-blue-700">
                                {formatCurrency(new Decimal(subtotal).times(formData.taxRate).dividedBy(100).toNumber())}
                            </span>
                        </div>
                    )}
                    <div className="mt-2 pt-2 border-t border-blue-200">
                        <div className="flex items-center gap-1 text-xs text-blue-600">
                            <span>ℹ️</span>
                            <span>Posts to Service Revenue (4100) • No COGS • No inventory impact</span>
                        </div>
                    </div>
                </div>

                {/* Action buttons */}
                <div className="flex gap-3 mt-5">
                    <button
                        type="button"
                        onClick={() => onOpenChange(false)}
                        className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={!formData.name.trim() || formData.unitPrice <= 0}
                        className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Add to Cart
                    </button>
                </div>
            </div>
        </POSModal>
    );
}
