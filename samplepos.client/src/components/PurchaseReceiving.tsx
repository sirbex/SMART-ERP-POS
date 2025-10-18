import React, { useState, useEffect } from 'react';
import { formatCurrency } from '../utils/currency';
import './PurchaseReceiving.css';
import PurchaseManagementService from '../services/PurchaseManagementService';
import { usePurchases } from '../services/api/purchasesApi';
import type { PurchaseOrder } from '../types';
import type { Purchase } from '../types/backend';

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


interface ReceivingItem {
  productId: string;
  productName: string;
  quantityOrdered: number;
  quantityReceived: number;
  batchNumber: string;
  expiryDate?: string;
  manufacturingDate?: string;
  supplierBatchRef?: string;
  location?: string;
  notes?: string;
}

const PurchaseReceiving: React.FC = () => {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [showReceivingDetails, setShowReceivingDetails] = useState<Purchase | null>(null);
  
  // Receiving form state
  const [receivingForm, setReceivingForm] = useState({
    receivedBy: '',
    receivedDate: new Date().toISOString().split('T')[0],
    notes: ''
  });
  const [receivingItems, setReceivingItems] = useState<ReceivingItem[]>([]);

  const purchaseService = PurchaseManagementService.getInstance();
  
  // Fetch received purchases (receivings) from backend
  const { data: receivedPurchasesData } = usePurchases({
    status: 'RECEIVED',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    // Get confirmed purchase orders ready for receiving
    const allOrders = purchaseService.getPurchaseOrders();
    const readyForReceiving = allOrders.filter(order => 
      ['confirmed', 'partial'].includes(order.status)
    );
    setPurchaseOrders(readyForReceiving);
  };

  const handleStartReceiving = (order: PurchaseOrder) => {
    setSelectedOrder(order);
    
    // Initialize receiving items from order items
    const items: ReceivingItem[] = order.items.map(orderItem => ({
      productId: String(orderItem.productId || ''),
      productName: orderItem.productName || 'Unknown Product',
      quantityOrdered: orderItem.quantityOrdered || 0,
      quantityReceived: 0,
      batchNumber: generateBatchNumber(orderItem.productName || 'PROD'),
      expiryDate: '',
      manufacturingDate: '',
      supplierBatchRef: '',
      location: 'Main Warehouse',
      notes: ''
    }));
    
    setReceivingItems(items);
    setShowReceiveModal(true);
  };

  const generateBatchNumber = (productName: string): string => {
    const prefix = productName.substring(0, 3).toUpperCase();
    const date = new Date();
    const dateString = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();
    return `${prefix}${dateString}${random}`;
  };

  const updateReceivingItem = (index: number, field: keyof ReceivingItem, value: any) => {
    const updatedItems = [...receivingItems];
    updatedItems[index] = { ...updatedItems[index], [field]: value };
    setReceivingItems(updatedItems);
  };

  const autoFillQuantities = () => {
    const updatedItems = receivingItems.map(item => ({
      ...item,
      quantityReceived: item.quantityOrdered
    }));
    setReceivingItems(updatedItems);
  };

  const validateReceiving = (): { isValid: boolean; errors: string[] } => {
    const errors: string[] = [];

    if (!receivingForm.receivedBy.trim()) {
      errors.push('Received by is required');
    }

    if (!receivingForm.receivedDate) {
      errors.push('Received date is required');
    }

    const hasItemsToReceive = receivingItems.some(item => item.quantityReceived > 0);
    if (!hasItemsToReceive) {
      errors.push('At least one item must have quantity received > 0');
    }

    receivingItems.forEach((item, index) => {
      if (item.quantityReceived > 0) {
        if (!item.batchNumber.trim()) {
          errors.push(`Item ${index + 1} (${item.productName}): Batch number is required`);
        }
        
        if (item.quantityReceived > item.quantityOrdered) {
          errors.push(`Item ${index + 1} (${item.productName}): Received quantity cannot exceed ordered quantity`);
        }
      }
    });

    return { isValid: errors.length === 0, errors };
  };

  const handleCompleteReceiving = () => {
    const validation = validateReceiving();
    
    if (!validation.isValid) {
      alert('Please fix the following errors:\n' + validation.errors.join('\n'));
      return;
    }

    if (!selectedOrder) return;

    // Filter items that have quantities received
    const itemsToReceive = receivingItems.filter(item => item.quantityReceived > 0);

    const success = purchaseService.receivePurchaseOrder(String(selectedOrder.id), {
      receivedBy: receivingForm.receivedBy,
      receivedDate: receivingForm.receivedDate,
      notes: receivingForm.notes,
      items: itemsToReceive.map(item => ({
        productId: item.productId,
        quantityReceived: item.quantityReceived,
        batchNumber: item.batchNumber,
        expiryDate: item.expiryDate || undefined,
        manufacturingDate: item.manufacturingDate || undefined,
        supplierBatchRef: item.supplierBatchRef || undefined,
        location: item.location || undefined,
        notes: item.notes || undefined
      }))
    });

    if (success) {
      alert('Purchase order received successfully!');
      setShowReceiveModal(false);
      setSelectedOrder(null);
      resetForm();
      loadData();
    } else {
      alert('Failed to process purchase receiving');
    }
  };

  const resetForm = () => {
    setReceivingForm({
      receivedBy: '',
      receivedDate: new Date().toISOString().split('T')[0],
      notes: ''
    });
    setReceivingItems([]);
  };

  const getStatusColor = (status: PurchaseOrder['status']): "default" | "destructive" | "secondary" => {
    switch (status) {
      case 'draft':
      case 'pending':
        return 'default';
      case 'partial':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  const calculateReceivingProgress = (order: PurchaseOrder): { percentage: number; received: number; total: number } => {
    const totalOrdered = order.items.reduce((sum, item) => sum + (item.quantityOrdered || 0), 0);
    const totalReceived = order.items.reduce((sum, item) => sum + (item.receivedQuantity || 0), 0);
    
    const percentage = totalOrdered > 0 ? (totalReceived / totalOrdered) * 100 : 0;
    
    return { percentage: Math.min(percentage, 100), received: totalReceived, total: totalOrdered };
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Purchase Receiving</h1>
        <p className="text-muted-foreground">Receive and process incoming inventory</p>
      </div>

      {/* Purchase Orders Ready for Receiving */}
      <Card>
        <CardHeader>
          <CardTitle>Orders Ready for Receiving</CardTitle>
          <CardDescription>
            Purchase orders that have been confirmed and are ready to receive
          </CardDescription>
        </CardHeader>
        <CardContent>
          {purchaseOrders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No purchase orders ready for receiving.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order Number</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Order Date</TableHead>
                  <TableHead>Total Value</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchaseOrders.map(order => {
                  const progress = calculateReceivingProgress(order);
                  
                  return (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">{order.orderNumber}</TableCell>
                      <TableCell>{order.supplierName}</TableCell>
                      <TableCell>{new Date(order.orderDate).toLocaleDateString()}</TableCell>
                      <TableCell>{formatCurrency(order.totalValue)}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="text-sm">{progress.received}/{progress.total} items</div>
                          <div className="w-full bg-muted rounded-full h-2">
                            <div 
                              className={`bg-primary h-2 rounded-full transition-all progress-bar`}
                              data-progress={Math.round(progress.percentage / 10) * 10}
                            />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusColor(order.status)}>
                          {order.status.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          onClick={() => handleStartReceiving(order)}
                        >
                          Receive
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

      {/* Receiving History */}
      <Card>
        <CardHeader>
          <CardTitle>Receiving History</CardTitle>
          <CardDescription>
            Previously received purchase orders
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(!receivedPurchasesData?.data || receivedPurchasesData.data.length === 0) ? (
            <div className="text-center py-8 text-muted-foreground">
              No receiving history found.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO Number</TableHead>
                  <TableHead>Received Date</TableHead>
                  <TableHead>Total Value</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receivedPurchasesData.data.map((receiving: Purchase) => (
                  <TableRow key={receiving.id}>
                    <TableCell>{receiving.purchaseNumber}</TableCell>
                    <TableCell>{new Date(receiving.receivedDate || receiving.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell>{formatCurrency(Number(receiving.totalAmount))}</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowReceivingDetails(receiving)}
                      >
                        View Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Receiving Modal */}
      {showReceiveModal && selectedOrder && (
        <Dialog open={true} onOpenChange={() => setShowReceiveModal(false)}>
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>
                Receive Purchase Order - {selectedOrder.orderNumber}
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-6">
              {/* Receiving Information */}
              <Card>
                <CardHeader>
                  <CardTitle>Receiving Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Received By *</Label>
                      <Input
                        value={receivingForm.receivedBy}
                        onChange={(e) => setReceivingForm({ ...receivingForm, receivedBy: e.target.value })}
                        placeholder="Enter receiver name"
                      />
                    </div>
                    <div>
                      <Label>Received Date *</Label>
                      <Input
                        type="date"
                        value={receivingForm.receivedDate}
                        onChange={(e) => setReceivingForm({ ...receivingForm, receivedDate: e.target.value })}
                      />
                    </div>
                  </div>
                  
                  <div className="mt-4">
                    <Label>Notes</Label>
                    <Textarea
                      value={receivingForm.notes}
                      onChange={(e) => setReceivingForm({ ...receivingForm, notes: e.target.value })}
                      placeholder="Additional notes about this receiving"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Items to Receive */}
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle>Items to Receive</CardTitle>
                    <Button onClick={autoFillQuantities} variant="outline">
                      Auto-fill All Quantities
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Ordered</TableHead>
                        <TableHead>Received</TableHead>
                        <TableHead>Batch Number</TableHead>
                        <TableHead>Expiry Date</TableHead>
                        <TableHead>Location</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {receivingItems.map((item, index) => (
                        <TableRow key={index}>
                          <TableCell>{item.productName}</TableCell>
                          <TableCell>{item.quantityOrdered}</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              max={item.quantityOrdered}
                              className="w-24"
                              value={item.quantityReceived}
                              onChange={(e) => updateReceivingItem(index, 'quantityReceived', 
                                parseInt(e.target.value) || 0)}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              className="w-32"
                              value={item.batchNumber}
                              onChange={(e) => updateReceivingItem(index, 'batchNumber', e.target.value)}
                              placeholder="Batch number"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="date"
                              className="w-36"
                              value={item.expiryDate}
                              onChange={(e) => updateReceivingItem(index, 'expiryDate', e.target.value)}
                            />
                          </TableCell>
                          <TableCell>
                            <Select
                              value={item.location}
                              onValueChange={(value) => updateReceivingItem(index, 'location', value)}
                            >
                              <SelectTrigger className="w-32">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Main Warehouse">Main Warehouse</SelectItem>
                                <SelectItem value="Cold Storage">Cold Storage</SelectItem>
                                <SelectItem value="Dry Storage">Dry Storage</SelectItem>
                                <SelectItem value="Retail Floor">Retail Floor</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowReceiveModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleCompleteReceiving}>
                Complete Receiving
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Receiving Details Modal */}
      {showReceivingDetails && (
        <Dialog open={true} onOpenChange={() => setShowReceivingDetails(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>
                Receiving Details - {showReceivingDetails.purchaseNumber}
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Purchase Number</Label>
                  <p className="font-medium">{showReceivingDetails.purchaseNumber}</p>
                </div>
                <div>
                  <Label>Received Date</Label>
                  <p>{new Date(showReceivingDetails.receivedDate || showReceivingDetails.createdAt).toLocaleDateString()}</p>
                </div>
                <div>
                  <Label>Status</Label>
                  <p className="font-medium">{showReceivingDetails.status}</p>
                </div>
                <div>
                  <Label>Total Value</Label>
                  <p className="font-medium">{formatCurrency(Number(showReceivingDetails.totalAmount))}</p>
                </div>
              </div>

              {showReceivingDetails.notes && (
                <div>
                  <Label>Notes</Label>
                  <p className="text-sm bg-muted p-3 rounded-md">{showReceivingDetails.notes}</p>
                </div>
              )}
            </div>
            
            <DialogFooter>
              <Button onClick={() => setShowReceivingDetails(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default PurchaseReceiving;

