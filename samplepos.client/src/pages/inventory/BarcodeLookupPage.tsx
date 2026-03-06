/**
 * Barcode Lookup Page
 *
 * Standalone barcode scanning page for inventory lookup:
 * - Scan product barcodes to view stock, batch info, pricing
 * - Manual barcode entry
 * - Scan history within session
 * - UoM-aware barcode resolution
 *
 * Accessible from Inventory section.
 */

import { useState, useCallback } from 'react';
import Layout from '../../components/Layout';
import BarcodeScannerIndicator from '../../components/barcode/BarcodeScannerIndicator';
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner';
import { formatCurrency } from '../../utils/currency';
import apiClient from '../../utils/api';
import toast from 'react-hot-toast';

interface LookupResult {
  productId: string;
  productName: string;
  sku: string;
  barcode: string;
  sellingPrice: number;
  costPrice: number;
  stockOnHand: number;
  productType: string;
  matchedVia: 'product_barcode' | 'uom_barcode' | 'sku';
  matchedUom?: string;
  batches?: Array<{
    batchNumber: string;
    expiryDate?: string;
    remainingQuantity: number;
    unitCost: number;
  }>;
}

interface ScanHistoryEntry {
  barcode: string;
  timestamp: number;
  result: LookupResult | null;
  error?: string;
}

export default function BarcodeLookupPage() {
  const [scannerEnabled, setScannerEnabled] = useState(true);
  const [manualBarcode, setManualBarcode] = useState('');
  const [currentResult, setCurrentResult] = useState<LookupResult | null>(null);
  const [scanHistory, setScanHistory] = useState<ScanHistoryEntry[]>([]);
  const [isLooking, setIsLooking] = useState(false);

  const lookupBarcode = useCallback(async (barcode: string) => {
    if (!barcode.trim()) return;

    setIsLooking(true);
    try {
      // Try server-side lookup first
      const res = await apiClient.get('/products', {
        params: { search: barcode, limit: 10 },
      });

      const products = res.data?.data || [];

      // Find exact barcode match
      let match: LookupResult | null = null;

      for (const product of products) {
        const productBarcode = (product.barcode || '').toUpperCase();
        const sku = (product.sku || '').toUpperCase();
        const searchBarcode = barcode.toUpperCase();

        if (productBarcode === searchBarcode) {
          match = {
            productId: product.id,
            productName: product.name,
            sku: product.sku || '',
            barcode: product.barcode || '',
            sellingPrice: parseFloat(product.selling_price || product.sellingPrice || '0'),
            costPrice: parseFloat(product.cost_price || product.costPrice || '0'),
            stockOnHand: parseFloat(product.quantity_on_hand || product.quantityOnHand || '0'),
            productType: product.product_type || product.productType || 'inventory',
            matchedVia: 'product_barcode',
          };
          break;
        }

        if (sku === searchBarcode) {
          match = {
            productId: product.id,
            productName: product.name,
            sku: product.sku || '',
            barcode: product.barcode || '',
            sellingPrice: parseFloat(product.selling_price || product.sellingPrice || '0'),
            costPrice: parseFloat(product.cost_price || product.costPrice || '0'),
            stockOnHand: parseFloat(product.quantity_on_hand || product.quantityOnHand || '0'),
            productType: product.product_type || product.productType || 'inventory',
            matchedVia: 'sku',
          };
          break;
        }

        // Check UoM barcodes
        const uoms = product.product_uoms || product.uoms || [];
        for (const uom of uoms) {
          if (uom.barcode && uom.barcode.toUpperCase() === searchBarcode) {
            match = {
              productId: product.id,
              productName: product.name,
              sku: product.sku || '',
              barcode: uom.barcode,
              sellingPrice: parseFloat(uom.price || uom.selling_price || '0'),
              costPrice: parseFloat(uom.cost || uom.cost_price || '0'),
              stockOnHand: parseFloat(product.quantity_on_hand || product.quantityOnHand || '0'),
              productType: product.product_type || product.productType || 'inventory',
              matchedVia: 'uom_barcode',
              matchedUom: uom.name || uom.symbol,
            };
            break;
          }
        }
        if (match) break;
      }

      // If matched, fetch batch details
      if (match) {
        try {
          const batchRes = await apiClient.get(`/inventory/batches?productId=${match.productId}&limit=20`);
          const batches = (batchRes.data?.data || []).map((b: Record<string, unknown>) => ({
            batchNumber: b.batch_number || b.batchNumber || '',
            expiryDate: b.expiry_date || b.expiryDate || undefined,
            remainingQuantity: parseFloat(String(b.remaining_quantity || b.remainingQuantity || '0')),
            unitCost: parseFloat(String(b.unit_cost || b.unitCost || '0')),
          }));
          match.batches = batches;
        } catch {
          // Non-critical, continue without batch data
        }

        setCurrentResult(match);
        setScanHistory((prev) => [
          { barcode, timestamp: Date.now(), result: match },
          ...prev.slice(0, 49), // Keep last 50
        ]);

        // Audio feedback
        const beep = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBztH1/LJfiwE');
        beep.play().catch(() => { });
        toast.success(`Found: ${match.productName}`);
      } else {
        setCurrentResult(null);
        setScanHistory((prev) => [
          { barcode, timestamp: Date.now(), result: null, error: 'Product not found' },
          ...prev.slice(0, 49),
        ]);
        toast.error(`Not found: ${barcode}`);
      }
    } catch (err) {
      setCurrentResult(null);
      setScanHistory((prev) => [
        { barcode, timestamp: Date.now(), result: null, error: 'Lookup failed' },
        ...prev.slice(0, 49),
      ]);
      toast.error('Barcode lookup failed');
    } finally {
      setIsLooking(false);
    }
  }, []);

  const { buffer, lastScannedBarcode } = useBarcodeScanner({
    onScan: lookupBarcode,
    enabled: scannerEnabled,
    minLength: 3,
    maxLength: 50,
    timeout: 100,
  });

  const handleManualLookup = () => {
    if (manualBarcode.trim()) {
      lookupBarcode(manualBarcode.trim());
      setManualBarcode('');
    }
  };

  return (
    <Layout>
      <div className="p-6 lg:p-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Barcode Lookup</h1>
            <p className="text-gray-600 mt-1">Scan or enter barcodes to look up product information</p>
          </div>
          <BarcodeScannerIndicator
            enabled={scannerEnabled}
            lastScanned={lastScannedBarcode}
            buffer={buffer}
            onToggle={() => setScannerEnabled(!scannerEnabled)}
          />
        </div>

        {/* Manual Entry */}
        <div className="mb-6 bg-white rounded-lg shadow p-4">
          <div className="flex gap-3">
            <input
              type="text"
              value={manualBarcode}
              onChange={(e) => setManualBarcode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleManualLookup()}
              placeholder="Enter barcode or SKU manually..."
              className="barcode-scanner-enabled flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base font-mono"
            />
            <button
              onClick={handleManualLookup}
              disabled={isLooking || !manualBarcode.trim()}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold disabled:opacity-50 transition-all"
            >
              {isLooking ? 'Looking...' : 'Lookup'}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Tip: With scanner enabled, simply scan a barcode — no need to click into a field
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Result Panel */}
          <div className="lg:col-span-2">
            {currentResult ? (
              <div className="bg-white rounded-lg shadow">
                {/* Product Header */}
                <div className="p-5 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">{currentResult.productName}</h2>
                      <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                        <span>SKU: <span className="font-mono">{currentResult.sku || '—'}</span></span>
                        <span>•</span>
                        <span>Barcode: <span className="font-mono">{currentResult.barcode || '—'}</span></span>
                        {currentResult.matchedUom && (
                          <>
                            <span>•</span>
                            <span className="text-blue-600">Matched UoM: {currentResult.matchedUom}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${currentResult.productType === 'service' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                      {currentResult.productType}
                    </span>
                  </div>
                </div>

                {/* Key Metrics */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-5 border-b border-gray-200">
                  <div>
                    <p className="text-xs text-gray-500">Selling Price</p>
                    <p className="text-lg font-bold text-gray-900">{formatCurrency(currentResult.sellingPrice)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Cost Price</p>
                    <p className="text-lg font-bold text-gray-900">{formatCurrency(currentResult.costPrice)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Stock on Hand</p>
                    <p className={`text-lg font-bold ${currentResult.stockOnHand > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {currentResult.stockOnHand}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Matched Via</p>
                    <p className="text-sm font-medium text-gray-700">{currentResult.matchedVia.replace(/_/g, ' ')}</p>
                  </div>
                </div>

                {/* Batch Information */}
                {currentResult.batches && currentResult.batches.length > 0 && (
                  <div className="p-5">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Batch Details ({currentResult.batches.length})</h3>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Batch</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Expiry</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Unit Cost</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {currentResult.batches.map((batch, idx) => {
                            const isExpired = batch.expiryDate && new Date(batch.expiryDate) < new Date();
                            return (
                              <tr key={idx} className={isExpired ? 'bg-red-50' : ''}>
                                <td className="px-3 py-2 text-sm font-mono">{batch.batchNumber}</td>
                                <td className="px-3 py-2 text-sm">
                                  {batch.expiryDate || '—'}
                                  {isExpired && <span className="ml-1 text-xs text-red-600">(expired)</span>}
                                </td>
                                <td className="px-3 py-2 text-sm text-right">{batch.remainingQuantity}</td>
                                <td className="px-3 py-2 text-sm text-right">{formatCurrency(batch.unitCost)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow p-12 text-center">
                <div className="text-6xl mb-4">📡</div>
                <h3 className="text-lg font-semibold text-gray-700 mb-2">Ready to Scan</h3>
                <p className="text-gray-500">
                  Scan a product barcode or enter it manually to view product details, stock levels, and batch information.
                </p>
              </div>
            )}
          </div>

          {/* Scan History */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow">
              <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">Scan History</h3>
                {scanHistory.length > 0 && (
                  <button
                    onClick={() => setScanHistory([])}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    Clear
                  </button>
                )}
              </div>
              {scanHistory.length === 0 ? (
                <div className="p-4 text-sm text-gray-400 text-center">No scans yet</div>
              ) : (
                <div className="max-h-[500px] overflow-y-auto divide-y divide-gray-100">
                  {scanHistory.map((entry, idx) => (
                    <button
                      key={idx}
                      onClick={() => entry.result && setCurrentResult(entry.result)}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-mono text-gray-900 truncate">
                          {entry.barcode}
                        </span>
                        <span className={`w-2 h-2 rounded-full ${entry.result ? 'bg-green-500' : 'bg-red-400'}`} />
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-xs text-gray-500 truncate">
                          {entry.result ? entry.result.productName : entry.error}
                        </span>
                        <span className="text-xs text-gray-400">
                          {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
