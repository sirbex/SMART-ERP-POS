import React, { useState } from 'react';
import { formatCurrency } from '../utils/currency';
import { 
  useSuppliers, 
  useCreateSupplier, 
  useUpdateSupplier, 
  useDeleteSupplier 
} from '../services/api/suppliersApi';
import { usePurchases } from '../services/api/purchasesApi';
import { 
  calculateSupplierPerformance, 
  type SupplierPerformance 
} from '../utils/supplierPerformanceCalculator';
import type { Supplier } from '../types/backend';

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

const SupplierManagement: React.FC = () => {
  // React Query hooks
  const { data: suppliersData, isLoading: isLoadingSuppliers } = useSuppliers();
  const { data: purchasesData, isLoading: isLoadingPurchases } = usePurchases();
  const createSupplierMutation = useCreateSupplier();
  const updateSupplierMutation = useUpdateSupplier();
  const deleteSupplierMutation = useDeleteSupplier();

  // Derived data
  const suppliers = suppliersData?.data || [];
  const purchases = purchasesData?.data || [];
  const supplierPerformance = calculateSupplierPerformance(suppliers, purchases);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showPerformanceModal, setShowPerformanceModal] = useState<SupplierPerformance | null>(null);
  
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

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.name.trim()) {
      errors.name = 'Supplier name is required';
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = 'Please enter a valid email address';
    }

    if (formData.phone && !/^[\+]?[0-9\-\(\)\s]+$/.test(formData.phone)) {
      errors.phone = 'Please enter a valid phone number';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
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
    setFormErrors({});
  };

  const handleCreateSupplier = () => {
    resetForm();
    setEditingSupplier(null);
    setShowCreateModal(true);
  };

  const handleEditSupplier = (supplier: Supplier) => {
    setFormData({
      name: supplier.name,
      contactPerson: supplier.contactPerson || '',
      email: supplier.email || '',
      phone: supplier.phone || '',
      address: supplier.address || '',
      paymentTerms: supplier.paymentTerms || '',
      notes: supplier.notes || ''
    });
    setEditingSupplier(supplier);
    setShowCreateModal(true);
  };

  const handleSaveSupplier = async () => {
    if (!validateForm()) {
      return;
    }

    try {
      if (editingSupplier) {
        // Update existing supplier
        await updateSupplierMutation.mutateAsync({
          id: String(editingSupplier.id),
          request: {
            name: formData.name.trim(),
            contactPerson: formData.contactPerson.trim() || undefined,
            email: formData.email.trim() || undefined,
            phone: formData.phone.trim() || undefined,
            address: formData.address.trim() || undefined,
            paymentTerms: formData.paymentTerms.trim() || undefined,
            notes: formData.notes.trim() || undefined,
            isActive: true
          }
        });
        alert('Supplier updated successfully!');
      } else {
        // Create new supplier
        await createSupplierMutation.mutateAsync({
          name: formData.name.trim(),
          contactPerson: formData.contactPerson.trim() || undefined,
          email: formData.email.trim() || undefined,
          phone: formData.phone.trim() || undefined,
          address: formData.address.trim() || undefined,
          paymentTerms: formData.paymentTerms.trim() || undefined,
          notes: formData.notes.trim() || undefined,
          isActive: true
        });
        alert('Supplier created successfully!');
      }
      
      setShowCreateModal(false);
      resetForm();
      setEditingSupplier(null);
    } catch (error) {
      console.error('Error saving supplier:', error);
      alert('Failed to save supplier');
    }
  };

  const handleDeleteSupplier = async (supplierId: string) => {
    try {
      await deleteSupplierMutation.mutateAsync(supplierId);
      setShowDeleteConfirm(null);
    } catch (error) {
      console.error('Error deleting supplier:', error);
      alert('Cannot delete supplier. There may be active purchase orders.');
    }
  };

  const handleToggleSupplierStatus = async (supplier: Supplier) => {
    try {
      await updateSupplierMutation.mutateAsync({
        id: String(supplier.id),
        request: { isActive: !supplier.isActive }
      });
    } catch (error) {
      console.error('Error toggling supplier status:', error);
      alert('Failed to update supplier status');
    }
  };

  const getPerformanceRating = (performance: SupplierPerformance): { rating: string; color: string } => {
    if (performance.totalOrders === 0) {
      return { rating: 'New', color: 'secondary' };
    }

    const avgValue = performance.averageOrderValue;
    const onTime = performance.onTimeDeliveryRate;

    if (avgValue > 500000 && onTime >= 95) {
      return { rating: 'Excellent', color: 'default' };
    } else if (avgValue > 200000 && onTime >= 85) {
      return { rating: 'Good', color: 'secondary' };
    } else if (onTime >= 70) {
      return { rating: 'Fair', color: 'outline' };
    } else {
      return { rating: 'Poor', color: 'destructive' };
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Supplier Management</h1>
          <p className="text-muted-foreground">Manage supplier information and track performance</p>
        </div>
        <Button onClick={handleCreateSupplier}>
          Add New Supplier
        </Button>
      </div>

      {/* Suppliers List */}
      <Card>
        <CardHeader>
          <CardTitle>Suppliers</CardTitle>
          <CardDescription>
            Manage supplier contact information and settings
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingSuppliers ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading suppliers...
            </div>
          ) : suppliers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No suppliers found. Add your first supplier to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Contact Person</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Payment Terms</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliers.map(supplier => (
                  <TableRow key={supplier.id}>
                    <TableCell className="font-medium">{supplier.name}</TableCell>
                    <TableCell>{supplier.contactPerson || '-'}</TableCell>
                    <TableCell>{supplier.email || '-'}</TableCell>
                    <TableCell>{supplier.phone || '-'}</TableCell>
                    <TableCell>{supplier.paymentTerms || '-'}</TableCell>
                    <TableCell>
                      <Badge variant={supplier.isActive ? 'default' : 'secondary'}>
                        {supplier.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEditSupplier(supplier)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant={supplier.isActive ? "secondary" : "default"}
                          onClick={() => handleToggleSupplierStatus(supplier)}
                        >
                          {supplier.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setShowDeleteConfirm(String(supplier.id))}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Supplier Performance */}
      <Card>
        <CardHeader>
          <CardTitle>Supplier Performance</CardTitle>
          <CardDescription>
            Track supplier performance metrics and order history
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingSuppliers || isLoadingPurchases ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading performance data...
            </div>
          ) : supplierPerformance.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No performance data available. Performance will show after placing purchase orders.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Total Orders</TableHead>
                  <TableHead>Total Value</TableHead>
                  <TableHead>Avg Order Value</TableHead>
                  <TableHead>On-Time Rate</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Last Order</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {supplierPerformance.map(performance => {
                  const rating = getPerformanceRating(performance);
                  
                  return (
                    <TableRow key={performance.supplierId}>
                      <TableCell className="font-medium">{performance.supplierName}</TableCell>
                      <TableCell>{performance.totalOrders}</TableCell>
                      <TableCell>{formatCurrency(performance.totalValue)}</TableCell>
                      <TableCell>{formatCurrency(performance.averageOrderValue)}</TableCell>
                      <TableCell>{performance.onTimeDeliveryRate.toFixed(1)}%</TableCell>
                      <TableCell>
                        <Badge variant={rating.color as any}>
                          {rating.rating}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {performance.lastOrderDate ? 
                          new Date(performance.lastOrderDate).toLocaleDateString() : 'Never'}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setShowPerformanceModal(performance)}
                        >
                          Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Supplier Modal */}
      {showCreateModal && (
        <Dialog open={true} onOpenChange={() => setShowCreateModal(false)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingSupplier ? 'Edit Supplier' : 'Add New Supplier'}
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Supplier Name *</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className={formErrors.name ? 'border-destructive' : ''}
                  />
                  {formErrors.name && (
                    <p className="text-sm text-destructive mt-1">{formErrors.name}</p>
                  )}
                </div>
                
                <div>
                  <Label>Contact Person</Label>
                  <Input
                    value={formData.contactPerson}
                    onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className={formErrors.email ? 'border-destructive' : ''}
                  />
                  {formErrors.email && (
                    <p className="text-sm text-destructive mt-1">{formErrors.email}</p>
                  )}
                </div>
                
                <div>
                  <Label>Phone</Label>
                  <Input
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className={formErrors.phone ? 'border-destructive' : ''}
                  />
                  {formErrors.phone && (
                    <p className="text-sm text-destructive mt-1">{formErrors.phone}</p>
                  )}
                </div>
              </div>

              <div>
                <Label>Address</Label>
                <Textarea
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Complete business address"
                />
              </div>

              <div>
                <Label>Payment Terms</Label>
                <Input
                  value={formData.paymentTerms}
                  onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })}
                  placeholder="e.g., Net 30, Cash on Delivery, etc."
                />
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
              <Button variant="outline" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveSupplier}>
                {editingSupplier ? 'Update Supplier' : 'Create Supplier'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Performance Details Modal */}
      {showPerformanceModal && (
        <Dialog open={true} onOpenChange={() => setShowPerformanceModal(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                Supplier Performance - {showPerformanceModal.supplierName}
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Order Statistics</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between">
                      <span>Total Orders:</span>
                      <span className="font-medium">{showPerformanceModal.totalOrders}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total Value:</span>
                      <span className="font-medium">{formatCurrency(showPerformanceModal.totalValue)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Average Order:</span>
                      <span className="font-medium">{formatCurrency(showPerformanceModal.averageOrderValue)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Last Order:</span>
                      <span className="font-medium">
                        {showPerformanceModal.lastOrderDate ? 
                          new Date(showPerformanceModal.lastOrderDate).toLocaleDateString() : 'Never'}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Performance Metrics</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between">
                      <span>On-Time Delivery:</span>
                      <span className="font-medium">{showPerformanceModal.onTimeDeliveryRate.toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Rating:</span>
                      <Badge variant={getPerformanceRating(showPerformanceModal).color as any}>
                        {getPerformanceRating(showPerformanceModal).rating}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-3">Performance Notes</h3>
                <div className="bg-muted p-4 rounded-md">
                  {showPerformanceModal.totalOrders === 0 ? (
                    <p className="text-muted-foreground">No orders placed with this supplier yet.</p>
                  ) : (
                    <div className="space-y-2 text-sm">
                      <p>
                        <strong>Order Frequency:</strong> {' '}
                        {showPerformanceModal.totalOrders > 10 ? 'Very Active' : 
                         showPerformanceModal.totalOrders > 5 ? 'Active' : 
                         showPerformanceModal.totalOrders > 1 ? 'Moderate' : 'New Supplier'}
                      </p>
                      <p>
                        <strong>Value Tier:</strong> {' '}
                        {showPerformanceModal.averageOrderValue > 1000000 ? 'Premium' :
                         showPerformanceModal.averageOrderValue > 500000 ? 'High Value' :
                         showPerformanceModal.averageOrderValue > 100000 ? 'Standard' : 'Basic'}
                      </p>
                      <p>
                        <strong>Reliability:</strong> {' '}
                        {showPerformanceModal.onTimeDeliveryRate >= 95 ? 'Excellent' :
                         showPerformanceModal.onTimeDeliveryRate >= 85 ? 'Good' :
                         showPerformanceModal.onTimeDeliveryRate >= 70 ? 'Fair' : 'Needs Improvement'}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <DialogFooter>
              <Button onClick={() => setShowPerformanceModal(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <AlertDialog open={true} onOpenChange={() => setShowDeleteConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Supplier</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this supplier? This action cannot be undone.
                Note: Suppliers with active purchase orders cannot be deleted.
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

export default SupplierManagement;

