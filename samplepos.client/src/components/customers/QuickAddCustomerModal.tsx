import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../utils/api';
import type { CreateCustomer } from '@shared/zod/customer';
import { CreateCustomerSchema } from '@shared/zod/customer';
import POSModal from '../pos/POSModal';
import POSButton from '../pos/POSButton';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { putCustomer } from '../../lib/offlineDb';

// LocalStorage key for offline customer creation queue
const OFFLINE_CUSTOMERS_KEY = 'pos_offline_customers';

interface CreatedCustomerData {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  creditLimit?: number;
  [key: string]: unknown;
}

interface QuickAddCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (customer: CreatedCustomerData) => void;
  isOffline?: boolean;
}

/** Queue an offline-created customer for later sync */
function queueOfflineCustomer(customer: CreatedCustomerData): void {
  try {
    const raw = localStorage.getItem(OFFLINE_CUSTOMERS_KEY);
    const queue: CreatedCustomerData[] = raw ? JSON.parse(raw) : [];
    queue.push(customer);
    localStorage.setItem(OFFLINE_CUSTOMERS_KEY, JSON.stringify(queue));
  } catch {
    // Best-effort queue
  }
}

export default function QuickAddCustomerModal({
  isOpen,
  onClose,
  onSuccess,
  isOffline = false,
}: QuickAddCustomerModalProps) {
  const queryClient = useQueryClient();
  const modalRef = useFocusTrap(isOpen);

  const [formData, setFormData] = useState<Partial<CreateCustomer>>({
    name: '',
    email: '',
    phone: '',
    address: '',
    creditLimit: 500000, // Default: 500,000 UGX
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const createMutation = useMutation({
    mutationFn: (data: CreateCustomer) => api.customers.create(data),
    onSuccess: (response) => {
      // Invalidate customer queries to refresh lists
      queryClient.invalidateQueries({ queryKey: ['customers'] });

      // Call success callback with created customer
      if (onSuccess && response.data.success) {
        onSuccess(response.data.data as CreatedCustomerData);
      }

      // Reset form and close
      resetForm();
      onClose();
    },
    onError: (error: { response?: { data?: { error?: string } }; message?: string }) => {
      const message = error.response?.data?.error || error.message || 'Failed to create customer';
      setErrors({ submit: message });
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      phone: '',
      address: '',
      creditLimit: 500000, // Default: 500,000 UGX
    });
    setErrors({});
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    // Convert empty strings to undefined so Zod .optional() accepts them
    const sanitized = {
      ...formData,
      email: formData.email?.trim() || undefined,
      phone: formData.phone?.trim() || undefined,
      address: formData.address?.trim() || undefined,
      customerGroupId: formData.customerGroupId || undefined,
    };

    // Validate with Zod
    const validation = CreateCustomerSchema.safeParse(sanitized);

    if (!validation.success) {
      const fieldErrors: Record<string, string> = {};
      validation.error.errors.forEach((err) => {
        if (err.path[0]) {
          fieldErrors[err.path[0] as string] = err.message;
        }
      });
      setErrors(fieldErrors);
      return;
    }

    if (isOffline) {
      // Save locally when offline
      const tempId = `offline_cust_${Date.now()}`;
      const offlineCustomer: CreatedCustomerData = {
        id: tempId,
        name: validation.data.name,
        email: validation.data.email || undefined,
        phone: validation.data.phone || undefined,
        address: validation.data.address || undefined,
        creditLimit: validation.data.creditLimit ?? 0,
        balance: 0,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      // Persist to IndexedDB so it shows in future offline searches
      putCustomer({
        id: tempId,
        name: validation.data.name,
        email: validation.data.email || '',
        phone: validation.data.phone || '',
        address: validation.data.address || '',
        creditLimit: validation.data.creditLimit ?? 0,
        balance: 0,
        isActive: true,
      }).catch(() => { /* best effort */ });
      // Queue for server sync when online
      queueOfflineCustomer(offlineCustomer);
      if (onSuccess) onSuccess(offlineCustomer);
      resetForm();
      onClose();
      return;
    }

    createMutation.mutate(validation.data);
  };

  const handleChange = (field: keyof CreateCustomer, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error for this field
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const handleCancel = () => {
    resetForm();
    onClose();
  };

  return (
    <POSModal
      open={isOpen}
      onOpenChange={(open) => !open && handleCancel()}
      title="Quick Add Customer"
    >
      <div ref={modalRef} className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name - Required */}
          <div>
            <label htmlFor="customer-name" className="block text-sm font-medium text-gray-700 mb-1">
              Customer Name <span className="text-red-500">*</span>
            </label>
            <input
              id="customer-name"
              type="text"
              value={formData.name || ''}
              onChange={(e) => handleChange('name', e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${errors.name ? 'border-red-500' : 'border-gray-300'
                }`}
              placeholder="Enter customer name"
              autoFocus
            />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
          </div>

          {/* Phone */}
          <div>
            <label htmlFor="customer-phone" className="block text-sm font-medium text-gray-700 mb-1">
              Phone Number
            </label>
            <input
              id="customer-phone"
              type="tel"
              value={formData.phone || ''}
              onChange={(e) => handleChange('phone', e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${errors.phone ? 'border-red-500' : 'border-gray-300'
                }`}
              placeholder="+256 700 000 000"
            />
            {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
          </div>

          {/* Email */}
          <div>
            <label htmlFor="customer-email" className="block text-sm font-medium text-gray-700 mb-1">
              Email Address
            </label>
            <input
              id="customer-email"
              type="email"
              value={formData.email || ''}
              onChange={(e) => handleChange('email', e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${errors.email ? 'border-red-500' : 'border-gray-300'
                }`}
              placeholder="customer@example.com"
            />
            {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
          </div>

          {/* Address */}
          <div>
            <label htmlFor="customer-address" className="block text-sm font-medium text-gray-700 mb-1">
              Address
            </label>
            <textarea
              id="customer-address"
              value={formData.address || ''}
              onChange={(e) => handleChange('address', e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="Physical address"
            />
          </div>

          {/* Credit Limit */}
          <div>
            <label htmlFor="customer-credit" className="block text-sm font-medium text-gray-700 mb-1">
              Credit Limit (UGX)
            </label>
            <input
              id="customer-credit"
              type="number"
              min="0"
              step="1000"
              value={formData.creditLimit || 0}
              onChange={(e) => handleChange('creditLimit', parseFloat(e.target.value) || 0)}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${errors.creditLimit ? 'border-red-500' : 'border-gray-300'
                }`}
              placeholder="500000"
            />
            {errors.creditLimit && <p className="text-red-500 text-xs mt-1">{errors.creditLimit}</p>}
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={() => handleChange('creditLimit', 100000)}
                className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
              >
                100K
              </button>
              <button
                type="button"
                onClick={() => handleChange('creditLimit', 250000)}
                className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
              >
                250K
              </button>
              <button
                type="button"
                onClick={() => handleChange('creditLimit', 500000)}
                className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
              >
                500K
              </button>
              <button
                type="button"
                onClick={() => handleChange('creditLimit', 1000000)}
                className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
              >
                1M
              </button>
              <button
                type="button"
                onClick={() => handleChange('creditLimit', 0)}
                className="px-2 py-1 text-xs bg-red-50 hover:bg-red-100 text-red-700 rounded"
              >
                No Credit
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">💡 Default: 500,000 UGX • Set to 0 for cash-only customers</p>
          </div>

          {/* Submit Error */}
          {errors.submit && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-red-700 text-sm">{errors.submit}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <POSButton
              type="button"
              variant="secondary"
              onClick={handleCancel}
              disabled={createMutation.isPending}
            >
              Cancel
            </POSButton>
            <POSButton
              type="submit"
              variant="primary"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? 'Creating...' : 'Create Customer'}
            </POSButton>
          </div>
        </form>
      </div>
    </POSModal>
  );
}
