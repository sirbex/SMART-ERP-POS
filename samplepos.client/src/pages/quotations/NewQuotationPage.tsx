/**
 * New Standard Quotation Form - Wizard Style
 * Simple 3-step process: Customer → Items → Review
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import quotationApi from '../../api/quotations';
import { api } from '../../utils/api';
import type { Customer } from '@shared/zod/customer';
import type { CreateQuotationInput } from '@shared/types/quotation';
import { AxiosError } from 'axios';
import { formatCurrency } from '../../utils/currency';
import Layout from '../../components/Layout';
import CustomerSelector from '../../components/pos/CustomerSelector';
import { DatePicker } from '../../components/ui/date-picker';
import Decimal from 'decimal.js';

interface QuoteItem {
  id: string;
  productId?: string;
  itemType: 'product' | 'service' | 'custom';
  sku?: string;
  description: string;
  notes?: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  isTaxable: boolean;
  taxRate: number;
  uomId?: string;
  uomName?: string;
}

interface ProductListItem {
  id: string;
  name: string;
  sku?: string;
  sellingPrice?: number;
  trackExpiry?: boolean;
  uomId?: string;
  uomName?: string;
}

export default function NewQuotationPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1); // 1: Customer, 2: Items, 3: Review

  // Customer data
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');

  // Quote details
  const [reference, setReference] = useState('');
  const [validUntil, setValidUntil] = useState(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [items, setItems] = useState<QuoteItem[]>([]);

  // Advanced fields (optional)
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [termsAndConditions, setTermsAndConditions] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('Net 30');
  const [deliveryTerms, setDeliveryTerms] = useState('7-14 business days');
  const [internalNotes, setInternalNotes] = useState('');
  const [requiresApproval, setRequiresApproval] = useState(false);

  // Product search
  const [productSearch, setProductSearch] = useState('');
  const { data: productsData } = useQuery({
    queryKey: ['products', productSearch],
    queryFn: async () => {
      const res = await api.products.list();
      if (!res.data.success) return [];
      const all = (res.data.data ?? []) as ProductListItem[];
      if (!productSearch) return all;
      const term = productSearch.toLowerCase();
      return all.filter((p: ProductListItem) =>
        String(p.name ?? '').toLowerCase().includes(term) ||
        (p.sku && String(p.sku).toLowerCase().includes(term))
      );
    },
    enabled: productSearch.length > 0,
  });

  const createQuoteMutation = useMutation({
    mutationFn: (data: CreateQuotationInput) => quotationApi.createQuotation(data),
    onSuccess: (response) => {
      // Invalidate quotations cache to refresh the list immediately
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      toast.success(`Quotation ${response.quotation.quoteNumber} created successfully!`);
      navigate('/quotations');
    },
    onError: (error: Error) => {
      toast.error((error as AxiosError<{ error?: string }>).response?.data?.error || 'Failed to create quotation');
    },
  });

  // Auto-fill from selected customer
  useEffect(() => {
    if (selectedCustomer) {
      setCustomerName(selectedCustomer.name);
      setCustomerPhone(selectedCustomer.phone || '');
      setCustomerEmail(selectedCustomer.email || '');
    }
  }, [selectedCustomer]);

  const addItem = () => {
    setItems([
      ...items,
      {
        id: `temp_${Date.now()}`,
        itemType: 'product',
        description: '',
        quantity: 1,
        unitPrice: 0,
        discountAmount: 0,
        isTaxable: true,
        taxRate: 18,
      },
    ]);
  };

  const addProductToItems = (product: ProductListItem) => {
    const existing = items.find((item) => item.productId === product.id);
    if (existing) {
      updateItem(items.indexOf(existing), 'quantity', existing.quantity + 1);
      toast.success(`Increased ${product.name} quantity`);
    } else {
      setItems([
        ...items,
        {
          id: `temp_${Date.now()}`,
          productId: product.id,
          itemType: 'product',
          sku: product.sku,
          description: product.name,
          quantity: 1,
          unitPrice: product.sellingPrice || 0,
          discountAmount: 0,
          isTaxable: product.trackExpiry !== false,
          taxRate: 18,
          uomId: product.uomId,
          uomName: product.uomName,
        },
      ]);
      toast.success(`Added ${product.name}`);
    }
    setProductSearch('');
  };

  const updateItem = (index: number, field: keyof QuoteItem, value: string | number | boolean) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const calculateItemTotal = (item: QuoteItem): number => {
    const subtotal = new Decimal(item.quantity).times(item.unitPrice);
    const afterDiscount = subtotal.minus(item.discountAmount || 0);
    if (item.isTaxable) {
      const tax = afterDiscount.times(item.taxRate || 0).dividedBy(100);
      return afterDiscount.plus(tax).toNumber();
    }
    return afterDiscount.toNumber();
  };

  const calculateTotals = () => {
    let subtotal = new Decimal(0);
    let totalDiscount = new Decimal(0);
    let totalTax = new Decimal(0);

    items.forEach((item) => {
      const itemSubtotal = new Decimal(item.quantity).times(item.unitPrice);
      subtotal = subtotal.plus(itemSubtotal);
      totalDiscount = totalDiscount.plus(item.discountAmount || 0);

      if (item.isTaxable) {
        const afterDiscount = itemSubtotal.minus(item.discountAmount || 0);
        const tax = afterDiscount.times(item.taxRate || 0).dividedBy(100);
        totalTax = totalTax.plus(tax);
      }
    });

    const total = subtotal.minus(totalDiscount).plus(totalTax);

    return {
      subtotal: subtotal.toNumber(),
      totalDiscount: totalDiscount.toNumber(),
      totalTax: totalTax.toNumber(),
      total: total.toNumber(),
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (items.length === 0) {
      toast.error('Please add at least one item');
      return;
    }

    const quotationData = {
      quoteType: 'standard' as const,
      customerId: selectedCustomer?.id,
      customerName: customerName || selectedCustomer?.name,
      customerPhone: (customerPhone || selectedCustomer?.phone) || undefined,
      customerEmail: (customerEmail || selectedCustomer?.email) || undefined,
      validFrom: new Date().toISOString().split('T')[0],
      validUntil,
      notes: internalNotes || undefined,
      items: items.map((item) => ({
        ...item,
        uomId: item.uomId || undefined, // Convert null to undefined for Zod
        total: calculateItemTotal(item),
      })),
    };

    createQuoteMutation.mutate(quotationData);
  };

  const totals = calculateTotals();

  return (
    <Layout>
      <div className="p-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Create Standard Quotation</h1>
              <p className="text-gray-600 mt-1">Simple 3-step process to create a detailed quote</p>
            </div>
            <button
              onClick={() => navigate('/quotations')}
              className="px-4 py-2 text-gray-600 hover:text-gray-900"
            >
              ← Back
            </button>
          </div>
        </div>

        {/* Step Indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-center space-x-4">
            {/* Step 1 */}
            <div className="flex flex-col items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-lg ${step >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
                  }`}
              >
                1
              </div>
              <span className={`text-sm mt-2 font-medium ${step >= 1 ? 'text-blue-600' : 'text-gray-500'}`}>
                Customer
              </span>
            </div>

            {/* Connector */}
            <div className={`w-24 h-1 ${step >= 2 ? 'bg-blue-600' : 'bg-gray-200'}`}></div>

            {/* Step 2 */}
            <div className="flex flex-col items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-lg ${step >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
                  }`}
              >
                2
              </div>
              <span className={`text-sm mt-2 font-medium ${step >= 2 ? 'text-blue-600' : 'text-gray-500'}`}>
                Add Items
              </span>
            </div>

            {/* Connector */}
            <div className={`w-24 h-1 ${step >= 3 ? 'bg-blue-600' : 'bg-gray-200'}`}></div>

            {/* Step 3 */}
            <div className="flex flex-col items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-lg ${step >= 3 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
                  }`}
              >
                3
              </div>
              <span className={`text-sm mt-2 font-medium ${step >= 3 ? 'text-blue-600' : 'text-gray-500'}`}>
                Review & Save
              </span>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Step 1: Customer Information */}
          {step === 1 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-6 flex items-center">
                <span className="bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center mr-3 text-base">
                  1
                </span>
                Customer Information
              </h2>

              {/* Customer Selector */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Existing Customer (Optional)
                </label>
                <CustomerSelector
                  selectedCustomer={selectedCustomer}
                  onSelectCustomer={setSelectedCustomer}
                  saleTotal={totals.total}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Select an existing customer to auto-fill details, or enter manually below
                </p>
              </div>

              {/* Manual Customer Entry */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Customer Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg"
                    placeholder="Enter customer name"
                    required
                    autoFocus
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Phone</label>
                    <input
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="0700000000"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                    <input
                      type="email"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="customer@example.com"
                    />
                  </div>
                </div>
              </div>

              {/* Optional Details */}
              <div className="mt-6 bg-gray-50 rounded-lg p-4">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center"
                >
                  {showAdvanced ? '− Hide' : '+ Add'} Reference & Validity Date
                </button>

                {showAdvanced && (
                  <div className="mt-4 grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Reference</label>
                      <input
                        type="text"
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="PO-123, RFQ-456"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Valid Until</label>
                      <DatePicker
                        value={validUntil}
                        onChange={(date) => setValidUntil(date)}
                        placeholder="Select valid until date"
                        minDate={new Date()}
                      />
                      <p className="text-xs text-gray-500 mt-1">Default: 30 days from today</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Step 1 Actions */}
              <div className="flex justify-end pt-6 border-t mt-6">
                <button
                  type="button"
                  onClick={() => {
                    if (!customerName.trim()) {
                      toast.error('Please enter customer name');
                      return;
                    }
                    setStep(2);
                  }}
                  className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold text-lg shadow-sm"
                >
                  Next: Add Items →
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Add Items */}
          {step === 2 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-6 flex items-center">
                <span className="bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center mr-3 text-base">
                  2
                </span>
                Add Items to Quote
              </h2>

              {/* Product Search */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  🔍 Search Products
                </label>
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg"
                  placeholder="Search by product name or SKU..."
                  autoFocus
                />
                {productSearch && productsData && productsData.length > 0 && (
                  <div className="mt-2 border border-gray-300 rounded-lg max-h-64 overflow-y-auto bg-white shadow-lg">
                    {productsData.slice(0, 10).map((product: ProductListItem) => (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => addProductToItems(product)}
                        className="w-full px-4 py-3 text-left hover:bg-blue-50 border-b last:border-b-0 transition-colors"
                      >
                        <div className="flex justify-between items-center">
                          <div>
                            <div className="font-semibold text-gray-900">{product.name}</div>
                            <div className="text-sm text-gray-600">
                              {product.sku && <span className="mr-2">SKU: {product.sku}</span>}
                              <span className="text-green-600 font-medium">
                                {formatCurrency(product.sellingPrice || 0)}
                              </span>
                            </div>
                          </div>
                          <span className="text-blue-600 font-medium">+ Add</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Items List */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold text-gray-900">Items ({items.length})</h3>
                  <button
                    type="button"
                    onClick={addItem}
                    className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium"
                  >
                    + Add Custom Item
                  </button>
                </div>

                {items.length === 0 ? (
                  <div className="text-center py-16 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                    <div className="text-4xl mb-3">📦</div>
                    <p className="text-gray-500 text-lg font-medium">No items added yet</p>
                    <p className="text-gray-400 text-sm mt-1">
                      Search for products above or add a custom item
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {items.map((item, index) => (
                      <div key={item.id} className="border border-gray-300 rounded-lg p-4 hover:border-blue-300">
                        <div className="grid grid-cols-12 gap-3">
                          {/* Description */}
                          <div className="col-span-5">
                            <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                            <input
                              type="text"
                              value={item.description}
                              onChange={(e) => updateItem(index, 'description', e.target.value)}
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                              aria-label="Item description"
                              required
                            />
                          </div>

                          {/* Quantity */}
                          <div className="col-span-2">
                            <label className="block text-xs font-medium text-gray-700 mb-1">Quantity</label>
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                              min="0"
                              step="0.01"
                              aria-label="Item quantity"
                              required
                            />
                          </div>

                          {/* Unit Price */}
                          <div className="col-span-2">
                            <label className="block text-xs font-medium text-gray-700 mb-1">Unit Price</label>
                            <input
                              type="number"
                              value={item.unitPrice}
                              onChange={(e) => updateItem(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                              min="0"
                              step="0.01"
                              aria-label="Item unit price"
                              required
                            />
                          </div>

                          {/* Total */}
                          <div className="col-span-2">
                            <label className="block text-xs font-medium text-gray-700 mb-1">Total</label>
                            <div className="px-3 py-2 text-sm bg-gray-50 border border-gray-300 rounded-lg font-semibold text-gray-900">
                              {formatCurrency(calculateItemTotal(item))}
                            </div>
                          </div>

                          {/* Remove Button */}
                          <div className="col-span-1 flex items-end">
                            <button
                              type="button"
                              onClick={() => removeItem(index)}
                              className="w-full px-2 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm font-medium"
                              title="Remove item"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>

                        {/* Tax Rate */}
                        <div className="mt-2 flex items-center space-x-4">
                          <label className="flex items-center text-sm">
                            <input
                              type="checkbox"
                              checked={item.isTaxable}
                              onChange={(e) => updateItem(index, 'isTaxable', e.target.checked)}
                              className="mr-2"
                              aria-label="Item is taxable"
                            />
                            <span className="text-gray-700">Taxable</span>
                          </label>
                          {item.isTaxable && (
                            <div className="flex items-center">
                              <label className="text-xs text-gray-600 mr-2">Tax Rate:</label>
                              <input
                                type="number"
                                value={item.taxRate}
                                onChange={(e) => updateItem(index, 'taxRate', parseFloat(e.target.value) || 0)}
                                className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                                min="0"
                                max="100"
                                step="0.01"
                                aria-label="Tax rate percentage"
                              />
                              <span className="ml-1 text-xs text-gray-600">%</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Running Total */}
              {items.length > 0 && (
                <div className="bg-blue-50 rounded-lg p-4 mb-6">
                  <div className="flex justify-between items-center text-lg">
                    <span className="font-medium text-gray-700">Running Total:</span>
                    <span className="font-bold text-blue-600 text-2xl">{formatCurrency(totals.total)}</span>
                  </div>
                  <div className="text-xs text-gray-600 mt-2 space-y-1">
                    <div className="flex justify-between">
                      <span>Subtotal:</span>
                      <span>{formatCurrency(totals.subtotal)}</span>
                    </div>
                    {totals.totalDiscount > 0 && (
                      <div className="flex justify-between">
                        <span>Discount:</span>
                        <span>-{formatCurrency(totals.totalDiscount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>Tax:</span>
                      <span>{formatCurrency(totals.totalTax)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2 Actions */}
              <div className="flex justify-between pt-6 border-t">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-semibold"
                >
                  ← Previous
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (items.length === 0) {
                      toast.error('Please add at least one item');
                      return;
                    }
                    setStep(3);
                  }}
                  className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold text-lg shadow-sm"
                >
                  Next: Review & Save →
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Review & Save */}
          {step === 3 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-6 flex items-center">
                <span className="bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center mr-3 text-base">
                  3
                </span>
                Review & Save
              </h2>

              {/* Summary */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-6 mb-6 border border-blue-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Quotation Summary</h3>

                <div className="grid grid-cols-2 gap-6">
                  {/* Customer Info */}
                  <div>
                    <div className="text-sm text-gray-600 mb-1">Customer</div>
                    <div className="font-semibold text-gray-900">{customerName}</div>
                    {customerPhone && <div className="text-sm text-gray-600">{customerPhone}</div>}
                    {customerEmail && <div className="text-sm text-gray-600">{customerEmail}</div>}
                  </div>

                  {/* Quote Details */}
                  <div>
                    <div className="text-sm text-gray-600 mb-1">Quote Details</div>
                    {reference && (
                      <div className="text-sm">
                        <span className="text-gray-600">Reference:</span>{' '}
                        <span className="font-medium">{reference}</span>
                      </div>
                    )}
                    <div className="text-sm">
                      <span className="text-gray-600">Valid Until:</span>{' '}
                      <span className="font-medium">{new Date(validUntil).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                {/* Items Summary */}
                <div className="mt-4 pt-4 border-t border-blue-200">
                  <div className="text-sm text-gray-600 mb-2">Items ({items.length})</div>
                  <div className="space-y-1">
                    {items.slice(0, 3).map((item, index) => (
                      <div key={index} className="flex justify-between text-sm">
                        <span className="text-gray-700">
                          {item.quantity}x {item.description}
                        </span>
                        <span className="font-medium">{formatCurrency(calculateItemTotal(item))}</span>
                      </div>
                    ))}
                    {items.length > 3 && (
                      <div className="text-sm text-gray-500">+ {items.length - 3} more items...</div>
                    )}
                  </div>
                </div>

                {/* Total */}
                <div className="mt-4 pt-4 border-t border-blue-200">
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-semibold text-gray-900">Total Amount</span>
                    <span className="text-3xl font-bold text-blue-600">{formatCurrency(totals.total)}</span>
                  </div>
                </div>
              </div>

              {/* Advanced Options */}
              <div className="mb-6">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center"
                >
                  {showAdvanced ? '− Hide' : '+ Add'} Advanced Options (Terms, Notes, Approval)
                </button>

                {showAdvanced && (
                  <div className="mt-4 space-y-4 bg-gray-50 rounded-lg p-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Payment Terms</label>
                      <input
                        type="text"
                        value={paymentTerms}
                        onChange={(e) => setPaymentTerms(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="e.g., Net 30, 50% upfront"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Terms</label>
                      <input
                        type="text"
                        value={deliveryTerms}
                        onChange={(e) => setDeliveryTerms(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="e.g., 7-14 business days"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Terms & Conditions</label>
                      <textarea
                        value={termsAndConditions}
                        onChange={(e) => setTermsAndConditions(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        rows={3}
                        placeholder="Add any special terms or conditions..."
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Internal Notes</label>
                      <textarea
                        value={internalNotes}
                        onChange={(e) => setInternalNotes(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        rows={2}
                        placeholder="Notes for internal use only (not shown to customer)"
                      />
                    </div>

                    <div>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={requiresApproval}
                          onChange={(e) => setRequiresApproval(e.target.checked)}
                          className="mr-2"
                          aria-label="Requires manager approval for this quotation"
                        />
                        <span className="text-sm font-medium text-gray-700">Requires Manager Approval</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* Step 3 Actions */}
              <div className="flex justify-between pt-6 border-t">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-semibold"
                >
                  ← Previous
                </button>
                <button
                  type="submit"
                  disabled={createQuoteMutation.isPending}
                  className="px-10 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-bold text-lg shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {createQuoteMutation.isPending ? '⏳ Creating...' : '✓ Create Quotation'}
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
    </Layout>
  );
}
