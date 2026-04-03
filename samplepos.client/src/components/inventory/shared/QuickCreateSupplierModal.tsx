import { useState } from 'react';
import { useCreateSupplier } from '@/hooks/useSuppliers';
import type { CreateSupplierInput } from '@/types/inputs';
import { getErrorMessage } from '@/utils/api';

const PAYMENT_TERMS = [
    { value: 'NET30', label: 'Net 30 Days' },
    { value: 'NET60', label: 'Net 60 Days' },
    { value: 'NET15', label: 'Net 15 Days' },
    { value: 'COD', label: 'Cash on Delivery' },
    { value: 'PREPAID', label: 'Prepaid' },
];

interface QuickCreateSupplierModalProps {
    onClose: () => void;
    onCreated: (supplier: { id: string; name: string }) => void;
}

export function QuickCreateSupplierModal({ onClose, onCreated }: QuickCreateSupplierModalProps) {
    const [name, setName] = useState('');
    const [contactPerson, setContactPerson] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [paymentTerms, setPaymentTerms] = useState('NET30');
    const [error, setError] = useState('');

    const createMutation = useCreateSupplier();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!name.trim()) {
            setError('Supplier name is required');
            return;
        }

        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setError('Invalid email format');
            return;
        }

        try {
            const data: CreateSupplierInput = {
                name: name.trim(),
                contactPerson: contactPerson.trim() || undefined,
                phone: phone.trim() || undefined,
                email: email.trim() || undefined,
                paymentTerms,
            };

            const result = await createMutation.mutateAsync(data);
            const created = result?.data as { id: string; name: string } | undefined;

            if (created?.id) {
                onCreated({ id: created.id, name: created.name || name.trim() });
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
                className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-5"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">Quick Add Supplier</h3>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                        aria-label="Close"
                    >
                        &times;
                    </button>
                </div>

                {error && (
                    <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-3">
                    <div>
                        <label htmlFor="qs-name" className="block text-sm font-medium text-gray-700 mb-1">
                            Supplier Name <span className="text-red-500">*</span>
                        </label>
                        <input
                            id="qs-name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="e.g., Pharmaco Ltd"
                            autoFocus
                            maxLength={255}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label htmlFor="qs-contact" className="block text-sm font-medium text-gray-700 mb-1">
                                Contact Person
                            </label>
                            <input
                                id="qs-contact"
                                type="text"
                                value={contactPerson}
                                onChange={(e) => setContactPerson(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="Name"
                                maxLength={255}
                            />
                        </div>
                        <div>
                            <label htmlFor="qs-phone" className="block text-sm font-medium text-gray-700 mb-1">
                                Phone
                            </label>
                            <input
                                id="qs-phone"
                                type="tel"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="+256..."
                                maxLength={50}
                            />
                        </div>
                    </div>

                    <div>
                        <label htmlFor="qs-email" className="block text-sm font-medium text-gray-700 mb-1">
                            Email
                        </label>
                        <input
                            id="qs-email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="supplier@example.com"
                        />
                    </div>

                    <div>
                        <label htmlFor="qs-terms" className="block text-sm font-medium text-gray-700 mb-1">
                            Payment Terms
                        </label>
                        <select
                            id="qs-terms"
                            value={paymentTerms}
                            onChange={(e) => setPaymentTerms(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                            {PAYMENT_TERMS.map((t) => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
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
                            {createMutation.isPending ? 'Creating...' : 'Create Supplier'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
