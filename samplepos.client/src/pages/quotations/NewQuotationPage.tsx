/**
 * New Standard Quotation Form - Wizard Style
 * Simple 3-step process: Customer → Items → Review
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import quotationApi from '../../api/quotations';
import { api } from '../../utils/api';
import type { Customer } from '@shared/zod/customer';
import type { CreateQuotationInput, FulfillmentMode } from '@shared/types/quotation';
import { AxiosError } from 'axios';
import { formatCurrency } from '../../utils/currency';
import Layout from '../../components/Layout';
import CustomerSelector from '../../components/pos/CustomerSelector';
import { DatePicker } from '../../components/ui/date-picker';
import { ResponsiveFormGrid } from '../../components/ui/ResponsiveFormGrid';
import Decimal from 'decimal.js';
import { formatTimestampDate } from '../../utils/businessDate';

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

interface StockLevelItem {
  product_id: string;
  product_name: string;
  sku?: string;
  barcode?: string;
  generic_name?: string;
  total_stock: number | string;
  selling_price: number | string;
  average_cost: number | string;
  nearest_expiry?: string;
  is_taxable?: boolean;
  tax_rate?: number | string;
  uom_id?: string;
  uom_name?: string;
  product_type?: string;
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
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-CA')
  );
  const [items, setItems] = useState<QuoteItem[]>([]);

  // Fulfillment mode
  const [fulfillmentMode, setFulfillmentMode] = useState<FulfillmentMode>('RETAIL');

  // Advanced fields (optional)
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [termsAndConditions, setTermsAndConditions] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('Net 30');
  const [deliveryTerms, setDeliveryTerms] = useState('7-14 business days');
  const [internalNotes, setInternalNotes] = useState('');
  const [requiresApproval, setRequiresApproval] = useState(false);

  // Pre-fetch all stock data once — filtering is instant in-memory
  const [productSearch, setProductSearch] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const productListRef = useRef<HTMLDivElement>(null);
  const [searchSelectedIndex, setSearchSelectedIndex] = useState(0);
  // Refs for item row inputs: itemRefs[rowIndex][fieldIndex]
  // fieldIndex: 0=description, 1=quantity, 2=unitPrice
  const itemRefs = useRef<(HTMLInputElement | null)[][]>([]);
  const { data: allStockData } = useQuery({
    queryKey: ['stock-levels-cache'],
    queryFn: async () => {
      const res = await api.inventory.stockLevels();
      if (!res.data.success) return [];
      return (res.data.data ?? []) as StockLevelItem[];
    },
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });

  // Instant client-side filtering — no API call per keystroke
  const productsData = useMemo(() => {
    if (!productSearch || !allStockData) return [];
    const term = productSearch.toLowerCase();
    return allStockData.filter((item: StockLevelItem) =>
      item.product_name?.toLowerCase().includes(term) ||
      item.sku?.toLowerCase().includes(term) ||
      item.barcode?.toLowerCase().includes(term) ||
      item.generic_name?.toLowerCase().includes(term)
    );
  }, [productSearch, allStockData]);

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

  const addProductToItems = (product: StockLevelItem) => {
    const existing = items.find((item) => item.productId === product.product_id);
    if (existing) {
      updateItem(items.indexOf(existing), 'quantity', existing.quantity + 1);
      toast.success(`Increased ${product.product_name} quantity`);
    } else {
      setItems([
        ...items,
        {
          id: `temp_${Date.now()}`,
          productId: product.product_id,
          itemType: 'product',
          sku: product.sku,
          description: product.product_name,
          quantity: 1,
          unitPrice: parseFloat(String(product.selling_price || '0')),
          discountAmount: 0,
          isTaxable: product.is_taxable || false,
          taxRate: parseFloat(String(product.tax_rate || '18')),
          uomId: product.uom_id,
          uomName: product.uom_name,
        },
      ]);
      toast.success(`Added ${product.product_name}`);
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

  // ── Keyboard Navigation ──

  // Reset search index when results change
  useEffect(() => {
    setSearchSelectedIndex(0);
  }, [productsData]);

  // Auto-focus search when entering Step 2
  useEffect(() => {
    if (step === 2) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [step]);

  // Ensure itemRefs array has correct size
  useEffect(() => {
    itemRefs.current = items.map((_, i) => itemRefs.current[i] || [null, null, null]);
  }, [items]);

  // Scroll a search result into view
  const scrollSearchItemIntoView = useCallback((index: number, direction: 'up' | 'down') => {
    setTimeout(() => {
      const container = productListRef.current;
      const item = container?.children[index] as HTMLElement;
      if (item && container) {
        const containerRect = container.getBoundingClientRect();
        const itemRect = item.getBoundingClientRect();
        if (direction === 'down' && itemRect.bottom > containerRect.bottom) {
          item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } else if (direction === 'up' && itemRect.top < containerRect.top) {
          item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }
    }, 0);
  }, []);

  // Select the highlighted product from search results
  const selectHighlightedProduct = useCallback(() => {
    if (!productsData || productsData.length === 0) return;
    const clamped = Math.min(searchSelectedIndex, productsData.length - 1);
    if (clamped < 0) return;
    addProductToItems(productsData[clamped]);
  }, [productsData, searchSelectedIndex]);

  // Search input keyboard handler (ArrowDown/Up, Enter, Escape)
  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (productSearch) {
        setProductSearch('');
        setSearchSelectedIndex(0);
      }
      return;
    }

    if (!productsData || productsData.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSearchSelectedIndex((prev) => {
        const next = Math.min(prev + 1, productsData.length - 1);
        scrollSearchItemIntoView(next, 'down');
        return next;
      });
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSearchSelectedIndex((prev) => {
        const next = Math.max(prev - 1, 0);
        scrollSearchItemIntoView(next, 'up');
        return next;
      });
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      selectHighlightedProduct();
      return;
    }
  }, [productsData, productSearch, scrollSearchItemIntoView, selectHighlightedProduct]);

  // Item row keyboard handler — Enter moves to next row, Ctrl+Delete removes row
  const handleItemKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>, rowIndex: number, fieldIndex: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Move to next field in same row, or first field of next row
      if (fieldIndex < 2) {
        // Move to next field in same row
        itemRefs.current[rowIndex]?.[fieldIndex + 1]?.focus();
      } else {
        // On last field — move to next row's first editable field, or focus search to add more
        if (rowIndex < items.length - 1) {
          itemRefs.current[rowIndex + 1]?.[0]?.focus();
        } else {
          // Last row, last field — focus search to encourage adding more items
          searchInputRef.current?.focus();
        }
      }
      return;
    }

    // Ctrl+Delete or Ctrl+Backspace to remove current row
    if ((e.key === 'Delete' || e.key === 'Backspace') && e.ctrlKey) {
      e.preventDefault();
      removeItem(rowIndex);
      // Focus previous row or search
      setTimeout(() => {
        if (rowIndex > 0) {
          itemRefs.current[rowIndex - 1]?.[0]?.focus();
        } else {
          searchInputRef.current?.focus();
        }
      }, 50);
      return;
    }

    // Arrow Down: move to same field in next row
    if (e.key === 'ArrowDown' && e.altKey) {
      e.preventDefault();
      if (rowIndex < items.length - 1) {
        itemRefs.current[rowIndex + 1]?.[fieldIndex]?.focus();
      }
      return;
    }

    // Arrow Up: move to same field in previous row
    if (e.key === 'ArrowUp' && e.altKey) {
      e.preventDefault();
      if (rowIndex > 0) {
        itemRefs.current[rowIndex - 1]?.[fieldIndex]?.focus();
      }
      return;
    }
  }, [items.length]);

  // Global keyboard shortcuts for Step 2
  useEffect(() => {
    if (step !== 2) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';

      // "/" to focus search (only when not in an input)
      if (e.key === '/' && !isInput) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      // F2 to focus search (works even from inputs)
      if (e.key === 'F2') {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      // Insert to add custom item
      if (e.key === 'Insert') {
        e.preventDefault();
        addItem();
        // Focus the new item's description after React renders
        setTimeout(() => {
          const lastRow = itemRefs.current[items.length];
          lastRow?.[0]?.focus();
        }, 100);
        return;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [step, items.length]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (items.length === 0) {
      toast.error('Please add at least one item');
      return;
    }

    const quotationData = {
      quoteType: 'standard' as const,
      fulfillmentMode,
      customerId: selectedCustomer?.id,
      customerName: customerName || selectedCustomer?.name,
      customerPhone: (customerPhone || selectedCustomer?.phone) || undefined,
      customerEmail: (customerEmail || selectedCustomer?.email) || undefined,
      validFrom: new Date().toLocaleDateString('en-CA'),
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

              {/* Fulfillment Mode Toggle */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Fulfillment Mode</label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setFulfillmentMode('RETAIL')}
                    className={`flex-1 py-3 px-4 rounded-lg border-2 font-semibold transition-colors ${fulfillmentMode === 'RETAIL'
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400'
                      }`}
                  >
                    🛒 Retail
                    <span className="block text-xs font-normal mt-1">Quote → POS Sale → Invoice</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFulfillmentMode('WHOLESALE')}
                    className={`flex-1 py-3 px-4 rounded-lg border-2 font-semibold transition-colors ${fulfillmentMode === 'WHOLESALE'
                      ? 'border-orange-600 bg-orange-50 text-orange-700'
                      : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400'
                      }`}
                  >
                    🏭 Wholesale
                    <span className="block text-xs font-normal mt-1">Quote → Delivery Notes → Invoice</span>
                  </button>
                </div>
              </div>

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

                <ResponsiveFormGrid>
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
                </ResponsiveFormGrid>
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
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
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
              <div className="mb-6 relative">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  🔍 Search Products
                  <span className="ml-2 text-xs text-gray-400 font-normal">
                    Press <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-[10px] font-mono">/</kbd> or
                    <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-[10px] font-mono ml-1">F2</kbd> to focus
                  </span>
                </label>
                <input
                  ref={searchInputRef}
                  type="text"
                  value={productSearch}
                  onChange={(e) => { setProductSearch(e.target.value); setSearchSelectedIndex(0); }}
                  onKeyDown={handleSearchKeyDown}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg"
                  placeholder="Search by name, SKU, or barcode... (↑↓ navigate, Enter select)"
                  autoFocus
                />
                {productSearch && productsData && productsData.length > 0 && (
                  <div ref={productListRef} className="mt-2 border border-gray-300 rounded-lg max-h-64 overflow-y-auto bg-white shadow-lg absolute z-20 left-0 right-0">
                    {productsData.slice(0, 10).map((product: StockLevelItem, idx: number) => (
                      <button
                        key={product.product_id}
                        type="button"
                        onClick={() => addProductToItems(product)}
                        className={`w-full px-4 py-3 text-left border-b last:border-b-0 transition-colors ${idx === searchSelectedIndex
                          ? 'bg-blue-100 border-l-4 border-l-blue-600'
                          : 'hover:bg-blue-50'
                          }`}
                      >
                        <div className="flex justify-between items-center">
                          <div>
                            <div className="font-semibold text-gray-900">{product.product_name}</div>
                            <div className="text-sm text-gray-600">
                              {product.sku && <span className="mr-2">SKU: {product.sku}</span>}
                              {product.barcode && <span className="mr-2">BC: {product.barcode}</span>}
                              <span className="text-green-600 font-medium">
                                {formatCurrency(parseFloat(String(product.selling_price || 0)))}
                              </span>
                              <span className="ml-2 text-gray-500">
                                Stock: {Number(product.total_stock || 0)}
                              </span>
                            </div>
                          </div>
                          <span className="text-blue-600 font-medium text-xs">
                            {idx === searchSelectedIndex ? '↵ Enter' : '+ Add'}
                          </span>
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
                    onClick={() => {
                      addItem();
                      setTimeout(() => {
                        const lastRow = itemRefs.current[items.length];
                        lastRow?.[0]?.focus();
                      }, 100);
                    }}
                    className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium"
                  >
                    + Add Custom Item
                    <kbd className="ml-2 px-1.5 py-0.5 bg-white border border-gray-300 rounded text-[10px] font-mono text-gray-500">Ins</kbd>
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
                      <div key={item.id} className="border border-gray-300 rounded-lg p-4 hover:border-blue-300 focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-200">
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                          {/* Row Number */}
                          <div className="sm:col-span-5">
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              <span className="inline-flex items-center justify-center w-5 h-5 bg-gray-200 text-gray-600 rounded text-[10px] font-bold mr-1">{index + 1}</span>
                              Description
                            </label>
                            <input
                              ref={(el) => {
                                if (!itemRefs.current[index]) itemRefs.current[index] = [null, null, null];
                                itemRefs.current[index][0] = el;
                              }}
                              type="text"
                              value={item.description}
                              onChange={(e) => updateItem(index, 'description', e.target.value)}
                              onKeyDown={(e) => handleItemKeyDown(e, index, 0)}
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                              aria-label={`Item ${index + 1} description`}
                              required
                            />
                          </div>

                          {/* Quantity */}
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-medium text-gray-700 mb-1">Quantity</label>
                            <input
                              ref={(el) => {
                                if (!itemRefs.current[index]) itemRefs.current[index] = [null, null, null];
                                itemRefs.current[index][1] = el;
                              }}
                              type="number"
                              value={item.quantity}
                              onChange={(e) => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                              onKeyDown={(e) => handleItemKeyDown(e, index, 1)}
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                              min="0"
                              step="0.01"
                              aria-label={`Item ${index + 1} quantity`}
                              required
                            />
                          </div>

                          {/* Unit Price */}
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-medium text-gray-700 mb-1">Unit Price</label>
                            <input
                              ref={(el) => {
                                if (!itemRefs.current[index]) itemRefs.current[index] = [null, null, null];
                                itemRefs.current[index][2] = el;
                              }}
                              type="number"
                              value={item.unitPrice}
                              onChange={(e) => updateItem(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                              onKeyDown={(e) => handleItemKeyDown(e, index, 2)}
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                              min="0"
                              step="0.01"
                              aria-label={`Item ${index + 1} unit price`}
                              required
                            />
                          </div>

                          {/* Total */}
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-medium text-gray-700 mb-1">Total</label>
                            <div className="px-3 py-2 text-sm bg-gray-50 border border-gray-300 rounded-lg font-semibold text-gray-900">
                              {formatCurrency(calculateItemTotal(item))}
                            </div>
                          </div>

                          {/* Remove Button */}
                          <div className="sm:col-span-1 flex items-end">
                            <button
                              type="button"
                              onClick={() => removeItem(index)}
                              className="w-full px-2 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm font-medium"
                              title="Remove item (Ctrl+Delete)"
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

              {/* Keyboard Shortcuts Legend */}
              <div className="bg-gray-50 rounded-lg px-4 py-3 mb-6 border border-gray-200">
                <div className="text-xs text-gray-500 font-medium mb-1.5">Keyboard Shortcuts</div>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-600">
                  <span><kbd className="px-1 py-0.5 bg-white border border-gray-300 rounded text-[10px] font-mono">/</kbd> or <kbd className="px-1 py-0.5 bg-white border border-gray-300 rounded text-[10px] font-mono">F2</kbd> Focus search</span>
                  <span><kbd className="px-1 py-0.5 bg-white border border-gray-300 rounded text-[10px] font-mono">↑</kbd><kbd className="px-1 py-0.5 bg-white border border-gray-300 rounded text-[10px] font-mono">↓</kbd> Navigate results</span>
                  <span><kbd className="px-1 py-0.5 bg-white border border-gray-300 rounded text-[10px] font-mono">Enter</kbd> Select / Next field</span>
                  <span><kbd className="px-1 py-0.5 bg-white border border-gray-300 rounded text-[10px] font-mono">Tab</kbd> Next field</span>
                  <span><kbd className="px-1 py-0.5 bg-white border border-gray-300 rounded text-[10px] font-mono">Alt+↑↓</kbd> Navigate rows</span>
                  <span><kbd className="px-1 py-0.5 bg-white border border-gray-300 rounded text-[10px] font-mono">Ins</kbd> Add custom item</span>
                  <span><kbd className="px-1 py-0.5 bg-white border border-gray-300 rounded text-[10px] font-mono">Ctrl+Del</kbd> Remove row</span>
                  <span><kbd className="px-1 py-0.5 bg-white border border-gray-300 rounded text-[10px] font-mono">Esc</kbd> Clear search</span>
                </div>
              </div>

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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                      <span className="font-medium">{formatTimestampDate(validUntil)}</span>
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
