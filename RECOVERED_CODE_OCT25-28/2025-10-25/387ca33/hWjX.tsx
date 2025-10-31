import React, { useState, useEffect } from 'react';
import api from '@/config/api.config';
import { formatCurrency } from '../utils/currency';
import { handleApiError, logApiRequest, parseDateInput } from '../utils/errorHandler';
import { 
  usePurchaseOrders,
  useCreatePurchaseOrder,
  useSendPurchaseOrder,
  useCancelPurchaseOrder,
  usePurchaseOrder
} from '../services/api/purchaseOrdersApi';
import { useActiveSuppliers } from '../services/api/suppliersApi';
import type { 
  PurchaseOrder, 
  PurchaseOrderStatus,
  GetPurchaseOrdersParams 
} from '../types/backend';
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
import { AlertCircle, Download } from "lucide-react";
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
import { useToast } from "./ui/toast";

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
  const { toast } = useToast();
  
  // Filters state
  const [filters, setFilters] = useState<GetPurchaseOrdersParams>({
    page: 1,
    limit: 50
  });

  // React Query hooks
  const { data: purchaseOrdersData, isLoading: isLoadingPurchases, refetch } = usePurchaseOrders(filters);
  const { data: suppliers, isLoading: isLoadingSuppliers } = useActiveSuppliers();
  const createPurchaseMutation = useCreatePurchaseOrder();
  const sendMutation = useSendPurchaseOrder();
  const cancelMutation = useCancelPurchaseOrder();

  // State - must be declared before derived data that uses it
  const [showCreateOrder, setShowCreateOrder] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [showSendConfirm, setShowSendConfirm] = useState<PurchaseOrder | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState<PurchaseOrder | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  // Export format states
  const [listExportFormat, setListExportFormat] = useState<'CSV' | 'PDF'>('CSV');
  const [itemsExportFormat, setItemsExportFormat] = useState<'CSV' | 'PDF'>('CSV');

  // Fetch full order details when viewing (hook handles enabled state internally)
  const { data: selectedOrder } = usePurchaseOrder(selectedOrderId || '');

  // Derived data - uses searchTerm so must come after state declarations
  const purchaseOrders = (purchaseOrdersData?.data || []).filter(order => 
    !searchTerm || order.poNumber.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const suppliersList = suppliers || [];
  
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

  // Refetch when filters change
  useEffect(() => {
    refetch();
  }, [filters, refetch]);

  const getStatusColor = (status: PurchaseOrderStatus) => {
    const colors = {
      DRAFT: 'secondary',
      PENDING: 'default',
      PARTIAL: 'outline',
      RECEIVED: 'default',
      CANCELLED: 'destructive'
    } as const;
    return colors[status] || 'secondary';
  };

  const handleCreateOrder = () => {
    resetForm();
    setShowCreateOrder(true);
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const exportPurchaseOrders = async () => {
    try {
      // Build params from current filters (exclude pagination)
      const params: any = {};
      if ((filters as any).status && (filters as any).status !== 'ALL') params.status = (filters as any).status;
      if ((filters as any).supplierId && (filters as any).supplierId !== 'all') params.supplierId = (filters as any).supplierId;
      if ((filters as any).startDate) params.startDate = (filters as any).startDate;
      if ((filters as any).endDate) params.endDate = (filters as any).endDate;

      if (listExportFormat === 'PDF') {
        toast({ title: 'PDF export coming soon', description: 'PDF export for purchase orders is not yet available.', variant: 'default' });
        return;
      }

      const res = await api.get('/purchase-orders/export', { responseType: 'blob', params });
      downloadBlob(res.data, `purchase-orders-${new Date().toISOString().slice(0,10)}.csv`);
      toast({ title: 'Exported', description: 'Purchase orders exported as CSV.' });
    } catch (err) {
      const msg = handleApiError(err, 'Failed to export purchase orders');
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    }
  };

  const exportSelectedOrderItems = async () => {
    try {
      if (!selectedOrderId) return;
      if (itemsExportFormat === 'PDF') {
        toast({ title: 'PDF export coming soon', description: 'PDF export for purchase order items is not yet available.', variant: 'default' });
        return;
      }
      const res = await api.get(`/purchase-orders/${selectedOrderId}/items/export`, { responseType: 'blob' });
      downloadBlob(res.data, `po-${selectedOrder?.poNumber || selectedOrderId}-items.csv`);
      toast({ title: 'Exported', description: 'Purchase order items exported as CSV.' });
    } catch (err) {
      const msg = handleApiError(err, 'Failed to export order items');
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    }
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
      toast({
        title: 'Validation Error',
        description: 'Please select a supplier and add at least one product',
        variant: 'destructive',
      });
      return;
    }

    const supplier = suppliersList.find(s => String(s.id) === formData.supplierId);
    if (!supplier) return;

    try {
      // Convert date to ISO datetime format if provided
      const expectedDeliveryDateISO = parseDateInput(formData.expectedDeliveryDate);
      
      const payload = {
        supplierId: formData.supplierId,
        orderDate: new Date().toISOString(),
        items: orderItems.map(item => ({
          productId: item.productId,
          orderedQuantity: item.quantityOrdered,
          unitPrice: item.unitCost
        })),
        expectedDeliveryDate: expectedDeliveryDateISO,
        paymentTerms: formData.paymentTerms || undefined,
        notes: formData.notes || undefined
      };
      
      // Log request in development
      logApiRequest('POST /purchase-orders', payload);
      
      await createPurchaseMutation.mutateAsync(payload);

      toast({
        title: 'Success',
        description: 'Purchase order created successfully!',
        variant: 'success',
      });
      setShowCreateOrder(false);
      resetForm();
      refetch();
    } catch (error: any) {
      const errorMessage = handleApiError(error, 'Failed to create purchase order');
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  const handleSendOrder = async () => {
    if (!showSendConfirm) return;
    
    try {
      await sendMutation.mutateAsync(showSendConfirm.id);
      toast({
        title: 'Success',
        description: `Purchase order ${showSendConfirm.poNumber} sent successfully!`,
        variant: 'success',
      });
      setShowSendConfirm(null);
      refetch();
    } catch (error: any) {
      const errorMessage = handleApiError(error, 'Failed to send purchase order');
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  const handleCancelOrder = async () => {
    if (!showCancelDialog || !cancelReason.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Please provide a cancellation reason',
        variant: 'destructive',
      });
      return;
    }

    try {
      await cancelMutation.mutateAsync({
        id: showCancelDialog.id,
        data: { reason: cancelReason }
      });
      toast({
        title: 'Success',
        description: `Purchase order ${showCancelDialog.poNumber} cancelled successfully!`,
        variant: 'success',
      });
      setShowCancelDialog(null);
      setCancelReason('');
      refetch();
    } catch (error: any) {
      const errorMessage = handleApiError(error, 'Failed to cancel purchase order');
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };  const handleReceiveOrder = (order: PurchaseOrder) => {
    const switchToReceiving = window.confirm(
      `Navigate to Receiving page for order ${order.poNumber}?\n\n` +
      `Supplier: ${order.supplier?.name || order.supplierId}\n` +
      `Total: ${formatCurrency(Number(order.totalAmount))}\n\n` +
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

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Search</Label>
              <Input
                placeholder="Search by PO number..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select
                value={filters.status || 'all'}
                onValueChange={(value) => setFilters({ ...filters, status: value === 'all' ? undefined : value as PurchaseOrderStatus })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="RECEIVED">Received</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Supplier</Label>
              <Select
                value={filters.supplierId || 'all'}
                onValueChange={(value) => setFilters({ ...filters, supplierId: value === 'all' ? undefined : value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All suppliers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Suppliers</SelectItem>
                  {suppliersList.map(supplier => (
                    <SelectItem key={supplier.id} value={String(supplier.id)}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Purchase Orders List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Purchase Orders</CardTitle>
              <CardDescription>
                Track and manage all purchase orders
              </CardDescription>
            </div>
            <div className="flex gap-2 items-center">
              <Select value={listExportFormat} onValueChange={(v) => setListExportFormat(v as 'CSV' | 'PDF')}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="Format" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CSV">CSV</SelectItem>
                  <SelectItem value="PDF">PDF</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={exportPurchaseOrders}>
                <Download className="h-4 w-4 mr-1" /> Export
              </Button>
            </div>
          </div>
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
                          onClick={() => setSelectedOrderId(order.id)}
                        >
                          View
                        </Button>
                        {order.status === 'DRAFT' && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => setShowSendConfirm(order)}
                            >
                              Send
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => setShowCancelDialog(order)}
                            >
                              Cancel
                            </Button>
                          </>
                        )}
                        {order.status === 'PENDING' && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => handleReceiveOrder(order)}
                            >
                              📦 Receive
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => setShowCancelDialog(order)}
                            >
                              Cancel
                            </Button>
                          </>
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
              {/* Alert when no suppliers */}
              {!isLoadingSuppliers && suppliersList.length === 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-yellow-800">No Suppliers Available</h4>
                      <p className="text-sm text-yellow-700 mt-1">
                        You need to add at least one active supplier before creating a purchase order.
                        Please go to the <strong>Suppliers</strong> tab to add suppliers first.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Supplier Selection */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Supplier *</Label>
                  <Select
                    value={formData.supplierId}
                    onValueChange={(value) => setFormData({ ...formData, supplierId: value })}
                    disabled={isLoadingSuppliers || suppliersList.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={
                        isLoadingSuppliers 
                          ? "Loading suppliers..." 
                          : suppliersList.length === 0 
                            ? "No active suppliers found" 
                            : "Select supplier"
                      } />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliersList.length === 0 ? (
                        <div className="p-2 text-sm text-muted-foreground text-center">
                          No active suppliers available.
                          <br />
                          Please add a supplier first.
                        </div>
                      ) : (
                        suppliersList.map(supplier => (
                          <SelectItem key={supplier.id} value={String(supplier.id)}>
                            {supplier.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {suppliersList.length === 0 && !isLoadingSuppliers && (
                    <p className="text-xs text-red-500 mt-1">
                      ⚠️ Add suppliers in the Suppliers tab first
                    </p>
                  )}
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
        <Dialog open={true} onOpenChange={() => setSelectedOrderId(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
            <DialogHeader>
              <div className="flex items-center justify-between w-full">
                <DialogTitle>Purchase Order Details - {selectedOrder.poNumber}</DialogTitle>
                <div className="flex items-center gap-2">
                  <Select value={itemsExportFormat} onValueChange={(v) => setItemsExportFormat(v as 'CSV' | 'PDF')}>
                    <SelectTrigger className="w-[120px]">
                      <SelectValue placeholder="Format" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CSV">CSV</SelectItem>
                      <SelectItem value="PDF">PDF</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={exportSelectedOrderItems}>
                    <Download className="h-4 w-4 mr-1" /> Export Items
                  </Button>
                </div>
              </div>
            </DialogHeader>
            
            <div className="space-y-6">
              {/* Header Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">PO Number</Label>
                  <p className="font-semibold">{selectedOrder.poNumber}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <div>
                    <Badge variant={getStatusColor(selectedOrder.status)}>
                      {selectedOrder.status}
                    </Badge>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Supplier Info */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Supplier Information</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Supplier Name</Label>
                    <p className="font-medium">{selectedOrder.supplier?.name || 'N/A'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Contact Person</Label>
                    <p>{selectedOrder.supplier?.contactPerson || 'N/A'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Email</Label>
                    <p>{selectedOrder.supplier?.email || 'N/A'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Phone</Label>
                    <p>{selectedOrder.supplier?.phone || 'N/A'}</p>
                  </div>
                </CardContent>
              </Card>

              {/* Dates */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="text-muted-foreground">Order Date</Label>
                  <p>{new Date(selectedOrder.orderDate || selectedOrder.createdAt).toLocaleDateString()}</p>
                </div>
                {selectedOrder.sentDate && (
                  <div>
                    <Label className="text-muted-foreground">Sent Date</Label>
                    <p>{new Date(selectedOrder.sentDate).toLocaleDateString()}</p>
                  </div>
                )}
                {selectedOrder.expectedDeliveryDate && (
                  <div>
                    <Label className="text-muted-foreground">Expected Delivery</Label>
                    <p>{new Date(selectedOrder.expectedDeliveryDate).toLocaleDateString()}</p>
                  </div>
                )}
              </div>

              {/* Items Table */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Order Items</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Quantity</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedOrder.items?.map((item: any, idx: number) => (
                        <TableRow key={idx}>
                          <TableCell>{item.product?.name || `Product ${item.productId}`}</TableCell>
                          <TableCell className="text-right">{item.quantity}</TableCell>
                          <TableCell className="text-right">{formatCurrency(Number(item.unitPrice))}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(Number(item.totalPrice))}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  
                  <div className="flex justify-between font-bold text-lg border-t mt-4 pt-4">
                    <span>Total Amount:</span>
                    <span>{formatCurrency(Number(selectedOrder.totalAmount))}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Notes */}
              {selectedOrder.notes && (
                <div>
                  <Label className="text-muted-foreground">Notes</Label>
                  <p className="text-sm bg-muted p-3 rounded-md mt-1">{selectedOrder.notes}</p>
                </div>
              )}

              {/* Cancellation Reason */}
              {selectedOrder.status === 'CANCELLED' && selectedOrder.cancellationReason && (
                <div>
                  <Label className="text-muted-foreground">Cancellation Reason</Label>
                  <p className="text-sm bg-destructive/10 text-destructive p-3 rounded-md mt-1">{selectedOrder.cancellationReason}</p>
                </div>
              )}
            </div>
            
            <DialogFooter>
              <Button onClick={() => setSelectedOrderId(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Send Confirmation */}
      {showSendConfirm && (
        <AlertDialog open={true} onOpenChange={() => setShowSendConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Send Purchase Order</AlertDialogTitle>
              <AlertDialogDescription>
                Send purchase order {showSendConfirm.poNumber} to supplier {showSendConfirm.supplier?.name || showSendConfirm.supplierId}?
                <br /><br />
                This will change the status from DRAFT to PENDING.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleSendOrder}>
                Send Order
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Cancel Confirmation */}
      {showCancelDialog && (
        <Dialog open={true} onOpenChange={() => { setShowCancelDialog(null); setCancelReason(''); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cancel Purchase Order</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Cancel purchase order {showCancelDialog.poNumber}?
              </p>
              <div>
                <Label>Cancellation Reason *</Label>
                <Textarea
                  placeholder="Enter reason for cancellation..."
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowCancelDialog(null); setCancelReason(''); }}>
                Back
              </Button>
              <Button variant="destructive" onClick={handleCancelOrder}>
                Cancel Order
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default PurchaseOrderManagement;


