/**
 * Price Rules Management Page
 * Full CRUD for pricing engine rules with filtering, search, and validation
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';
import Layout from '../../components/Layout';
import {
  usePriceRules,
  useCreatePriceRule,
  useUpdatePriceRule,
  useDeletePriceRule,
  useCustomerGroups,
  useCategories,
} from '../../hooks/usePricing';
import { formatCurrency } from '../../utils/currency';
import { extractApiError } from '../../utils/extractApiError';
import apiClient from '../../utils/api';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../components/ui/dialog';
import { Badge } from '../../components/ui/badge';
import PricingTabs from '../../components/PricingTabs';
import type {
  PriceRule,
  PriceRuleType,
  CreatePriceRuleInput,
  UpdatePriceRuleInput,
  PriceRuleFilters,
} from '../../types/pricing';

// ============================================================================
// Helpers
// ============================================================================

function ruleTypeLabel(type: PriceRuleType): string {
  switch (type) {
    case 'multiplier': return 'Multiplier';
    case 'discount': return 'Discount %';
    case 'fixed': return 'Fixed Price';
  }
}

function ruleTypeColor(type: PriceRuleType): string {
  switch (type) {
    case 'multiplier': return 'bg-blue-100 text-blue-800';
    case 'discount': return 'bg-orange-100 text-orange-800';
    case 'fixed': return 'bg-green-100 text-green-800';
  }
}

function scopeLabel(rule: PriceRule): string {
  if (rule.productName) return `Product: ${rule.productName}`;
  if (rule.categoryName) return `Category: ${rule.categoryName}`;
  return 'Global';
}

function formatValue(rule: PriceRule): string {
  switch (rule.ruleType) {
    case 'multiplier': return `×${rule.value}`;
    case 'discount': return `${rule.value}%`;
    case 'fixed': return formatCurrency(rule.value);
  }
}

function isDangerousRule(ruleType: PriceRuleType, value: number): string | null {
  if (ruleType === 'discount' && value >= 50) return 'High discount (≥50%)';
  if (ruleType === 'multiplier' && value < 0.5) return 'Heavy markdown (×<0.5)';
  if (ruleType === 'multiplier' && value > 3) return 'Extreme markup (×>3)';
  return null;
}

// ============================================================================
// Form Defaults
// ============================================================================

const EMPTY_FORM: CreatePriceRuleInput = {
  customerGroupId: '',
  name: '',
  ruleType: 'discount',
  value: 0,
  categoryId: null,
  productId: null,
  minQuantity: 1,
  validFrom: undefined,
  validUntil: undefined,
  priority: 0,
};

// ============================================================================
// Component
// ============================================================================

export default function PriceRulesPage() {
  // ── Filters ──
  const [page, setPage] = useState(1);
  const [filterGroup, setFilterGroup] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterActive, setFilterActive] = useState('');
  const limit = 20;

  const filters: PriceRuleFilters = useMemo(() => ({
    page,
    limit,
    customerGroupId: filterGroup || undefined,
    ruleType: (filterType as PriceRuleType) || undefined,
    isActive: filterActive === '' ? undefined : filterActive === 'true',
  }), [page, filterGroup, filterType, filterActive]);

  // ── Data ──
  const { data: rulesData, isLoading, error } = usePriceRules(filters);
  const { data: customerGroups } = useCustomerGroups(true);
  const { data: categoriesData } = useCategories({ limit: 200, isActive: true });

  const rules = rulesData?.data ?? [];
  const pagination = rulesData?.pagination;
  const categories = categoriesData?.data ?? [];
  const categoriesTruncated = categoriesData?.pagination
    ? categoriesData.pagination.total > categories.length
    : false;

  // ── Mutations ──
  const createMutation = useCreatePriceRule();
  const updateMutation = useUpdatePriceRule();
  const deleteMutation = useDeletePriceRule();

  // ── Modal State ──
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingRule, setEditingRule] = useState<PriceRule | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PriceRule | null>(null);
  const [formData, setFormData] = useState<CreatePriceRuleInput>({ ...EMPTY_FORM });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // ── Scope radio ──
  const [scopeMode, setScopeMode] = useState<'global' | 'category' | 'product'>('global');

  // ── Product search for product scope (F1) ──
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [productSearchResults, setProductSearchResults] = useState<Array<{ id: string; name: string }>>([]);
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [selectedProductName, setSelectedProductName] = useState('');
  const productSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const productDropdownRef = useRef<HTMLDivElement>(null);

  // ── Per-item loading (UX2) ──
  const [pendingToggleId, setPendingToggleId] = useState<string | null>(null);

  // ── Danger acknowledgment (UX4) ──
  const [dangerAcknowledged, setDangerAcknowledged] = useState(false);

  // ── Cleanup debounce timer (E1) ──
  useEffect(() => () => { if (productSearchTimeoutRef.current) clearTimeout(productSearchTimeoutRef.current); }, []);

  // ── Click outside product dropdown ──
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (productDropdownRef.current && !productDropdownRef.current.contains(event.target as Node)) {
        setShowProductDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ── Product search handler (F1) ──
  const handleProductSearchChange = useCallback((value: string) => {
    setProductSearchQuery(value);
    setSelectedProductName('');
    setFormData(f => ({ ...f, productId: null }));

    if (productSearchTimeoutRef.current) clearTimeout(productSearchTimeoutRef.current);
    if (value.length < 2) {
      setProductSearchResults([]);
      setShowProductDropdown(false);
      return;
    }

    productSearchTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await apiClient.get('/products', { params: { search: value, limit: 10 } });
        const items = response.data?.data ?? [];
        const products = (items as Record<string, unknown>[]).map((p) => ({
          id: String(p.id),
          name: String(p.name ?? ''),
        }));
        setProductSearchResults(products);
        setShowProductDropdown(true);
      } catch {
        setProductSearchResults([]);
      }
    }, 300);
  }, []);

  // ── Form Handlers ──
  const openCreate = useCallback(() => {
    setFormData({ ...EMPTY_FORM });
    setFormErrors({});
    setScopeMode('global');
    setSelectedProductName('');
    setProductSearchQuery('');
    setProductSearchResults([]);
    setDangerAcknowledged(false);
    setShowCreateModal(true);
  }, []);

  const openEdit = useCallback((rule: PriceRule) => {
    setEditingRule(rule);
    const mode = rule.productId ? 'product' : rule.categoryId ? 'category' : 'global';
    setScopeMode(mode);
    setSelectedProductName(rule.productName ?? '');
    setProductSearchQuery('');
    setProductSearchResults([]);
    setDangerAcknowledged(false);
    setFormData({
      customerGroupId: rule.customerGroupId,
      name: rule.name ?? '',
      ruleType: rule.ruleType,
      value: rule.value,
      categoryId: rule.categoryId,
      productId: rule.productId,
      minQuantity: rule.minQuantity,
      validFrom: rule.validFrom ?? undefined,
      validUntil: rule.validUntil ?? undefined,
      priority: rule.priority,
    });
    setFormErrors({});
  }, []);

  const closeModal = useCallback(() => {
    setShowCreateModal(false);
    setEditingRule(null);
    setFormErrors({});
  }, []);

  // ── Validation ──
  const validateForm = useCallback((): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.customerGroupId) errors.customerGroupId = 'Customer group is required';
    if (formData.ruleType === 'multiplier' && formData.value <= 0) {
      errors.value = 'Multiplier must be positive';
    }
    if (formData.ruleType === 'discount' && (formData.value < 0 || formData.value >= 100)) {
      errors.value = 'Discount must be 0–99.99%';
    }
    if (formData.ruleType === 'fixed' && formData.value < 0) {
      errors.value = 'Fixed price cannot be negative';
    }
    if (scopeMode === 'category' && !formData.categoryId) {
      errors.categoryId = 'Select a category';
    }
    if (scopeMode === 'product' && !formData.productId) {
      errors.productId = 'Enter a product ID';
    }
    if (formData.validFrom && formData.validUntil && formData.validFrom > formData.validUntil) {
      errors.validUntil = 'End date must be on or after start date';
    }
    if ((formData.minQuantity ?? 1) <= 0) {
      errors.minQuantity = 'Minimum quantity must be positive';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [formData, scopeMode]);

  // ── Submit ──
  const handleSubmit = useCallback(async () => {
    if (!validateForm()) return;

    const payload: CreatePriceRuleInput = {
      ...formData,
      name: formData.name || undefined,
      categoryId: scopeMode === 'category' ? formData.categoryId : null,
      productId: scopeMode === 'product' ? formData.productId : null,
    };

    try {
      if (editingRule) {
        const updateData: UpdatePriceRuleInput = {
          name: payload.name || null,
          ruleType: payload.ruleType,
          value: payload.value,
          categoryId: payload.categoryId ?? null,
          productId: payload.productId ?? null,
          minQuantity: payload.minQuantity,
          validFrom: payload.validFrom ?? null,
          validUntil: payload.validUntil ?? null,
          priority: payload.priority,
        };
        await updateMutation.mutateAsync({ id: editingRule.id, data: updateData });
        toast.success('Price rule updated');
      } else {
        await createMutation.mutateAsync(payload);
        toast.success('Price rule created');
      }
      closeModal();
    } catch (err: unknown) {
      toast.error(extractApiError(err));
    }
  }, [formData, scopeMode, editingRule, validateForm, createMutation, updateMutation, closeModal]);

  // ── Delete ──
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      toast.success('Price rule deactivated');
      setDeleteTarget(null);
    } catch (err: unknown) {
      toast.error(extractApiError(err, 'Failed to deactivate rule'));
    }
  }, [deleteTarget, deleteMutation]);

  // ── Toggle Active ──
  const handleToggleActive = useCallback(async (rule: PriceRule) => {
    setPendingToggleId(rule.id);
    try {
      await updateMutation.mutateAsync({
        id: rule.id,
        data: { isActive: !rule.isActive },
      });
      toast.success(rule.isActive ? 'Rule deactivated' : 'Rule activated');
    } catch (err: unknown) {
      toast.error(extractApiError(err, 'Failed to toggle rule'));
    } finally {
      setPendingToggleId(null);
    }
  }, [updateMutation]);

  // ── Danger warning ──
  const dangerWarning = useMemo(
    () => isDangerousRule(formData.ruleType, formData.value),
    [formData.ruleType, formData.value],
  );

  const isMutating = createMutation.isPending || updateMutation.isPending;

  return (
    <Layout>
      <PricingTabs />
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Price Rules</h1>
            <p className="text-sm text-gray-500 mt-1">
              Manage pricing rules for customer groups, categories, and products
            </p>
          </div>
          <button
            onClick={openCreate}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            + New Rule
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center bg-gray-50 rounded-lg p-4">
          <select
            value={filterGroup}
            onChange={e => { setFilterGroup(e.target.value); setPage(1); }}
            className="border rounded-md px-3 py-2 text-sm bg-white"
            aria-label="Filter by customer group"
          >
            <option value="">All Groups</option>
            {(customerGroups ?? []).map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>

          <select
            value={filterType}
            onChange={e => { setFilterType(e.target.value); setPage(1); }}
            className="border rounded-md px-3 py-2 text-sm bg-white"
            aria-label="Filter by rule type"
          >
            <option value="">All Types</option>
            <option value="multiplier">Multiplier</option>
            <option value="discount">Discount</option>
            <option value="fixed">Fixed</option>
          </select>

          <select
            value={filterActive}
            onChange={e => { setFilterActive(e.target.value); setPage(1); }}
            className="border rounded-md px-3 py-2 text-sm bg-white"
            aria-label="Filter by status"
          >
            <option value="">All Status</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>

          {(filterGroup || filterType || filterActive) && (
            <button
              onClick={() => { setFilterGroup(''); setFilterType(''); setFilterActive(''); setPage(1); }}
              className="text-sm text-blue-600 hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4">
            Failed to load price rules. Please try again.
          </div>
        ) : rules.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg font-medium">No price rules found</p>
            <p className="text-sm mt-1">Create your first rule to get started</p>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Customer Group</TableHead>
                  <TableHead>Min Qty</TableHead>
                  <TableHead>Date Range</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map(rule => (
                  <TableRow key={rule.id} className={!rule.isActive ? 'opacity-50' : ''}>
                    <TableCell className="font-medium">
                      {rule.name || <span className="text-gray-400 italic">Unnamed</span>}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${ruleTypeColor(rule.ruleType)}`}>
                        {ruleTypeLabel(rule.ruleType)}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono">{formatValue(rule)}</TableCell>
                    <TableCell className="text-sm">{scopeLabel(rule)}</TableCell>
                    <TableCell>{rule.customerGroupName || '—'}</TableCell>
                    <TableCell>{rule.minQuantity}</TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {rule.validFrom || rule.validUntil
                        ? `${rule.validFrom ?? '∞'} — ${rule.validUntil ?? '∞'}`
                        : 'Always'}
                    </TableCell>
                    <TableCell>{rule.priority}</TableCell>
                    <TableCell>
                      <Badge variant={rule.isActive ? 'default' : 'secondary'}>
                        {rule.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <button
                        onClick={() => handleToggleActive(rule)}
                        disabled={pendingToggleId === rule.id}
                        className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50"
                        title={rule.isActive ? 'Deactivate' : 'Activate'}
                      >
                        {pendingToggleId === rule.id ? '⏳' : rule.isActive ? '⏸' : '▶'}
                      </button>
                      <button
                        onClick={() => openEdit(rule)}
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeleteTarget(rule)}
                        className="text-xs text-red-600 hover:text-red-800"
                      >
                        Delete
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">
              Page {pagination.page} of {pagination.totalPages} ({pagination.total} rules)
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="px-3 py-1 text-sm border rounded-md hover:bg-gray-50 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                disabled={page >= pagination.totalPages}
                onClick={() => setPage(p => p + 1)}
                className="px-3 py-1 text-sm border rounded-md hover:bg-gray-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Create / Edit Modal */}
        <Dialog open={showCreateModal || !!editingRule} onOpenChange={() => closeModal()}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingRule ? 'Edit Price Rule' : 'Create Price Rule'}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Rule Name <span className="text-gray-400">(optional)</span>
                </label>
                <input
                  type="text"
                  value={formData.name ?? ''}
                  onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g., Wholesale 10% off"
                  className="w-full border rounded-md px-3 py-2 text-sm"
                />
              </div>

              {/* Customer Group */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Customer Group <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.customerGroupId}
                  onChange={e => setFormData(f => ({ ...f, customerGroupId: e.target.value }))}
                  className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.customerGroupId ? 'border-red-500' : ''}`}
                >
                  <option value="">Select group...</option>
                  {(customerGroups ?? []).map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
                {formErrors.customerGroupId && (
                  <p className="text-red-500 text-xs mt-1">{formErrors.customerGroupId}</p>
                )}
              </div>

              {/* Rule Type + Value */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Rule Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.ruleType}
                    onChange={e => setFormData(f => ({ ...f, ruleType: e.target.value as PriceRuleType }))}
                    className="w-full border rounded-md px-3 py-2 text-sm"
                  >
                    <option value="discount">Discount %</option>
                    <option value="multiplier">Multiplier</option>
                    <option value="fixed">Fixed Price</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Value <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={formData.value}
                    onChange={e => setFormData(f => ({ ...f, value: Number(e.target.value) }))}
                    className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.value ? 'border-red-500' : ''}`}
                    placeholder={formData.ruleType === 'discount' ? '0–99.99' : formData.ruleType === 'multiplier' ? 'e.g., 1.20' : 'e.g., 5000'}
                  />
                  {formErrors.value && (
                    <p className="text-red-500 text-xs mt-1">{formErrors.value}</p>
                  )}
                </div>
              </div>

              {/* Danger Warning (UX4) */}
              {dangerWarning && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-md p-3 text-sm space-y-2">
                  <div className="flex items-center gap-2">
                    <span>⚠️</span>
                    <span>{dangerWarning} — are you sure?</span>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={dangerAcknowledged}
                      onChange={e => setDangerAcknowledged(e.target.checked)}
                      className="accent-amber-600"
                    />
                    <span className="text-xs">I understand this is a high-impact rule</span>
                  </label>
                </div>
              )}

              {/* Value Help Text */}
              <p className="text-xs text-gray-400">
                {formData.ruleType === 'multiplier' && 'Multiplier applied to base price (e.g., 0.95 = 5% below, 1.20 = 20% markup)'}
                {formData.ruleType === 'discount' && 'Percentage discount off base price (e.g., 10 = 10% off)'}
                {formData.ruleType === 'fixed' && 'Fixed selling price regardless of base price'}
              </p>

              {/* Scope */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Scope</label>
                <div className="flex gap-4">
                  {(['global', 'category', 'product'] as const).map(mode => (
                    <label key={mode} className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name="scopeMode"
                        checked={scopeMode === mode}
                        onChange={() => {
                          setScopeMode(mode);
                          setFormData(f => ({ ...f, categoryId: null, productId: null }));
                          setSelectedProductName('');
                          setProductSearchQuery('');
                          setProductSearchResults([]);
                        }}
                        className="accent-blue-600"
                      />
                      {mode === 'global' ? 'Global' : mode === 'category' ? 'Category' : 'Product'}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-1">Product rules override Category, which override Global</p>
              </div>

              {scopeMode === 'category' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select
                    value={formData.categoryId ?? ''}
                    onChange={e => setFormData(f => ({ ...f, categoryId: e.target.value || null }))}
                    className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.categoryId ? 'border-red-500' : ''}`}
                  >
                    <option value="">Select category...</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  {categoriesTruncated && (
                    <p className="text-amber-600 text-xs mt-1">⚠ Not all categories shown. Contact admin if yours is missing.</p>
                  )}
                  {formErrors.categoryId && (
                    <p className="text-red-500 text-xs mt-1">{formErrors.categoryId}</p>
                  )}
                </div>
              )}

              {scopeMode === 'product' && (
                <div ref={productDropdownRef} className="relative">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Product</label>
                  <input
                    type="text"
                    value={selectedProductName || productSearchQuery}
                    onChange={e => handleProductSearchChange(e.target.value)}
                    onFocus={() => productSearchResults.length > 0 && !selectedProductName && setShowProductDropdown(true)}
                    placeholder="Search products..."
                    className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.productId ? 'border-red-500' : ''}`}
                  />
                  {selectedProductName && (
                    <button
                      onClick={() => {
                        setSelectedProductName('');
                        setProductSearchQuery('');
                        setFormData(f => ({ ...f, productId: null }));
                      }}
                      className="absolute right-2 top-8 text-gray-400 hover:text-gray-600 text-xs"
                      type="button"
                    >
                      ✕
                    </button>
                  )}
                  {showProductDropdown && productSearchResults.length > 0 && !selectedProductName && (
                    <div className="absolute z-10 w-full mt-1 bg-white border rounded-md shadow-lg max-h-48 overflow-auto">
                      {productSearchResults.map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setFormData(f => ({ ...f, productId: p.id }));
                            setSelectedProductName(p.name);
                            setProductSearchQuery('');
                            setShowProductDropdown(false);
                          }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                  )}
                  {formErrors.productId && (
                    <p className="text-red-500 text-xs mt-1">{formErrors.productId}</p>
                  )}
                </div>
              )}

              {/* Min Quantity + Priority */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Min Quantity</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={formData.minQuantity ?? 1}
                    onChange={e => setFormData(f => ({ ...f, minQuantity: Number(e.target.value) }))}
                    className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.minQuantity ? 'border-red-500' : ''}`}
                  />
                  {formErrors.minQuantity && (
                    <p className="text-red-500 text-xs mt-1">{formErrors.minQuantity}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={formData.priority ?? 0}
                    onChange={e => setFormData(f => ({ ...f, priority: Number(e.target.value) }))}
                    className="w-full border rounded-md px-3 py-2 text-sm"
                  />
                  <p className="text-xs text-gray-400 mt-0.5">Higher = applied first</p>
                </div>
              </div>

              {/* Date Range */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Valid From</label>
                  <input
                    type="date"
                    value={formData.validFrom ?? ''}
                    onChange={e => setFormData(f => ({ ...f, validFrom: e.target.value || undefined }))}
                    className="w-full border rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Valid Until</label>
                  <input
                    type="date"
                    value={formData.validUntil ?? ''}
                    onChange={e => setFormData(f => ({ ...f, validUntil: e.target.value || undefined }))}
                    className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.validUntil ? 'border-red-500' : ''}`}
                  />
                  {formErrors.validUntil && (
                    <p className="text-red-500 text-xs mt-1">{formErrors.validUntil}</p>
                  )}
                </div>
              </div>
            </div>

            <DialogFooter>
              <button
                onClick={closeModal}
                className="px-4 py-2 border rounded-md text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={isMutating || (!!dangerWarning && !dangerAcknowledged)}
                className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {isMutating ? 'Saving...' : editingRule ? 'Update Rule' : 'Create Rule'}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Deactivate Price Rule</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-gray-600 py-2">
              Are you sure you want to deactivate
              <strong> {deleteTarget?.name || 'this rule'}</strong>?
              It can be reactivated later.
            </p>
            <DialogFooter>
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 border rounded-md text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Deactivating...' : 'Deactivate'}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
