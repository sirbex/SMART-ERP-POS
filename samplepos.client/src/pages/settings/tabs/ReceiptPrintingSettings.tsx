/**
 * POS receipt thermal printer settings (SSOT UI).
 * Used by Settings → Printing and System → Printing.
 */
import { useState } from 'react';

export type ReceiptPrintingFields = {
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
};

export default function ReceiptPrintingSettings({
  settings,
  onSave,
  isSaving,
}: {
  settings: ReceiptPrintingFields;
  onSave: (updates: Partial<ReceiptPrintingFields>) => void;
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
    <form onSubmit={handleSubmit} className="space-y-6" data-settings-section="receipt-printing">
      <div>
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
          <p className="text-sm text-blue-800">
            <strong>Note:</strong> Invoice printing and appearance settings are configured in the{' '}
            <strong>Invoice Settings</strong> tab.
          </p>
        </div>

        <h3 className="text-lg font-semibold text-gray-900 mb-4">Receipt Printing Configuration</h3>

        <div className="space-y-4">
          <div className="flex items-center">
            <input
              type="checkbox"
              id="receiptPrinterEnabled"
              checked={formData.receiptPrinterEnabled}
              onChange={(e) =>
                setFormData({ ...formData, receiptPrinterEnabled: e.target.checked })
              }
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
                  onChange={(e) =>
                    setFormData({ ...formData, receiptPrinterName: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Leave blank for default thermal printer"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Thermal printer for POS receipts (typically 58mm or 80mm)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Paper Width</label>
                <select
                  value={formData.receiptPaperWidth}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      receiptPaperWidth: parseInt(e.target.value, 10),
                    })
                  }
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
                  onChange={(e) =>
                    setFormData({ ...formData, receiptAutoPrint: e.target.checked })
                  }
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="receiptAutoPrint" className="ml-2 block text-sm text-gray-900">
                  Auto-print receipt after completing sale
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Header Text</label>
                <textarea
                  value={formData.receiptHeaderText}
                  onChange={(e) =>
                    setFormData({ ...formData, receiptHeaderText: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  rows={2}
                  placeholder="Welcome to our store!"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Optional message printed at the top of each receipt
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Footer Text</label>
                <textarea
                  value={formData.receiptFooterText}
                  onChange={(e) =>
                    setFormData({ ...formData, receiptFooterText: e.target.value })
                  }
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
                  onChange={(e) =>
                    setFormData({ ...formData, receiptShowTaxBreakdown: e.target.checked })
                  }
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
                  onChange={(e) =>
                    setFormData({ ...formData, receiptShowQrCode: e.target.checked })
                  }
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
