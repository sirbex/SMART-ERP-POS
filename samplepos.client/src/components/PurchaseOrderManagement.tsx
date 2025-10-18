import React, { useState, useEffect } from 'react';
import api from '@/config/api.config';
import { formatCurrency } from '../utils/currency';
import { 
  usePurchases, 
  useCreatePurchase, 
  useUpdatePurchase 
} from '../services/api/purchasesApi';
import { useActiveSuppliers } from '../services/api/suppliersApi';
import type { Purchase } from '../types/backend';
import type { Product } from '../types';

// Local types for component state (frontend-specific)
interface PurchaseOrderItem {
  productId: string;
  productName: string;
  quantityOrdered: number;
  unitCost: number;
  totalCost: number;
  notes?: string;
}

// Import Shadcn UI components
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";
import { Textarea } from "./ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";

interface ProductSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectProduct: (product: Product) => void;
  selectedProducts: string[];
}

interface PurchaseOrderManagementProps {
  onNavigateToReceiving?: (order: Purchase) => void;
}

const ProductSelectionModal: React.FC<ProductSelectionModalProps> = ({
  isOpen,
  onClose,
  onSelectProduct,
  selectedProducts
}) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadProducts = async () => {
      if (!isOpen) return;
      
      setLoading(true);
      try {
        // Fetch products from new backend API
        const response = await api.get('/products?limit=1000');
        const productsData = response.data?.data || [];
        
        // Transform API data to Product format
        const productData: Product[] = productsData.map((item: any) => ({
          id: item.id.toString(),
          name: item.name,
          sku: item.barcode || item.id, // Use barcode or ID as SKU
          category: item.category || 'Uncategorized',
          unit: item.baseUnit || 'pcs',
          hasExpiry: false, // Can be enhanced based on product metadata
          reorderLevel: Number(item.reorderLevel) || 10,
          isActive: item.isActive !== false,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          price: Number(item.sellingPrice) || 0,
          currentStock: Number(item.currentStock) || 0
        }));
        
        setProducts(productData);
      } catch (error) {
        console.error('Error loading products for purchase order:', error);
        setProducts([]); // Clear products on error instead of fallback to localStorage
      } finally {
        setLoading(false);
      }
    };

    loadProducts();
  }, [isOpen]);  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(search.toLowerCase()) &&
    !selectedProducts.includes(String(product.id))
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Select Products for Purchase Order</DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-auto space-y-4">
          <div>
            <Label htmlFor="product-search">Search Products</Label>
            <Input
              id="product-search"
              placeholder="Search by product name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
                <p className="text-muted-foreground mt-2">Loading products...</p>
              </div>
            ) : filteredProducts.length > 0 ? (
              filteredProducts.map(product => {
                // Use current stock from PostgreSQL data (stored in custom property)
                const currentStock = (product as any).currentStock || 0;
                const isLowStock = currentStock <= (product.reorderLevel || 10);
                
                return (
                  <Card key={product.id} className="p-3 cursor-pointer hover:bg-accent" 
                        onClick={() => onSelectProduct(product)}>
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h4 className="font-medium">{product.name}</h4>
                        <p className="text-sm text-muted-foreground">
                          SKU: {product.sku || 'N/A'} | Category: {product.category || 'N/A'}
                        </p>
                        <div className="flex gap-2 mt-1">
                          <Badge variant={isLowStock ? "destructive" : "secondary"}>
                            Stock: {currentStock} {product.unit}
                          </Badge>
                          {isLowStock && (
                            <Badge variant="outline" className="text-amber-600">
                              Low Stock
                            </Badge>
                          )}
                          {product.price && (
                            <Badge variant="outline" className="text-green-600">
                              ${product.price}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <Button size="sm">Add</Button>
                    </div>
                  </Card>
                );
              })
            ) : (
              <div className="text-center text-muted-foreground py-4">
                {search ? 'No products match your search' : 'No products available'}
              </div>
            )}
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const PurchaseOrderManagement: React.FC<PurchaseOrderManagementProps> = ({ onNavigateToReceiving }) => {
  // React Query hooks
  const { data: purchasesData, isLoading: isLoadingPurchases } = usePurchases();
  const { data: suppliers } = useActiveSuppliers();
  const createPurchaseMutation = useCreatePurchase();
  const updatePurchaseMutation = useUpdatePurchase();

  // Derived data
  const purchaseOrders = purchasesData?.data || [];
  const suppliersList = suppliers || [];

  const [showCreateOrder, setShowCreateOrder] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Purchase | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    supplierId: '',
    expectedDeliveryDate: '',
    paymentTerms: '',
    notes: '',
    shippingCost: 0,
    tax: 0
  });
  const [orderItems, setOrderItems] = useState<PurchaseOrderItem[]>([]);

  const getStatusColor = (status: Purchase['status']) => {
    const colors = {
      PENDING: 'secondary',
      RECEIVED: 'default',
      PARTIAL: 'destructive',
      CANCELLED: 'outline'
    } as const;
    return colors[status] || 'secondary';
  };

  const handleCreateOrder = () => {
    resetForm();
    setShowCreateOrder(true);
  };

  const resetForm = () => {
    setFormData({
      supplierId: '',
      expectedDeliveryDate: '',
      paymentTerms: '',
      notes: '',
      shippingCost: 0,
      tax: 0
    });
    setOrderItems([]);
  };

  const handleAddProduct = (product: Product) => {
    const newItem: PurchaseOrderItem = {
      productId: String(product.id),
      productName: product.name,
      quantityOrdered: 1,
      unitCost: 0,
      totalCost: 0,
      notes: ''
    };
    
    setOrderItems([...orderItems, newItem]);
    setShowProductModal(false);
  };

  const updateOrderItem = (index: number, field: keyof PurchaseOrderItem, value: any) => {
    const updatedItems = [...orderItems];
    updatedItems[index] = { ...updatedItems[index], [field]: value };
    
    // Auto-calculate total cost
    if (field === 'quantityOrdered' || field === 'unitCost') {
      updatedItems[index].totalCost = updatedItems[index].quantityOrdered * updatedItems[index].unitCost;
    }
    
    setOrderItems(updatedItems);
  };

  const removeOrderItem = (index: number) => {
    setOrderItems(orderItems.filter((_, i) => i !== index));
  };

  const calculateOrderTotals = () => {
    const subtotal = orderItems.reduce((sum, item) => sum + item.totalCost, 0);
    const tax = formData.tax;
    const shipping = formData.shippingCost;
    const total = subtotal + tax + shipping;
    
    return { subtotal, tax, shipping, total };
  };

  const handleSaveOrder = async () => {
    if (!formData.supplierId || orderItems.length === 0) {
      alert('Please select a supplier and add at least one product');
      return;
    }

    const supplier = suppliersList.find(s => String(s.id) === formData.supplierId);
    if (!supplier) return;

    try {
      await createPurchaseMutation.mutateAsync({
        supplierId: formData.supplierId,
        items: orderItems.map(item => ({
          productId: item.productId,
          quantity: item.quantityOrdered,
          unitCost: item.unitCost
        })),
        orderDate: new Date().toISOString(),
        expectedDeliveryDate: formData.expectedDeliveryDate || undefined,
        notes: formData.notes || undefined,
        reference: formData.paymentTerms || undefined
      });

      alert('Purchase order created successfully!');
      setShowCreateOrder(false);
      resetForm();
    } catch (error) {
      console.error('Error creating purchase order:', error);
      alert('Failed to create purchase order');
    }
  };

  const handleUpdateOrderStatus = async (orderId: string, newStatus: Purchase['status']) => {
    try {
      await updatePurchaseMutation.mutateAsync({
        id: orderId,
        request: { status: newStatus }
      });
    } catch (error) {
      console.error('Error updating purchase order:', error);
      alert('Failed to update purchase order status');
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    try {
      // Backend doesn't have DELETE, so we CANCEL instead
      await updatePurchaseMutation.mutateAsync({
        id: orderId,
        request: { status: 'CANCELLED' }
      });
      setShowDeleteConfirm(null);
    } catch (error) {
      console.error('Error cancelling purchase order:', error);
      alert('Cannot cancel this purchase order');
    }
  };

  const handleConfirmOrder = (order: Purchase) => {
    const confirmed = window.confirm(
      `Confirm order ${order.id}?\n\n` +
      `Supplier ID: ${order.supplierId}\n` +
      `Total: ${Number(order.totalAmount).toLocaleString()} UGX\n\n` +
      `This will change the status to RECEIVED.`
    );
    
    if (confirmed) {
      handleUpdateOrderStatus(String(order.id), 'RECEIVED');
    }
  };

  const handleReceiveOrder = (order: Purchase) => {
    const switchToReceiving = window.confirm(
      `Navigate to Receiving page for order ${order.id}?\n\n` +
      `Supplier ID: ${order.supplierId}\n` +
      `Total: ${Number(order.totalAmount).toLocaleString()} UGX\n\n` +
      `This will take you to the Receiving tab where you can process the delivery.`
    );
    
    if (switchToReceiving && onNavigateToReceiving) {
      onNavigateToReceiving(order);
    }
  };

  const totals = calculateOrderTotals();

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Purchase Orders</h1>
          <p className="text-muted-foreground">Manage purchase orders and track deliveries</p>
        </div>
        <Button onClick={handleCreateOrder}>
          Create New Order
        </Button>
      </div>

      {/* Purchase Orders List */}
      <Card>
        <CardHeader>
          <CardTitle>Purchase Orders</CardTitle>
          <CardDescription>
            Track and manage all purchase orders
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingPurchases ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading purchase orders...
            </div>
          ) : purchaseOrders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No purchase orders found. Create your first purchase order to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order Number</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Order Date</TableHead>
                  <TableHead>Total Value</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchaseOrders.map(order => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">PO-{order.id}</TableCell>
                    <TableCell>Supplier ID: {order.supplierId}</TableCell>
                    <TableCell>{new Date(order.orderDate || order.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell>{formatCurrency(Number(order.totalAmount))}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusColor(order.status)}>
                        {order.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedOrder(order)}
                        >
                          View
                        </Button>
                        {order.status === 'PENDING' && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => handleConfirmOrder(order)}
                            >
                              Confirm
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => setShowDeleteConfirm(String(order.id))}
                            >
                              Cancel
                            </Button>
                          </>
                        )}
                        {order.status === 'PARTIAL' && (
                          <Button
                            size="sm"
                            onClick={() => handleReceiveOrder(order)}
                          >
                            📦 Receive More
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Order Modal */}
      {showCreateOrder && (
        <Dialog open={true} onOpenChange={() => setShowCreateOrder(false)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>Create Purchase Order</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-6">
              {/* Supplier Selection */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Supplier *</Label>
                  <Select
                    value={formData.supplierId}
                    onValueChange={(value) => setFormData({ ...formData, supplierId: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select supplier" />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliersList.map(supplier => (
                        <SelectItem key={supplier.id} value={String(supplier.id)}>
                          {supplier.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label>Expected Delivery Date</Label>
                  <Input
                    type="date"
                    value={formData.expectedDeliveryDate}
                    onChange={(e) => setFormData({ ...formData, expectedDeliveryDate: e.target.value })}
                  />
                </div>
              </div>

              {/* Order Items */}
              <div>
                <div className="flex justify-between items-center mb-4">
                  <Label className="text-lg font-medium">Order Items</Label>
                  <Button onClick={() => setShowProductModal(true)}>
                    Add Products
                  </Button>
                </div>
                
                {orderItems.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground border rounded-lg">
                    No products added. Click "Add Products" to get started.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>Unit Cost</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orderItems.map((item, index) => (
                        <TableRow key={index}>
                          <TableCell>{item.productName}</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={1}
                              className="w-24"
                              value={item.quantityOrdered}
                              onChange={(e) => updateOrderItem(index, 'quantityOrdered', parseInt(e.target.value) || 0)}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              step="0.01"
                              min={0}
                              className="w-32"
                              value={item.unitCost}
                              onChange={(e) => updateOrderItem(index, 'unitCost', parseFloat(e.target.value) || 0)}
                            />
                          </TableCell>
                          <TableCell>{formatCurrency(item.totalCost)}</TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => removeOrderItem(index)}
                            >
                              Remove
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>

              {/* Order Totals */}
              {orderItems.length > 0 && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Tax Amount</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min={0}
                            value={formData.tax}
                            onChange={(e) => setFormData({ ...formData, tax: parseFloat(e.target.value) || 0 })}
                          />
                        </div>
                        <div>
                          <Label>Shipping Cost</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min={0}
                            value={formData.shippingCost}
                            onChange={(e) => setFormData({ ...formData, shippingCost: parseFloat(e.target.value) || 0 })}
                          />
                        </div>
                      </div>
                      
                      <Separator />
                      
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span>Subtotal:</span>
                          <span>{formatCurrency(totals.subtotal)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Tax:</span>
                          <span>{formatCurrency(totals.tax)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Shipping:</span>
                          <span>{formatCurrency(totals.shipping)}</span>
                        </div>
                        <div className="flex justify-between font-bold text-lg border-t pt-2">
                          <span>Total:</span>
                          <span>{formatCurrency(totals.total)}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Additional Information */}
              <div className="space-y-4">
                <div>
                  <Label>Payment Terms</Label>
                  <Input
                    placeholder="e.g., Net 30, Cash on Delivery"
                    value={formData.paymentTerms}
                    onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })}
                  />
                </div>
                
                <div>
                  <Label>Notes</Label>
                  <Textarea
                    placeholder="Additional notes or special instructions"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  />
                </div>
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateOrder(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveOrder}>
                Create Purchase Order
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Product Selection Modal */}
      <ProductSelectionModal
        isOpen={showProductModal}
        onClose={() => setShowProductModal(false)}
        onSelectProduct={handleAddProduct}
        selectedProducts={orderItems.map(item => item.productId)}
      />

      {/* Order Details Modal */}
      {selectedOrder && (
        <Dialog open={true} onOpenChange={() => setSelectedOrder(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>Purchase Order Details - PO-{selectedOrder.id}</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Supplier ID</Label>
                  <p className="font-medium">{selectedOrder.supplierId}</p>
                </div>
                <div>
                  <Label>Status</Label>
                  <Badge variant={getStatusColor(selectedOrder.status)}>
                    {selectedOrder.status}
                  </Badge>
                </div>
                <div>
                  <Label>Order Date</Label>
                  <p>{new Date(selectedOrder.orderDate || selectedOrder.createdAt).toLocaleDateString()}</p>
                </div>
                <div>
                  <Label>Expected Delivery</Label>
                  <p>Not available in API yet</p>
                </div>
              </div>

              <Card>
                <CardContent className="pt-6">
                  <div className="space-y-2">
                    <div className="flex justify-between font-bold text-lg border-t pt-2">
                      <span>Total Amount:</span>
                      <span>{formatCurrency(Number(selectedOrder.totalAmount))}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {selectedOrder.notes && (
                <div>
                  <Label>Notes</Label>
                  <p className="text-sm bg-muted p-3 rounded-md">{selectedOrder.notes}</p>
                </div>
              )}
            </div>
            
            <DialogFooter>
              <Button onClick={() => setSelectedOrder(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <AlertDialog open={true} onOpenChange={() => setShowDeleteConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Purchase Order</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this purchase order? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => handleDeleteOrder(showDeleteConfirm)}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
};

export default PurchaseOrderManagement;


