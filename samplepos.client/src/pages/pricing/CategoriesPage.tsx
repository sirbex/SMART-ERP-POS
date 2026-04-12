/**
 * Category Management Page
 * CRUD for product categories with search and status toggle
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';
import { formatTimestampDate } from '../../utils/businessDate';
import { extractApiError } from '../../utils/extractApiError';
import Layout from '../../components/Layout';
import {
  useCategories,
  useCreateCategory,
  useUpdateCategory,
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

  // ── Per-item loading (UX2) ──
  const [pendingToggleId, setPendingToggleId] = useState<string | null>(null);

  // ── Modal State ──
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ProductCategory | null>(null);
  const [formData, setFormData] = useState<CreateProductCategoryInput>({ name: '', description: '' });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

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
          <button
            onClick={openCreate}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            + New Category
          </button>
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
      </div>
    </Layout>
  );
}
