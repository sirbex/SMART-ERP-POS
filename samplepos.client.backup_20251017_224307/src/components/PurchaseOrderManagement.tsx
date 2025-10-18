import React, { useState, useEffect } from 'react';
import SettingsService from '../services/SettingsService';
import PurchaseManagementService from '../services/PurchaseManagementService';
import InventoryBatchService from '../services/InventoryBatchService';
import type { 
  PurchaseOrder, 
  PurchaseOrderItem, 
  Supplier, 
  Product 
} from '../models/BatchInventory';

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
  onNavigateToReceiving?: (order: PurchaseOrder) => void;
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
  const inventoryService = InventoryBatchService.getInstance();

  useEffect(() => {
    const loadProducts = async () => {
      if (!isOpen) return;
      
      setLoading(true);
      try {
        // Fetch products from PostgreSQL unified inventory API
        const response = await fetch('http://localhost:3001/api/inventory/unified');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const unifiedData = await response.json();
        
        // Transform API data to Product format
        const productData: Product[] = unifiedData.map((item: any) => ({
          id: item.id.toString(),
          name: item.name,
          sku: item.sku || 'N/A',
          category: item.category || 'Uncategorized',
          unit: item.metadata?.unit || 'pcs',
          hasExpiry: item.metadata?.hasExpiry || false,
          reorderLevel: item.reorderLevel || 10,
          isActive: item.isActive,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          price: item.price || 0,
          currentStock: item.totalStock || 0
        }));
        
        setProducts(productData);
      } catch (error) {
        console.error('Error loading products for purchase order:', error);
        // Fallback to localStorage if API fails
        setProducts(inventoryService.getProducts());
      } finally {
        setLoading(false);
      }
    };
    
    loadProducts();
  }, [isOpen, inventoryService]);

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(search.toLowerCase()) &&
    !selectedProducts.includes(product.id)
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
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [showCreateOrder, setShowCreateOrder] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
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

  const purchaseService = PurchaseManagementService.getInstance();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setPurchaseOrders(purchaseService.getPurchaseOrders());
    setSuppliers(purchaseService.getSuppliers());
  };

  const getStatusColor = (status: PurchaseOrder['status']) => {
    const colors = {
      draft: 'secondary',
      sent: 'outline',
      confirmed: 'default',
      partial: 'destructive',
      received: 'destructive', // Green-like color for completed
      cancelled: 'secondary'
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
      productId: product.id,
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

  const handleSaveOrder = () => {
    if (!formData.supplierId || orderItems.length === 0) {
      alert('Please select a supplier and add at least one product');
      return;
    }

    const supplier = suppliers.find(s => s.id === formData.supplierId);
    if (!supplier) return;

    const totals = calculateOrderTotals();
    const orderNumber = purchaseService.generateOrderNumber();

    const newOrder: Omit<PurchaseOrder, 'id' | 'createdAt' | 'updatedAt'> = {
      orderNumber,
      supplierId: formData.supplierId,
      supplierName: supplier.name,
      orderDate: new Date().toISOString(),
      expectedDeliveryDate: formData.expectedDeliveryDate || undefined,
      items: orderItems,
      subtotal: totals.subtotal,
      tax: totals.tax,
      shippingCost: totals.shipping,
      totalValue: totals.total,
      status: 'draft',
      paymentTerms: formData.paymentTerms,
      notes: formData.notes,
      createdBy: 'system' // In real app, use current user
    };

    const orderId = purchaseService.createPurchaseOrder(newOrder);
    
    if (orderId) {
      alert('Purchase order created successfully!');
      setShowCreateOrder(false);
      loadData();
    } else {
      alert('Failed to create purchase order');
    }
  };

  const handleUpdateOrderStatus = (orderId: string, newStatus: PurchaseOrder['status']) => {
    const success = purchaseService.updatePurchaseOrder(orderId, { status: newStatus });
    if (success) {
      loadData();
    }
  };

  const handleDeleteOrder = (orderId: string) => {
    const success = purchaseService.deletePurchaseOrder(orderId);
    if (success) {
      setShowDeleteConfirm(null);
      loadData();
    } else {
      alert('Cannot delete this purchase order');
    }
  };

  const handleConfirmOrder = (order: PurchaseOrder) => {
    const confirmed = window.confirm(
      `Confirm order ${order.orderNumber}?\n\n` +
      `Supplier: ${order.supplierName}\n` +
      `Items: ${order.items.length}\n` +
      `Total: ${order.totalValue.toLocaleString()} UGX\n\n` +
      `This will change the status from SENT to CONFIRMED.`
    );
    
    if (confirmed) {
      handleUpdateOrderStatus(order.id, 'confirmed');
    }
  };

  const handleReceiveOrder = (order: PurchaseOrder) => {
    const switchToReceiving = window.confirm(
      `Navigate to Receiving page for order ${order.orderNumber}?\n\n` +
      `Supplier: ${order.supplierName}\n` +
      `Items: ${order.items.length}\n` +
      `Total: ${order.totalValue.toLocaleString()} UGX\n\n` +
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
          {purchaseOrders.length === 0 ? (
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
                    <TableCell className="font-medium">{order.orderNumber}</TableCell>
                    <TableCell>{order.supplierName}</TableCell>
                    <TableCell>{new Date(order.orderDate).toLocaleDateString()}</TableCell>
                    <TableCell>{SettingsService.getInstance().formatCurrency(order.totalValue)}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusColor(order.status)}>
                        {order.status.toUpperCase()}
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
                        {order.status === 'draft' && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => handleUpdateOrderStatus(order.id, 'sent')}
                            >
                              Send
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => setShowDeleteConfirm(order.id)}
                            >
                              Delete
                            </Button>
                          </>
                        )}
                        {order.status === 'sent' && (
                          <Button
                            size="sm"
                            onClick={() => handleConfirmOrder(order)}
                          >
                            ✅ Confirm
                          </Button>
                        )}
                        {order.status === 'confirmed' && (
                          <Button
                            size="sm"
                            onClick={() => handleReceiveOrder(order)}
                          >
                            📦 Receive
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
                      {suppliers.filter(s => s.isActive).map(supplier => (
                        <SelectItem key={supplier.id} value={supplier.id}>
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
                          <TableCell>{SettingsService.getInstance().formatCurrency(item.totalCost)}</TableCell>
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
                          <span>{SettingsService.getInstance().formatCurrency(totals.subtotal)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Tax:</span>
                          <span>{SettingsService.getInstance().formatCurrency(totals.tax)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Shipping:</span>
                          <span>{SettingsService.getInstance().formatCurrency(totals.shipping)}</span>
                        </div>
                        <div className="flex justify-between font-bold text-lg border-t pt-2">
                          <span>Total:</span>
                          <span>{SettingsService.getInstance().formatCurrency(totals.total)}</span>
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
              <DialogTitle>Purchase Order Details - {selectedOrder.orderNumber}</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Supplier</Label>
                  <p className="font-medium">{selectedOrder.supplierName}</p>
                </div>
                <div>
                  <Label>Status</Label>
                  <Badge variant={getStatusColor(selectedOrder.status)}>
                    {selectedOrder.status.toUpperCase()}
                  </Badge>
                </div>
                <div>
                  <Label>Order Date</Label>
                  <p>{new Date(selectedOrder.orderDate).toLocaleDateString()}</p>
                </div>
                <div>
                  <Label>Expected Delivery</Label>
                  <p>{selectedOrder.expectedDeliveryDate ? 
                      new Date(selectedOrder.expectedDeliveryDate).toLocaleDateString() : 'Not specified'}</p>
                </div>
              </div>

              <div>
                <Label className="text-lg font-medium">Order Items</Label>
                <Table className="mt-2">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Unit Cost</TableHead>
                      <TableHead>Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedOrder.items.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell>{item.productName}</TableCell>
                        <TableCell>{item.quantityOrdered}</TableCell>
                        <TableCell>{SettingsService.getInstance().formatCurrency(item.unitCost)}</TableCell>
                        <TableCell>{SettingsService.getInstance().formatCurrency(item.totalCost)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <Card>
                <CardContent className="pt-6">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Subtotal:</span>
                      <span>{SettingsService.getInstance().formatCurrency(selectedOrder.subtotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Tax:</span>
                      <span>{SettingsService.getInstance().formatCurrency(selectedOrder.tax)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Shipping:</span>
                      <span>{SettingsService.getInstance().formatCurrency(selectedOrder.shippingCost)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-lg border-t pt-2">
                      <span>Total:</span>
                      <span>{SettingsService.getInstance().formatCurrency(selectedOrder.totalValue)}</span>
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
