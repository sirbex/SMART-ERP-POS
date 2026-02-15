import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Label from '@radix-ui/react-label';
import * as Switch from '@radix-ui/react-switch';
import * as RadioGroup from '@radix-ui/react-radio-group';
import Layout from '../../components/Layout';

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
  paymentInstructions: string | null;
  termsAndConditions: string | null;
  footerText: string | null;
  createdAt: string;
  updatedAt: string;
}

const API_BASE = 'http://localhost:3001/api';

export default function InvoiceSettingsPage() {
  const queryClient = useQueryClient();
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');

  // Fetch settings
  const { data: settingsData, isLoading } = useQuery({
    queryKey: ['invoice-settings'],
    queryFn: async () => {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_BASE}/settings/invoice`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) throw new Error('Failed to fetch settings');
      const result = await response.json();
      return result.data as InvoiceSettings;
    },
  });

  // Update settings mutation
  const updateMutation = useMutation({
    mutationFn: async (data: Partial<InvoiceSettings>) => {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_BASE}/settings/invoice`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update settings');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice-settings'] });
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3000);
    },
    onError: () => {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaveStatus('saving');
    const formData = new FormData(e.currentTarget);

    const updates: Partial<InvoiceSettings> = {
      companyName: formData.get('companyName') as string,
      companyAddress: formData.get('companyAddress') as string || null,
      companyPhone: formData.get('companyPhone') as string || null,
      companyEmail: formData.get('companyEmail') as string || null,
      companyTin: formData.get('companyTin') as string || null,
      companyLogoUrl: formData.get('companyLogoUrl') as string || null,
      templateType: formData.get('templateType') as InvoiceSettings['templateType'],
      primaryColor: formData.get('primaryColor') as string,
      secondaryColor: formData.get('secondaryColor') as string,
      showCompanyLogo: formData.get('showCompanyLogo') === 'on',
      showTaxBreakdown: formData.get('showTaxBreakdown') === 'on',
      showPaymentInstructions: formData.get('showPaymentInstructions') === 'on',
      paymentInstructions: formData.get('paymentInstructions') as string || null,
      termsAndConditions: formData.get('termsAndConditions') as string || null,
      footerText: formData.get('footerText') as string || null,
    };

    updateMutation.mutate(updates);
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-gray-600">Loading settings...</div>
        </div>
      </Layout>
    );
  }

  const settings = settingsData;
  if (!settings) return null;

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Invoice Settings</h1>
            <p className="mt-2 text-gray-600">
              Customize your invoice templates, company information, and branding.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8">
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
                    aria-label="Company Name"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
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
                    aria-label="Company Email"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
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
                    aria-label="Company Phone"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
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
                    aria-label="Company TIN/Tax ID"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
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
                    aria-label="Company Address"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
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
                    placeholder="https://example.com/logo.png"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
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
              </div>
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
        </div>
      </div>
    </Layout>
  );
}
