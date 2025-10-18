/**
 * Enhanced Purchase Order Management with Workflow
 * Demonstrates the complete order workflow from draft to delivery
 */

import React, { useState, useEffect } from 'react';
import PurchaseOrderWorkflowService, { type DeliveryTracking } from '../services/PurchaseOrderWorkflowService';
import PurchaseManagementService from '../services/PurchaseManagementService';
import type { PurchaseOrder } from '../models/BatchInventory';

// Shadcn UI components
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { Input } from "./ui/input";
import { Label } from "./ui/label";


interface EnhancedPurchaseOrder extends PurchaseOrder {
  supplierEmail?: string;
  deliveryStatus?: string;
  trackingHistory?: DeliveryTracking[];
}

const EnhancedPurchaseOrderWorkflow: React.FC = () => {
  const [orders, setOrders] = useState<EnhancedPurchaseOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<EnhancedPurchaseOrder | null>(null);
  const [showSendModal, setShowSendModal] = useState(false);
  const [showTrackingModal, setShowTrackingModal] = useState(false);
  const [tracking, setTracking] = useState<DeliveryTracking[]>([]);
  const [sendOptions, setSendOptions] = useState({
    expectedDeliveryDate: ''
  });
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmationData, setConfirmationData] = useState({
    confirmedBy: '',
    notes: ''
  });
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [deliveryData, setDeliveryData] = useState({
    status: 'in_transit',
    location: '',
    description: '',
    estimatedDelivery: ''
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const workflowService = PurchaseOrderWorkflowService.getInstance();
  const purchaseService = PurchaseManagementService.getInstance();

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      // Get regular orders first
      const regularOrders = purchaseService.getPurchaseOrders();
      
      // Try to get enhanced workflow data
      const enhancedOrders = await workflowService.getOrdersWithWorkflow();
      
      // Merge the data (use enhanced if available, fall back to regular)
      const mergedOrders = regularOrders.map(order => {
        const enhanced = enhancedOrders.find(e => e.id === order.id);
        return enhanced ? { ...order, ...enhanced } : order;
      });
      
      setOrders(mergedOrders);
    } catch (error) {
      console.error('Error loading orders:', error);
      setOrders(purchaseService.getPurchaseOrders());
    }
  };

  const handleSendOrder = async () => {
    if (!selectedOrder) return;

    setLoading(true);
    try {
      const result = await workflowService.sendOrderInternally(selectedOrder.id, sendOptions);
      
      if (result.success) {
        setMessage({
          type: 'success',
          text: 'Order sent internally and ready for manual confirmation!'
        });
        
        await loadOrders();
        setShowSendModal(false);
      } else {
        setMessage({
          type: 'error',
          text: result.message || 'Failed to send order'
        });
      }
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.message || 'Error sending order'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleViewTracking = async (order: EnhancedPurchaseOrder) => {
    setSelectedOrder(order);
    const trackingData = await workflowService.getOrderTracking(order.id);
    setTracking(trackingData);
    setShowTrackingModal(true);
  };

  const handleConfirmOrder = async () => {
    if (!selectedOrder) return;

    setLoading(true);
    try {
      const result = await workflowService.confirmOrderManually(
        selectedOrder.id, 
        confirmationData.confirmedBy, 
        confirmationData.notes
      );
      
      if (result.success) {
        setMessage({ type: 'success', text: 'Order confirmed successfully!' });
        await loadOrders();
        setShowConfirmModal(false);
        setConfirmationData({ confirmedBy: '', notes: '' });
      } else {
        setMessage({ type: 'error', text: 'Failed to simulate confirmation' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Error simulating confirmation' });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateDelivery = async () => {
    if (!selectedOrder) return;

    setLoading(true);
    try {
      const result = await workflowService.updateDeliveryStatus(
        selectedOrder.id,
        deliveryData.status,
        deliveryData.location,
        deliveryData.description,
        deliveryData.estimatedDelivery
      );
      
      if (result.success) {
        setMessage({ type: 'success', text: 'Delivery status updated successfully!' });
        await loadOrders();
        setShowDeliveryModal(false);
        setDeliveryData({ status: 'in_transit', location: '', description: '', estimatedDelivery: '' });
      } else {
        setMessage({ type: 'error', text: result.message || 'Failed to update delivery status' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Error updating delivery status' });
    } finally {
      setLoading(false);
    }
  };

  const canSendOrder = (order: EnhancedPurchaseOrder) => {
    return workflowService.canSendOrder(order);
  };

  const getStatusBadge = (order: EnhancedPurchaseOrder) => {
    const statusInfo = workflowService.getStatusInfo(order);
    return (
      <Badge variant={statusInfo.color} title={statusInfo.description}>
        {statusInfo.display}
      </Badge>
    );
  };

  const getDeliveryStatusBadge = (deliveryStatus?: string) => {
    const statusInfo = workflowService.getDeliveryStatusInfo(deliveryStatus);
    return (
      <span 
        className={`inline-flex items-center gap-1 ${
          deliveryStatus === 'pending' ? 'text-gray-600' :
          deliveryStatus === 'shipped' ? 'text-blue-600' :
          deliveryStatus === 'delivered' ? 'text-green-600' :
          'text-gray-600'
        }`}
        title={statusInfo.display}
      >
        {statusInfo.icon} {statusInfo.display}
      </span>
    );
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Enhanced Purchase Order Workflow</h1>
        <p className="text-muted-foreground">
          Complete order management with supplier notifications and delivery tracking
        </p>
      </div>

      {/* Message Display */}
      {message && (
        <Card className={`border-l-4 ${message.type === 'success' ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'}`}>
          <CardContent className="py-3">
            <p className={message.type === 'success' ? 'text-green-800' : 'text-red-800'}>
              {message.text}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Orders Table */}
      <Card>
        <CardHeader>
          <CardTitle>Purchase Orders</CardTitle>
          <CardDescription>
            Manage orders with automated supplier communication and delivery tracking
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order Number</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Delivery Status</TableHead>
                <TableHead>Total Amount</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map(order => (
                <TableRow key={order.id}>
                  <TableCell className="font-medium">
                    {order.orderNumber}
                  </TableCell>
                  <TableCell>
                    <div>
                      <div>{order.supplierName}</div>
                      {order.supplierEmail && (
                        <div className="text-sm text-muted-foreground">
                          📧 {order.supplierEmail}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(order)}
                  </TableCell>
                  <TableCell>
                    {getDeliveryStatusBadge(order.deliveryStatus)}
                  </TableCell>
                  <TableCell>
                    {order.totalValue?.toLocaleString()} UGX
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      {order.status === 'draft' && (
                        <Button
                          size="sm"
                          onClick={() => {
                            setSelectedOrder(order);
                            setShowSendModal(true);
                          }}
                          disabled={!canSendOrder(order).canSend}
                        >
                          📤 Send
                        </Button>
                      )}
                      
                      {order.status === 'sent' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedOrder(order);
                            setShowConfirmModal(true);
                          }}
                          disabled={loading}
                        >
                          ✅ Confirm
                        </Button>
                      )}

                      {order.status === 'confirmed' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedOrder(order);
                            setShowDeliveryModal(true);
                          }}
                          disabled={loading}
                        >
                          🚚 Update Delivery
                        </Button>
                      )}
                      
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleViewTracking(order)}
                      >
                        📍 Track
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Send Order Modal */}
      {showSendModal && selectedOrder && (
        <Dialog open={true} onOpenChange={() => setShowSendModal(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Send Purchase Order: {selectedOrder.orderNumber}</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              <div>
                <Label>Expected Delivery Date</Label>
                <Input
                  type="date"
                  value={sendOptions.expectedDeliveryDate}
                  onChange={(e) => setSendOptions({ ...sendOptions, expectedDeliveryDate: e.target.value })}
                />
              </div>

              <div className="bg-blue-50 p-4 rounded-lg">
                <h4 className="font-semibold mb-2">What happens when you send this order:</h4>
                <ul className="text-sm space-y-1">
                  <li>✅ Order status changes to SENT</li>
                  <li>📧 Supplier receives email notification with order details</li>
                  <li>🔗 Supplier gets confirmation link to accept the order</li>
                  <li>📊 Delivery tracking begins automatically</li>
                  <li>🔄 Order progresses to CONFIRMED when supplier accepts</li>
                </ul>
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowSendModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleSendOrder} disabled={loading}>
                {loading ? 'Sending...' : 'Send Order'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Tracking Modal */}
      {showTrackingModal && selectedOrder && (
        <Dialog open={true} onOpenChange={() => setShowTrackingModal(false)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Order Tracking: {selectedOrder.orderNumber}</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <div className="font-semibold">{selectedOrder.supplierName}</div>
                  <div className="text-sm text-muted-foreground">
                    Total: {selectedOrder.totalValue?.toLocaleString()} UGX
                  </div>
                </div>
                <div>
                  {getStatusBadge(selectedOrder)}
                </div>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Delivery Timeline</CardTitle>
                </CardHeader>
                <CardContent>
                  {tracking.length === 0 ? (
                    <p className="text-muted-foreground">No tracking information available</p>
                  ) : (
                    <div className="space-y-3">
                      {tracking.map((event) => (
                        <div key={event.id} className="flex items-start space-x-3">
                          <div className="w-3 h-3 bg-blue-500 rounded-full mt-1 flex-shrink-0" />
                          <div className="flex-1">
                            <div className="flex justify-between items-start">
                              <div>
                                <div className="font-medium">{event.description}</div>
                                <div className="text-sm text-muted-foreground">
                                  📍 {event.location}
                                </div>
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {new Date(event.timestamp).toLocaleString()}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
            
            <DialogFooter>
              <Button onClick={() => setShowTrackingModal(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && selectedOrder && (
        <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Order Reception</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              {/* Order Details */}
              <div className="border rounded-lg p-4 bg-muted/50">
                <h4 className="font-semibold mb-2">Order Details</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">Order Number:</span>
                  <span className="font-medium">{selectedOrder.orderNumber}</span>
                  <span className="text-muted-foreground">Supplier:</span>
                  <span className="font-medium">{selectedOrder.supplierName}</span>
                  <span className="text-muted-foreground">Total Amount:</span>
                  <span className="font-medium">{selectedOrder.totalValue?.toLocaleString()} UGX</span>
                  <span className="text-muted-foreground">Items:</span>
                  <span className="font-medium">{selectedOrder.items?.length || 0} items</span>
                </div>
              </div>

              {/* Order Items */}
              {selectedOrder.items && selectedOrder.items.length > 0 && (
                <div className="border rounded-lg p-4">
                  <h4 className="font-semibold mb-2">Items to Receive</h4>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {selectedOrder.items.map((item, index) => (
                      <div key={index} className="flex justify-between items-center text-sm p-2 bg-muted/30 rounded">
                        <span className="font-medium">{item.productName}</span>
                        <span className="text-muted-foreground">Qty: {item.quantityOrdered}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Confirmation Form */}
              <div className="space-y-3">
                <div>
                  <Label htmlFor="confirmedBy">Confirmed By</Label>
                  <Input
                    id="confirmedBy"
                    placeholder="Enter your name"
                    value={confirmationData.confirmedBy}
                    onChange={(e) => setConfirmationData({ ...confirmationData, confirmedBy: e.target.value })}
                  />
                </div>
                
                <div>
                  <Label htmlFor="notes">Notes (Optional)</Label>
                  <Input
                    id="notes"
                    placeholder="Any notes about the delivery..."
                    value={confirmationData.notes}
                    onChange={(e) => setConfirmationData({ ...confirmationData, notes: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowConfirmModal(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleConfirmOrder} 
                disabled={loading || !confirmationData.confirmedBy.trim()}
              >
                {loading ? 'Confirming...' : 'Confirm Receipt'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Delivery Update Modal */}
      {showDeliveryModal && selectedOrder && (
        <Dialog open={showDeliveryModal} onOpenChange={setShowDeliveryModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Update Delivery Status</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              {/* Order Details */}
              <div className="border rounded-lg p-4 bg-muted/50">
                <h4 className="font-semibold mb-2">Order Details</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">Order Number:</span>
                  <span className="font-medium">{selectedOrder.orderNumber}</span>
                  <span className="text-muted-foreground">Supplier:</span>
                  <span className="font-medium">{selectedOrder.supplierName}</span>
                  <span className="text-muted-foreground">Current Status:</span>
                  <span className="font-medium capitalize">{selectedOrder.status}</span>
                </div>
              </div>

              {/* Delivery Update Form */}
              <div className="space-y-3">
                <div>
                  <Label htmlFor="deliveryStatus">Delivery Status</Label>
                  <select
                    id="deliveryStatus"
                    title="Select delivery status"
                    className="w-full px-3 py-2 border rounded-md"
                    value={deliveryData.status}
                    onChange={(e) => setDeliveryData({ ...deliveryData, status: e.target.value })}
                  >
                    <option value="in_transit">In Transit</option>
                    <option value="out_for_delivery">Out for Delivery</option>
                    <option value="delivered">Delivered</option>
                    <option value="delayed">Delayed</option>
                  </select>
                </div>
                
                <div>
                  <Label htmlFor="location">Current Location</Label>
                  <Input
                    id="location"
                    placeholder="e.g., Distribution Center, On Route, Office"
                    value={deliveryData.location}
                    onChange={(e) => setDeliveryData({ ...deliveryData, location: e.target.value })}
                  />
                </div>
                
                <div>
                  <Label htmlFor="description">Status Description</Label>
                  <Input
                    id="description"
                    placeholder="e.g., Package left distribution center, Delivery attempted"
                    value={deliveryData.description}
                    onChange={(e) => setDeliveryData({ ...deliveryData, description: e.target.value })}
                  />
                </div>
                
                <div>
                  <Label htmlFor="estimatedDelivery">Estimated Delivery (Optional)</Label>
                  <Input
                    id="estimatedDelivery"
                    type="datetime-local"
                    value={deliveryData.estimatedDelivery}
                    onChange={(e) => setDeliveryData({ ...deliveryData, estimatedDelivery: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDeliveryModal(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleUpdateDelivery} 
                disabled={loading || !deliveryData.location.trim() || !deliveryData.description.trim()}
              >
                {loading ? 'Updating...' : 'Update Status'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Workflow Explanation */}
      <Card>
        <CardHeader>
          <CardTitle>Enhanced Workflow Features</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <h4 className="font-semibold text-green-600">✅ Automated Notifications</h4>
              <p className="text-sm text-muted-foreground">
                Suppliers automatically receive email notifications with order details and confirmation links
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-blue-600">🔄 Status Progression</h4>
              <p className="text-sm text-muted-foreground">
                Orders automatically progress from SENT → CONFIRMED when suppliers accept via email
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-purple-600">📍 Delivery Tracking</h4>
              <p className="text-sm text-muted-foreground">
                Real-time tracking updates from order placement through delivery completion
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default EnhancedPurchaseOrderWorkflow;