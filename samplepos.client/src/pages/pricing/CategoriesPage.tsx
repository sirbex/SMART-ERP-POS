/**
 * Category Management Page
 * CRUD for product categories with search and status toggle
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';
import { formatTimestampDate } from '../../utils/businessDate';
import { extractApiError } from '../../utils/extractApiError';
import { useSubmitOnEnter } from '../../hooks/useSubmitOnEnter';
import Layout from '../../components/Layout';
import {
  useCategories,
  useCreateCategory,
  useUpdateCategory,
  useMergeCategory,
} from '../../hooks/usePricing';
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
  ProductCategory,
  CreateProductCategoryInput,
  UpdateProductCategoryInput,
  CategoryFilters,
} from '../../types/pricing';

// ============================================================================
// Component
// ============================================================================

export default function CategoriesPage() {
  // ── Filters ──
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterActive, setFilterActive] = useState('');
  const limit = 20;

  // Debounced search
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); }, []);
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 300);
  }, []);

  const filters: CategoryFilters = useMemo(() => ({
    page,
    limit,
    search: debouncedSearch || undefined,
    isActive: filterActive === '' ? undefined : filterActive === 'true',
  }), [page, debouncedSearch, filterActive]);

  // ── Data ──
  const { data: categoriesData, isLoading, error } = useCategories(filters);
  const categories = categoriesData?.data ?? [];
  const pagination = categoriesData?.pagination;

  // ── Mutations ──
  const createMutation = useCreateCategory();
  const updateMutation = useUpdateCategory();
  const mergeMutation = useMergeCategory();

  // Fetch all categories (no pagination) for merge dropdowns
  const { data: allCategoriesData } = useCategories({ limit: 500 });
  const allCategories = allCategoriesData?.data ?? [];

  // ── Per-item loading (UX2) ──
  const [pendingToggleId, setPendingToggleId] = useState<string | null>(null);

  // ── Modal State ──
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ProductCategory | null>(null);
  const [formData, setFormData] = useState<CreateProductCategoryInput>({ name: '', description: '' });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // ── Odoo-style Merge State ──
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [mergeSources, setMergeSources] = useState<ProductCategory[]>([]); // chips: categories to delete
  const [mergeTarget, setMergeTarget] = useState<ProductCategory | null>(null); // the category to keep
  const [sourceInput, setSourceInput] = useState('');
  const [targetInput, setTargetInput] = useState('');
  const [showSourceDrop, setShowSourceDrop] = useState(false);
  const [showTargetDrop, setShowTargetDrop] = useState(false);
  const [mergeProgress, setMergeProgress] = useState<string | null>(null);
  const sourceRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (sourceRef.current && !sourceRef.current.contains(e.target as Node)) setShowSourceDrop(false);
      if (targetRef.current && !targetRef.current.contains(e.target as Node)) setShowTargetDrop(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const openMerge = useCallback((cat: ProductCategory) => {
    setMergeSources([cat]);
    setMergeTarget(null);
    setSourceInput('');
    setTargetInput('');
    setMergeProgress(null);
    setShowMergeDialog(true);
  }, []);

  const openFreshMerge = useCallback(() => {
    setMergeSources([]);
    setMergeTarget(null);
    setSourceInput('');
    setTargetInput('');
    setMergeProgress(null);
    setShowMergeDialog(true);
  }, []);

  const closeMerge = useCallback(() => {
    setShowMergeDialog(false);
    setMergeSources([]);
    setMergeTarget(null);
    setSourceInput('');
    setTargetInput('');
    setMergeProgress(null);
  }, []);

  const sourceDropOptions = useMemo(() => {
    const excludedIds = new Set([
      ...mergeSources.map(s => s.id),
      ...(mergeTarget ? [mergeTarget.id] : []),
    ]);
    const q = sourceInput.toLowerCase().trim();
    return allCategories
      .filter(c => !excludedIds.has(c.id) && (!q || c.name.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 12);
  }, [allCategories, mergeSources, mergeTarget, sourceInput]);

  const targetDropOptions = useMemo(() => {
    const excludedIds = new Set(mergeSources.map(s => s.id));
    const q = targetInput.toLowerCase().trim();
    return allCategories
      .filter(c => !excludedIds.has(c.id) && (!q || c.name.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 12);
  }, [allCategories, mergeSources, targetInput]);

  const addSource = useCallback((cat: ProductCategory) => {
    setMergeSources(prev => prev.find(s => s.id === cat.id) ? prev : [...prev, cat]);
    setSourceInput('');
    setShowSourceDrop(false);
  }, []);

  const removeSource = useCallback((id: string) => {
    setMergeSources(prev => prev.filter(s => s.id !== id));
  }, []);

  const selectTarget = useCallback((cat: ProductCategory) => {
    setMergeTarget(cat);
    setTargetInput(cat.name);
    setShowTargetDrop(false);
  }, []);

  const handleMerge = useCallback(async () => {
    if (!mergeTarget || mergeSources.length === 0) return;
    let totalMoved = 0;
    try {
      for (let i = 0; i < mergeSources.length; i++) {
        const src = mergeSources[i];
        setMergeProgress(`Merging ${i + 1} of ${mergeSources.length}: "${src.name}"…`);
        const result = await mergeMutation.mutateAsync({ targetId: mergeTarget.id, sourceId: src.id });
        totalMoved += result.movedProducts ?? 0;
      }
      toast.success(`Merged ${mergeSources.length} categor${mergeSources.length > 1 ? 'ies' : 'y'} into "${mergeTarget.name}" — ${totalMoved} products moved`);
      closeMerge();
    } catch (err: unknown) {
      setMergeProgress(null);
      toast.error(extractApiError(err, 'Merge failed'));
    }
  }, [mergeSources, mergeTarget, mergeMutation, closeMerge]);

  // ── Form Handlers ──
  const openCreate = useCallback(() => {
    setFormData({ name: '', description: '' });
    setFormErrors({});
    setShowCreateModal(true);
  }, []);

  const openEdit = useCallback((category: ProductCategory) => {
    setEditingCategory(category);
    setFormData({ name: category.name, description: category.description ?? '' });
    setFormErrors({});
  }, []);

  const closeModal = useCallback(() => {
    setShowCreateModal(false);
    setEditingCategory(null);
    setFormErrors({});
  }, []);

  // ── Validation ──
  const validateForm = useCallback((): boolean => {
    const errors: Record<string, string> = {};
    if (!formData.name.trim()) errors.name = 'Category name is required';
    if (formData.name.length > 255) errors.name = 'Name must be 255 characters or less';
    if (formData.description && formData.description.length > 1000) {
      errors.description = 'Description must be 1000 characters or less';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [formData]);

  // ── Submit ──
  const handleSubmit = useCallback(async () => {
    if (!validateForm()) return;

    try {
      if (editingCategory) {
        const data: UpdateProductCategoryInput = {
          name: formData.name.trim(),
          description: formData.description?.trim() || null,
        };
        await updateMutation.mutateAsync({ id: editingCategory.id, data });
        toast.success('Category updated');
      } else {
        await createMutation.mutateAsync({
          name: formData.name.trim(),
          description: formData.description?.trim() || undefined,
        });
        toast.success('Category created');
      }
      closeModal();
    } catch (err: unknown) {
      toast.error(extractApiError(err));
    }
  }, [formData, editingCategory, validateForm, createMutation, updateMutation, closeModal]);

  // ── Toggle Active ──
  const handleToggleActive = useCallback(async (category: ProductCategory) => {
    setPendingToggleId(category.id);
    try {
      await updateMutation.mutateAsync({
        id: category.id,
        data: { isActive: !category.isActive },
      });
      toast.success(category.isActive ? 'Category deactivated' : 'Category activated');
    } catch (err: unknown) {
      toast.error(extractApiError(err, 'Failed to toggle category'));
    } finally {
      setPendingToggleId(null);
    }
  }, [updateMutation]);

  const isMutating = createMutation.isPending || updateMutation.isPending;

  useSubmitOnEnter(showCreateModal || !!editingCategory, !isMutating, handleSubmit);

  return (
    <Layout>
      <PricingTabs />
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Product Categories</h1>
            <p className="text-sm text-gray-500 mt-1">
              Organize products into categories for group pricing rules
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={openFreshMerge}
              className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors text-sm font-medium"
              title="Merge duplicate categories"
            >
              ⇄ Merge Categories
            </button>
            <button
              onClick={openCreate}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              + New Category
            </button>
          </div>
        </div>

        {/* Search + Filters */}
        <div className="flex flex-wrap gap-3 items-center bg-gray-50 rounded-lg p-4">
          <div className="relative flex-1 min-w-[200px]">
            <input
              type="text"
              value={search}
              onChange={e => handleSearchChange(e.target.value)}
              placeholder="Search categories..."
              className="w-full border rounded-md pl-9 pr-3 py-2 text-sm bg-white"
              aria-label="Search categories"
            />
            <span className="absolute left-3 top-2.5 text-gray-400 text-sm">🔍</span>
          </div>

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

          {(debouncedSearch || filterActive) && (
            <button
              onClick={() => { setSearch(''); setDebouncedSearch(''); setFilterActive(''); setPage(1); }}
              className="text-sm text-blue-600 hover:underline"
            >
              Clear
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
            Failed to load categories. Please try again.
          </div>
        ) : categories.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg font-medium">No categories found</p>
            <p className="text-sm mt-1">
              {debouncedSearch ? 'Try a different search term' : 'Create your first category'}
            </p>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map(cat => (
                  <TableRow key={cat.id} className={!cat.isActive ? 'opacity-50' : ''}>
                    <TableCell className="font-medium">{cat.name}</TableCell>
                    <TableCell className="text-sm text-gray-500 max-w-xs truncate">
                      {cat.description || <span className="italic text-gray-300">No description</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={cat.isActive ? 'default' : 'secondary'}>
                        {cat.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {formatTimestampDate(cat.createdAt)}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <button
                        onClick={() => handleToggleActive(cat)}
                        disabled={pendingToggleId === cat.id}
                        className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50"
                        title={cat.isActive ? 'Deactivate' : 'Activate'}
                      >
                        {pendingToggleId === cat.id ? '⏳' : cat.isActive ? '⏸' : '▶'}
                      </button>
                      <button
                        onClick={() => openEdit(cat)}
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => openMerge(cat)}
                        className="text-xs text-orange-600 hover:text-orange-800"
                        title="Merge this category into another"
                      >
                        Merge
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
              Page {pagination.page} of {pagination.totalPages} ({pagination.total} categories)
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
        <Dialog open={showCreateModal || !!editingCategory} onOpenChange={() => closeModal()}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingCategory ? 'Edit Category' : 'Create Category'}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g., Pharmaceuticals"
                  className={`w-full border rounded-md px-3 py-2 text-sm ${formErrors.name ? 'border-red-500' : ''}`}
                  autoFocus
                />
                {formErrors.name && (
                  <p className="text-red-500 text-xs mt-1">{formErrors.name}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description ?? ''}
                  onChange={e => setFormData(f => ({ ...f, description: e.target.value }))}
                  placeholder="Optional description..."
                  rows={3}
                  className={`w-full border rounded-md px-3 py-2 text-sm resize-none ${formErrors.description ? 'border-red-500' : ''}`}
                />
                {formErrors.description && (
                  <p className="text-red-500 text-xs mt-1">{formErrors.description}</p>
                )}
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
                disabled={isMutating}
                className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {isMutating ? 'Saving...' : editingCategory ? 'Update' : 'Create'}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Merge Modal — Odoo-style */}
        <Dialog open={showMergeDialog} onOpenChange={() => closeMerge()}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span className="text-orange-500">⇄</span> Merge Categories
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-5 py-2">

              {/* SOURCE CHIPS */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Merge these (will be deleted) <span className="text-red-400">*</span>
                </label>
                <div className="min-h-[44px] border rounded-lg p-2 flex flex-wrap gap-1.5 bg-gray-50">
                  {mergeSources.map(s => (
                    <span
                      key={s.id}
                      className="inline-flex items-center gap-1 bg-orange-100 text-orange-800 border border-orange-200 rounded-md px-2.5 py-1 text-sm font-medium"
                    >
                      {s.name}
                      <button
                        onClick={() => removeSource(s.id)}
                        className="ml-0.5 text-orange-400 hover:text-orange-700 text-xs font-bold leading-none"
                        title="Remove"
                      >✕</button>
                    </span>
                  ))}
                  {/* Inline search input */}
                  <div ref={sourceRef} className="relative flex-1 min-w-[160px]">
                    <input
                      type="text"
                      value={sourceInput}
                      onChange={e => { setSourceInput(e.target.value); setShowSourceDrop(true); }}
                      onFocus={() => setShowSourceDrop(true)}
                      placeholder={mergeSources.length === 0 ? 'Type to search categories…' : 'Add another…'}
                      className="w-full bg-transparent border-none outline-none text-sm py-1 px-1 placeholder-gray-400"
                    />
                    {showSourceDrop && sourceDropOptions.length > 0 && (
                      <div className="absolute top-full left-0 z-50 mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                        {sourceDropOptions.map(c => (
                          <button
                            key={c.id}
                            onMouseDown={e => { e.preventDefault(); addSource(c); }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-orange-50 hover:text-orange-800 border-b last:border-b-0"
                          >
                            {c.name}
                            {!c.isActive && <span className="ml-2 text-xs text-gray-400">(inactive)</span>}
                          </button>
                        ))}
                      </div>
                    )}
                    {showSourceDrop && sourceInput.trim() && sourceDropOptions.length === 0 && (
                      <div className="absolute top-full left-0 z-50 mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm text-gray-400 text-center">
                        No categories found
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ARROW */}
              <div className="flex items-center gap-3">
                <div className="flex-1 border-t border-dashed border-gray-200" />
                <div className="text-2xl text-gray-300">↓</div>
                <div className="flex-1 border-t border-dashed border-gray-200" />
              </div>

              {/* TARGET COMBOBOX */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Into this (will be kept) <span className="text-red-400">*</span>
                </label>
                <div ref={targetRef} className="relative">
                  <input
                    type="text"
                    value={targetInput}
                    onChange={e => {
                      setTargetInput(e.target.value);
                      setMergeTarget(null);
                      setShowTargetDrop(true);
                    }}
                    onFocus={() => setShowTargetDrop(true)}
                    placeholder="Type to search target category…"
                    className={`w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 transition ${
                      mergeTarget
                        ? 'border-emerald-400 bg-emerald-50 text-emerald-800 font-medium focus:ring-emerald-200'
                        : 'border-gray-300 bg-white focus:ring-blue-200 focus:border-blue-400'
                    }`}
                  />
                  {mergeTarget && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500 text-sm">✓</span>
                  )}
                  {showTargetDrop && targetDropOptions.length > 0 && (
                    <div className="absolute top-full left-0 z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                      {targetDropOptions.map(c => (
                        <button
                          key={c.id}
                          onMouseDown={e => { e.preventDefault(); selectTarget(c); }}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b last:border-b-0 ${
                            mergeTarget?.id === c.id ? 'bg-blue-50 text-blue-700 font-medium' : ''
                          }`}
                        >
                          {c.name}
                          {!c.isActive && <span className="ml-2 text-xs text-gray-400">(inactive)</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  {showTargetDrop && targetInput.trim() && targetDropOptions.length === 0 && (
                    <div className="absolute top-full left-0 z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm text-gray-400 text-center">
                      No categories found
                    </div>
                  )}
                </div>
              </div>

              {/* SUMMARY / WARNING */}
              {mergeSources.length > 0 && mergeTarget && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                  <p className="text-amber-800 font-medium mb-1">⚠️ This action cannot be undone</p>
                  <p className="text-amber-700">
                    All products from{' '}
                    <strong>{mergeSources.map(s => `"${s.name}"`).join(', ')}</strong>{' '}
                    will be moved to <strong>"{mergeTarget.name}"</strong>.
                    {mergeSources.length > 1 ? ` ${mergeSources.length} categories` : ' The source category'} will be permanently deleted.
                  </p>
                </div>
              )}

              {/* PROGRESS */}
              {mergeProgress && (
                <div className="flex items-center gap-2 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full flex-shrink-0" />
                  {mergeProgress}
                </div>
              )}
            </div>

            <DialogFooter>
              <button
                onClick={closeMerge}
                disabled={mergeMutation.isPending}
                className="px-4 py-2 border rounded-md text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleMerge}
                disabled={!mergeTarget || mergeSources.length === 0 || mergeMutation.isPending}
                className="px-4 py-2 bg-orange-600 text-white rounded-md text-sm hover:bg-orange-700 disabled:opacity-50 font-medium"
              >
                {mergeMutation.isPending
                  ? 'Merging…'
                  : `Merge & Delete ${mergeSources.length > 1 ? `${mergeSources.length} Sources` : 'Source'}`}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
