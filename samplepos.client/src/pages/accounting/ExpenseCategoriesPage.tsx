import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit, Trash2, Settings, PowerOff, Power } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';


interface ExpenseCategory {
  id: string;
  name: string;
  code: string;
  description?: string;
  isActive: boolean;
  expenseCount: number;
}

const categoryApi = {
  getCategories: async (): Promise<ExpenseCategory[]> => {
    const response = await fetch('/api/expenses/categories?includeInactive=true', {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch categories');
    }

    const result = await response.json();
    return (result.data || []).map((c: { id: string; code: string; name: string; description?: string; is_active?: boolean; isActive?: boolean; expense_count?: number | string; expenseCount?: number | string }) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      description: c.description,
      isActive: c.isActive ?? c.is_active ?? true,
      expenseCount: Number(c.expenseCount ?? c.expense_count ?? 0),
    }));
  },

  createCategory: async (data: { name: string; code: string; description?: string }): Promise<ExpenseCategory> => {
    const response = await fetch('/api/expenses/categories', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to create category');
    }

    const result = await response.json();
    return result.data;
  },

  updateCategory: async (id: string, data: { name?: string; code?: string; description?: string; isActive?: boolean }): Promise<ExpenseCategory> => {
    const response = await fetch(`/api/expenses/categories/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to update category');
    }

    const result = await response.json();
    return result.data;
  },

  deleteCategory: async (id: string): Promise<void> => {
    const response = await fetch(`/api/expenses/categories/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to delete category');
    }
  }
};

interface CategoryFormData {
  name: string;
  code: string;
  description?: string;
}

const CategoryForm: React.FC<{
  category?: ExpenseCategory;
  onSubmit: (data: CategoryFormData) => void;
  onCancel: () => void;
  isLoading: boolean;
}> = ({ category, onSubmit, onCancel, isLoading }) => {
  const [formData, setFormData] = useState<CategoryFormData>({
    name: category?.name || '',
    code: category?.code || '',
    description: category?.description || ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="name">Category Name *</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
          placeholder="Enter category name"
          required
        />
      </div>

      <div>
        <Label htmlFor="code">Category Code *</Label>
        <Input
          id="code"
          value={formData.code}
          onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
          placeholder="Enter category code"
          required
        />
      </div>

      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
          placeholder="Enter category description"
          rows={3}
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Saving...' : (category ? 'Update' : 'Create')}
        </Button>
      </div>
    </form>
  );
};

export const ExpenseCategoriesPage: React.FC = () => {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ExpenseCategory | null>(null);
  const queryClient = useQueryClient();

  const { data: categories = [], isLoading, error } = useQuery({
    queryKey: ['expense-categories-admin'],
    queryFn: categoryApi.getCategories
  });

  const createMutation = useMutation({
    mutationFn: categoryApi.createCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
      queryClient.invalidateQueries({ queryKey: ['expense-categories-admin'] });
      setIsCreateModalOpen(false);
      toast.success('Category created successfully');
    },
    onError: (error) => {
      toast.error('Failed to create category', {
        description: error instanceof Error ? error.message : 'Please try again'
      });
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: CategoryFormData }) =>
      categoryApi.updateCategory(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
      queryClient.invalidateQueries({ queryKey: ['expense-categories-admin'] });
      setEditingCategory(null);
      toast.success('Category updated successfully');
    },
    onError: (error) => {
      toast.error('Failed to update category', {
        description: error instanceof Error ? error.message : 'Please try again'
      });
    }
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      categoryApi.updateCategory(id, { isActive }),
    onSuccess: (_data, { isActive }) => {
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
      queryClient.invalidateQueries({ queryKey: ['expense-categories-admin'] });
      toast.success(isActive ? 'Category activated' : 'Category deactivated');
    },
    onError: (error) => {
      toast.error('Failed to update category status', {
        description: error instanceof Error ? error.message : 'Please try again'
      });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: categoryApi.deleteCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
      queryClient.invalidateQueries({ queryKey: ['expense-categories-admin'] });
      toast.success('Category deleted successfully');
    },
    onError: (error) => {
      toast.error('Failed to delete category', {
        description: error instanceof Error ? error.message : 'Please try again'
      });
    }
  });

  const handleCreate = (data: CategoryFormData) => {
    createMutation.mutate(data);
  };

  const handleUpdate = (data: CategoryFormData) => {
    if (editingCategory) {
      updateMutation.mutate({ id: editingCategory.id, data });
    }
  };

  const handleToggleActive = (category: ExpenseCategory) => {
    toggleActiveMutation.mutate({ id: category.id, isActive: !category.isActive });
  };

  const handleDelete = (category: ExpenseCategory) => {
    if (category.expenseCount > 0) {
      toast.error('Cannot delete category', {
        description: `This category has ${category.expenseCount} associated expenses`
      });
      return;
    }

    if (confirm(`Are you sure you want to delete "${category.name}"? This cannot be undone.`)) {
      deleteMutation.mutate(category.id);
    }
  };

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Error loading categories: {(error as Error).message}</p>
        </div>
      </div>
    );
  }

  const activeCategories = categories.filter(c => c.isActive);
  const inactiveCategories = categories.filter(c => !c.isActive);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Settings className="h-8 w-8 text-blue-600" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Expense Categories</h1>
            <p className="text-gray-600">Manage expense categories and classifications</p>
          </div>
        </div>
        
        <Button 
          onClick={() => setIsCreateModalOpen(true)}
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          New Category
        </Button>
      </div>

      {/* Categories Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <>
          {/* Active Categories */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {activeCategories.map((category) => (
              <Card key={category.id}>
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{category.name}</CardTitle>
                      <Badge variant="outline" className="mt-1">
                        {category.code}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingCategory(category)}
                        title="Edit category"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleActive(category)}
                        title="Deactivate category"
                        disabled={toggleActiveMutation.isPending}
                      >
                        <PowerOff className="h-4 w-4 text-yellow-600" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(category)}
                        disabled={category.expenseCount > 0}
                        title={category.expenseCount > 0 ? `Cannot delete — has ${category.expenseCount} expenses` : 'Delete category'}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {category.description && (
                    <p className="text-sm text-gray-600 mb-3">{category.description}</p>
                  )}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">
                      {category.expenseCount} expense{category.expenseCount !== 1 ? 's' : ''}
                    </span>
                    <Badge variant="default" className="bg-green-100 text-green-800 hover:bg-green-100">
                      Active
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Inactive Categories */}
          {inactiveCategories.length > 0 && (
            <div className="mt-8">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
                Inactive Categories ({inactiveCategories.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {inactiveCategories.map((category) => (
                  <Card key={category.id} className="opacity-60 border-dashed">
                    <CardHeader className="pb-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg text-gray-500">{category.name}</CardTitle>
                          <Badge variant="outline" className="mt-1 text-gray-400">
                            {category.code}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleActive(category)}
                            title="Activate category"
                            disabled={toggleActiveMutation.isPending}
                          >
                            <Power className="h-4 w-4 text-green-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(category)}
                            disabled={category.expenseCount > 0}
                            title={category.expenseCount > 0 ? `Cannot delete — has ${category.expenseCount} expenses` : 'Delete category'}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {category.description && (
                        <p className="text-sm text-gray-400 mb-3">{category.description}</p>
                      )}
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-400">
                          {category.expenseCount} expense{category.expenseCount !== 1 ? 's' : ''}
                        </span>
                        <Badge variant="secondary">
                          Inactive
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Create Category Modal */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Category</DialogTitle>
          </DialogHeader>
          <CategoryForm
            onSubmit={handleCreate}
            onCancel={() => setIsCreateModalOpen(false)}
            isLoading={createMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Category Modal */}
      <Dialog open={!!editingCategory} onOpenChange={() => setEditingCategory(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Category</DialogTitle>
          </DialogHeader>
          {editingCategory && (
            <CategoryForm
              category={editingCategory}
              onSubmit={handleUpdate}
              onCancel={() => setEditingCategory(null)}
              isLoading={updateMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ExpenseCategoriesPage;
