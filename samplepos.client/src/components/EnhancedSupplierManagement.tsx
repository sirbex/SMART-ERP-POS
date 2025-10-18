/**
 * Enhanced Supplier Management Component
 * Comprehensive supplier management with item catalogs, purchase history, and performance analytics
 */

import React, { useState, useEffect } from 'react';
import { formatCurrency } from '../utils/currency';
import './EnhancedSupplierManagement.css';
import PurchaseManagementService from '../services/PurchaseManagementService';
import SupplierCatalogService from '../services/SupplierCatalogService';
import type { Supplier } from '../types';
import type { 
  SupplierItem, 
  DetailedPurchaseHistory,
  SupplierPerformanceMetrics 
} from '../types';

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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "./ui/tabs";
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

interface SupplierDetailView {
  supplier: Supplier;
  performance: SupplierPerformanceMetrics;
  items: SupplierItem[];
  purchaseHistory: DetailedPurchaseHistory[];
}

const EnhancedSupplierManagement: React.FC = () => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [selectedSupplierView, setSelectedSupplierView] = useState<SupplierDetailView | null>(null);
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<SupplierItem | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    contactPerson: '',
    email: '',
    phone: '',
    address: '',
    paymentTerms: '',
    notes: ''
  });

  // Item form state
  const [itemFormData, setItemFormData] = useState({
    productId: '',
    productName: '',
    supplierPartNumber: '',
    supplierDescription: '',
    unitOfMeasure: '',
    packSize: 1,
    minimumOrderQuantity: 1,
    leadTimeDays: 7,
    currentPrice: 0,
    currency: 'USD',
    qualityRating: 5,
    preferredSupplier: false,
    certifications: '',
    shelfLife: 0,
    storageRequirements: '',
    notes: ''
  });

  const purchaseService = PurchaseManagementService.getInstance();
  const catalogService = SupplierCatalogService.getInstance();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setSuppliers(purchaseService.getSuppliers());
  };

  const handleCreateSupplier = () => {
    const newSupplier: Supplier = {
      ...formData,
      id: `supplier-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      const success = purchaseService.saveSupplier(newSupplier);
      if (success) {
        setShowCreateModal(false);
        resetForm();
        loadData();
      } else {
        alert('Failed to create supplier');
      }
    } catch (error) {
      alert('Failed to create supplier');
    }
  };

  const handleUpdateSupplier = () => {
    if (!editingSupplier) return;

    const updatedSupplier: Supplier = {
      ...editingSupplier,
      ...formData,
      updatedAt: new Date().toISOString()
    };

    const success = purchaseService.saveSupplier(updatedSupplier);
    if (success) {
      setEditingSupplier(null);
      resetForm();
      loadData();
    } else {
      alert('Failed to update supplier');
    }
  };

  const handleDeleteSupplier = (supplierId: string) => {
    const success = purchaseService.deleteSupplier(supplierId);
    if (success) {
      setShowDeleteConfirm(null);
      loadData();
    } else {
      alert('Failed to delete supplier. Supplier may have associated purchase orders.');
    }
  };

  const handleEditSupplier = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name,
      contactPerson: supplier.contactPerson || '',
      email: supplier.email || '',
      phone: supplier.phone || '',
      address: supplier.address || '',
      paymentTerms: supplier.paymentTerms || '',
      notes: supplier.notes || ''
    });
  };

  const handleViewSupplierDetails = async (supplier: Supplier) => {
    // Load comprehensive supplier data
    const performance = catalogService.calculateSupplierPerformance(supplier.id);
    const items = catalogService.getSupplierCatalog(supplier.id);
    const purchaseHistory = catalogService.getDetailedPurchaseHistory(supplier.id);

    const supplierView: SupplierDetailView = {
      supplier,
      performance,
      items,
      purchaseHistory
    };

    setSelectedSupplierView(supplierView);
  };

  const handleCreateItem = () => {
    if (!selectedSupplierView) return;

    const newItem: Omit<SupplierItem, 'id' | 'createdAt' | 'updatedAt'> = {
      ...itemFormData,
      supplierId: selectedSupplierView.supplier.id,
      supplierName: selectedSupplierView.supplier.name,
      isActive: true,
      priceHistory: [],
      deliveryReliability: 100,
      averageDeliveryTime: itemFormData.leadTimeDays,
      certifications: itemFormData.certifications ? itemFormData.certifications.split(',').map(c => c.trim()) : []
    };

    try {
      catalogService.saveSupplierItem(newItem);
      setShowItemModal(false);
      resetItemForm();
      
      // Refresh supplier view
      handleViewSupplierDetails(selectedSupplierView.supplier);
    } catch (error) {
      alert('Failed to create supplier item');
    }
  };

  const handleUpdateItem = () => {
    if (!editingItem || !selectedSupplierView) return;

    const updatedItem: Omit<SupplierItem, 'id' | 'createdAt' | 'updatedAt'> = {
      ...editingItem,
      ...itemFormData,
      supplierId: selectedSupplierView.supplier.id,
      supplierName: selectedSupplierView.supplier.name,
      certifications: itemFormData.certifications ? itemFormData.certifications.split(',').map(c => c.trim()) : []
    };

    try {
      catalogService.saveSupplierItem(updatedItem);
      setEditingItem(null);
      setShowItemModal(false);
      resetItemForm();
      
      // Refresh supplier view
      handleViewSupplierDetails(selectedSupplierView.supplier);
    } catch (error) {
      alert('Failed to update supplier item');
    }
  };

  const handleEditItem = (item: SupplierItem) => {
    setEditingItem(item);
    setItemFormData({
      productId: item.productId,
      productName: item.productName,
      supplierPartNumber: item.supplierPartNumber || '',
      supplierDescription: item.supplierDescription || '',
      unitOfMeasure: item.unitOfMeasure,
      packSize: item.packSize || 1,
      minimumOrderQuantity: item.minimumOrderQuantity,
      leadTimeDays: item.leadTimeDays,
      currentPrice: item.currentPrice,
      currency: item.currency,
      qualityRating: item.qualityRating,
      preferredSupplier: item.preferredSupplier,
      certifications: item.certifications?.join(', ') || '',
      shelfLife: item.shelfLife || 0,
      storageRequirements: item.storageRequirements || '',
      notes: item.notes || ''
    });
    setShowItemModal(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      contactPerson: '',
      email: '',
      phone: '',
      address: '',
      paymentTerms: '',
      notes: ''
    });
  };

  const resetItemForm = () => {
    setItemFormData({
      productId: '',
      productName: '',
      supplierPartNumber: '',
      supplierDescription: '',
      unitOfMeasure: '',
      packSize: 1,
      minimumOrderQuantity: 1,
      leadTimeDays: 7,
      currentPrice: 0,
      currency: 'USD',
      qualityRating: 5,
      preferredSupplier: false,
      certifications: '',
      shelfLife: 0,
      storageRequirements: '',
      notes: ''
    });
  };

  const getPerformanceBadgeVariant = (rating: number): "default" | "destructive" | "secondary" => {
    if (rating >= 4) return 'default';
    if (rating >= 3) return 'secondary';
    return 'destructive';
  };

  const getMarketPositionColor = (position: string): string => {
    switch (position) {
      case 'preferred': return 'text-green-600 bg-green-50';
      case 'standard': return 'text-blue-600 bg-blue-50';
      case 'backup': return 'text-orange-600 bg-orange-50';
      case 'probation': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const formatTrend = (trend: string): string => {
    const trendMap: Record<string, string> = {
      'improving': '📈 Improving',
      'stable': '➡️ Stable',
      'declining': '📉 Declining'
    };
    return trendMap[trend] || trend;
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Enhanced Supplier Management</h1>
          <p className="text-muted-foreground">
            Comprehensive supplier management with performance analytics, item catalogs, and purchase history
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          Add New Supplier
        </Button>
      </div>

      {/* Suppliers Overview */}
      <Card>
        <CardHeader>
          <CardTitle>Suppliers Overview</CardTitle>
          <CardDescription>
            All suppliers with performance ratings and key metrics
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Performance Rating</TableHead>
                <TableHead>Total Orders</TableHead>
                <TableHead>Total Value</TableHead>
                <TableHead>On-Time Delivery</TableHead>
                <TableHead>Market Position</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.map(supplier => {
                const performance = catalogService.calculateSupplierPerformance(supplier.id);
                
                return (
                  <TableRow key={supplier.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{supplier.name}</div>
                        <div className="text-sm text-muted-foreground">{supplier.email}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div>{supplier.contactPerson || 'N/A'}</div>
                        <div className="text-sm text-muted-foreground">{supplier.phone || 'N/A'}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Badge variant={getPerformanceBadgeVariant(performance.overallRating)}>
                          {performance.overallRating.toFixed(1)} ⭐
                        </Badge>
                        <span className="text-sm">
                          {formatTrend(performance.performanceTrend)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{performance.totalOrders}</TableCell>
                    <TableCell>{formatCurrency(performance.totalValue)}</TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <span>{performance.onTimeDeliveryRate.toFixed(1)}%</span>
                        <div className="w-16 bg-muted rounded-full h-2">
                          <div 
                            className={`bg-primary h-2 rounded-full progress-bar`}
                            data-width={Math.round(performance.onTimeDeliveryRate)}
                          />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getMarketPositionColor(performance.marketPosition)}>
                        {performance.marketPosition.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleViewSupplierDetails(supplier)}
                        >
                          View Details
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEditSupplier(supplier)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setShowDeleteConfirm(supplier.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Supplier Details Modal */}
      {selectedSupplierView && (
        <Dialog open={true} onOpenChange={() => setSelectedSupplierView(null)}>
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>
                {selectedSupplierView.supplier.name} - Detailed View
              </DialogTitle>
            </DialogHeader>

            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="items">Item Catalog</TabsTrigger>
                <TabsTrigger value="history">Purchase History</TabsTrigger>
                <TabsTrigger value="performance">Performance</TabsTrigger>
                <TabsTrigger value="analytics">Analytics</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                <div className="grid grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Supplier Information</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div><strong>Contact Person:</strong> {selectedSupplierView.supplier.contactPerson || 'N/A'}</div>
                      <div><strong>Email:</strong> {selectedSupplierView.supplier.email || 'N/A'}</div>
                      <div><strong>Phone:</strong> {selectedSupplierView.supplier.phone || 'N/A'}</div>
                      <div><strong>Address:</strong> {selectedSupplierView.supplier.address || 'N/A'}</div>
                      <div><strong>Payment Terms:</strong> {selectedSupplierView.supplier.paymentTerms || 'N/A'}</div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Key Metrics</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div><strong>Overall Rating:</strong> {selectedSupplierView.performance.overallRating.toFixed(1)} ⭐</div>
                      <div><strong>Total Orders:</strong> {selectedSupplierView.performance.totalOrders}</div>
                      <div><strong>Total Value:</strong> {formatCurrency(selectedSupplierView.performance.totalValue)}</div>
                      <div><strong>On-Time Delivery:</strong> {selectedSupplierView.performance.onTimeDeliveryRate.toFixed(1)}%</div>
                      <div><strong>Quality Score:</strong> {selectedSupplierView.performance.averageQualityScore.toFixed(1)}/5</div>
                      <div><strong>Market Position:</strong> 
                        <Badge className={`ml-2 ${getMarketPositionColor(selectedSupplierView.performance.marketPosition)}`}>
                          {selectedSupplierView.performance.marketPosition.toUpperCase()}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="items" className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold">Supplier Item Catalog</h3>
                  <Button onClick={() => setShowItemModal(true)}>
                    Add New Item
                  </Button>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Part Number</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>MOQ</TableHead>
                      <TableHead>Lead Time</TableHead>
                      <TableHead>Quality</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedSupplierView.items.map(item => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{item.productName}</div>
                            <div className="text-sm text-muted-foreground">{item.supplierDescription}</div>
                          </div>
                        </TableCell>
                        <TableCell>{item.supplierPartNumber || 'N/A'}</TableCell>
                        <TableCell>{formatCurrency(item.currentPrice)}/{item.unitOfMeasure}</TableCell>
                        <TableCell>{item.minimumOrderQuantity} {item.unitOfMeasure}</TableCell>
                        <TableCell>{item.leadTimeDays} days</TableCell>
                        <TableCell>
                          <Badge variant={getPerformanceBadgeVariant(item.qualityRating)}>
                            {item.qualityRating.toFixed(1)} ⭐
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            {item.preferredSupplier && (
                              <Badge variant="default">Preferred</Badge>
                            )}
                            <Badge variant={item.isActive ? "default" : "secondary"}>
                              {item.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEditItem(item)}
                          >
                            Edit
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TabsContent>

              <TabsContent value="history" className="space-y-4">
                <h3 className="text-lg font-semibold">Purchase History</h3>
                
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order Number</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Total Value</TableHead>
                      <TableHead>Delivery Status</TableHead>
                      <TableHead>Completeness</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedSupplierView.purchaseHistory.map(history => (
                      <TableRow key={history.id}>
                        <TableCell className="font-medium">{history.orderNumber}</TableCell>
                        <TableCell>{new Date(history.orderDate).toLocaleDateString()}</TableCell>
                        <TableCell>{history.itemCount} items ({history.totalQuantity} total qty)</TableCell>
                        <TableCell>{formatCurrency(history.finalTotal)}</TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            {history.onTimeDelivery ? (
                              <Badge variant="default">On Time</Badge>
                            ) : (
                              <Badge variant="destructive">
                                Late ({history.deliveryDelayDays} days)
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <span>{history.completenessScore.toFixed(1)}%</span>
                            <div className="w-16 bg-muted rounded-full h-2">
                              <div 
                                className={`bg-primary h-2 rounded-full progress-bar`}
                                data-width={Math.round(history.completenessScore)}
                              />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={history.status === 'completed' ? "default" : "secondary"}>
                            {history.status.toUpperCase()}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TabsContent>

              <TabsContent value="performance" className="space-y-4">
                <div className="grid grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Delivery Performance</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span>On-Time Delivery Rate</span>
                          <span>{selectedSupplierView.performance.onTimeDeliveryRate.toFixed(1)}%</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2">
                          <div 
                            className={`bg-primary h-2 rounded-full progress-bar`}
                            data-width={Math.round(selectedSupplierView.performance.onTimeDeliveryRate)}
                          />
                        </div>
                      </div>
                      
                      <div>
                        <div className="flex justify-between">
                          <span>Average Delivery Time</span>
                          <span>{selectedSupplierView.performance.averageDeliveryTime.toFixed(1)} days</span>
                        </div>
                      </div>
                      
                      <div>
                        <div className="flex justify-between">
                          <span>Delivery Trend</span>
                          <span>{formatTrend(selectedSupplierView.performance.performanceTrend)}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Quality Metrics</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <div className="flex justify-between">
                          <span>Average Quality Score</span>
                          <span>{selectedSupplierView.performance.averageQualityScore.toFixed(1)}/5</span>
                        </div>
                      </div>
                      
                      <div>
                        <div className="flex justify-between">
                          <span>Defect Rate</span>
                          <span>{selectedSupplierView.performance.defectRate.toFixed(2)}%</span>
                        </div>
                      </div>
                      
                      <div>
                        <div className="flex justify-between">
                          <span>Return Rate</span>
                          <span>{selectedSupplierView.performance.returnRate.toFixed(2)}%</span>
                        </div>
                      </div>
                      
                      <div>
                        <div className="flex justify-between">
                          <span>Complaints</span>
                          <span>{selectedSupplierView.performance.complaintCount}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Financial Performance</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <div className="flex justify-between">
                          <span>Total Savings</span>
                          <span>{formatCurrency(selectedSupplierView.performance.totalSavings)}</span>
                        </div>
                      </div>
                      
                      <div>
                        <div className="flex justify-between">
                          <span>Average Discount</span>
                          <span>{selectedSupplierView.performance.averageDiscount.toFixed(2)}%</span>
                        </div>
                      </div>
                      
                      <div>
                        <div className="flex justify-between">
                          <span>Price Stability</span>
                          <span>{selectedSupplierView.performance.priceStability.toFixed(1)}%</span>
                        </div>
                      </div>
                      
                      <div>
                        <div className="flex justify-between">
                          <span>Cost Trend</span>
                          <span>{formatTrend(selectedSupplierView.performance.costTrend)}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Order Statistics</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <div className="flex justify-between">
                          <span>Order Frequency</span>
                          <span>{selectedSupplierView.performance.orderFrequency.toFixed(1)}/month</span>
                        </div>
                      </div>
                      
                      <div>
                        <div className="flex justify-between">
                          <span>Average Order Value</span>
                          <span>{formatCurrency(selectedSupplierView.performance.averageOrderValue)}</span>
                        </div>
                      </div>
                      
                      <div>
                        <div className="flex justify-between">
                          <span>Next Review Date</span>
                          <span>{new Date(selectedSupplierView.performance.nextReviewDate).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="analytics" className="space-y-4">
                <div className="grid grid-cols-1 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Performance Summary</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-4 gap-4 text-center">
                        <div>
                          <div className="text-2xl font-bold text-green-600">
                            {selectedSupplierView.performance.overallRating.toFixed(1)}
                          </div>
                          <div className="text-sm text-muted-foreground">Overall Rating</div>
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-blue-600">
                            {selectedSupplierView.performance.onTimeDeliveryRate.toFixed(0)}%
                          </div>
                          <div className="text-sm text-muted-foreground">On-Time Delivery</div>
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-purple-600">
                            {selectedSupplierView.performance.averageQualityScore.toFixed(1)}
                          </div>
                          <div className="text-sm text-muted-foreground">Quality Score</div>
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-orange-600">
                            {formatCurrency(selectedSupplierView.performance.totalValue)}
                          </div>
                          <div className="text-sm text-muted-foreground">Total Business</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader>
                      <CardTitle>Recommendations</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {selectedSupplierView.performance.overallRating >= 4.5 && (
                          <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                            <strong className="text-green-800">Excellent Performance:</strong>
                            <span className="text-green-700 ml-2">
                              Consider expanding business relationship and negotiating better terms.
                            </span>
                          </div>
                        )}
                        
                        {selectedSupplierView.performance.onTimeDeliveryRate < 85 && (
                          <div className="p-3 bg-orange-50 border border-orange-200 rounded-md">
                            <strong className="text-orange-800">Delivery Issues:</strong>
                            <span className="text-orange-700 ml-2">
                              Address delivery reliability concerns with supplier.
                            </span>
                          </div>
                        )}
                        
                        {selectedSupplierView.performance.averageQualityScore < 3.5 && (
                          <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                            <strong className="text-red-800">Quality Concerns:</strong>
                            <span className="text-red-700 ml-2">
                              Review quality standards and consider alternative suppliers.
                            </span>
                          </div>
                        )}
                        
                        {selectedSupplierView.performance.performanceTrend === 'improving' && (
                          <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                            <strong className="text-blue-800">Improving Trend:</strong>
                            <span className="text-blue-700 ml-2">
                              Supplier showing positive improvements in performance.
                            </span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter>
              <Button onClick={() => setSelectedSupplierView(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Create/Edit Supplier Modal */}
      {(showCreateModal || editingSupplier) && (
        <Dialog open={true} onOpenChange={() => {
          setShowCreateModal(false);
          setEditingSupplier(null);
          resetForm();
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingSupplier ? 'Edit Supplier' : 'Create New Supplier'}
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              <div>
                <Label>Name *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Supplier name"
                />
              </div>
              
              <div>
                <Label>Contact Person</Label>
                <Input
                  value={formData.contactPerson}
                  onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                  placeholder="Contact person name"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="Email address"
                  />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="Phone number"
                  />
                </div>
              </div>
              
              <div>
                <Label>Address</Label>
                <Textarea
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Full address"
                />
              </div>
              
              <div>
                <Label>Payment Terms</Label>
                <Select
                  value={formData.paymentTerms}
                  onValueChange={(value) => setFormData({ ...formData, paymentTerms: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select payment terms" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Net 30">Net 30</SelectItem>
                    <SelectItem value="Net 15">Net 15</SelectItem>
                    <SelectItem value="Cash on Delivery">Cash on Delivery</SelectItem>
                    <SelectItem value="2/10 Net 30">2/10 Net 30</SelectItem>
                    <SelectItem value="Custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label>Notes</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Additional notes about this supplier"
                />
              </div>
            </div>
            
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingSupplier(null);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button onClick={editingSupplier ? handleUpdateSupplier : handleCreateSupplier}>
                {editingSupplier ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Supplier Item Modal */}
      {showItemModal && (
        <Dialog open={true} onOpenChange={() => {
          setShowItemModal(false);
          setEditingItem(null);
          resetItemForm();
        }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingItem ? 'Edit Supplier Item' : 'Add New Supplier Item'}
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Product ID *</Label>
                  <Input
                    value={itemFormData.productId}
                    onChange={(e) => setItemFormData({ ...itemFormData, productId: e.target.value })}
                    placeholder="Product ID"
                  />
                </div>
                <div>
                  <Label>Product Name *</Label>
                  <Input
                    value={itemFormData.productName}
                    onChange={(e) => setItemFormData({ ...itemFormData, productName: e.target.value })}
                    placeholder="Product name"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Supplier Part Number</Label>
                  <Input
                    value={itemFormData.supplierPartNumber}
                    onChange={(e) => setItemFormData({ ...itemFormData, supplierPartNumber: e.target.value })}
                    placeholder="Supplier's part number"
                  />
                </div>
                <div>
                  <Label>Unit of Measure</Label>
                  <Select
                    value={itemFormData.unitOfMeasure}
                    onValueChange={(value) => setItemFormData({ ...itemFormData, unitOfMeasure: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select UOM" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="kg">Kilogram (kg)</SelectItem>
                      <SelectItem value="g">Gram (g)</SelectItem>
                      <SelectItem value="lb">Pound (lb)</SelectItem>
                      <SelectItem value="pc">Piece (pc)</SelectItem>
                      <SelectItem value="box">Box</SelectItem>
                      <SelectItem value="case">Case</SelectItem>
                      <SelectItem value="l">Liter (l)</SelectItem>
                      <SelectItem value="ml">Milliliter (ml)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Supplier Description</Label>
                <Textarea
                  value={itemFormData.supplierDescription}
                  onChange={(e) => setItemFormData({ ...itemFormData, supplierDescription: e.target.value })}
                  placeholder="Supplier's product description"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Current Price *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={itemFormData.currentPrice}
                    onChange={(e) => setItemFormData({ ...itemFormData, currentPrice: parseFloat(e.target.value) || 0 })}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <Label>Minimum Order Qty</Label>
                  <Input
                    type="number"
                    min="1"
                    value={itemFormData.minimumOrderQuantity}
                    onChange={(e) => setItemFormData({ ...itemFormData, minimumOrderQuantity: parseInt(e.target.value) || 1 })}
                  />
                </div>
                <div>
                  <Label>Lead Time (Days)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={itemFormData.leadTimeDays}
                    onChange={(e) => setItemFormData({ ...itemFormData, leadTimeDays: parseInt(e.target.value) || 7 })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Pack Size</Label>
                  <Input
                    type="number"
                    min="1"
                    value={itemFormData.packSize}
                    onChange={(e) => setItemFormData({ ...itemFormData, packSize: parseInt(e.target.value) || 1 })}
                    placeholder="Items per pack/case"
                  />
                </div>
                <div>
                  <Label>Quality Rating</Label>
                  <Select
                    value={itemFormData.qualityRating.toString()}
                    onValueChange={(value) => setItemFormData({ ...itemFormData, qualityRating: parseFloat(value) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5 - Excellent</SelectItem>
                      <SelectItem value="4">4 - Good</SelectItem>
                      <SelectItem value="3">3 - Average</SelectItem>
                      <SelectItem value="2">2 - Below Average</SelectItem>
                      <SelectItem value="1">1 - Poor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Shelf Life (Days)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={itemFormData.shelfLife}
                    onChange={(e) => setItemFormData({ ...itemFormData, shelfLife: parseInt(e.target.value) || 0 })}
                    placeholder="0 for non-perishable"
                  />
                </div>
                <div className="flex items-center space-x-2 pt-8">
                  <input
                    type="checkbox"
                    id="preferred"
                    checked={itemFormData.preferredSupplier}
                    onChange={(e) => setItemFormData({ ...itemFormData, preferredSupplier: e.target.checked })}
                    className="rounded"
                    title="Mark as preferred supplier for this item"
                  />
                  <Label htmlFor="preferred">Preferred Supplier for this item</Label>
                </div>
              </div>

              <div>
                <Label>Storage Requirements</Label>
                <Input
                  value={itemFormData.storageRequirements}
                  onChange={(e) => setItemFormData({ ...itemFormData, storageRequirements: e.target.value })}
                  placeholder="e.g., Refrigerated, Dry place, Room temperature"
                />
              </div>

              <div>
                <Label>Certifications</Label>
                <Input
                  value={itemFormData.certifications}
                  onChange={(e) => setItemFormData({ ...itemFormData, certifications: e.target.value })}
                  placeholder="Comma-separated certifications (e.g., USDA Organic, Fair Trade)"
                />
              </div>

              <div>
                <Label>Notes</Label>
                <Textarea
                  value={itemFormData.notes}
                  onChange={(e) => setItemFormData({ ...itemFormData, notes: e.target.value })}
                  placeholder="Additional notes about this item"
                />
              </div>
            </div>
            
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowItemModal(false);
                  setEditingItem(null);
                  resetItemForm();
                }}
              >
                Cancel
              </Button>
              <Button onClick={editingItem ? handleUpdateItem : handleCreateItem}>
                {editingItem ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <AlertDialog open={true} onOpenChange={() => setShowDeleteConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Supplier</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this supplier? This action cannot be undone.
                Any associated purchase orders will remain but the supplier reference will be removed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => handleDeleteSupplier(showDeleteConfirm)}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
};

export default EnhancedSupplierManagement;

