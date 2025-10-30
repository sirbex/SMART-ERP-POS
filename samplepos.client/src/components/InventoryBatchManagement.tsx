import React, { useState, useEffect } from 'react';
import api from '@/config/api.config';
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Checkbox } from "./ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Badge } from "./ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { AlertTriangle, Package, Plus, Truck, Eye, AlertCircle, TrendingUp, TrendingDown } from "lucide-react";

import InventoryBatchServiceAPI from '../services/InventoryBatchServiceAPI';
import type { Product, PurchaseReceiving, PurchaseReceivingItem, ProductStockSummary, InventoryBatch } from '../types';
import { toSelectValue } from '../utils/selectHelpers';

const InventoryBatchManagement: React.FC = () => {
  const inventoryService = new InventoryBatchServiceAPI();

  // State
  const [products, setProducts] = useState<Product[]>([]);
  const [stockSummaries, setStockSummaries] = useState<ProductStockSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Search and filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'low_stock' | 'expired' | 'expiring_soon'>('all');



  // Modal states
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [showBatchDetails, setShowBatchDetails] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productBatches, setProductBatches] = useState<InventoryBatch[]>([]);

  // Form states
  const [productForm, setProductForm] = useState<Partial<Product>>({
    name: '',
    sku: '',
    category: '',
    unit: 'pcs',
    hasExpiry: false,
    expiryAlertDays: 30,
    reorderLevel: 10,
    isActive: true
  });

  const [purchaseForm, setPurchaseForm] = useState<Partial<PurchaseReceiving>>({
    supplier: '',
    receivedBy: 'Current User',
    receivedDate: new Date().toISOString().split('T')[0],
    items: [],
    notes: ''
  });

  const [purchaseItem, setPurchaseItem] = useState<Partial<PurchaseReceivingItem>>({
    productId: '',
    productName: '',
    batchNumber: '',
    quantityReceived: 0,
    unitCost: 0,
    expiryDate: '',
    manufacturingDate: '',
    location: '',
    notes: ''
  });

  // Load data
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Fetch products from new backend API
      const response = await api.get('/products?limit=1000');
      const productsData = response.data?.data || [];
      
      // Transform data to match our component structure
      const loadedProducts: Product[] = productsData.map((item: any) => ({
        id: item.id.toString(),
        name: item.name,
        sku: item.barcode || item.id,
        category: item.category || 'Uncategorized',
        unit: item.baseUnit || 'pcs',
        hasExpiry: false, // Can be enhanced based on product metadata
        expiryAlertDays: 30,
        reorderLevel: Number(item.reorderLevel) || 10,
        price: Number(item.sellingPrice) || 0,
        costPrice: Number(item.costPrice) || 0,
        description: item.description || '',
        isActive: item.isActive !== false,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
      }));
      
      // Create stock summaries from products data
      const summaries: ProductStockSummary[] = productsData.map((item: any) => ({
        productId: item.id.toString(),
        productName: item.name,
        totalQuantity: Number(item.currentStock) || 0,
        availableQuantity: Number(item.currentStock) || 0,
        expiredQuantity: 0, // Will be properly calculated from batches if needed
        expiringSoonQuantity: 0,
        batchCount: 0, // Can be fetched from /api/inventory/batches if needed
        earliestExpiry: null,
        averageCost: Number(item.costPrice) || 0,
        totalValue: (Number(item.currentStock) || 0) * (Number(item.costPrice) || 0),
        reorderLevel: Number(item.reorderLevel) || 10,
        isLowStock: (Number(item.currentStock) || 0) < (Number(item.reorderLevel) || 10),
        hasExpiredStock: false,
        hasExpiringSoonStock: false
      }));
      
      setProducts(loadedProducts);
      setStockSummaries(summaries);

    } catch (err) {
      setError('Failed to load inventory data');
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Handlers
  const handleAddProduct = async () => {
    try {
      if (!productForm.name) {
        setError('Product name is required');
        return;
      }

      if (productForm.id) {
        // Update existing product
        const updatedProduct: Product = {
          ...products.find(p => p.id === productForm.id)!,
          name: productForm.name,
          sku: productForm.sku || `SKU-${Date.now()}`,
          category: productForm.category || 'General',
          unit: productForm.unit || 'pcs',
          hasExpiry: productForm.hasExpiry || false,
          expiryAlertDays: productForm.expiryAlertDays || 30,
          reorderLevel: productForm.reorderLevel || 10,
          price: typeof productForm.price === 'number' ? productForm.price : 0,
          costPrice: typeof productForm.costPrice === 'number' ? productForm.costPrice : 0,
          maxStockLevel: productForm.maxStockLevel,
          description: productForm.description,
          supplier: productForm.supplier,
          location: productForm.location,
          isActive: true,
          updatedAt: new Date().toISOString()
        };

        const updateSuccess = await inventoryService.updateProduct(updatedProduct);
        if (updateSuccess) {
          setSuccess('Product updated successfully!');
          setProductForm({
            name: '', sku: '', category: '', unit: 'pcs', hasExpiry: false,
            expiryAlertDays: 30, reorderLevel: 10, isActive: true
          });
          setShowAddProduct(false);
          await loadData();
        } else {
          setError('Failed to update product');
        }
      } else {
        // Add new product
        const newProduct: Product = {
          id: `product-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: productForm.name,
          sku: productForm.sku || `SKU-${Date.now()}`,
          category: productForm.category || 'General',
          unit: productForm.unit || 'pcs',
          hasExpiry: productForm.hasExpiry || false,
          expiryAlertDays: productForm.expiryAlertDays || 30,
          reorderLevel: productForm.reorderLevel || 10,
          price: typeof productForm.price === 'number' ? productForm.price : 0,
          costPrice: typeof productForm.costPrice === 'number' ? productForm.costPrice : 0,
          maxStockLevel: productForm.maxStockLevel,
          description: productForm.description,
          supplier: productForm.supplier,
          location: productForm.location,
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        const saveSuccess = await inventoryService.saveProduct(newProduct);
        if (saveSuccess) {
          setSuccess('Product added successfully!');
          setProductForm({
            name: '', sku: '', category: '', unit: 'pcs', hasExpiry: false,
            expiryAlertDays: 30, reorderLevel: 10, isActive: true
          });
          setShowAddProduct(false);
          await loadData();
        } else {
          setError('Failed to save product');
        }
      }
    } catch (err) {
      setError('Error saving product');
      console.error('Error saving product:', err);
    }
  };

  const handleAddToPurchase = () => {
    try {
      if (!purchaseItem.productId || !purchaseItem.batchNumber || !purchaseItem.quantityReceived || !purchaseItem.unitCost) {
        setError('Please fill all required fields');
        return;
      }

      const selectedProd = products.find(p => p.id === purchaseItem.productId);
      if (!selectedProd) {
        setError('Selected product not found');
        return;
      }

      const newItem: PurchaseReceivingItem = {
        productId: purchaseItem.productId,
        productName: selectedProd.name,
        batchNumber: purchaseItem.batchNumber,
        quantity: purchaseItem.quantityReceived,
        quantityReceived: purchaseItem.quantityReceived,
        unitCost: purchaseItem.unitCost,
        total: purchaseItem.quantityReceived * purchaseItem.unitCost,
        totalCost: purchaseItem.quantityReceived * purchaseItem.unitCost,
        expiryDate: purchaseItem.expiryDate || undefined,
        manufacturingDate: purchaseItem.manufacturingDate || undefined,
        supplierBatchRef: purchaseItem.supplierBatchRef,
        location: purchaseItem.location || 'Main Warehouse',
        notes: purchaseItem.notes
      };

      setPurchaseForm(prev => ({
        ...prev,
        items: [...(prev.items || []), newItem]
      }));

      // Reset purchase item form
      setPurchaseItem({
        productId: '', productName: '', batchNumber: '', quantityReceived: 0,
        unitCost: 0, expiryDate: '', manufacturingDate: '', location: '', notes: ''
      });

    } catch (err) {
      setError('Error adding item to purchase');
      console.error('Error adding item to purchase:', err);
    }
  };

  const handleReceivePurchase = async () => {
    try {
      if (!purchaseForm.supplier || !purchaseForm.items || purchaseForm.items.length === 0) {
        setError('Please add supplier and at least one item');
        return;
      }

      const purchase: PurchaseReceiving = {
        id: `purchase-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        purchaseOrderNumber: `PO-${Date.now()}`,
        supplierId: 1, // Default supplier ID
        supplier: purchaseForm.supplier,
        receivedBy: purchaseForm.receivedBy || 'Current User',
        receivedDate: purchaseForm.receivedDate || new Date().toISOString().split('T')[0],
        items: purchaseForm.items,
        totalQuantity: purchaseForm.items.reduce((sum, item) => sum + (item.quantity || item.quantityReceived || 0), 0),
        totalCost: purchaseForm.items.reduce((sum, item) => sum + (item.total || item.totalCost || 0), 0),
        totalValue: purchaseForm.items.reduce((sum, item) => sum + (item.totalCost || 0), 0),
        status: 'complete',
        notes: purchaseForm.notes,
        createdAt: new Date().toISOString()
      };

      const purchaseSuccess = await inventoryService.receivePurchase(purchase);
      if (purchaseSuccess) {
        setSuccess(`Purchase received successfully! ${purchase.items.length} items added to inventory.`);
        setPurchaseForm({
          supplier: '', receivedBy: 'Current User',
          receivedDate: new Date().toISOString().split('T')[0], items: [], notes: ''
        });
        setShowPurchaseModal(false);
        await loadData();
      } else {
        setError('Failed to receive purchase');
      }

    } catch (err) {
      setError('Error processing purchase');
      console.error('Error processing purchase:', err);
    }
  };

  const handleRemovePurchaseItem = (index: number) => {
    setPurchaseForm(prev => ({
      ...prev,
      items: prev.items?.filter((_, i) => i !== index) || []
    }));
  };

  // Filtered and sorted data
  const filteredSummaries = stockSummaries.filter(summary => {
    const matchesSearch = summary.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         String(summary.productId).toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = filterCategory === 'all' || 
      products.find(p => p.id === summary.productId)?.category === filterCategory;
    
    const matchesStatus = filterStatus === 'all' ||
      (filterStatus === 'low_stock' && summary.isLowStock) ||
      (filterStatus === 'expired' && summary.hasExpiredStock) ||
      (filterStatus === 'expiring_soon' && summary.hasExpiringSoonStock);
    
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const categories = [...new Set(products.map(p => p.category).filter(Boolean))];

  // Format currency
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  // Auto-clear messages
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  // Fetch product batches when selectedProduct changes
  useEffect(() => {
    const fetchBatches = async () => {
      if (selectedProduct?.id) {
        try {
          const batches = await inventoryService.getProductBatches(selectedProduct.id, true);
          setProductBatches(batches);
        } catch (error) {
          console.error('Error fetching product batches:', error);
          setProductBatches([]);
        }
      } else {
        setProductBatches([]);
      }
    };
    
    fetchBatches();
  }, [selectedProduct?.id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-7xl mx-auto">
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-muted-foreground">Loading inventory data...</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-2 sm:p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
        
        {/* Header */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle className="text-xl sm:text-2xl lg:text-3xl font-bold flex items-center gap-2">
                  <Package className="h-6 w-6 sm:h-8 sm:w-8" />
                  Inventory Batch Management
                </CardTitle>
                <CardDescription className="text-sm sm:text-base">
                  Manage products, batches, and track inventory with FIFO system
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Dialog open={showAddProduct} onOpenChange={setShowAddProduct}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="gap-2">
                      <Plus className="h-4 w-4" />
                      <span className="hidden sm:inline">Add Product</span>
                      <span className="sm:hidden">Product</span>
                    </Button>
                  </DialogTrigger>
                </Dialog>
                
                <Dialog open={showPurchaseModal} onOpenChange={setShowPurchaseModal}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className="gap-2">
                      <Truck className="h-4 w-4" />
                      <span className="hidden sm:inline">Receive Purchase</span>
                      <span className="sm:hidden">Purchase</span>
                    </Button>
                  </DialogTrigger>
                </Dialog>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {/* Statistics */}
            <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 mb-6">
              <Card className="p-2 sm:p-3 lg:p-4">
                <div className="flex flex-col xs:flex-row items-start xs:items-center gap-1 xs:gap-2">
                  <Package className="h-4 w-4 text-blue-600 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-base sm:text-lg lg:text-xl font-bold truncate">{products.length}</div>
                    <div className="text-xs text-muted-foreground truncate">Total Products</div>
                  </div>
                </div>
              </Card>

              <Card className="p-2 sm:p-3 lg:p-4">
                <div className="flex flex-col xs:flex-row items-start xs:items-center gap-1 xs:gap-2">
                  <TrendingDown className="h-4 w-4 text-red-600 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-base sm:text-lg lg:text-xl font-bold text-red-600 truncate">
                      {stockSummaries.filter(s => s.isLowStock).length}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">Low Stock</div>
                  </div>
                </div>
              </Card>

              <Card className="p-2 sm:p-3 lg:p-4">
                <div className="flex flex-col xs:flex-row items-start xs:items-center gap-1 xs:gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-600 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-base sm:text-lg lg:text-xl font-bold text-orange-600 truncate">
                      {stockSummaries.filter(s => s.hasExpiringSoonStock).length}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">Expiring Soon</div>
                  </div>
                </div>
              </Card>

              <Card className="p-2 sm:p-3 lg:p-4">
                <div className="flex flex-col xs:flex-row items-start xs:items-center gap-1 xs:gap-2">
                  <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-base sm:text-lg lg:text-xl font-bold text-red-600 truncate">
                      {stockSummaries.filter(s => s.hasExpiredStock).length}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">Expired Stock</div>
                  </div>
                </div>
              </Card>

              <Card className="p-2 sm:p-3 lg:p-4">
                <div className="flex flex-col xs:flex-row items-start xs:items-center gap-1 xs:gap-2">
                  <TrendingUp className="h-4 w-4 text-green-600 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-base sm:text-lg lg:text-xl font-bold text-green-600 truncate">
                      {formatCurrency(stockSummaries.reduce((sum, s) => sum + s.totalValue, 0))}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">Total Value</div>
                  </div>
                </div>
              </Card>
            </div>
          </CardContent>
        </Card>

        {/* Status Messages */}
        {error && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-red-800">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm sm:text-base">{error}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {success && (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="pt-6">
              <p className="text-green-800 text-sm sm:text-base">{success}</p>
            </CardContent>
          </Card>
        )}


                {/* Search and Filters */}
            <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <Input
                placeholder="Search products..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1"
              />
              
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map(category => (
                    <SelectItem key={category} value={category!}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value as any)}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="low_stock">Low Stock</SelectItem>
                  <SelectItem value="expiring_soon">Expiring Soon</SelectItem>
                  <SelectItem value="expired">Expired Stock</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

            {/* Inventory Table */}
            <Card>
          <CardHeader>
            <CardTitle className="text-lg sm:text-xl">Product Inventory ({filteredSummaries.length})</CardTitle>
            <CardDescription>Stock levels, batches, and expiry information</CardDescription>
          </CardHeader>
          
          <CardContent>
            {filteredSummaries.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                <p className="text-lg font-medium">No products found</p>
                <p className="text-sm">Add products and receive inventory to get started</p>
              </div>
            ) : (
              <>
                {/* Desktop Table View */}
                <div className="hidden md:block rounded-md border overflow-x-auto">
                  <table className="w-full min-w-[800px]">
                  <thead className="border-b bg-muted/50">
                    <tr>
                      <th className="p-3 text-left font-medium">Product</th>
                      <th className="p-3 text-left font-medium">Available Qty</th>
                      <th className="p-3 text-left font-medium">Total Qty</th>
                      <th className="p-3 text-left font-medium">Batches</th>
                      <th className="p-3 text-left font-medium">Price</th>
                      <th className="p-3 text-left font-medium">Earliest Expiry</th>
                      <th className="p-3 text-left font-medium">Avg Cost</th>
                      <th className="p-3 text-left font-medium">Total Value</th>
                      <th className="p-3 text-left font-medium">Status</th>
                      <th className="p-3 text-left font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSummaries.map((summary) => (
                      <tr key={summary.productId} className="border-b hover:bg-muted/30">
                        <td className="p-3">
                          <div>
                            <div className="font-medium">{summary.productName}</div>
                            <div className="text-sm text-muted-foreground">
                              {products.find(p => p.id === summary.productId)?.sku || 'No SKU'}
                            </div>
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="font-medium">{summary.availableQuantity}</div>
                          {summary.expiredQuantity > 0 && (
                            <div className="text-xs text-red-600">
                              {summary.expiredQuantity} expired
                            </div>
                          )}
                        </td>
                        <td className="p-3 font-medium">{summary.totalQuantity}</td>
                        <td className="p-3">{summary.batchCount}</td>
                        <td className="p-3 font-medium">
                          {formatCurrency(products.find(p => p.id === summary.productId)?.price || 0)}
                        </td>
                        <td className="p-3">
                          {summary.earliestExpiry ? (
                            <div className={`text-sm ${
                              summary.hasExpiredStock ? 'text-red-600' :
                              summary.hasExpiringSoonStock ? 'text-orange-600' : 'text-muted-foreground'
                            }`}>
                              {new Date(summary.earliestExpiry).toLocaleDateString()}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">No expiry</span>
                          )}
                        </td>
                        <td className="p-3 font-medium">{formatCurrency(summary.averageCost)}</td>
                        <td className="p-3 font-medium">{formatCurrency(summary.totalValue)}</td>
                        <td className="p-3">
                          <div className="flex flex-col gap-1">
                            {summary.isLowStock && (
                              <Badge variant="destructive" className="text-xs">
                                Low Stock
                              </Badge>
                            )}
                            {summary.hasExpiredStock && (
                              <Badge variant="destructive" className="text-xs">
                                Expired
                              </Badge>
                            )}
                            {summary.hasExpiringSoonStock && (
                              <Badge variant="outline" className="text-xs text-orange-600 border-orange-600">
                                Expiring Soon
                              </Badge>
                            )}
                            {!summary.isLowStock && !summary.hasExpiredStock && !summary.hasExpiringSoonStock && (
                              <Badge variant="default" className="text-xs">
                                Good
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex gap-2">
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => {
                                setSelectedProduct(products.find(p => p.id === summary.productId) || null);
                                setShowBatchDetails(true);
                              }}
                              className="gap-1"
                            >
                              <Eye className="h-3 w-3" />
                              <span className="hidden sm:inline">Batches</span>
                            </Button>
                            <Button 
                              size="sm" 
                              variant="secondary"
                              onClick={() => {
                                const product = products.find(p => p.id === summary.productId);
                                if (product) {
                                  setProductForm({
                                    ...product,
                                    price: product.price || 0
                                  });
                                  setShowAddProduct(true);
                                }
                              }}
                              className="gap-1"
                            >
                              <span className="hidden sm:inline">Edit</span>
                              <span className="sm:hidden">✏️</span>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="block md:hidden space-y-3">
                {filteredSummaries.map((summary) => (
                  <Card key={summary.productId} className="p-3">
                    <div className="space-y-3">
                      {/* Product Header */}
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-medium truncate">{summary.productName}</h3>
                          <p className="text-sm text-muted-foreground truncate">
                            {products.find(p => p.id === summary.productId)?.sku || 'No SKU'}
                          </p>
                        </div>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => {
                            setSelectedProduct(products.find(p => p.id === summary.productId) || null);
                            setShowBatchDetails(true);
                          }}
                          className="ml-2 flex-shrink-0"
                        >
                          <Eye className="h-3 w-3" />
                        </Button>
                      </div>

                      {/* Status Badges */}
                      <div className="flex flex-wrap gap-1">
                        {summary.isLowStock && (
                          <Badge variant="destructive" className="text-xs">
                            Low Stock
                          </Badge>
                        )}
                        {summary.hasExpiredStock && (
                          <Badge variant="destructive" className="text-xs">
                            Expired
                          </Badge>
                        )}
                        {summary.hasExpiringSoonStock && (
                          <Badge variant="outline" className="text-xs text-orange-600 border-orange-600">
                            Expiring Soon
                          </Badge>
                        )}
                        {!summary.isLowStock && !summary.hasExpiredStock && !summary.hasExpiringSoonStock && (
                          <Badge variant="default" className="text-xs">
                            Good
                          </Badge>
                        )}
                      </div>

                      {/* Stats Grid */}
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <div className="text-muted-foreground">Available</div>
                          <div className="font-medium">
                            {summary.availableQuantity}
                            {summary.expiredQuantity > 0 && (
                              <span className="text-xs text-red-600 ml-1">
                                ({summary.expiredQuantity} expired)
                              </span>
                            )}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Total Qty</div>
                          <div className="font-medium">{summary.totalQuantity}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Selling Price</div>
                          <div className="font-medium">{formatCurrency(products.find(p => p.id === summary.productId)?.price || 0)}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Batches</div>
                          <div className="font-medium">{summary.batchCount}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Avg Cost</div>
                          <div className="font-medium">{formatCurrency(summary.averageCost)}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Total Value</div>
                          <div className="font-medium">{formatCurrency(summary.totalValue)}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Earliest Expiry</div>
                          <div className={`font-medium text-sm ${
                            summary.hasExpiredStock ? 'text-red-600' :
                            summary.hasExpiringSoonStock ? 'text-orange-600' : 'text-muted-foreground'
                          }`}>
                            {summary.earliestExpiry ? 
                              new Date(summary.earliestExpiry).toLocaleDateString() : 
                              'No expiry'
                            }
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </>
            )}
          </CardContent>
        </Card>

            {/* Add/Edit Product Modal */}
            <Dialog open={showAddProduct} onOpenChange={setShowAddProduct}>
          <DialogContent className="w-[95vw] max-w-md max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{productForm.id ? 'Edit Product' : 'Add New Product'}</DialogTitle>
              <DialogDescription>
                {productForm.id ? 'Update product information' : 'Create a new product in the inventory system'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="product-name">Product Name *</Label>
                <Input
                  id="product-name"
                  value={productForm.name || ''}
                  onChange={(e) => setProductForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter product name"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="product-sku">SKU</Label>
                  <Input
                    id="product-sku"
                    value={productForm.sku || ''}
                    onChange={(e) => setProductForm(prev => ({ ...prev, sku: e.target.value }))}
                    placeholder="Auto-generated"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="product-category">Category</Label>
                  <Input
                    id="product-category"
                    value={productForm.category || ''}
                    onChange={(e) => setProductForm(prev => ({ ...prev, category: e.target.value }))}
                    placeholder="e.g. Medicine, Food"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="product-unit">Unit</Label>
                  <Select 
                    value={productForm.unit} 
                    onValueChange={(value) => setProductForm(prev => ({ ...prev, unit: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pcs">Pieces</SelectItem>
                      <SelectItem value="box">Box</SelectItem>
                      <SelectItem value="pack">Pack</SelectItem>
                      <SelectItem value="bottle">Bottle</SelectItem>
                      <SelectItem value="kg">Kilogram</SelectItem>
                      <SelectItem value="liter">Liter</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="product-reorder">Reorder Level</Label>
                  <Input
                    id="product-reorder"
                    type="number"
                    min="0"
                    value={productForm.reorderLevel || ''}
                    onChange={(e) => setProductForm(prev => ({ ...prev, reorderLevel: parseInt(e.target.value) || 0 }))}
                    placeholder="10"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="product-price">Selling Price</Label>
                  <Input
                    id="product-price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={productForm.price !== undefined ? productForm.price : ''}
                    onChange={(e) => setProductForm(prev => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
                    placeholder="0.00"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="product-cost">Cost Price</Label>
                  <Input
                    id="product-cost"
                    type="number"
                    min="0"
                    step="0.01"
                    value={productForm.costPrice !== undefined ? productForm.costPrice : ''}
                    onChange={(e) => setProductForm(prev => ({ ...prev, costPrice: parseFloat(e.target.value) || 0 }))}
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="has-expiry"
                    checked={productForm.hasExpiry || false}
                    onCheckedChange={(checked) => setProductForm(prev => ({ ...prev, hasExpiry: !!checked }))}
                  />
                  <Label htmlFor="has-expiry">This product has expiry dates</Label>
                </div>

                {productForm.hasExpiry && (
                  <div className="space-y-2">
                    <Label htmlFor="expiry-alert">Alert Days Before Expiry</Label>
                    <Input
                      id="expiry-alert"
                      type="number"
                      min="1"
                      value={productForm.expiryAlertDays || ''}
                      onChange={(e) => setProductForm(prev => ({ ...prev, expiryAlertDays: parseInt(e.target.value) || 30 }))}
                      placeholder="30"
                    />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="product-description">Description (Optional)</Label>
                <Textarea
                  id="product-description"
                  value={productForm.description || ''}
                  onChange={(e) => setProductForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Product description or notes"
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setShowAddProduct(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddProduct}>
                {productForm.id ? 'Update Product' : 'Add Product'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

            {/* Purchase Receiving Modal */}
            <Dialog open={showPurchaseModal} onOpenChange={setShowPurchaseModal}>
          <DialogContent className="w-[95vw] max-w-4xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Truck className="h-5 w-5" />
                Receive Purchase
              </DialogTitle>
              <DialogDescription>
                Record received inventory items and create batches
              </DialogDescription>
            </DialogHeader>

            <Tabs defaultValue="purchase-info" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="purchase-info">Purchase Info</TabsTrigger>
                <TabsTrigger value="items">Items ({purchaseForm.items?.length || 0})</TabsTrigger>
              </TabsList>

              <TabsContent value="purchase-info" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="supplier">Supplier *</Label>
                    <Input
                      id="supplier"
                      value={purchaseForm.supplier || ''}
                      onChange={(e) => setPurchaseForm(prev => ({ ...prev, supplier: e.target.value }))}
                      placeholder="Enter supplier name"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="received-by">Received By</Label>
                    <Input
                      id="received-by"
                      value={purchaseForm.receivedBy || ''}
                      onChange={(e) => setPurchaseForm(prev => ({ ...prev, receivedBy: e.target.value }))}
                      placeholder="Your name"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="received-date">Received Date</Label>
                    <Input
                      id="received-date"
                      type="date"
                      value={purchaseForm.receivedDate || ''}
                      onChange={(e) => setPurchaseForm(prev => ({ ...prev, receivedDate: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="purchase-notes">Notes (Optional)</Label>
                  <Textarea
                    id="purchase-notes"
                    value={purchaseForm.notes || ''}
                    onChange={(e) => setPurchaseForm(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Purchase notes or comments"
                    rows={3}
                  />
                </div>
              </TabsContent>

              <TabsContent value="items" className="space-y-4">
                {/* Add Item Form */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Add Item to Purchase</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="item-product">Product *</Label>
                        <Select 
                          value={toSelectValue(purchaseItem.productId)} 
                          onValueChange={(value) => {
                            const product = products.find(p => p.id === value);
                            setPurchaseItem(prev => ({ 
                              ...prev, 
                              productId: value,
                              productName: product?.name || ''
                            }));
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select product" />
                          </SelectTrigger>
                          <SelectContent>
                            {products.map(product => (
                              <SelectItem key={product.id} value={toSelectValue(product.id)}>
                                {product.name} ({product.sku})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="item-batch">Batch Number *</Label>
                        <Input
                          id="item-batch"
                          value={purchaseItem.batchNumber || ''}
                          onChange={(e) => setPurchaseItem(prev => ({ ...prev, batchNumber: e.target.value }))}
                          placeholder="Batch/Lot number"
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="item-quantity">Quantity Received *</Label>
                        <Input
                          id="item-quantity"
                          type="number"
                          min="0"
                          value={purchaseItem.quantityReceived || ''}
                          onChange={(e) => setPurchaseItem(prev => ({ ...prev, quantityReceived: parseInt(e.target.value) || 0 }))}
                          placeholder="0"
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="item-cost">Unit Cost *</Label>
                        <Input
                          id="item-cost"
                          type="number"
                          min="0"
                          step="0.01"
                          value={purchaseItem.unitCost || ''}
                          onChange={(e) => setPurchaseItem(prev => ({ ...prev, unitCost: parseFloat(e.target.value) || 0 }))}
                          placeholder="0.00"
                          required
                        />
                      </div>

                      {/* Show expiry fields only if product has expiry */}
                      {purchaseItem.productId && products.find(p => p.id === purchaseItem.productId)?.hasExpiry && (
                        <>
                          <div className="space-y-2">
                            <Label htmlFor="item-expiry">Expiry Date</Label>
                            <Input
                              id="item-expiry"
                              type="date"
                              value={purchaseItem.expiryDate || ''}
                              onChange={(e) => setPurchaseItem(prev => ({ ...prev, expiryDate: e.target.value }))}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="item-mfg">Manufacturing Date</Label>
                            <Input
                              id="item-mfg"
                              type="date"
                              value={purchaseItem.manufacturingDate || ''}
                              onChange={(e) => setPurchaseItem(prev => ({ ...prev, manufacturingDate: e.target.value }))}
                            />
                          </div>
                        </>
                      )}
                    </div>

                    <Button onClick={handleAddToPurchase} className="w-full">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Item to Purchase
                    </Button>
                  </CardContent>
                </Card>

                {/* Items List */}
                {purchaseForm.items && purchaseForm.items.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Items in Purchase</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {purchaseForm.items.map((item, index) => (
                          <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                            <div className="space-y-1">
                              <div className="font-medium">{item.productName}</div>
                              <div className="text-sm text-muted-foreground">
                                Batch: {item.batchNumber} • Qty: {item.quantityReceived} • 
                                Cost: {formatCurrency(item.unitCost)} • 
                                Total: {formatCurrency(item.totalCost)}
                                {item.expiryDate && ` • Expires: ${new Date(item.expiryDate).toLocaleDateString()}`}
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleRemovePurchaseItem(index)}
                            >
                              Remove
                            </Button>
                          </div>
                        ))}
                        
                        <div className="border-t pt-3">
                          <div className="text-right font-medium">
                            Total Value: {formatCurrency(
                              purchaseForm.items.reduce((sum, item) => sum + (item.totalCost || 0), 0)
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </Tabs>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setShowPurchaseModal(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleReceivePurchase}
                disabled={!purchaseForm.supplier || !purchaseForm.items || purchaseForm.items.length === 0}
              >
                Receive Purchase
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

            {/* Batch Details Modal */}
            <Dialog open={showBatchDetails} onOpenChange={setShowBatchDetails}>
          <DialogContent className="w-[95vw] max-w-4xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Batch Details - {selectedProduct?.name}
              </DialogTitle>
              <DialogDescription>
                View all batches for this product with expiry and quantity details
              </DialogDescription>
            </DialogHeader>

            {selectedProduct && (
              <div className="space-y-4">
                {/* Product Summary */}
                <Card>
                  <CardContent className="pt-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <div className="font-medium text-muted-foreground">SKU</div>
                        <div>{selectedProduct.sku}</div>
                      </div>
                      <div>
                        <div className="font-medium text-muted-foreground">Category</div>
                        <div>{selectedProduct.category}</div>
                      </div>
                      <div>
                        <div className="font-medium text-muted-foreground">Unit</div>
                        <div>{selectedProduct.unit}</div>
                      </div>
                      <div>
                        <div className="font-medium text-muted-foreground">Reorder Level</div>
                        <div>{selectedProduct.reorderLevel}</div>
                      </div>
                      <div>
                        <div className="font-medium text-muted-foreground">Selling Price</div>
                        <div>{formatCurrency(selectedProduct.price || 0)}</div>
                      </div>
                      <div>
                        <div className="font-medium text-muted-foreground">Cost Price</div>
                        <div>{formatCurrency(selectedProduct.costPrice || 0)}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Batches Table */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Current Batches</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {productBatches.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                        <p>No batches found for this product</p>
                      </div>
                    ) : (
                      <div className="rounded-md border overflow-x-auto">
                        <table className="w-full min-w-[600px]">
                          <thead className="border-b bg-muted/50">
                            <tr>
                              <th className="p-3 text-left font-medium">Batch Number</th>
                              <th className="p-3 text-left font-medium">Quantity</th>
                              <th className="p-3 text-left font-medium">Cost Price</th>
                              <th className="p-3 text-left font-medium">Expiry Date</th>
                              <th className="p-3 text-left font-medium">Received Date</th>
                              <th className="p-3 text-left font-medium">Supplier</th>
                              <th className="p-3 text-left font-medium">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {productBatches.map((batch: InventoryBatch) => (
                              <tr key={batch.id} className="border-b hover:bg-muted/30">
                                <td className="p-3 font-medium">{batch.batchNumber}</td>
                                <td className="p-3">{batch.quantity}</td>
                                <td className="p-3">{formatCurrency(batch.costPrice)}</td>
                                <td className="p-3">
                                  {batch.expiryDate ? (
                                    <div className={`text-sm ${
                                      inventoryService.isBatchExpired(batch) ? 'text-red-600' :
                                      inventoryService.isBatchExpiringSoon(batch, selectedProduct.expiryAlertDays) ? 'text-orange-600' : 'text-muted-foreground'
                                    }`}>
                                      {new Date(batch.expiryDate).toLocaleDateString()}
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground text-sm">No expiry</span>
                                  )}
                                </td>
                                <td className="p-3 text-muted-foreground text-sm">
                                  {new Date(batch.receivedDate).toLocaleDateString()}
                                </td>
                                <td className="p-3 text-muted-foreground text-sm">{batch.supplier || 'N/A'}</td>
                                <td className="p-3">
                                  <Badge 
                                    variant={
                                      batch.status === 'depleted' ? 'secondary' :
                                      inventoryService.isBatchExpired(batch) ? 'destructive' :
                                      inventoryService.isBatchExpiringSoon(batch, selectedProduct.expiryAlertDays) ? 'outline' : 'default'
                                    }
                                    className={
                                      inventoryService.isBatchExpiringSoon(batch, selectedProduct.expiryAlertDays) && !inventoryService.isBatchExpired(batch)
                                        ? 'text-orange-600 border-orange-600' : ''
                                    }
                                  >
                                    {inventoryService.isBatchExpired(batch) ? 'Expired' :
                                     inventoryService.isBatchExpiringSoon(batch, selectedProduct.expiryAlertDays) ? 'Expiring Soon' :
                                     batch.status === 'depleted' ? 'Depleted' : 'Active'}
                                  </Badge>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </DialogContent>
        </Dialog>

      </div>
    </div>
  );
};

export default InventoryBatchManagement;

