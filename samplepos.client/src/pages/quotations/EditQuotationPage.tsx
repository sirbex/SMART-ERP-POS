/**
 * Edit Quotation Page
 * Edit DRAFT quotations - loads existing data and allows modifications
 */

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import quotationApi from '../../api/quotations';
import { api } from '../../utils/api';
import type { Customer } from '@shared/zod/customer';
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
  unitCost?: number;
  productType?: string;
}

export default function EditQuotationPage() {
  const navigate = useNavigate();
  const { quoteNumber } = useParams<{ quoteNumber: string }>();
  const queryClient = useQueryClient();

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [reference, setReference] = useState('');
  const [description, setDescription] = useState('');
  const [validFrom, setValidFrom] = useState(new Date().toISOString().split('T')[0]);
  const [validUntil, setValidUntil] = useState(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [items, setItems] = useState<QuoteItem[]>([]);
  const [termsAndConditions, setTermsAndConditions] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('Net 30');
  const [deliveryTerms, setDeliveryTerms] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [requiresApproval, setRequiresApproval] = useState(false);

  // Load existing quotation
  const { data: quoteData, isLoading: isLoadingQuote } = useQuery({
    queryKey: ['quotation', quoteNumber],
    queryFn: () => quotationApi.getQuotationByNumber(quoteNumber!),
    enabled: !!quoteNumber,
  });

  const quote = quoteData;
  const quotation = quote?.quotation;

  // Populate form when quote loads
  useEffect(() => {
    if (quotation) {
      // Check if quote is editable (DRAFT only)
      if (quotation.status !== 'DRAFT') {
        toast.error('Only DRAFT quotes can be edited');
        navigate(`/quotations/${quoteNumber}`);
        return;
      }

      // Set customer data
      if (quotation.customerId) {
        // Load customer if we have ID
        api.customers.getById(quotation.customerId).then((res) => {
          if (res.data.success && res.data.data) {
            setSelectedCustomer(res.data.data as Customer);
          }
        });
      } else {
        // Walk-in customer
        setCustomerName(quotation.customerName || '');
        setCustomerPhone(quotation.customerPhone || '');
        setCustomerEmail(quotation.customerEmail || '');
      }

      // Set quote fields
      setReference(quotation.reference || '');
      setDescription(quotation.description || '');
      setValidFrom(quotation.validFrom);
      setValidUntil(quotation.validUntil);
      setTermsAndConditions(quotation.termsAndConditions || '');
      setPaymentTerms(quotation.paymentTerms || 'Net 30');
      setDeliveryTerms(quotation.deliveryTerms || '');
      setInternalNotes(quotation.internalNotes || '');
      setRequiresApproval(quotation.requiresApproval || false);

      // Set items
      if (quote?.items && Array.isArray(quote.items)) {
        const loadedItems: QuoteItem[] = quote.items.map((item: any) => ({
          id: item.id || crypto.randomUUID(),
          productId: item.productId,
          itemType: item.itemType || 'product',
          sku: item.sku,
          description: item.description,
          notes: item.notes,
          quantity: parseFloat(item.quantity),
          unitPrice: parseFloat(item.unitPrice),
          discountAmount: parseFloat(item.discountAmount || '0'),
          isTaxable: item.isTaxable || false,
          taxRate: parseFloat(item.taxRate || '0'),
          uomId: item.uomId,
          uomName: item.uomName,
          unitCost: item.unitCost ? parseFloat(item.unitCost) : undefined,
          productType: item.productType,
        }));
        setItems(loadedItems);
      }
    }
  }, [quotation, quote, quoteNumber, navigate]);

  // Product search
  const [productSearch, setProductSearch] = useState('');
  const { data: productsData } = useQuery({
    queryKey: ['products', productSearch],
    queryFn: async () => {
      const res = await api.products.list();
      if (!res.data.success) return [];
      const products = res.data.data as any[];
      if (!productSearch) return products;
      return products.filter(
        (p) =>
          p.name?.toLowerCase().includes(productSearch.toLowerCase()) ||
          p.sku?.toLowerCase().includes(productSearch.toLowerCase())
      );
    },
    enabled: productSearch.length > 0,
  });

  const products = productsData || [];

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data: any) => quotationApi.updateQuotation(quotation!.id, data),
    onSuccess: () => {
      toast.success('Quotation updated successfully');
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      queryClient.invalidateQueries({ queryKey: ['quotation', quoteNumber] });
      navigate(`/quotations/${quoteNumber}`);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to update quotation');
    },
  });

  // Item management
  const addItem = () => {
    const newItem: QuoteItem = {
      id: crypto.randomUUID(),
      itemType: 'custom',
      description: '',
      quantity: 1,
      unitPrice: 0,
      discountAmount: 0,
      isTaxable: false,
      taxRate: 0,
    };
    setItems([...items, newItem]);
  };

  const addProductAsItem = (product: any) => {
    const newItem: QuoteItem = {
      id: crypto.randomUUID(),
      productId: product.id,
      itemType: 'product',
      sku: product.sku,
      description: product.name,
      quantity: 1,
      unitPrice: parseFloat(product.selling_price || '0'),
      discountAmount: 0,
      isTaxable: product.is_taxable || false,
      taxRate: parseFloat(product.tax_rate || '0'),
      uomId: product.uom_id,
      uomName: product.uom_name,
      unitCost: product.unit_cost ? parseFloat(product.unit_cost) : undefined,
      productType: product.product_type,
    };
    setItems([...items, newItem]);
    setProductSearch('');
  };

  const updateItem = (id: string, field: keyof QuoteItem, value: any) => {
    setItems(
      items.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  };

  const removeItem = (id: string) => {
    setItems(items.filter((item) => item.id !== id));
  };

  // Calculate totals
  const calculateTotals = () => {
    let subtotal = new Decimal(0);
    let totalDiscount = new Decimal(0);
    let totalTax = new Decimal(0);

    items.forEach((item) => {
      const itemSubtotal = new Decimal(item.quantity).times(item.unitPrice);
      const itemDiscount = new Decimal(item.discountAmount);
      const taxableAmount = itemSubtotal.minus(itemDiscount);
      const itemTax = item.isTaxable
        ? taxableAmount.times(item.taxRate).dividedBy(100)
        : new Decimal(0);

      subtotal = subtotal.plus(itemSubtotal);
      totalDiscount = totalDiscount.plus(itemDiscount);
      totalTax = totalTax.plus(itemTax);
    });

    const total = subtotal.minus(totalDiscount).plus(totalTax);

    return {
      subtotal: subtotal.toNumber(),
      totalDiscount: totalDiscount.toNumber(),
      totalTax: totalTax.toNumber(),
      total: total.toNumber(),
    };
  };

  const totals = calculateTotals();

  const handleSubmit = () => {
    // Validation
    if (!selectedCustomer && !customerName.trim()) {
      toast.error('Please select or enter a customer');
      return;
    }

    if (items.length === 0) {
      toast.error('Please add at least one item');
      return;
    }

    if (items.some((item) => !item.description.trim())) {
      toast.error('All items must have a description');
      return;
    }

    if (items.some((item) => item.quantity <= 0)) {
      toast.error('All items must have a positive quantity');
      return;
    }

    if (items.some((item) => item.unitPrice < 0)) {
      toast.error('Unit prices cannot be negative');
      return;
    }

    // Prepare data
    const quoteData = {
      customerId: selectedCustomer?.id,
      customerName: selectedCustomer ? selectedCustomer.name : customerName,
      customerPhone: selectedCustomer ? selectedCustomer.phone : customerPhone,
      customerEmail: selectedCustomer ? selectedCustomer.email : customerEmail,
      reference: reference || undefined,
      description: description || undefined,
      validFrom: validFrom,
      validUntil: validUntil,
      termsAndConditions: termsAndConditions || undefined,
      paymentTerms: paymentTerms || undefined,
      deliveryTerms: deliveryTerms || undefined,
      internalNotes: internalNotes || undefined,
      requiresApproval: requiresApproval,
      items: items.map((item) => ({
        productId: item.productId,
        itemType: item.itemType,
        sku: item.sku,
        description: item.description,
        notes: item.notes,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountAmount: item.discountAmount,
        isTaxable: item.isTaxable,
        taxRate: item.taxRate,
        uomId: item.uomId || undefined, // Convert null to undefined for Zod
        uomName: item.uomName,
        unitCost: item.unitCost,
        productType: item.productType,
      })),
    };

    updateMutation.mutate(quoteData);
  };

  if (isLoadingQuote) {
    return (
      <Layout>
        <div className="p-8 text-center">
          <div className="text-gray-600">Loading quotation...</div>
        </div>
      </Layout>
    );
  }

  if (!quote) {
    return (
      <Layout>
        <div className="p-8 text-center">
          <div className="text-red-600">Quotation not found</div>
          <button
            onClick={() => navigate('/quotations')}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Back to Quotations
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Edit Quotation</h1>
            <p className="mt-1 text-sm text-gray-600">
              Editing {quotation?.quoteNumber} - Only DRAFT quotes can be edited
            </p>
          </div>
          <button
            onClick={() => navigate('/quotations')}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            ← Back to List
          </button>
        </div>

        {/* Customer Section */}
        <div className="mb-6 bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Customer Information</h2>
          <div className="space-y-4">
            <CustomerSelector
              selectedCustomer={selectedCustomer}
              onSelectCustomer={setSelectedCustomer}
              saleTotal={totals.total}
            />

            {!selectedCustomer && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Customer Name *
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter customer name"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Phone
                    </label>
                    <input
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Phone number"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Email
                    </label>
                    <input
                      type="email"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Email address"
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Quote Details Section */}
        <div className="mb-6 bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Quote Details</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="reference-input" className="block text-sm font-medium text-gray-700 mb-2">
                Reference
              </label>
              <input
                id="reference-input"
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Optional reference"
              />
            </div>
            <div>
              <label htmlFor="description-input" className="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <input
                id="description-input"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Optional description"
              />
            </div>
            <div>
              <label htmlFor="valid-from-input" className="block text-sm font-medium text-gray-700 mb-2">
                Valid From *
              </label>
              <DatePicker
                value={validFrom}
                onChange={(date) => setValidFrom(date)}
                placeholder="Select valid from date"
                maxDate={validUntil ? new Date(validUntil) : undefined}
              />
            </div>
            <div>
              <label htmlFor="valid-until-input" className="block text-sm font-medium text-gray-700 mb-2">
                Valid Until *
              </label>
              <DatePicker
                value={validUntil}
                onChange={(date) => setValidUntil(date)}
                placeholder="Select valid until date"
                minDate={validFrom ? new Date(validFrom) : undefined}
              />
            </div>
          </div>
        </div>

        {/* Items Section */}
        <div className="mb-6 bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Line Items</h2>
            <button
              onClick={addItem}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              + Add Item
            </button>
          </div>

          {/* Product Search */}
          <div className="mb-4 relative">
            <input
              type="text"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder="Search products to add..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            {productSearch && products.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {products.map((product: any) => (
                  <button
                    key={product.id}
                    onClick={() => addProductAsItem(product)}
                    className="w-full px-4 py-2 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                  >
                    <div className="font-medium text-gray-900">{product.name}</div>
                    <div className="text-sm text-gray-500">
                      {product.sku && `SKU: ${product.sku} • `}
                      {formatCurrency(parseFloat(product.selling_price || '0'))}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Items Table */}
          {items.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No items added yet. Click "Add Item" or search for products above.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quantity</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unit Price</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Discount</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tax</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {items.map((item) => {
                    const itemSubtotal = new Decimal(item.quantity).times(item.unitPrice);
                    const itemDiscount = new Decimal(item.discountAmount);
                    const taxableAmount = itemSubtotal.minus(itemDiscount);
                    const itemTax = item.isTaxable
                      ? taxableAmount.times(item.taxRate).dividedBy(100)
                      : new Decimal(0);
                    const itemTotal = taxableAmount.plus(itemTax);

                    return (
                      <tr key={item.id}>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={item.description}
                            onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                            className="w-full px-2 py-1 border border-gray-300 rounded"
                            placeholder="Description"
                            aria-label="Item description"
                          />
                          {item.sku && (
                            <div className="text-xs text-gray-500 mt-1">SKU: {item.sku}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => updateItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                            className="w-20 px-2 py-1 border border-gray-300 rounded"
                            min="0"
                            step="0.01"
                            aria-label="Item quantity"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            value={item.unitPrice}
                            onChange={(e) => updateItem(item.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                            className="w-24 px-2 py-1 border border-gray-300 rounded"
                            min="0"
                            step="0.01"
                            aria-label="Unit price"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            value={item.discountAmount}
                            onChange={(e) => updateItem(item.id, 'discountAmount', parseFloat(e.target.value) || 0)}
                            className="w-20 px-2 py-1 border border-gray-300 rounded"
                            min="0"
                            step="0.01"
                            aria-label="Discount amount"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              checked={item.isTaxable}
                              onChange={(e) => updateItem(item.id, 'isTaxable', e.target.checked)}
                              className="rounded"
                              aria-label="Item is taxable"
                            />
                            {item.isTaxable && (
                              <input
                                type="number"
                                value={item.taxRate}
                                onChange={(e) => updateItem(item.id, 'taxRate', parseFloat(e.target.value) || 0)}
                                className="w-16 px-2 py-1 border border-gray-300 rounded"
                                min="0"
                                step="0.01"
                                placeholder="%"
                                aria-label="Tax rate percentage"
                              />
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          {formatCurrency(itemTotal.toNumber())}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => removeItem(item.id)}
                            className="text-red-600 hover:text-red-800"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Totals */}
          {items.length > 0 && (
            <div className="mt-4 border-t border-gray-200 pt-4">
              <div className="flex justify-end">
                <div className="w-64 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Subtotal:</span>
                    <span className="font-medium">{formatCurrency(totals.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Discount:</span>
                    <span className="font-medium text-red-600">
                      -{formatCurrency(totals.totalDiscount)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Tax:</span>
                    <span className="font-medium">{formatCurrency(totals.totalTax)}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold border-t border-gray-200 pt-2">
                    <span>Total:</span>
                    <span>{formatCurrency(totals.total)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Terms Section */}
        <div className="mb-6 bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Terms &amp; Conditions</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Payment Terms
              </label>
              <input
                type="text"
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., Net 30, Payment on delivery"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Delivery Terms
              </label>
              <input
                type="text"
                value={deliveryTerms}
                onChange={(e) => setDeliveryTerms(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Delivery timeframe and conditions"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Terms and Conditions
              </label>
              <textarea
                value={termsAndConditions}
                onChange={(e) => setTermsAndConditions(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter any terms and conditions..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Internal Notes
              </label>
              <textarea
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Internal notes (not visible to customer)"
              />
            </div>
            <div className="flex items-center">
              <input
                type="checkbox"
                id="requiresApproval"
                checked={requiresApproval}
                onChange={(e) => setRequiresApproval(e.target.checked)}
                className="rounded"
              />
              <label htmlFor="requiresApproval" className="ml-2 text-sm text-gray-700">
                Requires approval before sending
              </label>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end space-x-4">
          <button
            onClick={() => navigate(`/quotations/${quoteNumber}`)}
            className="px-6 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            disabled={updateMutation.isPending}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={updateMutation.isPending}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {updateMutation.isPending ? 'Updating...' : 'Update Quotation'}
          </button>
        </div>
      </div>
    </Layout>
  );
}
