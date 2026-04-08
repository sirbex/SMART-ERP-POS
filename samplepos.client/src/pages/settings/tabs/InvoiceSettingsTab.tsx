import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Label from '@radix-ui/react-label';
import * as Switch from '@radix-ui/react-switch';
import * as RadioGroup from '@radix-ui/react-radio-group';
import { api } from '../../../services/api';

type PaymentAccountType = 'BANK' | 'MOBILE_MONEY' | 'WALLET';

interface PaymentAccount {
  id: string;
  type: PaymentAccountType;
  provider: string;
  accountName: string;
  accountNumber: string;
  branchOrCode?: string;
  isActive: boolean;
  showOnReceipt: boolean;
  showOnInvoice: boolean;
  sortOrder: number;
}

// Utility function to format dates without timezone conversion
const formatDisplayDate = (dateString: string | null | undefined): string => {
  if (!dateString) return 'N/A';
  // If it's an ISO string with time, extract just the date part
  if (dateString.includes('T')) {
    return dateString.split('T')[0];
  }
  // Otherwise return as-is (already in YYYY-MM-DD format)
  return dateString;
};

interface InvoiceSettings {
  id: string;
  companyName: string;
  companyAddress: string | null;
  companyPhone: string | null;
  companyEmail: string | null;
  companyTin: string | null;
  companyLogoUrl: string | null;
  templateType: 'modern' | 'classic' | 'minimal' | 'professional';
  primaryColor: string;
  secondaryColor: string;
  showCompanyLogo: boolean;
  showTaxBreakdown: boolean;
  showPaymentInstructions: boolean;
  showPricesOnDnPdf: boolean;
  paymentAccounts: PaymentAccount[];
  paymentInstructions: string | null;
  termsAndConditions: string | null;
  footerText: string | null;
  customReceiptNote: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ValidationError {
  field: string;
  message: string;
}

// Removed hardcoded API_BASE — uses shared api client

export default function InvoiceSettingsTab() {
  const queryClient = useQueryClient();
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [paymentAccounts, setPaymentAccounts] = useState<PaymentAccount[]>([]);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);

  const generateId = () => crypto.randomUUID();

  const addPaymentAccount = useCallback(() => {
    const newAccount: PaymentAccount = {
      id: generateId(),
      type: 'MOBILE_MONEY',
      provider: '',
      accountName: '',
      accountNumber: '',
      branchOrCode: '',
      isActive: true,
      showOnReceipt: true,
      showOnInvoice: true,
      sortOrder: paymentAccounts.length,
    };
    setPaymentAccounts(prev => [...prev, newAccount]);
    setEditingAccountId(newAccount.id);
  }, [paymentAccounts.length]);

  const updatePaymentAccount = useCallback((id: string, updates: Partial<PaymentAccount>) => {
    setPaymentAccounts(prev =>
      prev.map(acc => (acc.id === id ? { ...acc, ...updates } : acc))
    );
  }, []);

  const removePaymentAccount = useCallback((id: string) => {
    setPaymentAccounts(prev => prev.filter(acc => acc.id !== id));
    if (editingAccountId === id) setEditingAccountId(null);
  }, [editingAccountId]);

  const moveAccount = useCallback((id: string, direction: 'up' | 'down') => {
    setPaymentAccounts(prev => {
      const idx = prev.findIndex(a => a.id === id);
      if (idx < 0) return prev;
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next.map((a, i) => ({ ...a, sortOrder: i }));
    });
  }, []);

  // Fetch settings
  const { data: settingsData, isLoading, error: fetchError } = useQuery({
    queryKey: ['invoice-settings'],
    queryFn: async () => {
      const { data: result } = await api.get('/settings/invoice');
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch settings');
      }
      const settings = result.data as InvoiceSettings;
      // Sync payment accounts state from server
      setPaymentAccounts(settings.paymentAccounts || []);
      return settings;
    },
    retry: 1,
    staleTime: 30000, // Consider data fresh for 30 seconds
  });

  // Update settings mutation
  const updateMutation = useMutation({
    mutationFn: async (data: Partial<InvoiceSettings>) => {
      const { data: result } = await api.put('/settings/invoice', data);
      if (!result.success) {
        if (result.details && Array.isArray(result.details)) {
          throw {
            message: result.error || 'Validation failed',
            details: result.details,
          };
        }
        throw new Error(result.error || 'Failed to update settings');
      }
      return result.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['invoice-settings'], data);
      setSaveStatus('success');
      setErrorMessage('');
      setValidationErrors([]);
      setTimeout(() => setSaveStatus('idle'), 3000);
    },
    onError: (error: Error & { details?: Array<{ field: string; message: string }>; message?: string }) => {
      setSaveStatus('error');

      if (error.details && Array.isArray(error.details)) {
        setValidationErrors(error.details);
        setErrorMessage('Please fix the validation errors below');
      } else {
        setErrorMessage(error.message || 'Failed to save settings');
        setValidationErrors([]);
      }

      setTimeout(() => {
        setSaveStatus('idle');
        setErrorMessage('');
        setValidationErrors([]);
      }, 5000);
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaveStatus('saving');
    setErrorMessage('');
    setValidationErrors([]);

    const formData = new FormData(e.currentTarget);

    // Helper to get form value or null
    const getFormValue = (name: string): string | null => {
      const value = formData.get(name) as string;
      return value && value.trim() !== '' ? value.trim() : null;
    };

    const updates: Partial<InvoiceSettings> = {
      companyName: getFormValue('companyName') || undefined,
      companyAddress: getFormValue('companyAddress'),
      companyPhone: getFormValue('companyPhone'),
      companyEmail: getFormValue('companyEmail'),
      companyTin: getFormValue('companyTin'),
      companyLogoUrl: getFormValue('companyLogoUrl'),
      templateType: (getFormValue('templateType') as InvoiceSettings['templateType']) || undefined,
      primaryColor: getFormValue('primaryColor') || undefined,
      secondaryColor: getFormValue('secondaryColor') || undefined,
      showCompanyLogo: formData.get('showCompanyLogo') === 'on',
      showTaxBreakdown: formData.get('showTaxBreakdown') === 'on',
      showPaymentInstructions: formData.get('showPaymentInstructions') === 'on',
      showPricesOnDnPdf: formData.get('showPricesOnDnPdf') === 'on',
      paymentAccounts: paymentAccounts.filter(a => a.provider && a.accountName && a.accountNumber),
      paymentInstructions: getFormValue('paymentInstructions'),
      termsAndConditions: getFormValue('termsAndConditions'),
      footerText: getFormValue('footerText'),
      customReceiptNote: getFormValue('customReceiptNote'),
    };

    // Remove undefined values to avoid sending them to API
    Object.keys(updates).forEach(key => {
      if (updates[key as keyof typeof updates] === undefined) {
        delete updates[key as keyof typeof updates];
      }
    });

    updateMutation.mutate(updates);
  };

  const getFieldError = (fieldName: string): string | undefined => {
    const error = validationErrors.find(e => e.field === fieldName);
    return error?.message;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <div className="text-gray-600">Loading invoice settings...</div>
        </div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <h3 className="text-red-800 font-semibold mb-2">Error Loading Settings</h3>
        <p className="text-red-600">{(fetchError as Error).message}</p>
        <button
          onClick={() => queryClient.invalidateQueries({ queryKey: ['invoice-settings'] })}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  const settings = settingsData;
  if (!settings) return null;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Error Alert */}
      {errorMessage && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <span className="text-red-600 text-xl">⚠</span>
            <div className="flex-1">
              <h4 className="text-red-800 font-semibold">Error</h4>
              <p className="text-red-600 text-sm mt-1">{errorMessage}</p>
              {validationErrors.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {validationErrors.map((err, idx) => (
                    <li key={idx} className="text-red-600 text-sm">
                      • <strong>{err.field}:</strong> {err.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Company Information */}
      <section className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Company Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <Label.Root className="block text-sm font-medium text-gray-700 mb-2" htmlFor="companyName">
              Company Name *
            </Label.Root>
            <input
              type="text"
              id="companyName"
              name="companyName"
              defaultValue={settings.companyName}
              required
              maxLength={255}
              aria-label="Company Name"
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${getFieldError('companyName') ? 'border-red-500' : 'border-gray-300'
                }`}
            />
            {getFieldError('companyName') && (
              <p className="mt-1 text-sm text-red-600">{getFieldError('companyName')}</p>
            )}
          </div>

          <div>
            <Label.Root className="block text-sm font-medium text-gray-700 mb-2" htmlFor="companyEmail">
              Email
            </Label.Root>
            <input
              type="email"
              id="companyEmail"
              name="companyEmail"
              defaultValue={settings.companyEmail || ''}
              maxLength={255}
              aria-label="Company Email"
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${getFieldError('companyEmail') ? 'border-red-500' : 'border-gray-300'
                }`}
            />
            {getFieldError('companyEmail') && (
              <p className="mt-1 text-sm text-red-600">{getFieldError('companyEmail')}</p>
            )}
          </div>

          <div>
            <Label.Root className="block text-sm font-medium text-gray-700 mb-2" htmlFor="companyPhone">
              Phone
            </Label.Root>
            <input
              type="tel"
              id="companyPhone"
              name="companyPhone"
              defaultValue={settings.companyPhone || ''}
              maxLength={50}
              aria-label="Company Phone"
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${getFieldError('companyPhone') ? 'border-red-500' : 'border-gray-300'
                }`}
            />
            {getFieldError('companyPhone') && (
              <p className="mt-1 text-sm text-red-600">{getFieldError('companyPhone')}</p>
            )}
          </div>

          <div>
            <Label.Root className="block text-sm font-medium text-gray-700 mb-2" htmlFor="companyTin">
              TIN/Tax ID
            </Label.Root>
            <input
              type="text"
              id="companyTin"
              name="companyTin"
              defaultValue={settings.companyTin || ''}
              maxLength={100}
              aria-label="Company TIN/Tax ID"
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${getFieldError('companyTin') ? 'border-red-500' : 'border-gray-300'
                }`}
            />
            {getFieldError('companyTin') && (
              <p className="mt-1 text-sm text-red-600">{getFieldError('companyTin')}</p>
            )}
          </div>

          <div className="md:col-span-2">
            <Label.Root className="block text-sm font-medium text-gray-700 mb-2" htmlFor="companyAddress">
              Address
            </Label.Root>
            <textarea
              id="companyAddress"
              name="companyAddress"
              defaultValue={settings.companyAddress || ''}
              rows={3}
              maxLength={1000}
              aria-label="Company Address"
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${getFieldError('companyAddress') ? 'border-red-500' : 'border-gray-300'
                }`}
            />
            {getFieldError('companyAddress') && (
              <p className="mt-1 text-sm text-red-600">{getFieldError('companyAddress')}</p>
            )}
          </div>

          <div className="md:col-span-2">
            <Label.Root className="block text-sm font-medium text-gray-700 mb-2" htmlFor="companyLogoUrl">
              Logo URL
            </Label.Root>
            <input
              type="url"
              id="companyLogoUrl"
              name="companyLogoUrl"
              defaultValue={settings.companyLogoUrl || ''}
              maxLength={500}
              placeholder="https://example.com/logo.png"
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${getFieldError('companyLogoUrl') ? 'border-red-500' : 'border-gray-300'
                }`}
            />
            {getFieldError('companyLogoUrl') && (
              <p className="mt-1 text-sm text-red-600">{getFieldError('companyLogoUrl')}</p>
            )}
          </div>
        </div>
      </section>

      {/* Template Selection */}
      <section className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Invoice Template</h2>
        <RadioGroup.Root
          name="templateType"
          defaultValue={settings.templateType}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
        >
          {[
            { value: 'modern', label: 'Modern', description: 'Clean and contemporary design with gradients' },
            { value: 'classic', label: 'Classic', description: 'Traditional professional layout' },
            { value: 'minimal', label: 'Minimal', description: 'Simple and uncluttered' },
            { value: 'professional', label: 'Professional', description: 'Formal business style' },
          ].map((template) => (
            <RadioGroup.Item
              key={template.value}
              value={template.value}
              className="group border-2 border-gray-200 rounded-lg p-4 hover:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 data-[state=checked]:border-blue-600 data-[state=checked]:bg-blue-50 cursor-pointer transition-colors"
            >
              <div className="flex items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full border-2 border-gray-300 group-data-[state=checked]:border-blue-600 group-data-[state=checked]:bg-blue-600 flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-white opacity-0 group-data-[state=checked]:opacity-100"></div>
                    </div>
                    <h3 className="font-semibold text-gray-900">{template.label}</h3>
                  </div>
                  <p className="text-sm text-gray-600 mt-2 ml-7">{template.description}</p>
                </div>
              </div>
            </RadioGroup.Item>
          ))}
        </RadioGroup.Root>
      </section>

      {/* Color Theme */}
      <section className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Color Theme</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <Label.Root className="block text-sm font-medium text-gray-700 mb-2" htmlFor="primaryColor">
              Primary Color
            </Label.Root>
            <div className="flex items-center gap-3">
              <input
                type="color"
                id="primaryColor"
                name="primaryColor"
                defaultValue={settings.primaryColor}
                aria-label="Primary color picker"
                className="h-12 w-20 rounded-lg border border-gray-300 cursor-pointer"
              />
              <input
                type="text"
                defaultValue={settings.primaryColor}
                pattern="^#[0-9A-Fa-f]{6}$"
                placeholder="#2563eb"
                aria-label="Primary color hex code"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                onChange={(e) => {
                  const colorInput = document.getElementById('primaryColor') as HTMLInputElement;
                  if (colorInput && /^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
                    colorInput.value = e.target.value;
                  }
                }}
              />
            </div>
            <p className="text-sm text-gray-500 mt-1">Used for headers and primary elements</p>
          </div>

          <div>
            <Label.Root className="block text-sm font-medium text-gray-700 mb-2" htmlFor="secondaryColor">
              Secondary Color
            </Label.Root>
            <div className="flex items-center gap-3">
              <input
                type="color"
                id="secondaryColor"
                name="secondaryColor"
                defaultValue={settings.secondaryColor}
                aria-label="Secondary color picker"
                className="h-12 w-20 rounded-lg border border-gray-300 cursor-pointer"
              />
              <input
                type="text"
                defaultValue={settings.secondaryColor}
                pattern="^#[0-9A-Fa-f]{6}$"
                placeholder="#10b981"
                aria-label="Secondary color hex code"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                onChange={(e) => {
                  const colorInput = document.getElementById('secondaryColor') as HTMLInputElement;
                  if (colorInput && /^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
                    colorInput.value = e.target.value;
                  }
                }}
              />
            </div>
            <p className="text-sm text-gray-500 mt-1">Used for accents and success states</p>
          </div>
        </div>
      </section>

      {/* Display Options */}
      <section className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Display Options</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label.Root className="font-medium text-gray-900" htmlFor="showCompanyLogo">
                Show Company Logo
              </Label.Root>
              <p className="text-sm text-gray-600">Display logo in invoice header</p>
            </div>
            <Switch.Root
              id="showCompanyLogo"
              name="showCompanyLogo"
              defaultChecked={settings.showCompanyLogo}
              className="w-12 h-6 bg-gray-300 rounded-full relative data-[state=checked]:bg-blue-600 transition-colors cursor-pointer"
            >
              <Switch.Thumb className="block w-5 h-5 bg-white rounded-full transition-transform duration-100 translate-x-0.5 will-change-transform data-[state=checked]:translate-x-[26px]" />
            </Switch.Root>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label.Root className="font-medium text-gray-900" htmlFor="showTaxBreakdown">
                Show Tax Breakdown
              </Label.Root>
              <p className="text-sm text-gray-600">Display itemized tax calculations</p>
            </div>
            <Switch.Root
              id="showTaxBreakdown"
              name="showTaxBreakdown"
              defaultChecked={settings.showTaxBreakdown}
              className="w-12 h-6 bg-gray-300 rounded-full relative data-[state=checked]:bg-blue-600 transition-colors cursor-pointer"
            >
              <Switch.Thumb className="block w-5 h-5 bg-white rounded-full transition-transform duration-100 translate-x-0.5 will-change-transform data-[state=checked]:translate-x-[26px]" />
            </Switch.Root>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label.Root className="font-medium text-gray-900" htmlFor="showPaymentInstructions">
                Show Payment Instructions
              </Label.Root>
              <p className="text-sm text-gray-600">Display payment methods and instructions</p>
            </div>
            <Switch.Root
              id="showPaymentInstructions"
              name="showPaymentInstructions"
              defaultChecked={settings.showPaymentInstructions}
              className="w-12 h-6 bg-gray-300 rounded-full relative data-[state=checked]:bg-blue-600 transition-colors cursor-pointer"
            >
              <Switch.Thumb className="block w-5 h-5 bg-white rounded-full transition-transform duration-100 translate-x-0.5 will-change-transform data-[state=checked]:translate-x-[26px]" />
            </Switch.Root>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label.Root className="font-medium text-gray-900" htmlFor="showPricesOnDnPdf">
                Show Prices on Delivery Note PDF
              </Label.Root>
              <p className="text-sm text-gray-600">Display unit prices, line totals, and grand total on delivery note PDFs</p>
            </div>
            <Switch.Root
              id="showPricesOnDnPdf"
              name="showPricesOnDnPdf"
              defaultChecked={settings.showPricesOnDnPdf}
              className="w-12 h-6 bg-gray-300 rounded-full relative data-[state=checked]:bg-blue-600 transition-colors cursor-pointer"
            >
              <Switch.Thumb className="block w-5 h-5 bg-white rounded-full transition-transform duration-100 translate-x-0.5 will-change-transform data-[state=checked]:translate-x-[26px]" />
            </Switch.Root>
          </div>
        </div>
      </section>

      {/* Payment Accounts */}
      <section className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Payment Accounts</h2>
            <p className="text-sm text-gray-600 mt-1">
              Add bank accounts, mobile money, and wallet details to display on receipts and invoices
            </p>
          </div>
          <button
            type="button"
            onClick={addPaymentAccount}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            + Add Account
          </button>
        </div>

        {paymentAccounts.length === 0 ? (
          <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-lg">
            <p className="text-gray-500">No payment accounts configured</p>
            <p className="text-sm text-gray-400 mt-1">Add accounts so customers know where to send payments</p>
          </div>
        ) : (
          <div className="space-y-4">
            {paymentAccounts.map((account, index) => {
              const isEditing = editingAccountId === account.id;
              return (
                <div
                  key={account.id}
                  className={`border rounded-lg p-4 ${isEditing ? 'border-blue-300 bg-blue-50/50' : 'border-gray-200'} ${!account.isActive ? 'opacity-60' : ''}`}
                >
                  {isEditing ? (
                    /* Edit Mode */
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                          <select
                            value={account.type}
                            onChange={(e) => updatePaymentAccount(account.id, { type: e.target.value as PaymentAccountType })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          >
                            <option value="BANK">Bank Account</option>
                            <option value="MOBILE_MONEY">Mobile Money</option>
                            <option value="WALLET">Wallet / Other</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Provider *</label>
                          <input
                            type="text"
                            value={account.provider}
                            onChange={(e) => updatePaymentAccount(account.id, { provider: e.target.value })}
                            placeholder={account.type === 'BANK' ? 'e.g. Stanbic Bank' : account.type === 'MOBILE_MONEY' ? 'e.g. MTN Mobile Money' : 'e.g. PayPal'}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Account Name *</label>
                          <input
                            type="text"
                            value={account.accountName}
                            onChange={(e) => updatePaymentAccount(account.id, { accountName: e.target.value })}
                            placeholder="Account holder name"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Account Number *</label>
                          <input
                            type="text"
                            value={account.accountNumber}
                            onChange={(e) => updatePaymentAccount(account.id, { accountNumber: e.target.value })}
                            placeholder={account.type === 'MOBILE_MONEY' ? 'e.g. 0770123456' : 'e.g. 9030001234567'}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            {account.type === 'BANK' ? 'Branch' : 'Short Code / Reference'}
                          </label>
                          <input
                            type="text"
                            value={account.branchOrCode || ''}
                            onChange={(e) => updatePaymentAccount(account.id, { branchOrCode: e.target.value || undefined })}
                            placeholder={account.type === 'BANK' ? 'e.g. Kampala Branch' : 'Optional'}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-6">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={account.isActive}
                            onChange={(e) => updatePaymentAccount(account.id, { isActive: e.target.checked })}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          Active
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={account.showOnReceipt}
                            onChange={(e) => updatePaymentAccount(account.id, { showOnReceipt: e.target.checked })}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          Show on Receipt
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={account.showOnInvoice}
                            onChange={(e) => updatePaymentAccount(account.id, { showOnInvoice: e.target.checked })}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          Show on Invoice
                        </label>
                      </div>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => setEditingAccountId(null)}
                          className="px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                        >
                          Done
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Display Mode */
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white text-sm font-bold ${account.type === 'BANK' ? 'bg-indigo-500' : account.type === 'MOBILE_MONEY' ? 'bg-yellow-500' : 'bg-green-500'
                          }`}>
                          {account.type === 'BANK' ? '🏦' : account.type === 'MOBILE_MONEY' ? '📱' : '💳'}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{account.provider || 'Unnamed provider'}</div>
                          <div className="text-sm text-gray-600">{account.accountName} &middot; {account.accountNumber}</div>
                          {account.branchOrCode && (
                            <div className="text-sm text-gray-500">{account.type === 'BANK' ? 'Branch' : 'Code'}: {account.branchOrCode}</div>
                          )}
                          <div className="flex gap-2 mt-1">
                            {account.showOnReceipt && (
                              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Receipt</span>
                            )}
                            {account.showOnInvoice && (
                              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Invoice</span>
                            )}
                            {!account.isActive && (
                              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">Inactive</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveAccount(account.id, 'up')}
                          disabled={index === 0}
                          className="p-1.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                          title="Move up"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          onClick={() => moveAccount(account.id, 'down')}
                          disabled={index === paymentAccounts.length - 1}
                          className="p-1.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                          title="Move down"
                        >
                          ▼
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingAccountId(account.id)}
                          className="p-1.5 text-blue-600 hover:text-blue-800"
                          title="Edit"
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          onClick={() => removePaymentAccount(account.id)}
                          className="p-1.5 text-red-500 hover:text-red-700"
                          title="Remove"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Content Customization */}
      <section className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Content Customization</h2>
        <div className="space-y-6">
          <div>
            <Label.Root className="block text-sm font-medium text-gray-700 mb-2" htmlFor="paymentInstructions">
              Payment Instructions
            </Label.Root>
            <textarea
              id="paymentInstructions"
              name="paymentInstructions"
              defaultValue={settings.paymentInstructions || ''}
              rows={3}
              placeholder="Payment can be made via Mobile Money, Bank Transfer, or Cash."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <Label.Root className="block text-sm font-medium text-gray-700 mb-2" htmlFor="termsAndConditions">
              Terms and Conditions
            </Label.Root>
            <textarea
              id="termsAndConditions"
              name="termsAndConditions"
              defaultValue={settings.termsAndConditions || ''}
              rows={4}
              placeholder="Enter your terms and conditions..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <Label.Root className="block text-sm font-medium text-gray-700 mb-2" htmlFor="footerText">
              Footer Text
            </Label.Root>
            <input
              type="text"
              id="footerText"
              name="footerText"
              defaultValue={settings.footerText || ''}
              placeholder="Thank you for your business!"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <Label.Root className="block text-sm font-medium text-gray-700 mb-2" htmlFor="customReceiptNote">
              Custom Receipt Note
            </Label.Root>
            <p className="text-xs text-gray-500 mb-2">
              Add any custom text to display on receipts (e.g. MoMo numbers, promo messages, opening hours)
            </p>
            <textarea
              id="customReceiptNote"
              name="customReceiptNote"
              defaultValue={settings.customReceiptNote || ''}
              rows={3}
              placeholder="e.g. Pay via MoMo: 0770 123 456 (Name) | Airtel Money: 0750 123 456"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      </section>

      {/* Save Button */}
      <div className="flex items-center justify-between bg-white rounded-lg shadow-sm p-6">
        <div className="text-sm text-gray-600">
          Last updated: {formatDisplayDate(settings.updatedAt)}
        </div>
        <div className="flex items-center gap-4">
          {saveStatus === 'success' && (
            <span className="text-green-600 font-medium">✓ Settings saved successfully</span>
          )}
          {saveStatus === 'error' && (
            <span className="text-red-600 font-medium">✗ Failed to save settings</span>
          )}
          <button
            type="submit"
            disabled={saveStatus === 'saving'}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
          >
            {saveStatus === 'saving' ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </form>
  );
}
