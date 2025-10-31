import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Package, AlertCircle, CheckCircle, Clock } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { useToast } from "./ui/toast";
import { usePurchaseOrders, usePurchaseOrder } from '../services/api/purchaseOrdersApi';
import { useCreateGoodsReceipt, useFinalizeGoodsReceipt } from '../services/api/goodsReceiptsApi';
import { format } from 'date-fns';

interface ReceivingItem {
  purchaseItemId: string;
  productId: string; // Changed from number to string (CUID)
  productName: string;
  orderedQuantity: number;
  receivedQuantity: number;
  remainingQuantity: number;
  unitCost: number;
  receiveNow: number;
  batchNumber: string;
  expiryDate: string;
  manufacturingDate: string;
  hasExpiry: boolean;
}

const PurchaseReceiving: React.FC = () => {
  const { toast } = useToast();
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string | null>(null);
  const [showReceiveDialog, setShowReceiveDialog] = useState(false);
  const [receivingItems, setReceivingItems] = useState<ReceivingItem[]>([]);
  const [receivedDate, setReceivedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState('');
  const [grExportFormat, setGrExportFormat] = useState<'CSV' | 'PDF'>('CSV');

  const { data: purchasesResponse, isLoading } = usePurchaseOrders({ status: 'PENDING' });
  const { data: selectedPurchase } = usePurchaseOrder(selectedPurchaseId || '');
  const createGoodsReceiptMutation = useCreateGoodsReceipt();
  const finalizeGoodsReceiptMutation = useFinalizeGoodsReceipt();

  const pendingPurchases = purchasesResponse?.data || [];

  // Initialize receiving items when purchase is selected
  useEffect(() => {
    if (selectedPurchase?.items) {
      const items: ReceivingItem[] = selectedPurchase.items.map((item) => ({
        purchaseItemId: item.id.toString(),
        productId: item.productId, // Keep as string (CUID)
        productName: item.product?.name || `Product ${item.productId}`,
        orderedQuantity: Number(item.orderedQuantity),
        receivedQuantity: Number(item.receivedQuantity) || 0,
        remainingQuantity: Number(item.orderedQuantity) - (Number(item.receivedQuantity) || 0),
        unitCost: Number(item.unitPrice),
        receiveNow: 0,
        batchNumber: '',
        expiryDate: '',
        manufacturingDate: '',
        hasExpiry: false,
      }));
      setReceivingItems(items);
    }
  }, [selectedPurchase]);

  const handleOpenReceiveDialog = (purchaseId: string) => {
    setSelectedPurchaseId(purchaseId);
    setShowReceiveDialog(true);
    setReceivedDate(format(new Date(), 'yyyy-MM-dd'));
    setNotes('');
  };

  const handleReceiveQuantityChange = (index: number, value: string) => {
    const numValue = parseInt(value) || 0;
    setReceivingItems(items =>
      items.map((item, i) =>
        i === index
          ? { ...item, receiveNow: Math.min(Math.max(0, numValue), item.remainingQuantity) }
          : item
      )
    );
  };

  const handleBatchNumberChange = (index: number, value: string) => {
    setReceivingItems(items =>
      items.map((item, i) => (i === index ? { ...item, batchNumber: value } : item))
    );
  };

  const handleExpiryDateChange = (index: number, value: string) => {
    setReceivingItems(items =>
      items.map((item, i) => (i === index ? { ...item, expiryDate: value } : item))
    );
  };

  const handleMfgDateChange = (index: number, value: string) => {
    setReceivingItems(items =>
      items.map((item, i) => (i === index ? { ...item, manufacturingDate: value } : item))
    );
  };

  const handleToggleExpiry = (index: number) => {
    setReceivingItems(items =>
      items.map((item, i) =>
        i === index
          ? { ...item, hasExpiry: !item.hasExpiry, expiryDate: !item.hasExpiry ? '' : item.expiryDate }
          : item
      )
    );
  };

  const handleReceiveAll = () => {
    setReceivingItems(items =>
      items.map(item => ({ ...item, receiveNow: item.remainingQuantity }))
    );
  };

  const validateReceiving = (): string | null => {
    const itemsToReceive = receivingItems.filter(item => item.receiveNow > 0);

    if (itemsToReceive.length === 0) {
      return 'Please enter quantities to receive for at least one item';
    }

    for (const item of itemsToReceive) {
      if (item.receiveNow > item.remainingQuantity) {
        return `${item.productName}: Cannot receive more than remaining quantity (${item.remainingQuantity})`;
      }

      console.log(`Validating ${item.productName}: batchNumber="${item.batchNumber}", trimmed="${item.batchNumber?.trim() || ''}", length=${item.batchNumber?.length || 0}`);
      
      if (!item.batchNumber || !item.batchNumber.trim()) {
        return `${item.productName}: Batch number is required (current value: "${item.batchNumber || 'empty'}")`;
      }

      if (item.hasExpiry && !item.expiryDate) {
        return `${item.productName}: Expiry date is required when tracking expiry`;
      }

      if (item.hasExpiry && item.expiryDate) {
        const expiryDate = new Date(item.expiryDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (expiryDate <= today) {
          return `${item.productName}: Expiry date must be in the future`;
        }

        if (item.manufacturingDate) {
          const mfgDate = new Date(item.manufacturingDate);
          if (mfgDate >= expiryDate) {
            return `${item.productName}: Manufacturing date must be before expiry date`;
          }
        }
      }

      if (item.manufacturingDate && !item.hasExpiry) {
        const mfgDate = new Date(item.manufacturingDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (mfgDate > today) {
          return `${item.productName}: Manufacturing date cannot be in the future`;
        }
      }
    }

    const receiveDateObj = new Date(receivedDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    receiveDateObj.setHours(0, 0, 0, 0);

    console.log('Date validation:', {
      receivedDate,
      receiveDateObj: receiveDateObj.toISOString(),
      today: today.toISOString(),
      isInFuture: receiveDateObj > today
    });

    if (receiveDateObj > today) {
      return `Received date cannot be in the future (Received: ${receivedDate}, Today: ${format(today, 'yyyy-MM-dd')})`;
    }

    return null;
  };

  const handleSubmitReceiving = async () => {
    const validationError = validateReceiving();
    if (validationError) {
      toast({ title: "Validation Error", description: validationError, variant: "destructive" });
      return;
    }

    const itemsToReceive = receivingItems.filter(item => item.receiveNow > 0);

    console.log('[RECEIVE] Starting to receive items:', itemsToReceive.length);
    console.log('[RECEIVE] Purchase ID:', selectedPurchaseId);

    try {
      // Create Goods Receipt with all items in one API call
      console.log('[RECEIVE] Creating Goods Receipt with items');
      
      const goodsReceiptData = {
        purchaseOrderId: selectedPurchaseId!,
        receivedDate: new Date(receivedDate).toISOString(),
        notes: notes.trim() || undefined,
        items: itemsToReceive.map(item => ({
          purchaseOrderItemId: item.purchaseItemId,
          productId: item.productId,
          receivedQuantity: item.receiveNow,
          actualCost: item.unitCost,
          batchNumber: item.batchNumber.trim() || undefined,
          expiryDate: item.hasExpiry && item.expiryDate ? new Date(item.expiryDate).toISOString() : undefined,
        }))
      };

      console.log('[RECEIVE] Goods Receipt Data:', JSON.stringify(goodsReceiptData, null, 2));

      // Create the goods receipt (DRAFT status)
      const goodsReceipt = await createGoodsReceiptMutation.mutateAsync(goodsReceiptData);
      console.log('[RECEIVE] Goods Receipt created:', goodsReceipt.receiptNumber);

      // Finalize the goods receipt (creates GoodsReceiptItems, updates stock, creates batches)
      console.log('[RECEIVE] Finalizing Goods Receipt');
      await finalizeGoodsReceiptMutation.mutateAsync({
        id: goodsReceipt.id,
        data: {
          createBatches: true,
          updateStock: true,
          updatePurchaseOrder: true
        }
      });
      console.log('[RECEIVE] Goods Receipt finalized successfully');

      const totalReceived = itemsToReceive.reduce((sum, item) => sum + item.receiveNow, 0);
      
      console.log('[RECEIVE] All items processed successfully, total:', totalReceived);
      
      // Goods Receipt finalization already updates the Purchase Order status
      
      toast({
        title: "Success",
        description: `Successfully received ${totalReceived} items via Goods Receipt ${goodsReceipt.receiptNumber}`,
      });

      setShowReceiveDialog(false);
      setSelectedPurchaseId(null);
      setReceivingItems([]);
      setNotes('');
    } catch (error: any) {
      console.error('[RECEIVE] Error in handleSubmitReceiving:', error);
      console.error('[RECEIVE] Full error object:', JSON.stringify(error, null, 2));
      
      toast({
        title: "Error",
        description: error.response?.data?.message || error.message || "Failed to receive items",
        variant: "destructive",
      });
    }
  };

  const getTotalToReceive = () => receivingItems.reduce((sum, item) => sum + item.receiveNow, 0);
  const getTotalValue = () => receivingItems.reduce((sum, item) => sum + (item.receiveNow * item.unitCost), 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Pending Orders</CardDescription>
            <CardTitle className="text-3xl">{pendingPurchases.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Awaiting Receiving</CardDescription>
            <CardTitle className="text-3xl text-orange-600">
              {pendingPurchases.length} orders
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Total Pending Value</CardDescription>
            <CardTitle className="text-3xl text-blue-600">
              {pendingPurchases.reduce((sum, po) => sum + Number(po.totalAmount), 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Purchase Receiving
                </CardTitle>
                <CardDescription>
                  Receive goods from purchase orders and create inventory batches with expiry tracking
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Select value={grExportFormat} onValueChange={(v) => setGrExportFormat(v as 'CSV' | 'PDF')}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue placeholder="Format" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CSV">CSV</SelectItem>
                    <SelectItem value="PDF">PDF</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      if (grExportFormat === 'PDF') {
                        console.warn('PDF export for Goods Receipts is not yet available.');
                        return;
                      }
                      const api = (await import('@/config/api.config')).default;
                      const res = await api.get('/goods-receipts/export', { responseType: 'blob' });
                      const url = window.URL.createObjectURL(res.data);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `goods-receipts-${new Date().toISOString().slice(0,10)}.csv`;
                      a.click();
                      window.URL.revokeObjectURL(url);
                    } catch (err) {
                      console.error('Failed to export goods receipts', err);
                    }
                  }}
                >
                  Export
                </Button>
              </div>
            </div>
          </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <Clock className="h-8 w-8 animate-spin mx-auto text-gray-400" />
              <p className="mt-2 text-sm text-gray-500">Loading purchase orders...</p>
            </div>
          ) : pendingPurchases.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle className="h-12 w-12 mx-auto text-green-400" />
              <p className="mt-2 text-gray-500">No pending purchase orders to receive</p>
              <p className="text-sm text-gray-400 mt-1">All orders have been fully received</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PO Number</TableHead>
                    <TableHead>Supplier ID</TableHead>
                    <TableHead>Order Date</TableHead>
                    <TableHead>Total Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingPurchases.map((purchase) => (
                    <TableRow key={purchase.id}>
                      <TableCell className="font-medium">{purchase.poNumber}</TableCell>
                      <TableCell>
                        {purchase.supplier?.name ? (
                          <Badge variant="secondary">{purchase.supplier.name}</Badge>
                        ) : (
                          <span className="text-sm text-gray-500">Supplier #{purchase.supplierId}</span>
                        )}
                      </TableCell>
                      <TableCell>{purchase.orderDate ? format(new Date(purchase.orderDate), 'MMM dd, yyyy') : '-'}</TableCell>
                      <TableCell>₱{Number(purchase.totalAmount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell>
                        <Badge variant={purchase.status === 'PENDING' ? 'secondary' : 'default'}>
                          {purchase.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          onClick={() => handleOpenReceiveDialog(purchase.id)}
                        >
                          <Package className="h-4 w-4 mr-2" />
                          Receive
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showReceiveDialog} onOpenChange={setShowReceiveDialog}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Receive Purchase Order - {selectedPurchase?.poNumber || selectedPurchaseId}</DialogTitle>
            <DialogDescription>
              Enter received quantities and batch details. Expiry tracking ensures proper FIFO inventory management.
            </DialogDescription>
          </DialogHeader>

          {selectedPurchase && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-md">
                <div>
                  <Label className="text-xs text-gray-500">Supplier</Label>
                  <p className="font-medium">{selectedPurchase.supplier?.name}</p>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Order Date</Label>
                  <p>{selectedPurchase.orderDate ? format(new Date(selectedPurchase.orderDate), 'MMM dd, yyyy') : '-'}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Received Date *</Label>
                  <Input
                    type="date"
                    value={receivedDate}
                    onChange={(e) => setReceivedDate(e.target.value)}
                    max={format(new Date(), 'yyyy-MM-dd')}
                  />
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-600">
                    * Required fields - Enter the actual batch numbers from supplier packaging
                  </div>
                  <Button onClick={handleReceiveAll} variant="outline" size="sm">
                    Receive All
                  </Button>
                </div>
              </div>

              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead className="w-[200px]">Product</TableHead>
                      <TableHead className="w-[100px]">Ordered</TableHead>
                      <TableHead className="w-[100px]">Received</TableHead>
                      <TableHead className="w-[100px]">Remaining</TableHead>
                      <TableHead className="w-[120px]">Receive Now *</TableHead>
                      <TableHead className="w-[150px]">Batch Number *</TableHead>
                      <TableHead className="w-[80px]">Track Expiry</TableHead>
                      <TableHead className="w-[140px]">Mfg Date</TableHead>
                      <TableHead className="w-[140px]">Expiry Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {receivingItems.map((item, index) => (
                      <TableRow key={item.purchaseItemId} className={item.receiveNow > 0 ? 'bg-blue-50' : ''}>
                        <TableCell className="font-medium">
                          <div>
                            <p>{item.productName}</p>
                            <p className="text-xs text-gray-500">{item.unitCost.toFixed(2)} each</p>
                          </div>
                        </TableCell>
                        <TableCell>{item.orderedQuantity}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{item.receivedQuantity}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={item.remainingQuantity > 0 ? 'default' : 'secondary'}>
                            {item.remainingQuantity}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            max={item.remainingQuantity}
                            value={item.receiveNow || ''}
                            onChange={(e) => handleReceiveQuantityChange(index, e.target.value)}
                            placeholder="0"
                            className="w-full"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={item.batchNumber}
                            onChange={(e) => handleBatchNumberChange(index, e.target.value)}
                            placeholder="Enter batch #"
                            disabled={item.receiveNow === 0}
                            className={`w-full ${item.receiveNow > 0 && !item.batchNumber ? 'border-red-300' : ''}`}
                            required
                          />
                        </TableCell>
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={item.hasExpiry}
                            onChange={() => handleToggleExpiry(index)}
                            disabled={item.receiveNow === 0}
                            className="w-4 h-4"
                            aria-label={`Track expiry for ${item.productName}`}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="date"
                            value={item.manufacturingDate}
                            onChange={(e) => handleMfgDateChange(index, e.target.value)}
                            max={format(new Date(), 'yyyy-MM-dd')}
                            disabled={item.receiveNow === 0}
                            className="w-full"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="date"
                            value={item.expiryDate}
                            onChange={(e) => handleExpiryDateChange(index, e.target.value)}
                            min={format(new Date(), 'yyyy-MM-dd')}
                            disabled={item.receiveNow === 0 || !item.hasExpiry}
                            className="w-full"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div>
                <Label>Receiving Notes</Label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any notes about this receiving (damage, quality issues, etc.)..."
                  className="w-full min-h-[80px] px-3 py-2 text-sm border rounded-md"
                />
              </div>

              <div className="flex items-center justify-between p-4 bg-blue-50 rounded-md">
                <div className="flex gap-8">
                  <div>
                    <p className="text-sm text-gray-600">Total Items to Receive</p>
                    <p className="text-2xl font-bold text-blue-600">{getTotalToReceive()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Total Value</p>
                    <p className="text-2xl font-bold text-green-600">
                      {getTotalValue().toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <AlertCircle className="h-4 w-4" />
                  <span>Stock batches will be created automatically</span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowReceiveDialog(false); setSelectedPurchaseId(null); }}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmitReceiving}
              disabled={createGoodsReceiptMutation.isPending || finalizeGoodsReceiptMutation.isPending || getTotalToReceive() === 0}
            >
              {(createGoodsReceiptMutation.isPending || finalizeGoodsReceiptMutation.isPending) ? 'Processing...' : `Receive ${getTotalToReceive()} Items`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PurchaseReceiving;
