/**
 * Purchase Management Service
 * Handles purchase orders, receiving, supplier management, and purchase analytics
 */

import type { 
  PurchaseOrder, 
  PurchaseOrderItem, 
  PurchaseReceiving, 
  Supplier
} from '../models/BatchInventory';
import InventoryBatchService from './InventoryBatchService';

export interface PurchaseOrderSummary {
  totalOrders: number;
  totalValue: number;
  pendingOrders: number;
  pendingValue: number;
  receivedOrders: number;
  receivedValue: number;
}

export interface SupplierPerformance {
  supplierId: string;
  supplierName: string;
  totalOrders: number;
  totalValue: number;
  averageOrderValue: number;
  onTimeDeliveryRate: number;
  lastOrderDate?: string;
}

class PurchaseManagementService {
  private static instance: PurchaseManagementService;
  private readonly SUPPLIERS_KEY = 'suppliers';
  private readonly PURCHASE_ORDERS_KEY = 'purchase_orders';
  private inventoryService: InventoryBatchService;

  private constructor() {
    this.inventoryService = InventoryBatchService.getInstance();
    this.initializeDefaultData();
  }

  static getInstance(): PurchaseManagementService {
    if (!PurchaseManagementService.instance) {
      PurchaseManagementService.instance = new PurchaseManagementService();
    }
    return PurchaseManagementService.instance;
  }

  private initializeDefaultData(): void {
    // Initialize with sample suppliers if none exist
    if (!localStorage.getItem(this.SUPPLIERS_KEY)) {
      const defaultSuppliers: Supplier[] = [
        {
          id: 'supplier-1',
          name: 'ABC Distribution Ltd',
          contactPerson: 'John Doe',
          email: 'john@abcdist.com',
          phone: '+256-700-123456',
          address: 'Plot 123, Industrial Area, Kampala',
          paymentTerms: 'Net 30',
          isActive: true,
          notes: 'Main supplier for beverages and snacks',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ];
      this.saveSuppliers(defaultSuppliers);
    }
  }

  // ==================== SUPPLIER MANAGEMENT ====================

  getSuppliers(): Supplier[] {
    try {
      const stored = localStorage.getItem(this.SUPPLIERS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error loading suppliers:', error);
      return [];
    }
  }

  getSupplier(id: string): Supplier | null {
    const suppliers = this.getSuppliers();
    return suppliers.find(s => s.id === id) || null;
  }

  saveSupplier(supplier: Supplier): boolean {
    try {
      const suppliers = this.getSuppliers();
      const existingIndex = suppliers.findIndex(s => s.id === supplier.id);
      
      if (existingIndex >= 0) {
        suppliers[existingIndex] = { ...supplier, updatedAt: new Date().toISOString() };
      } else {
        suppliers.push({ ...supplier, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      }
      
      this.saveSuppliers(suppliers);
      return true;
    } catch (error) {
      console.error('Error saving supplier:', error);
      return false;
    }
  }

  private saveSuppliers(suppliers: Supplier[]): void {
    localStorage.setItem(this.SUPPLIERS_KEY, JSON.stringify(suppliers));
  }

  deleteSupplier(id: string): boolean {
    try {
      // Check if supplier has pending orders
      const orders = this.getPurchaseOrders();
      const hasActiveOrders = orders.some(order => 
        String(order.supplierId) === String(id) && ['draft', 'sent', 'confirmed', 'partial'].includes(order.status)
      );

      if (hasActiveOrders) {
        throw new Error('Cannot delete supplier with active purchase orders');
      }

      const suppliers = this.getSuppliers().filter(s => String(s.id) !== String(id));
      this.saveSuppliers(suppliers);
      return true;
    } catch (error) {
      console.error('Error deleting supplier:', error);
      return false;
    }
  }

  // ==================== PURCHASE ORDER MANAGEMENT ====================

  getPurchaseOrders(): PurchaseOrder[] {
    try {
      const stored = localStorage.getItem(this.PURCHASE_ORDERS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error loading purchase orders:', error);
      return [];
    }
  }

  getPurchaseOrder(id: string): PurchaseOrder | null {
    const orders = this.getPurchaseOrders();
    return orders.find(o => String(o.id) === String(id)) || null;
  }

  createPurchaseOrder(orderData: Omit<PurchaseOrder, 'id' | 'createdAt' | 'updatedAt'>): number {
    const newOrder: PurchaseOrder = {
      ...orderData,
      id: Date.now(), // Bank-grade: Use number ID
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const orders = this.getPurchaseOrders();
    orders.push(newOrder);
    localStorage.setItem('purchaseOrders', JSON.stringify(orders));
    
    return Number(newOrder.id);
  }

  updatePurchaseOrder(id: string, updates: Partial<PurchaseOrder>): boolean {
    try {
      const orders = this.getPurchaseOrders();
      const orderIndex = orders.findIndex(o => String(o.id) === String(id));
      
      if (orderIndex === -1) {
        throw new Error('Purchase order not found');
      }

      orders[orderIndex] = {
        ...orders[orderIndex],
        ...updates,
        updatedAt: new Date().toISOString()
      };

      this.savePurchaseOrders(orders);
      return true;
    } catch (error) {
      console.error('Error updating purchase order:', error);
      return false;
    }
  }

  private savePurchaseOrders(orders: PurchaseOrder[]): void {
    localStorage.setItem(this.PURCHASE_ORDERS_KEY, JSON.stringify(orders));
  }

  deletePurchaseOrder(id: string): boolean {
    try {
      const order = this.getPurchaseOrder(id);
      if (!order) {
        throw new Error('Purchase order not found');
      }

      if (!['draft', 'cancelled'].includes(order.status)) {
        throw new Error('Can only delete draft or cancelled orders');
      }

      const orders = this.getPurchaseOrders().filter(o => String(o.id) !== String(id));
      this.savePurchaseOrders(orders);
      return true;
    } catch (error) {
      console.error('Error deleting purchase order:', error);
      return false;
    }
  }

  // ==================== PURCHASE RECEIVING ====================

  receivePurchaseOrder(purchaseOrderId: string, receivingData: {
    receivedBy: string;
    receivedDate: string;
    items: Array<{
      productId: string;
      quantityReceived: number;
      batchNumber: string;
      expiryDate?: string;
      manufacturingDate?: string;
      supplierBatchRef?: string;
      location?: string;
      notes?: string;
    }>;
    notes?: string;
  }): boolean {
    try {
      const purchaseOrder = this.getPurchaseOrder(purchaseOrderId);
      if (!purchaseOrder) {
        throw new Error('Purchase order not found');
      }

      // Create receiving record
      const receiving: PurchaseReceiving = {
        id: `recv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        purchaseOrderId,
        purchaseOrderNumber: purchaseOrder.orderNumber,
        supplier: purchaseOrder.supplierName,
        supplierId: purchaseOrder.supplierId,
        receivedBy: receivingData.receivedBy,
        receivedDate: receivingData.receivedDate,
        items: receivingData.items.map(item => {
          const orderItem = purchaseOrder.items.find((oi: any) => oi.productId === item.productId);
          return {
            productId: item.productId,
            productName: orderItem?.productName || 'Unknown Product',
            batchNumber: item.batchNumber,
            quantity: item.quantityReceived,
            quantityOrdered: orderItem?.quantityOrdered || 0,
            quantityReceived: item.quantityReceived,
            unitCost: orderItem?.unitCost || 0,
            total: (orderItem?.unitCost || 0) * item.quantityReceived,
            totalCost: (orderItem?.unitCost || 0) * item.quantityReceived,
            expiryDate: item.expiryDate,
            manufacturingDate: item.manufacturingDate,
            supplierBatchRef: item.supplierBatchRef,
            location: item.location,
            notes: item.notes
          };
        }),
        totalValue: 0, // Will be calculated below
        totalQuantity: 0, // Will be calculated below
        totalCost: 0, // Will be calculated below
        status: 'complete',
        notes: receivingData.notes,
        createdAt: new Date().toISOString()
      };

      // Calculate total values
      receiving.totalValue = receiving.items.reduce((sum: number, item: any) => sum + (item.totalCost || 0), 0);
      receiving.totalQuantity = receiving.items.reduce((sum: number, item: any) => sum + (item.quantity || item.quantityReceived || 0), 0);
      receiving.totalCost = receiving.totalValue;

      // Process through inventory batch service
      const success = this.inventoryService.receivePurchase(receiving);
      
      if (success) {
        // Update purchase order status
        const fullyReceived = purchaseOrder.items.every((orderItem: any) => {
          const receivedQty = receiving.items
            .filter((ri: any) => ri.productId === orderItem.productId)
            .reduce((sum: number, ri: any) => sum + ri.quantityReceived, 0);
          return receivedQty >= orderItem.quantityOrdered;
        });

        this.updatePurchaseOrder(purchaseOrderId, {
          status: fullyReceived ? 'received' : 'partial'
        });
      }

      return success;
    } catch (error) {
      console.error('Error receiving purchase order:', error);
      return false;
    }
  }

  // ==================== ANALYTICS AND REPORTING ====================

  getPurchaseOrderSummary(): PurchaseOrderSummary {
    const orders = this.getPurchaseOrders();
    
    const pending = orders.filter(o => ['draft', 'sent', 'confirmed', 'partial'].includes(o.status));
    const received = orders.filter(o => o.status === 'received');

    return {
      totalOrders: orders.length,
      totalValue: orders.reduce((sum, o) => sum + (o.totalValue || 0), 0),
      pendingOrders: pending.length,
      pendingValue: pending.reduce((sum, o) => sum + (o.totalValue || 0), 0),
      receivedOrders: received.length,
      receivedValue: received.reduce((sum, o) => sum + (o.totalValue || 0), 0)
    };
  }

  getSupplierPerformance(): SupplierPerformance[] {
    const orders = this.getPurchaseOrders();
    const suppliers = this.getSuppliers();

    return suppliers.map(supplier => {
      const supplierOrders = orders.filter(o => String(o.supplierId) === String(supplier.id));
      const totalValue = supplierOrders.reduce((sum, o) => sum + (o.totalValue || 0), 0);
      
      // Calculate on-time delivery rate (simplified)
      const completedOrders = supplierOrders.filter(o => o.status === 'received');
      // Simplified: assume 100% on-time delivery for now
      // In real implementation, compare actual vs expected delivery dates
      const onTimeDeliveries = completedOrders;

      const lastOrder = supplierOrders
        .sort((a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime())[0];

      return {
        supplierId: String(supplier.id),
        supplierName: supplier.name,
        totalOrders: supplierOrders.length,
        totalValue,
        averageOrderValue: supplierOrders.length > 0 ? totalValue / supplierOrders.length : 0,
        onTimeDeliveryRate: completedOrders.length > 0 ? 
          (onTimeDeliveries.length / completedOrders.length) * 100 : 100,
        lastOrderDate: lastOrder?.orderDate
      };
    });
  }

  // ==================== UTILITY METHODS ====================

  generateOrderNumber(): string {
    const orders = this.getPurchaseOrders();
    const today = new Date();
    const datePrefix = `PO${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}`;
    
    // Find highest number for today
    const todayOrders = orders.filter(o => o.orderNumber.startsWith(datePrefix));
    const maxNumber = todayOrders.reduce((max, order) => {
      const numberPart = parseInt(order.orderNumber.split('-')[1] || '0');
      return Math.max(max, numberPart);
    }, 0);

    return `${datePrefix}-${String(maxNumber + 1).padStart(3, '0')}`;
  }

  calculateOrderTotal(items: PurchaseOrderItem[]): { subtotal: number; tax: number; total: number } {
    const subtotal = items.reduce((sum, item) => sum + (item.totalCost || 0), 0);
    const tax = subtotal * 0.18; // 18% VAT (configurable)
    const total = subtotal + tax;

    return { subtotal, tax, total };
  }

  // Get products that need restocking (low stock)
  getRestockSuggestions(): Array<{
    productId: string | number;
    productName: string;
    currentStock: number;
    reorderLevel: number;
    suggestedOrderQuantity: number;
    preferredSupplier?: string | number;
  }> {
    const products = this.inventoryService.getProducts();
    const suggestions = [];

    for (const product of products) {
      const stockSummary = this.inventoryService.getProductStockSummary(product.id);
      
      if (stockSummary && stockSummary.isLowStock) {
        const reorderLevel = product.reorderLevel || 0;
        const suggestedQuantity = Math.max(
          reorderLevel * 2, // Reorder to double the reorder level
          stockSummary.availableQuantity * 3 // Or triple current stock
        );

        suggestions.push({
          productId: product.id,
          productName: product.name,
          currentStock: stockSummary.availableQuantity,
          reorderLevel: reorderLevel,
          suggestedOrderQuantity: suggestedQuantity,
          preferredSupplier: product.supplier
        });
      }
    }

    return suggestions;
  }
}

export default PurchaseManagementService;