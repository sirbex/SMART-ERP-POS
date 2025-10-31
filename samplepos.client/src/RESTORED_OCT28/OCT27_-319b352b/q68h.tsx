import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import {
  Package,
  Plus,
  Edit,
  Trash2,
  Search,
  RefreshCw,
  CheckCircle,
  XCircle,
  Eye,
  ClipboardList,
  Ruler,
} from 'lucide-react';
import ProductHistoryDialog from './ProductHistoryDialog';
import ProductUoMManagement from './ProductUoMManagement';
import {
  useProducts,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
} from '@/services/api/productsApi';
import { useToast } from '@/components/ui/toast';
import type { Product } from '@/types/backend';
import BulkPurchaseDialog from './BulkPurchaseDialog';
import { priceFromCost, marginFromCostAndPrice } from '@/utils/pricing';
import ProductForm, { type ProductFormData } from './ProductForm';

type ProductItem = Product & {
  unit?: string;
};

// ProductFormData moved to reusable ProductForm component

interface ProductManagementProps {
  onStartPhysicalCount?: () => void;
}

const ProductManagement: React.FC<ProductManagementProps> = ({ onStartPhysicalCount }) => {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [showInactive, setShowInactive] = useState(false); // Toggle to show/hide inactive products
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isBulkPurchaseDialogOpen, setIsBulkPurchaseDialogOpen] = useState(false);
  const [isUoMManagementOpen, setIsUoMManagementOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [historyProductId, setHistoryProductId] = useState<string | null>(null);

  const [formData, setFormData] = useState<ProductFormData>({
    name: '',
    sku: '',
    description: '',
    category: '',
    unitPrice: '',
    costPrice: '',
    marginPercent: '25.00',
    autoCalcPrice: true,
    unit: 'pcs',
    reorderLevel: '10',
    isActive: true,
    taxRatePercent: '10.00',
  });

  // Fetch products
  // Request products with UoM associations so we can show equivalence in the table
  const { data: productsData, isLoading } = useProducts({ page: 1, limit: 1000, includeUoMs: true });
  const products = productsData?.data || [];

  // Mutations
  const createMutation = useCreateProduct();
  const updateMutation = useUpdateProduct();
  const deleteMutation = useDeleteProduct();

  // Filter products
  const filteredProducts = products.filter((product) => {
    // Filter by active status first
    if (!showInactive && !product.isActive) {
      return false;
    }

    // Then filter by search term
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      return (
        product.name.toLowerCase().includes(searchLower) ||
        product.sku?.toLowerCase().includes(searchLower) ||
        product.description?.toLowerCase().includes(searchLower)
      );
    }

    return true;
  });

  // Reset form
  const resetForm = () => {
    setFormData({
      name: '',
      sku: '',
      description: '',
      category: '',
      unitPrice: '',
      costPrice: '',
      marginPercent: '25.00',
      autoCalcPrice: true,
      unit: 'pcs',
      reorderLevel: '10',
      isActive: true,
      taxRatePercent: '10.00',
    });
  };

  // Handle create
  const handleCreate = async () => {
    if (!formData.name || !formData.sku || !formData.unitPrice) {
      toast({
        title: 'Validation Error',
        description: 'Name, SKU, and Unit Price are required.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const productPayload = {
        name: formData.name,
        barcode: formData.sku, // Backend uses 'barcode' field
        description: formData.description || undefined,
        category: formData.category || undefined,
        sellingPrice: parseFloat(formData.unitPrice), // Backend uses 'sellingPrice'
        costPrice: formData.costPrice
          ? parseFloat(formData.costPrice)
          : parseFloat(formData.unitPrice) * 0.6, // Required field fallback
        baseUnit: formData.unit || 'pcs', // Backend uses 'baseUnit'
        taxRate: formData.taxRatePercent ? parseFloat(formData.taxRatePercent) / 100 : 0, // convert % to decimal (0-1)
        reorderPoint: formData.reorderLevel ? parseInt(formData.reorderLevel) : undefined,
        isActive: formData.isActive,
      };

      await createMutation.mutateAsync(productPayload);

      toast({
        title: 'Success',
        description: `Product "${formData.name}" created successfully.`,
      });

      setIsCreateDialogOpen(false);
      resetForm();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || error.message || 'Failed to create product.',
        variant: 'destructive',
      });
    }
  };

  // Handle edit
  const handleEdit = async () => {
    if (!selectedProduct || !formData.name || !formData.unitPrice) {
      toast({
        title: 'Validation Error',
        description: 'Name and Unit Price are required.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await updateMutation.mutateAsync({
        id: selectedProduct.id.toString(),
        request: {
          name: formData.name,
          barcode: formData.sku || undefined, // Backend uses 'barcode'
          description: formData.description || undefined,
          category: formData.category || undefined,
          sellingPrice: parseFloat(formData.unitPrice), // Backend uses 'sellingPrice'
          costPrice: formData.costPrice ? parseFloat(formData.costPrice) : undefined,
          baseUnit: formData.unit || undefined, // Backend uses 'baseUnit'
          taxRate: formData.taxRatePercent ? parseFloat(formData.taxRatePercent) / 100 : 0, // convert % to decimal (0-1)
          reorderPoint: formData.reorderLevel ? parseInt(formData.reorderLevel) : undefined,
          isActive: formData.isActive,
        },
      });

      toast({
        title: 'Success',
        description: `Product "${formData.name}" updated successfully.`,
      });

      setIsEditDialogOpen(false);
      setSelectedProduct(null);
      resetForm();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to update product.',
        variant: 'destructive',
      });
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!selectedProduct) return;

    try {
      await deleteMutation.mutateAsync(selectedProduct.id.toString());

      toast({
        title: 'Success',
        description: `Product "${selectedProduct.name}" deleted successfully.`,
      });

      setIsDeleteDialogOpen(false);
      setSelectedProduct(null);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to delete product.',
        variant: 'destructive',
      });
    }
  };

  // Handle reactivate (undo soft delete)
  const handleReactivate = async (product: ProductItem) => {
    try {
      await updateMutation.mutateAsync({
        id: product.id.toString(),
        request: { isActive: true },
      });

      toast({
        title: 'Success',
        description: `Product "${product.name}" reactivated successfully.`,
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to reactivate product.',
        variant: 'destructive',
      });
    }
  };

  // Open edit dialog
  const openEditDialog = (product: ProductItem) => {
    setSelectedProduct(product);

    // Compute margin percent from current cost/selling price for display
    const initialMargin = marginFromCostAndPrice(
      Number(product.costPrice || 0),
      Number(product.sellingPrice || 0)
    );

    setFormData({
      name: product.name,
      sku: product.barcode || product.sku || '', // Backend stores in 'barcode', show as SKU in UI
      description: product.description || '',
      category: product.category || '',
      unitPrice: (product.sellingPrice || 0).toString(), // Backend uses 'sellingPrice'
      costPrice: (product.costPrice || '').toString(),
      marginPercent: initialMargin,
      autoCalcPrice: true,
      unit: product.baseUnit || 'pcs', // Backend uses 'baseUnit'
      reorderLevel: (product.reorderLevel || '10').toString(),
      isActive: product.isActive,
  taxRatePercent: ((product as any).taxRate != null ? Number((product as any).taxRate) * 100 : 0).toString(), // convert decimal to %
    });
    setIsEditDialogOpen(true);
  };

  // Open delete dialog
  const openDeleteDialog = (product: ProductItem) => {
    setSelectedProduct(product);
    setIsDeleteDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Products</CardTitle>
            <Package className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{products.length}</div>
            <p className="text-xs text-muted-foreground">All products in catalog</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Products</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {products.filter((p) => p.isActive).length}
            </div>
            <p className="text-xs text-muted-foreground">Available for sale</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inactive Products</CardTitle>
            <XCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {products.filter((p) => !p.isActive).length}
            </div>
            <p className="text-xs text-muted-foreground">Not available for sale</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle className="text-xl font-bold flex items-center gap-2">
                <Package className="h-5 w-5" />
                Product Management
              </CardTitle>
              <CardDescription>Create, view, edit, and manage products</CardDescription>
            </div>
            <div className="flex gap-2">
              {onStartPhysicalCount && (
                <Button 
                  variant="outline"
                  onClick={onStartPhysicalCount}
                >
                  <ClipboardList className="h-4 w-4 mr-1" />
                  Physical Count
                </Button>
              )}
              <Button 
                variant="outline"
                onClick={() => setIsBulkPurchaseDialogOpen(true)}
              >
                <Package className="h-4 w-4 mr-1" />
                Bulk Purchase
              </Button>
              <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={() => resetForm()}>
                    <Plus className="h-4 w-4 mr-1" />
                    Create Product
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Create New Product</DialogTitle>
                    <DialogDescription>
                      Add a new product to your inventory catalog
                    </DialogDescription>
                  </DialogHeader>

                  <ProductForm mode="create" formData={formData} setFormData={setFormData} />

                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setIsCreateDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button onClick={handleCreate} disabled={createMutation.isPending}>
                      {createMutation.isPending ? 'Creating...' : 'Create Product'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Search and Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, SKU, or description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
            <Button 
              variant={showInactive ? 'default' : 'outline'} 
              size="sm"
              onClick={() => setShowInactive(!showInactive)}
            >
              {showInactive ? 'Hide Inactive' : 'Show Inactive'}
            </Button>
            <Button variant="outline" size="sm">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          {/* Products Table */}
          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
              <p className="text-muted-foreground mt-2">Loading products...</p>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-8">
              <Package className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-2 text-sm font-semibold">
                {searchTerm ? 'No products found' : 'No products yet'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {searchTerm
                  ? 'Try adjusting your search'
                  : 'Create your first product to get started'}
              </p>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Base Unit</TableHead>
                    <TableHead className="text-right">Current Stock</TableHead>
                    <TableHead className="text-right">Cost Price</TableHead>
                    <TableHead className="text-right">Unit Price</TableHead>
                    <TableHead className="text-right">Reorder Level</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell>
                        {product.category ? (
                          <Badge variant="secondary">{product.category}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell>{product.barcode || product.sku || '-'}</TableCell>
                      <TableCell>
                        {product.baseUnit || 'pcs'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end">
                          <span className={
                            product.currentStock && product.reorderLevel && 
                            Number(product.currentStock) <= Number(product.reorderLevel)
                              ? 'text-red-600 font-semibold'
                              : 'font-medium'
                          }>
                            {product.currentStock ? Number(product.currentStock) : 0} {product.baseUnit || 'pcs'}
                          </span>
                          {(product as any).productUoMs && (product as any).productUoMs.length > 0 && (
                            <span className="text-xs text-muted-foreground">
                              {([...(product as any).productUoMs] as any[])
                                .filter((pu: any) => Number(pu.conversionFactor) > 1)
                                .sort((a: any, b: any) => Number(b.conversionFactor) - Number(a.conversionFactor))
                                .map((pu: any) => {
                                  const stock = Number(product.currentStock || 0);
                                  const factor = Number(pu.conversionFactor || 1);
                                  const raw = stock / factor;
                                  const isInt = Math.abs(raw - Math.round(raw)) < 1e-9;
                                  const qtyStr = isInt ? String(Math.round(raw)) : raw.toFixed(2);
                                  const unitName = pu.uom?.name || pu.uomId || '';
                                  return `${qtyStr} ${unitName}`;
                                })
                                .join(', ')}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {product.costPrice
                          ? `₱${Number(product.costPrice).toFixed(2)}`
                          : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        ₱{Number(product.sellingPrice || 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        {product.reorderLevel ? Number(product.reorderLevel) : '-'}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={product.isActive ? 'default' : 'outline'}
                          className={
                            product.isActive
                              ? 'bg-green-600 text-white'
                              : 'text-red-600 border-red-600'
                          }
                        >
                          {product.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setHistoryProductId(product.id.toString());
                              setShowHistoryDialog(true);
                            }}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(product as any)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          {product.isActive ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openDeleteDialog(product as any)}
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleReactivate(product as any)}
                              className="text-green-600"
                            >
                              <RefreshCw className="h-4 w-4 mr-1" />
                              Reactivate
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Footer */}
          {filteredProducts.length > 0 && (
            <div className="text-sm text-muted-foreground">
              Showing {filteredProducts.length} of {products.length} products
              {showInactive && (
                <span className="ml-2">
                  ({products.filter(p => p.isActive).length} active, {products.filter(p => !p.isActive).length} inactive)
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Product</DialogTitle>
            <DialogDescription>Update product information</DialogDescription>
          </DialogHeader>

          <ProductForm mode="edit" formData={formData} setFormData={setFormData} />

          {/* UoM Management Section */}
          <div className="border-t pt-4 mt-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="font-medium">Units of Measure</h3>
                <p className="text-sm text-muted-foreground">
                  Manage multiple units and pricing for this product
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsUoMManagementOpen(true);
                }}
              >
                <Ruler className="h-4 w-4 mr-2" />
                Manage UoM
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEdit} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Updating...' : 'Update Product'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Product</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{selectedProduct?.name}"? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Purchase Dialog */}
      <BulkPurchaseDialog
        open={isBulkPurchaseDialogOpen}
        onClose={() => setIsBulkPurchaseDialogOpen(false)}
        onSuccess={() => {
          // Refresh will happen automatically via React Query invalidation
        }}
      />

      {/* Product History Dialog */}
      <ProductHistoryDialog
        productId={historyProductId}
        open={showHistoryDialog}
        onOpenChange={(open) => {
          setShowHistoryDialog(open);
          if (!open) setHistoryProductId(null);
        }}
      />

      {/* Product UoM Management Dialog */}
      <ProductUoMManagement
        open={isUoMManagementOpen}
        onOpenChange={setIsUoMManagementOpen}
        product={selectedProduct ? {
          id: selectedProduct.id.toString(),
          name: selectedProduct.name,
          baseUnit: selectedProduct.baseUnit || 'pcs',
          sellingPrice: Number(selectedProduct.sellingPrice || 0),
        } : null}
        onSuccess={() => {
          // Refresh products list
          // React Query will auto-invalidate
        }}
      />
    </div>
  );
};

export default ProductManagement;
