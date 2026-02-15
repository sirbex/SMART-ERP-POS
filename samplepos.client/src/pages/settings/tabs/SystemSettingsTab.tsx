import { useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiResponse } from '../../../services/api';

interface TaxRate {
    name: string;
    rate: number;
    default?: boolean;
    description?: string;
}

interface SystemSettings {
    id: string;
    businessName: string;
    currencyCode: string;
    currencySymbol: string;
    dateFormat: string;
    timeFormat: string;
    timezone: string;
    taxEnabled: boolean;
    defaultTaxRate: number;
    taxName: string;
    taxNumber?: string;
    taxInclusive: boolean;
    taxRates: TaxRate[];
    receiptPrinterEnabled: boolean;
    receiptPrinterName?: string;
    receiptPaperWidth: number;
    receiptAutoPrint: boolean;
    receiptShowLogo: boolean;
    receiptLogoUrl?: string;
    receiptHeaderText?: string;
    receiptFooterText?: string;
    receiptShowTaxBreakdown: boolean;
    receiptShowQrCode: boolean;
    invoicePrinterEnabled: boolean;
    invoicePrinterName?: string;
    invoicePaperSize: string;
    invoiceTemplate: string;
    invoiceShowLogo: boolean;
    invoiceShowPaymentTerms: boolean;
    invoiceDefaultPaymentTerms?: string;
    lowStockAlertsEnabled: boolean;
    lowStockThreshold: number;
}

async function fetchSettings(): Promise<SystemSettings> {
    const response = await api.get<ApiResponse<SystemSettings>>('/system-settings');
    if (!response.data.success) throw new Error(response.data.error);
    return response.data.data!;
}

async function updateSettings(updates: Partial<SystemSettings>): Promise<SystemSettings> {
    const response = await api.patch<ApiResponse<SystemSettings>>('/system-settings', updates);
    if (!response.data.success) throw new Error(response.data.error);
    return response.data.data!;
}

export default function SystemSettingsTab() {
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState('general');
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState('');

    const { data: settings, isLoading } = useQuery({
        queryKey: ['systemSettings'],
        queryFn: fetchSettings,
    });

    const mutation = useMutation({
        mutationFn: updateSettings,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['systemSettings'] });
            setIsSaving(false);
            setSaveMessage('Settings saved successfully!');
            setTimeout(() => setSaveMessage(''), 3000);
        },
        onError: (error: any) => {
            setIsSaving(false);
            setSaveMessage(`Error: ${error.message}`);
            setTimeout(() => setSaveMessage(''), 5000);
        },
    });

    const handleSave = (updates: Partial<SystemSettings>) => {
        setIsSaving(true);
        mutation.mutate(updates);
    };

    if (isLoading) {
        return (
            <div className="bg-white rounded-lg shadow-sm p-6">
                <p className="text-gray-600">Loading settings...</p>
            </div>
        );
    }

    if (!settings) {
        return (
            <div className="bg-white rounded-lg shadow-sm p-6">
                <p className="text-red-600">Failed to load settings</p>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg shadow-sm">
            {saveMessage && (
                <div
                    className={`mb-4 p-4 rounded ${saveMessage.startsWith('Error') ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'
                        }`}
                >
                    {saveMessage}
                </div>
            )}

            <Tabs.Root value={activeTab} onValueChange={setActiveTab}>
                <Tabs.List className="flex border-b border-gray-200">
                    <Tabs.Trigger
                        value="general"
                        className="px-6 py-3 text-sm font-medium text-gray-600 border-b-2 border-transparent hover:text-gray-900 hover:border-gray-300 data-[state=active]:text-blue-600 data-[state=active]:border-blue-600"
                    >
                        General
                    </Tabs.Trigger>
                    <Tabs.Trigger
                        value="tax"
                        className="px-6 py-3 text-sm font-medium text-gray-600 border-b-2 border-transparent hover:text-gray-900 hover:border-gray-300 data-[state=active]:text-blue-600 data-[state=active]:border-blue-600"
                    >
                        Tax Management
                    </Tabs.Trigger>
                    <Tabs.Trigger
                        value="printing"
                        className="px-6 py-3 text-sm font-medium text-gray-600 border-b-2 border-transparent hover:text-gray-900 hover:border-gray-300 data-[state=active]:text-blue-600 data-[state=active]:border-blue-600"
                    >
                        Receipt Printing
                    </Tabs.Trigger>
                    <Tabs.Trigger
                        value="alerts"
                        className="px-6 py-3 text-sm font-medium text-gray-600 border-b-2 border-transparent hover:text-gray-900 hover:border-gray-300 data-[state=active]:text-blue-600 data-[state=active]:border-blue-600"
                    >
                        Alerts
                    </Tabs.Trigger>
                </Tabs.List>

                <Tabs.Content value="general" className="p-6">
                    <GeneralSettings settings={settings} onSave={handleSave} isSaving={isSaving} />
                </Tabs.Content>

                <Tabs.Content value="tax" className="p-6">
                    <TaxSettings settings={settings} onSave={handleSave} isSaving={isSaving} />
                </Tabs.Content>

                <Tabs.Content value="printing" className="p-6">
                    <ReceiptPrintingSettings settings={settings} onSave={handleSave} isSaving={isSaving} />
                </Tabs.Content>

                <Tabs.Content value="alerts" className="p-6">
                    <AlertSettings settings={settings} onSave={handleSave} isSaving={isSaving} />
                </Tabs.Content>
            </Tabs.Root>
        </div>
    );
}

// General Settings Tab
function GeneralSettings({
    settings,
    onSave,
    isSaving,
}: {
    settings: SystemSettings;
    onSave: (updates: Partial<SystemSettings>) => void;
    isSaving: boolean;
}) {
    const [formData, setFormData] = useState({
        businessName: settings.businessName,
        currencyCode: settings.currencyCode,
        currencySymbol: settings.currencySymbol,
        dateFormat: settings.dateFormat,
        timeFormat: settings.timeFormat,
        timezone: settings.timezone,
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Business Information</h3>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Business Name
                        </label>
                        <input
                            type="text"
                            value={formData.businessName}
                            onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                            aria-label="Business Name"
                            required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Currency Code
                            </label>
                            <input
                                type="text"
                                value={formData.currencyCode}
                                onChange={(e) => setFormData({ ...formData, currencyCode: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                placeholder="UGX"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Currency Symbol
                            </label>
                            <input
                                type="text"
                                value={formData.currencySymbol}
                                onChange={(e) => setFormData({ ...formData, currencySymbol: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                placeholder="UGX"
                                required
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Regional Settings</h3>

                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Date Format
                            </label>
                            <select
                                value={formData.dateFormat}
                                onChange={(e) => setFormData({ ...formData, dateFormat: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                aria-label="Date Format"
                            >
                                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Time Format
                            </label>
                            <select
                                value={formData.timeFormat}
                                onChange={(e) => setFormData({ ...formData, timeFormat: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                aria-label="Time Format"
                            >
                                <option value="24h">24 Hour</option>
                                <option value="12h">12 Hour (AM/PM)</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Timezone
                        </label>
                        <select
                            value={formData.timezone}
                            onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                            aria-label="Timezone"
                        >
                            <option value="Africa/Kampala">Africa/Kampala (EAT)</option>
                            <option value="Africa/Nairobi">Africa/Nairobi (EAT)</option>
                            <option value="Africa/Lagos">Africa/Lagos (WAT)</option>
                            <option value="UTC">UTC</option>
                        </select>
                    </div>
                </div>
            </div>

            <div className="flex justify-end">
                <button
                    type="submit"
                    disabled={isSaving}
                    className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isSaving ? 'Saving...' : 'Save General Settings'}
                </button>
            </div>
        </form>
    );
}

// Tax Settings Tab
function TaxSettings({
    settings,
    onSave,
    isSaving,
}: {
    settings: SystemSettings;
    onSave: (updates: Partial<SystemSettings>) => void;
    isSaving: boolean;
}) {
    const [formData, setFormData] = useState({
        taxEnabled: settings.taxEnabled,
        taxName: settings.taxName,
        taxNumber: settings.taxNumber || '',
        defaultTaxRate: settings.defaultTaxRate,
        taxInclusive: settings.taxInclusive,
        taxRates: settings.taxRates || [],
    });

    const [newRate, setNewRate] = useState({ name: '', rate: 0, description: '' });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData);
    };

    const addTaxRate = () => {
        if (newRate.name && newRate.rate >= 0) {
            setFormData({
                ...formData,
                taxRates: [...formData.taxRates, { ...newRate, default: formData.taxRates.length === 0 }],
            });
            setNewRate({ name: '', rate: 0, description: '' });
        }
    };

    const removeTaxRate = (index: number) => {
        setFormData({
            ...formData,
            taxRates: formData.taxRates.filter((_, i) => i !== index),
        });
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Tax Configuration</h3>

                <div className="space-y-4">
                    <div className="flex items-center">
                        <input
                            type="checkbox"
                            id="taxEnabled"
                            checked={formData.taxEnabled}
                            onChange={(e) => setFormData({ ...formData, taxEnabled: e.target.checked })}
                            className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <label htmlFor="taxEnabled" className="ml-2 block text-sm text-gray-900">
                            Enable Tax System
                        </label>
                    </div>

                    {formData.taxEnabled && (
                        <>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Tax Name
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.taxName}
                                        onChange={(e) => setFormData({ ...formData, taxName: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                        placeholder="VAT, GST, Sales Tax"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Tax Registration Number
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.taxNumber}
                                        onChange={(e) => setFormData({ ...formData, taxNumber: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                        placeholder="TIN/VAT Number"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Default Tax Rate (%)
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={formData.defaultTaxRate}
                                    onChange={(e) => setFormData({ ...formData, defaultTaxRate: parseFloat(e.target.value) })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                    aria-label="Default Tax Rate"
                                    required
                                />
                            </div>

                            <div className="flex items-center">
                                <input
                                    type="checkbox"
                                    id="taxInclusive"
                                    checked={formData.taxInclusive}
                                    onChange={(e) => setFormData({ ...formData, taxInclusive: e.target.checked })}
                                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                />
                                <label htmlFor="taxInclusive" className="ml-2 block text-sm text-gray-900">
                                    Tax Inclusive Pricing (prices displayed include tax)
                                </label>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {formData.taxEnabled && (
                <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Multiple Tax Rates</h3>

                    <div className="space-y-4">
                        {formData.taxRates.map((rate, index) => (
                            <div key={index} className="flex items-center gap-4 p-3 bg-gray-50 rounded-md">
                                <div className="flex-1">
                                    <span className="font-medium">{rate.name}</span> - {rate.rate}%
                                    {rate.description && (
                                        <span className="text-sm text-gray-600 ml-2">({rate.description})</span>
                                    )}
                                    {rate.default && (
                                        <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                                            Default
                                        </span>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => removeTaxRate(index)}
                                    className="text-red-600 hover:text-red-800"
                                >
                                    Remove
                                </button>
                            </div>
                        ))}

                        <div className="flex gap-2">
                            <input
                                type="text"
                                placeholder="Rate name"
                                value={newRate.name}
                                onChange={(e) => setNewRate({ ...newRate, name: e.target.value })}
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                            />
                            <input
                                type="number"
                                step="0.01"
                                placeholder="Rate %"
                                value={newRate.rate}
                                onChange={(e) => setNewRate({ ...newRate, rate: parseFloat(e.target.value) })}
                                className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                            />
                            <button
                                type="button"
                                onClick={addTaxRate}
                                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                            >
                                Add Rate
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex justify-end">
                <button
                    type="submit"
                    disabled={isSaving}
                    className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isSaving ? 'Saving...' : 'Save Tax Settings'}
                </button>
            </div>
        </form>
    );
}

// Printing Settings Tab
function ReceiptPrintingSettings({
    settings,
    onSave,
    isSaving,
}: {
    settings: SystemSettings;
    onSave: (updates: Partial<SystemSettings>) => void;
    isSaving: boolean;
}) {
    const [formData, setFormData] = useState({
        receiptPrinterEnabled: settings.receiptPrinterEnabled,
        receiptPrinterName: settings.receiptPrinterName || '',
        receiptPaperWidth: settings.receiptPaperWidth,
        receiptAutoPrint: settings.receiptAutoPrint,
        receiptShowLogo: settings.receiptShowLogo,
        receiptLogoUrl: settings.receiptLogoUrl || '',
        receiptHeaderText: settings.receiptHeaderText || '',
        receiptFooterText: settings.receiptFooterText || '',
        receiptShowTaxBreakdown: settings.receiptShowTaxBreakdown,
        receiptShowQrCode: settings.receiptShowQrCode,
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {/* Receipt Settings Only - Invoice settings are in the Invoice Settings tab */}
            <div>
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                    <p className="text-sm text-blue-800">
                        <strong>Note:</strong> Invoice printing and appearance settings are configured in the <strong>Invoice Settings</strong> tab.
                    </p>
                </div>

                <h3 className="text-lg font-semibold text-gray-900 mb-4">Receipt Printing Configuration</h3>

                <div className="space-y-4">
                    <div className="flex items-center">
                        <input
                            type="checkbox"
                            id="receiptPrinterEnabled"
                            checked={formData.receiptPrinterEnabled}
                            onChange={(e) => setFormData({ ...formData, receiptPrinterEnabled: e.target.checked })}
                            className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <label htmlFor="receiptPrinterEnabled" className="ml-2 block text-sm text-gray-900">
                            Enable Receipt Printing
                        </label>
                    </div>

                    {formData.receiptPrinterEnabled && (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Thermal Printer Name
                                </label>
                                <input
                                    type="text"
                                    value={formData.receiptPrinterName}
                                    onChange={(e) => setFormData({ ...formData, receiptPrinterName: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="Leave blank for default thermal printer"
                                />
                                <p className="mt-1 text-xs text-gray-500">
                                    Thermal printer for POS receipts (typically 58mm or 80mm)
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Paper Width
                                </label>
                                <select
                                    value={formData.receiptPaperWidth}
                                    onChange={(e) => setFormData({ ...formData, receiptPaperWidth: parseInt(e.target.value) })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                    aria-label="Receipt Paper Width"
                                >
                                    <option value={58}>58mm (Small format)</option>
                                    <option value={80}>80mm (Standard format)</option>
                                </select>
                            </div>

                            <div className="flex items-center">
                                <input
                                    type="checkbox"
                                    id="receiptAutoPrint"
                                    checked={formData.receiptAutoPrint}
                                    onChange={(e) => setFormData({ ...formData, receiptAutoPrint: e.target.checked })}
                                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                />
                                <label htmlFor="receiptAutoPrint" className="ml-2 block text-sm text-gray-900">
                                    Auto-print receipt after completing sale
                                </label>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Header Text
                                </label>
                                <textarea
                                    value={formData.receiptHeaderText}
                                    onChange={(e) => setFormData({ ...formData, receiptHeaderText: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                    rows={2}
                                    placeholder="Welcome to our store!"
                                />
                                <p className="mt-1 text-xs text-gray-500">
                                    Optional message printed at the top of each receipt
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Footer Text
                                </label>
                                <textarea
                                    value={formData.receiptFooterText}
                                    onChange={(e) => setFormData({ ...formData, receiptFooterText: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                    rows={2}
                                    placeholder="Thank you for your business!"
                                />
                                <p className="mt-1 text-xs text-gray-500">
                                    Optional message printed at the bottom of each receipt
                                </p>
                            </div>

                            <div className="flex items-center">
                                <input
                                    type="checkbox"
                                    id="receiptShowTaxBreakdown"
                                    checked={formData.receiptShowTaxBreakdown}
                                    onChange={(e) => setFormData({ ...formData, receiptShowTaxBreakdown: e.target.checked })}
                                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                />
                                <label htmlFor="receiptShowTaxBreakdown" className="ml-2 block text-sm text-gray-900">
                                    Show detailed tax breakdown on receipt
                                </label>
                            </div>

                            <div className="flex items-center">
                                <input
                                    type="checkbox"
                                    id="receiptShowQrCode"
                                    checked={formData.receiptShowQrCode}
                                    onChange={(e) => setFormData({ ...formData, receiptShowQrCode: e.target.checked })}
                                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                />
                                <label htmlFor="receiptShowQrCode" className="ml-2 block text-sm text-gray-900">
                                    Show QR code on receipt (for digital verification)
                                </label>
                            </div>
                        </>
                    )}
                </div>
            </div>

            <div className="flex justify-end">
                <button
                    type="submit"
                    disabled={isSaving}
                    className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isSaving ? 'Saving...' : 'Save Receipt Settings'}
                </button>
            </div>
        </form>
    );
}

// Alert Settings Tab
function AlertSettings({
    settings,
    onSave,
    isSaving,
}: {
    settings: SystemSettings;
    onSave: (updates: Partial<SystemSettings>) => void;
    isSaving: boolean;
}) {
    const [formData, setFormData] = useState({
        lowStockAlertsEnabled: settings.lowStockAlertsEnabled,
        lowStockThreshold: settings.lowStockThreshold,
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Low Stock Alerts</h3>

                <div className="space-y-4">
                    <div className="flex items-center">
                        <input
                            type="checkbox"
                            id="lowStockAlertsEnabled"
                            checked={formData.lowStockAlertsEnabled}
                            onChange={(e) => setFormData({ ...formData, lowStockAlertsEnabled: e.target.checked })}
                            className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <label htmlFor="lowStockAlertsEnabled" className="ml-2 block text-sm text-gray-900">
                            Enable low stock alerts
                        </label>
                    </div>

                    {formData.lowStockAlertsEnabled && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Alert Threshold (units)
                            </label>
                            <input
                                type="number"
                                value={formData.lowStockThreshold}
                                onChange={(e) => setFormData({ ...formData, lowStockThreshold: parseInt(e.target.value) })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                aria-label="Low Stock Alert Threshold"
                                min="0"
                            />
                            <p className="mt-1 text-sm text-gray-500">
                                Alert when product quantity falls below this threshold
                            </p>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex justify-end">
                <button
                    type="submit"
                    disabled={isSaving}
                    className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isSaving ? 'Saving...' : 'Save Alert Settings'}
                </button>
            </div>
        </form>
    );
}
