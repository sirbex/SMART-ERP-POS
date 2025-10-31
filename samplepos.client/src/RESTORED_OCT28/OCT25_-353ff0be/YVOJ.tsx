import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Plus, Search, Edit, Trash2, RefreshCw, Store, Phone, Mail, Eye, Package, AlertCircle, CheckCircle, Clock, Download } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { useToast } from "./ui/toast";
import { handleApiError, logApiRequest } from '@/utils/errorHandler';
import {
  useSuppliers,
  useCreateSupplier,
  useUpdateSupplier,
  useDeleteSupplier,
  type CreateSupplierRequest,
  type UpdateSupplierRequest
} from '@/services/api/suppliersApi';
import { useSupplierPerformance, useSupplierHistory } from '@/services/api/supplierApi';
import type { Supplier } from '@/types/backend';

interface SupplierFormData {
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  paymentTerms: string;
  notes: string;
  isActive: boolean;
}

const SupplierManagement: React.FC = () => {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [showOrderItemsDialog, setShowOrderItemsDialog] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [perfExportFormat, setPerfExportFormat] = useState<'CSV' | 'PDF'>('CSV');
  const [histExportFormat, setHistExportFormat] = useState<'CSV' | 'PDF'>('CSV');
  const [historyStatus, setHistoryStatus] = useState<string>('all');
  const [formData, setFormData] = useState<SupplierFormData>({
    name: '',
    contactPerson: '',
    email: '',
    phone: '',
    address: '',
    paymentTerms: '30 days',
    notes: '',
    isActive: true,
  });

  const { data: suppliersResponse, isLoading, error, refetch } = useSuppliers({ search: searchTerm || undefined });
  const createSupplierMutation = useCreateSupplier();
  const updateSupplierMutation = useUpdateSupplier();
  const deleteSupplierMutation = useDeleteSupplier();
  
  // Performance data for selected supplier
  const { data: performance } = useSupplierPerformance(selectedSupplier?.id?.toString() || '');
  const { data: history } = useSupplierHistory(
    selectedSupplier?.id?.toString() || '',
    { page: historyPage, limit: 5, status: historyStatus !== 'all' ? historyStatus : undefined }
  );

  const suppliers = suppliersResponse?.data || [];
  const totalSuppliers = suppliers.length;
  const activeSuppliers = suppliers.filter(s => s.isActive).length;

  const resetForm = () => {
    setFormData({
      name: '',
      contactPerson: '',
      email: '',
      phone: '',
      address: '',
      paymentTerms: '30 days',
      notes: '',
      isActive: true,
    });
  };

  const openDetailsDialog = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setHistoryPage(1);
    setShowDetailsDialog(true);
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const exportSupplierPerformance = async () => {
    if (!selectedSupplier) return;
    try {
      const api = (await import('@/config/api.config')).default;
      if (perfExportFormat === 'PDF') {
        const res = await api.get(`/suppliers/${selectedSupplier.id}/performance/export/pdf`, { responseType: 'blob' });
        downloadBlob(res.data, `supplier-performance-${selectedSupplier.name}-${new Date().toISOString().slice(0,10)}.pdf`);
        toast({ title: 'Exported', description: 'Supplier performance exported as PDF.' });
      } else {
        const res = await api.get(`/suppliers/${selectedSupplier.id}/performance/export`, { responseType: 'blob' });
        downloadBlob(res.data, `supplier-performance-${selectedSupplier.name}-${new Date().toISOString().slice(0,10)}.csv`);
        toast({ title: 'Exported', description: 'Supplier performance exported as CSV.' });
      }
    } catch (err) {
      const msg = handleApiError(err, 'Failed to export supplier performance');
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    }
  };

  const exportSupplierHistory = async () => {
    if (!selectedSupplier) return;
    try {
      const api = (await import('@/config/api.config')).default;
      const params: any = {};
      if (historyStatus !== 'all') params.status = historyStatus;
      if (histExportFormat === 'PDF') {
        const res = await api.get(`/suppliers/${selectedSupplier.id}/history/export/pdf`, { responseType: 'blob', params });
        downloadBlob(res.data, `supplier-history-${selectedSupplier.name}-${new Date().toISOString().slice(0,10)}.pdf`);
        toast({ title: 'Exported', description: 'Supplier order history exported as PDF.' });
      } else {
        const res = await api.get(`/suppliers/${selectedSupplier.id}/history/export`, { responseType: 'blob', params });
        downloadBlob(res.data, `supplier-history-${selectedSupplier.name}-${new Date().toISOString().slice(0,10)}.csv`);
        toast({ title: 'Exported', description: 'Supplier order history exported as CSV.' });
      }
    } catch (err) {
      const msg = handleApiError(err, 'Failed to export supplier history');
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    }
  };

  const getDeliveryStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETE':
        return <Badge className="bg-green-600 text-white text-xs"><CheckCircle className="w-3 h-3 mr-1" />Complete</Badge>;
      case 'PARTIAL':
        return <Badge className="bg-yellow-600 text-white text-xs"><Clock className="w-3 h-3 mr-1" />Partial</Badge>;
      case 'NOT_DELIVERED':
        return <Badge variant="destructive" className="text-xs"><AlertCircle className="w-3 h-3 mr-1" />Not Delivered</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">{status}</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return <Badge className="bg-green-600 text-white text-xs">Completed</Badge>;
      case 'PENDING':
        return <Badge className="bg-blue-600 text-white text-xs">Pending</Badge>;
      case 'CANCELLED':
        return <Badge variant="destructive" className="text-xs">Cancelled</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">{status}</Badge>;
    }
  };

  const handleCreateSupplier = async () => {
    if (!formData.name.trim()) {
      toast({ title: "Error", description: "Supplier name is required", variant: "destructive" });
      return;
    }

    try {
      const request: CreateSupplierRequest = {
        name: formData.name.trim(),
        contactPerson: formData.contactPerson.trim() || undefined,
        email: formData.email.trim() || undefined,
        phone: formData.phone.trim() || undefined,
        address: formData.address.trim() || undefined,
        paymentTerms: formData.paymentTerms.trim() || undefined,
        notes: formData.notes.trim() || undefined,
        isActive: formData.isActive,
      };
      logApiRequest('POST /suppliers', request);
      await createSupplierMutation.mutateAsync(request);
      toast({ title: "Success", description: `Supplier "${formData.name}" created` });
      setShowCreateDialog(false);
      resetForm();
    } catch (error: any) {
      const errorMessage = handleApiError(error, 'Failed to create supplier');
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
    }
  };

  const handleEditSupplier = async () => {
    if (!selectedSupplier || !formData.name.trim()) {
      toast({ title: "Error", description: "Supplier name is required", variant: "destructive" });
      return;
    }

    try {
      const request: UpdateSupplierRequest = {
        name: formData.name.trim(),
        contactPerson: formData.contactPerson.trim() || undefined,
        email: formData.email.trim() || undefined,
        phone: formData.phone.trim() || undefined,
        address: formData.address.trim() || undefined,
        paymentTerms: formData.paymentTerms.trim() || undefined,
        notes: formData.notes.trim() || undefined,
        isActive: formData.isActive,
      };
      logApiRequest(`PUT /suppliers/${selectedSupplier.id}`, request);
      await updateSupplierMutation.mutateAsync({ id: selectedSupplier.id.toString(), request });
      toast({ title: "Success", description: `Supplier "${formData.name}" updated` });
      setShowEditDialog(false);
      setSelectedSupplier(null);
      resetForm();
    } catch (error: any) {
      const errorMessage = handleApiError(error, 'Failed to update supplier');
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
    }
  };

  const handleDeleteSupplier = async () => {
    if (!selectedSupplier) return;

    try {
      await deleteSupplierMutation.mutateAsync(selectedSupplier.id.toString());
      toast({ title: "Success", description: `Supplier "${selectedSupplier.name}" deleted` });
      setShowDeleteDialog(false);
      setSelectedSupplier(null);
    } catch (error: any) {
      const errorMessage = handleApiError(error, 'Failed to delete supplier');
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
    }
  };

  const openEditDialog = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setFormData({
      name: supplier.name,
      contactPerson: supplier.contactPerson || '',
      email: supplier.email || '',
      phone: supplier.phone || '',
      address: supplier.address || '',
      paymentTerms: supplier.paymentTerms || '30 days',
      notes: supplier.notes || '',
      isActive: supplier.isActive,
    });
    setShowEditDialog(true);
  };

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-red-500">Error Loading Suppliers</CardTitle>
          <CardDescription>{(error as any)?.message || 'Failed to load suppliers'}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => refetch()}><RefreshCw className="mr-2 h-4 w-4" />Retry</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <Card><CardHeader className="pb-3"><CardDescription>Total Suppliers</CardDescription><CardTitle className="text-3xl">{totalSuppliers}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-3"><CardDescription>Active Suppliers</CardDescription><CardTitle className="text-3xl text-green-600">{activeSuppliers}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-3"><CardDescription>Inactive</CardDescription><CardTitle className="text-3xl text-gray-500">{totalSuppliers - activeSuppliers}</CardTitle></CardHeader></Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2"><Store className="h-5 w-5" />Supplier Management</CardTitle>
              <CardDescription>Manage your suppliers and vendor relationships</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => refetch()} variant="outline" size="sm"><RefreshCw className="h-4 w-4 mr-2" />Refresh</Button>
              <Button onClick={() => setShowCreateDialog(true)} size="sm"><Plus className="h-4 w-4 mr-2" />Add Supplier</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input placeholder="Search suppliers..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto text-gray-400" />
              <p className="mt-2 text-sm text-gray-500">Loading suppliers...</p>
            </div>
          ) : suppliers.length === 0 ? (
            <div className="text-center py-8">
              <Store className="h-12 w-12 mx-auto text-gray-400" />
              <p className="mt-2 text-gray-500">{searchTerm ? 'No suppliers found' : 'No suppliers yet'}</p>
              {!searchTerm && <Button onClick={() => setShowCreateDialog(true)} className="mt-4"><Plus className="h-4 w-4 mr-2" />Add Your First Supplier</Button>}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Payment Terms</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suppliers.map((supplier) => (
                    <TableRow key={supplier.id}>
                      <TableCell className="font-medium">{supplier.name}</TableCell>
                      <TableCell>{supplier.contactPerson || '-'}</TableCell>
                      <TableCell>{supplier.email ? <div className="flex items-center gap-1"><Mail className="h-3 w-3" /><span>{supplier.email}</span></div> : '-'}</TableCell>
                      <TableCell>{supplier.phone ? <div className="flex items-center gap-1"><Phone className="h-3 w-3" /><span>{supplier.phone}</span></div> : '-'}</TableCell>
                      <TableCell>{supplier.paymentTerms || '-'}</TableCell>
                      <TableCell><Badge variant={supplier.isActive ? "default" : "secondary"}>{supplier.isActive ? 'Active' : 'Inactive'}</Badge></TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => openDetailsDialog(supplier)}>
                            <Eye className="h-4 w-4 mr-1" />
                            Details
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => openEditDialog(supplier)}><Edit className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="sm" onClick={() => { setSelectedSupplier(supplier); setShowDeleteDialog(true); }}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Supplier</DialogTitle>
            <DialogDescription>Create a new supplier record. Name is required.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Supplier Name *</Label><Input value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} placeholder="ABC Corporation" /></div>
              <div><Label>Contact Person</Label><Input value={formData.contactPerson} onChange={(e) => setFormData({...formData, contactPerson: e.target.value})} placeholder="John Doe" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Email</Label><Input type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} placeholder="contact@abc.com" /></div>
              <div><Label>Phone</Label><Input value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} placeholder="+63 123 456 7890" /></div>
            </div>
            <div><Label>Address</Label><Input value={formData.address} onChange={(e) => setFormData({...formData, address: e.target.value})} placeholder="123 Main Street" /></div>
            <div><Label>Payment Terms</Label><Input value={formData.paymentTerms} onChange={(e) => setFormData({...formData, paymentTerms: e.target.value})} placeholder="30 days" /></div>
            <div><Label>Notes</Label><textarea value={formData.notes} onChange={(e) => setFormData({...formData, notes: e.target.value})} placeholder="Additional notes..." className="w-full min-h-[80px] px-3 py-2 text-sm border rounded-md" /></div>
            <div className="flex items-center space-x-2">
              <input type="checkbox" id="create-active" checked={formData.isActive} onChange={(e) => setFormData({...formData, isActive: e.target.checked})} className="w-4 h-4" aria-label="Supplier is active" />
              <Label htmlFor="create-active" className="cursor-pointer">Active Supplier</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreateDialog(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleCreateSupplier} disabled={createSupplierMutation.isPending}>{createSupplierMutation.isPending ? 'Creating...' : 'Create Supplier'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Supplier</DialogTitle>
            <DialogDescription>Update supplier information. Name is required.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Supplier Name *</Label><Input value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} placeholder="ABC Corporation" /></div>
              <div><Label>Contact Person</Label><Input value={formData.contactPerson} onChange={(e) => setFormData({...formData, contactPerson: e.target.value})} placeholder="John Doe" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Email</Label><Input type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} placeholder="contact@abc.com" /></div>
              <div><Label>Phone</Label><Input value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} placeholder="+63 123 456 7890" /></div>
            </div>
            <div><Label>Address</Label><Input value={formData.address} onChange={(e) => setFormData({...formData, address: e.target.value})} placeholder="123 Main Street" /></div>
            <div><Label>Payment Terms</Label><Input value={formData.paymentTerms} onChange={(e) => setFormData({...formData, paymentTerms: e.target.value})} placeholder="30 days" /></div>
            <div><Label>Notes</Label><textarea value={formData.notes} onChange={(e) => setFormData({...formData, notes: e.target.value})} placeholder="Additional notes..." className="w-full min-h-[80px] px-3 py-2 text-sm border rounded-md" /></div>
            <div className="flex items-center space-x-2">
              <input type="checkbox" id="edit-active" checked={formData.isActive} onChange={(e) => setFormData({...formData, isActive: e.target.checked})} className="w-4 h-4" aria-label="Supplier is active" />
              <Label htmlFor="edit-active" className="cursor-pointer">Active Supplier</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowEditDialog(false); setSelectedSupplier(null); resetForm(); }}>Cancel</Button>
            <Button onClick={handleEditSupplier} disabled={updateSupplierMutation.isPending}>{updateSupplierMutation.isPending ? 'Updating...' : 'Update Supplier'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Supplier</DialogTitle>
            <DialogDescription>Are you sure you want to delete "{selectedSupplier?.name}"? This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowDeleteDialog(false); setSelectedSupplier(null); }}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteSupplier} disabled={deleteSupplierMutation.isPending}>{deleteSupplierMutation.isPending ? 'Deleting...' : 'Delete'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Supplier Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Store className="h-5 w-5" />
              {selectedSupplier?.name} - Performance & History
            </DialogTitle>
            <DialogDescription>
              Delivery tracking and order history for this supplier
            </DialogDescription>
          </DialogHeader>

          {performance && (
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="overview">Performance Overview</TabsTrigger>
                <TabsTrigger value="history">Order History</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                <div className="flex justify-end gap-2 items-center">
                  <Select value={perfExportFormat} onValueChange={(v) => setPerfExportFormat(v as 'CSV' | 'PDF')}>
                    <SelectTrigger className="w-[120px]">
                      <SelectValue placeholder="Format" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CSV">CSV</SelectItem>
                      <SelectItem value="PDF">PDF</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={exportSupplierPerformance} disabled={!selectedSupplier}>
                    <Download className="h-4 w-4 mr-1" /> Export
                  </Button>
                </div>
                {/* Performance Metrics Cards */}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardDescription>Total Orders</CardDescription>
                      <CardTitle className="text-2xl">{performance.orderMetrics.totalOrders}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-xs text-muted-foreground space-y-1">
                        <div>✓ {performance.orderMetrics.completedOrders} Completed</div>
                        <div>⏳ {performance.orderMetrics.pendingOrders} Pending</div>
                        <div>✗ {performance.orderMetrics.cancelledOrders} Cancelled</div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardDescription>Delivery Rate</CardDescription>
                      <CardTitle className="text-2xl text-blue-600">
                        {performance.deliveryMetrics.deliveryRate}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-xs text-muted-foreground">
                        <div>{performance.deliveryMetrics.totalDeliveredQty.toLocaleString()} of {performance.deliveryMetrics.totalOrderedQty.toLocaleString()} items delivered</div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardDescription>Delivery Quality</CardDescription>
                      <CardTitle className="text-2xl text-green-600">
                        {performance.deliveryMetrics.fullDeliveries}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-xs text-muted-foreground space-y-1">
                        <div className="text-green-600">✓ {performance.deliveryMetrics.fullDeliveries} Full</div>
                        <div className="text-yellow-600">⚠ {performance.deliveryMetrics.partialDeliveries} Partial</div>
                        <div className="text-red-600">✗ {performance.deliveryMetrics.noDeliveries} None</div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardDescription>Outstanding Value</CardDescription>
                      <CardTitle className="text-2xl text-orange-600">
                        ₱{Number(performance.financialMetrics.outstandingValue).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-xs text-muted-foreground space-y-1">
                        <div>Ordered: ₱{Number(performance.financialMetrics.totalOrderedValue).toLocaleString()}</div>
                        <div>Delivered: ₱{Number(performance.financialMetrics.totalDeliveredValue).toLocaleString()}</div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Financial Summary */}
                <Card>
                  <CardHeader>
                    <CardTitle>Financial Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <div className="text-sm text-muted-foreground">Total Paid</div>
                        <div className="text-xl font-bold text-green-600">
                          ₱{Number(performance.financialMetrics.totalPaid).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Current Balance</div>
                        <div className="text-xl font-bold text-blue-600">
                          ₱{Number(performance.financialMetrics.currentBalance).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Completion Rate</div>
                        <div className="text-xl font-bold text-purple-600">
                          {performance.orderMetrics.completionRate}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="history" className="space-y-4">
                <div className="flex justify-between items-center flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground">Status</Label>
                    <Select value={historyStatus} onValueChange={setHistoryStatus}>
                      <SelectTrigger className="w-[160px] h-8">
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="PENDING">Pending</SelectItem>
                        <SelectItem value="COMPLETED">Completed</SelectItem>
                        <SelectItem value="CANCELLED">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={histExportFormat} onValueChange={(v) => setHistExportFormat(v as 'CSV' | 'PDF')}>
                      <SelectTrigger className="w-[120px]">
                        <SelectValue placeholder="Format" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CSV">CSV</SelectItem>
                        <SelectItem value="PDF">PDF</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" onClick={exportSupplierHistory} disabled={!selectedSupplier}>
                      <Download className="h-4 w-4 mr-1" /> Export
                    </Button>
                  </div>
                </div>
                {history && history.orders.length > 0 ? (
                  <div className="space-y-4">
                    {/* Purchase Orders Table */}
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>PO Number</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Items</TableHead>
                            <TableHead className="text-right">Ordered Qty</TableHead>
                            <TableHead className="text-right">Received Qty</TableHead>
                            <TableHead className="text-right">Delivery Rate</TableHead>
                            <TableHead className="text-right">Total Amount</TableHead>
                            <TableHead className="text-right">Outstanding</TableHead>
                            <TableHead className="text-center">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {history.orders.map(order => (
                            <TableRow key={order.id}>
                              <TableCell className="font-medium">{order.poNumber}</TableCell>
                              <TableCell>{new Date(order.orderDate).toLocaleDateString()}</TableCell>
                              <TableCell>{getStatusBadge(order.status)}</TableCell>
                              <TableCell className="text-right">{order.items.length}</TableCell>
                              <TableCell className="text-right">{order.summary.totalOrderedQty.toLocaleString()}</TableCell>
                              <TableCell className="text-right text-green-600 font-semibold">
                                {order.summary.totalReceivedQty.toLocaleString()}
                              </TableCell>
                              <TableCell className="text-right">
                                <Badge variant="outline" className="text-blue-600">
                                  {order.summary.deliveryRate}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-semibold">
                                ₱{order.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </TableCell>
                              <TableCell className="text-right text-orange-600">
                                ₱{Number(order.summary.outstandingValue).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </TableCell>
                              <TableCell className="text-center">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedOrder(order);
                                    setShowOrderItemsDialog(true);
                                  }}
                                >
                                  <Eye className="h-4 w-4 mr-1" />
                                  View Items
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Pagination */}
                    {history.pagination.pages > 1 && (
                      <div className="flex justify-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={historyPage === 1}
                          onClick={() => setHistoryPage(p => p - 1)}
                        >
                          Previous
                        </Button>
                        <span className="flex items-center px-4 text-sm">
                          Page {historyPage} of {history.pagination.pages}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={historyPage === history.pagination.pages}
                          onClick={() => setHistoryPage(p => p + 1)}
                        >
                          Next
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No orders found for this supplier</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}

          <DialogFooter>
            <Button onClick={() => { setShowDetailsDialog(false); setSelectedSupplier(null); setHistoryPage(1); }}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order Items Details Dialog */}
      <Dialog open={showOrderItemsDialog} onOpenChange={setShowOrderItemsDialog}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              {selectedOrder?.poNumber} - Items Details
            </DialogTitle>
            <DialogDescription>
              Ordered vs Delivered breakdown for {selectedOrder?.poNumber}
            </DialogDescription>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-4">
              {/* Order Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted rounded-lg">
                <div>
                  <div className="text-xs text-muted-foreground">Order Date</div>
                  <div className="font-semibold">{new Date(selectedOrder.orderDate).toLocaleDateString()}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Status</div>
                  <div>{getStatusBadge(selectedOrder.status)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Total Amount</div>
                  <div className="font-semibold">₱{selectedOrder.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Delivery Rate</div>
                  <div className="font-semibold text-blue-600">{selectedOrder.summary.deliveryRate}</div>
                </div>
              </div>

              {/* Summary Stats */}
              <div className="grid grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-2xl font-bold">{selectedOrder.summary.totalOrderedQty.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">Total Ordered Qty</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-2xl font-bold text-green-600">{selectedOrder.summary.totalReceivedQty.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">Total Received Qty</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-2xl font-bold text-blue-600">₱{Number(selectedOrder.summary.totalReceivedValue).toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">Value Received</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-2xl font-bold text-orange-600">₱{Number(selectedOrder.summary.outstandingValue).toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">Outstanding Value</div>
                  </CardContent>
                </Card>
              </div>

              {/* Items Table */}
              <Card>
                <CardHeader>
                  <CardTitle>Order Items ({selectedOrder.items.length})</CardTitle>
                  <CardDescription>Detailed breakdown of ordered vs received quantities</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead className="text-right">Ordered</TableHead>
                          <TableHead className="text-right">Received</TableHead>
                          <TableHead className="text-right">Remaining</TableHead>
                          <TableHead className="text-right">Unit Price</TableHead>
                          <TableHead className="text-right">Total Ordered</TableHead>
                          <TableHead className="text-right">Total Received</TableHead>
                          <TableHead className="text-center">Delivery Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedOrder.items.map((item: any, idx: number) => (
                          <TableRow key={idx}>
                            <TableCell>
                              <div className="font-medium">{item.productName}</div>
                              {item.barcode && (
                                <div className="text-xs text-muted-foreground">SKU: {item.barcode}</div>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="font-semibold">{item.orderedQuantity} {item.unit}</div>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="font-semibold text-green-600">{item.receivedQuantity} {item.unit}</div>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className={`font-semibold ${item.remainingQuantity > 0 ? 'text-orange-600' : 'text-muted-foreground'}`}>
                                {item.remainingQuantity} {item.unit}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">₱{item.unitPrice.toFixed(2)}</TableCell>
                            <TableCell className="text-right">
                              ₱{item.totalOrdered.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              ₱{item.totalReceived.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell className="text-center">
                              {getDeliveryStatusBadge(item.deliveryStatus)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {/* Delivery Summary */}
              <Card>
                <CardHeader>
                  <CardTitle>Delivery Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      <div>
                        <div className="text-lg font-bold text-green-600">
                          {selectedOrder.items.filter((item: any) => item.deliveryStatus === 'COMPLETE').length}
                        </div>
                        <div className="text-xs text-muted-foreground">Fully Delivered Items</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-5 w-5 text-yellow-600" />
                      <div>
                        <div className="text-lg font-bold text-yellow-600">
                          {selectedOrder.items.filter((item: any) => item.deliveryStatus === 'PARTIAL').length}
                        </div>
                        <div className="text-xs text-muted-foreground">Partially Delivered Items</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-5 w-5 text-red-600" />
                      <div>
                        <div className="text-lg font-bold text-red-600">
                          {selectedOrder.items.filter((item: any) => item.deliveryStatus === 'NOT_DELIVERED').length}
                        </div>
                        <div className="text-xs text-muted-foreground">Not Delivered Items</div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => { setShowOrderItemsDialog(false); setSelectedOrder(null); }}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SupplierManagement;
