/**
 * Price Preview Page
 * Simulate pricing calculations with full breakdown of how a price was determined
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';
import Decimal from 'decimal.js';
import Layout from '../../components/Layout';
import { useCustomerGroups } from '../../hooks/usePricing';
import { pricingApi } from '../../api/pricing';
import { formatCurrency } from '../../utils/currency';
import { extractApiError } from '../../utils/extractApiError';
import apiClient from '../../utils/api';
import PricingTabs from '../../components/PricingTabs';
import type { ResolvedPrice } from '../../types/pricing';

// ============================================================================
// Helpers
// ============================================================================

function scopeExplanation(scope: string): string {
  switch (scope) {
    case 'tier': return 'Product pricing tier (quantity-based)';
    case 'product': return 'Product-specific price rule';
    case 'category': return 'Category-level price rule';
    case 'global': return 'Global price rule for customer group';
    case 'group_discount': return 'Customer group flat discount';
    case 'formula': return 'Product pricing formula';
    case 'base': return 'Base selling price (no rules applied)';
    default: return scope;
  }
}

function scopeColor(scope: string): string {
  switch (scope) {
    case 'tier': return 'bg-purple-100 text-purple-800 border-purple-200';
    case 'product': return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'category': return 'bg-teal-100 text-teal-800 border-teal-200';
    case 'global': return 'bg-indigo-100 text-indigo-800 border-indigo-200';
    case 'group_discount': return 'bg-orange-100 text-orange-800 border-orange-200';
    case 'formula': return 'bg-pink-100 text-pink-800 border-pink-200';
    case 'base': return 'bg-gray-100 text-gray-800 border-gray-200';
    default: return 'bg-gray-100 text-gray-800 border-gray-200';
  }
}

interface ProductOption {
  id: string;
  name: string;
  sellingPrice: number;
}

interface CustomerOption {
  id: string;
  name: string;
}

// ============================================================================
// Component
// ============================================================================

export default function PricePreviewPage() {
  // ── Inputs ──
  const [productSearch, setProductSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<ProductOption | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [quantity, setQuantity] = useState(1);

  // ── Search results ──
  const [productResults, setProductResults] = useState<ProductOption[]>([]);
  const [customerResults, setCustomerResults] = useState<CustomerOption[]>([]);
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  // ── Result ──
  const [result, setResult] = useState<ResolvedPrice | null>(null);
  const [calculating, setCalculating] = useState(false);

  // ── Dropdown data ──
  const { data: customerGroups } = useCustomerGroups(true);

  // ── Refs for click-outside (UX1) ──
  const productDropdownRef = useRef<HTMLDivElement>(null);
  const customerDropdownRef = useRef<HTMLDivElement>(null);

  // ── Click-outside handler (UX1) ──
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (productDropdownRef.current && !productDropdownRef.current.contains(event.target as Node)) {
        setShowProductDropdown(false);
      }
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(event.target as Node)) {
        setShowCustomerDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ── Product Search (P3: useRef for debounce, E1: cleanup) ──
  const productSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (productSearchTimeoutRef.current) clearTimeout(productSearchTimeoutRef.current); }, []);

  const handleProductSearch = useCallback((value: string) => {
    setProductSearch(value);
    setSelectedProduct(null);
    setResult(null);

    if (productSearchTimeoutRef.current) clearTimeout(productSearchTimeoutRef.current);
    if (value.length < 2) {
      setProductResults([]);
      setShowProductDropdown(false);
      return;
    }

    productSearchTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await apiClient.get('/products', { params: { search: value, limit: 10 } });
        const items = response.data?.data ?? [];
        const products: ProductOption[] = (items as Record<string, unknown>[]).map((p) => ({
          id: String(p.id),
          name: String(p.name ?? ''),
          sellingPrice: Number(p.selling_price ?? p.sellingPrice ?? 0),
        }));
        setProductResults(products);
        setShowProductDropdown(true);
      } catch {
        setProductResults([]);
      }
    }, 300);
  }, []);

  // ── Customer Search (P3: useRef for debounce, E1: cleanup) ──
  const customerSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (customerSearchTimeoutRef.current) clearTimeout(customerSearchTimeoutRef.current); }, []);

  const handleCustomerSearch = useCallback((value: string) => {
    setCustomerSearch(value);
    setSelectedCustomer(null);

    if (customerSearchTimeoutRef.current) clearTimeout(customerSearchTimeoutRef.current);
    if (value.length < 2) {
      setCustomerResults([]);
      setShowCustomerDropdown(false);
      return;
    }

    customerSearchTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await apiClient.get('/customers', { params: { search: value, limit: 10 } });
        const items = response.data?.data ?? [];
        const customers: CustomerOption[] = (items as Record<string, unknown>[]).map((c) => ({
          id: String(c.id),
          name: String(c.name ?? ''),
        }));
        setCustomerResults(customers);
        setShowCustomerDropdown(true);
      } catch {
        setCustomerResults([]);
      }
    }, 300);
  }, []);

  // ── Calculate ──
  const handleCalculate = useCallback(async () => {
    if (!selectedProduct) {
      toast.error('Select a product first');
      return;
    }
    if (quantity <= 0) {
      toast.error('Quantity must be positive');
      return;
    }

    setCalculating(true);
    try {
      const res = await pricingApi.calculatePrice(
        selectedProduct.id,
        quantity,
        selectedCustomer?.id,
        selectedGroupId || undefined,
      );
      setResult(res);
    } catch (err: unknown) {
      toast.error(extractApiError(err, 'Calculation failed'));
      setResult(null);
    } finally {
      setCalculating(false);
    }
  }, [selectedProduct, selectedCustomer, selectedGroupId, quantity]);

  // ── Reset ──
  const handleReset = useCallback(() => {
    setProductSearch('');
    setCustomerSearch('');
    setSelectedProduct(null);
    setSelectedCustomer(null);
    setSelectedGroupId('');
    setQuantity(1);
    setResult(null);
    setProductResults([]);
    setCustomerResults([]);
  }, []);

  return (
    <Layout>
      <PricingTabs />
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Price Preview</h1>
          <p className="text-sm text-gray-500 mt-1">
            Simulate pricing to see exactly how a price is calculated for any product, customer, and quantity
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input Panel */}
          <div className="bg-white border rounded-lg p-6 space-y-5">
            <h2 className="text-lg font-semibold text-gray-800">Calculation Inputs</h2>

            {/* Product Search */}
            <div className="relative" ref={productDropdownRef}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Product <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={selectedProduct ? selectedProduct.name : productSearch}
                onChange={e => handleProductSearch(e.target.value)}
                onFocus={() => productResults.length > 0 && setShowProductDropdown(true)}
                placeholder="Search products..."
                className="w-full border rounded-md px-3 py-2 text-sm"
              />
              {selectedProduct && (
                <button
                  onClick={() => { setSelectedProduct(null); setProductSearch(''); setResult(null); }}
                  className="absolute right-2 top-8 text-gray-400 hover:text-gray-600 text-xs"
                >
                  ✕
                </button>
              )}
              {showProductDropdown && productResults.length > 0 && !selectedProduct && (
                <div className="absolute z-10 w-full mt-1 bg-white border rounded-md shadow-lg max-h-48 overflow-auto">
                  {productResults.map(p => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setSelectedProduct(p);
                        setProductSearch(p.name);
                        setShowProductDropdown(false);
                        setResult(null);
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex justify-between"
                    >
                      <span>{p.name}</span>
                      <span className="text-gray-400">{formatCurrency(p.sellingPrice)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Customer Search (optional) */}
            <div className="relative" ref={customerDropdownRef}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Customer <span className="text-gray-400">(optional)</span>
              </label>
              <input
                type="text"
                value={selectedCustomer ? selectedCustomer.name : customerSearch}
                onChange={e => handleCustomerSearch(e.target.value)}
                onFocus={() => customerResults.length > 0 && setShowCustomerDropdown(true)}
                placeholder="Search customers..."
                className="w-full border rounded-md px-3 py-2 text-sm"
              />
              {selectedCustomer && (
                <button
                  onClick={() => { setSelectedCustomer(null); setCustomerSearch(''); }}
                  className="absolute right-2 top-8 text-gray-400 hover:text-gray-600 text-xs"
                >
                  ✕
                </button>
              )}
              {showCustomerDropdown && customerResults.length > 0 && !selectedCustomer && (
                <div className="absolute z-10 w-full mt-1 bg-white border rounded-md shadow-lg max-h-48 overflow-auto">
                  {customerResults.map(c => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setSelectedCustomer(c);
                        setCustomerSearch(c.name);
                        setShowCustomerDropdown(false);
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* OR Customer Group */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Or select Customer Group directly
              </label>
              <select
                value={selectedGroupId}
                onChange={e => setSelectedGroupId(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
              >
                <option value="">No group selected</option>
                {(customerGroups ?? []).map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">
                If a customer is selected, their group is used automatically
              </p>
            </div>

            {/* Quantity */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
              <input
                type="number"
                min="1"
                step="1"
                value={quantity}
                onChange={e => { setQuantity(Math.max(1, Number(e.target.value) || 1)); setResult(null); }}
                className="w-full border rounded-md px-3 py-2 text-sm"
              />
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleCalculate}
                disabled={calculating || !selectedProduct}
                className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium"
              >
                {calculating ? 'Calculating...' : 'Calculate Price'}
              </button>
              <button
                onClick={handleReset}
                className="px-4 py-2.5 border rounded-lg hover:bg-gray-50 transition-colors text-sm"
              >
                Reset
              </button>
            </div>
          </div>

          {/* Result Panel */}
          <div className="bg-white border rounded-lg p-6 space-y-5">
            <h2 className="text-lg font-semibold text-gray-800">Price Breakdown</h2>

            {!result && !calculating && (
              <div className="text-center py-12 text-gray-400">
                <p className="text-4xl mb-3">💰</p>
                <p className="text-sm">Select a product and click &quot;Calculate Price&quot; to see the breakdown</p>
              </div>
            )}

            {calculating && (
              <div className="flex justify-center py-12">
                <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
              </div>
            )}

            {result && (
              <div className="space-y-6">
                {/* Final Price - hero display */}
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 text-center border border-blue-100">
                  <p className="text-sm text-gray-500 mb-1">Final Price</p>
                  <p className="text-4xl font-bold text-blue-700">{formatCurrency(result.finalPrice)}</p>
                  {quantity > 1 && (
                    <p className="text-sm text-gray-500 mt-2">
                      Line total: <span className="font-semibold">{formatCurrency(new Decimal(result.finalPrice).mul(quantity))}</span>
                    </p>
                  )}
                </div>

                {/* Breakdown Table */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm text-gray-600">Base Price</span>
                    <span className="font-mono text-sm">{formatCurrency(result.basePrice)}</span>
                  </div>

                  {result.discount > 0 && (
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="text-sm text-red-600">Discount</span>
                      <span className="font-mono text-sm text-red-600">
                        −{formatCurrency(result.discount)}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between items-center py-2 border-b font-semibold">
                    <span className="text-sm">Final Unit Price</span>
                    <span className="font-mono text-sm">{formatCurrency(result.finalPrice)}</span>
                  </div>

                  {result.basePrice > 0 && result.discount > 0 && (
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="text-sm text-gray-600">Effective Discount</span>
                      <span className="font-mono text-sm text-orange-600">
                        {new Decimal(result.discount).div(result.basePrice).mul(100).toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>

                {/* Applied Rule Explanation */}
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2 border-b">
                    <h3 className="text-sm font-semibold text-gray-700">Why this price?</h3>
                  </div>
                  <div className="p-4 space-y-3">
                    {/* Scope badge */}
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium px-2 py-1 rounded border ${scopeColor(result.appliedRule.scope)}`}>
                        {result.appliedRule.scope.toUpperCase().replace('_', ' ')}
                      </span>
                      <span className="text-sm text-gray-600">
                        {scopeExplanation(result.appliedRule.scope)}
                      </span>
                    </div>

                    {/* Rule details */}
                    {result.appliedRule.ruleId && (
                      <div className="bg-gray-50 rounded-md p-3 text-sm space-y-1">
                        {result.appliedRule.ruleName && (
                          <p>
                            <span className="text-gray-500">Rule:</span>{' '}
                            <span className="font-medium">{result.appliedRule.ruleName}</span>
                          </p>
                        )}
                        {result.appliedRule.ruleType && (
                          <p>
                            <span className="text-gray-500">Type:</span>{' '}
                            {result.appliedRule.ruleType === 'multiplier' && `Multiplier ×${result.appliedRule.ruleValue}`}
                            {result.appliedRule.ruleType === 'discount' && `${result.appliedRule.ruleValue}% discount`}
                            {result.appliedRule.ruleType === 'fixed' && `Fixed at ${formatCurrency(result.appliedRule.ruleValue ?? 0)}`}
                          </p>
                        )}
                      </div>
                    )}

                    {/* No rule applied */}
                    {!result.appliedRule.ruleId && result.appliedRule.scope === 'base' && (
                      <p className="text-sm text-gray-500">
                        No pricing rules matched for this combination. The product&apos;s base selling price is used.
                      </p>
                    )}

                    {!result.appliedRule.ruleId && result.appliedRule.scope === 'group_discount' && (
                      <p className="text-sm text-gray-500">
                        The customer group&apos;s flat discount percentage was applied.
                      </p>
                    )}

                    {!result.appliedRule.ruleId && result.appliedRule.scope === 'formula' && (
                      <p className="text-sm text-gray-500">
                        The product&apos;s pricing formula was used to compute the final price.
                      </p>
                    )}

                    {!result.appliedRule.ruleId && result.appliedRule.scope === 'tier' && (
                      <p className="text-sm text-gray-500">
                        A quantity-based pricing tier was matched for this product.
                      </p>
                    )}
                  </div>
                </div>

                {/* Selected inputs summary */}
                <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-1">
                  <p className="font-medium text-gray-700 mb-2">Calculation Inputs</p>
                  <p><span className="text-gray-500">Product:</span> {selectedProduct?.name}</p>
                  {selectedCustomer && (
                    <p><span className="text-gray-500">Customer:</span> {selectedCustomer.name}</p>
                  )}
                  {selectedGroupId && (
                    <p>
                      <span className="text-gray-500">Group:</span>{' '}
                      {(customerGroups ?? []).find(g => g.id === selectedGroupId)?.name ?? selectedGroupId}
                    </p>
                  )}
                  <p><span className="text-gray-500">Quantity:</span> {quantity}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
