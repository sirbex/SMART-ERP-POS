/**
 * Enhanced Supplier Catalog Service
 * Manages supplier items, pricing history, and detailed purchase tracking
 */

import type { 
  SupplierItem,
  SupplierPriceHistory,
  DetailedPurchaseHistory,
  DetailedPurchaseItem,
  SupplierPerformanceMetrics
} from '../models/SupplierCatalog';
import type { PurchaseOrder, PurchaseReceiving } from '../models/BatchInventory';


class SupplierCatalogService {
  private static instance: SupplierCatalogService;
  private readonly SUPPLIER_ITEMS_KEY = 'supplier_items';
  private readonly PRICE_HISTORY_KEY = 'supplier_price_history';
  private readonly DETAILED_PURCHASE_HISTORY_KEY = 'detailed_purchase_history';

  private constructor() {
    this.initializeDefaultData();
  }

  static getInstance(): SupplierCatalogService {
    if (!SupplierCatalogService.instance) {
      SupplierCatalogService.instance = new SupplierCatalogService();
    }
    return SupplierCatalogService.instance;
  }

  private initializeDefaultData(): void {
    if (!localStorage.getItem(this.SUPPLIER_ITEMS_KEY)) {
      this.createSampleSupplierItems();
    }
    if (!localStorage.getItem(this.PRICE_HISTORY_KEY)) {
      this.createSamplePriceHistory();
    }
    if (!localStorage.getItem(this.DETAILED_PURCHASE_HISTORY_KEY)) {
      this.createSampleDetailedHistory();
    }
  }

  // ===== SUPPLIER ITEM MANAGEMENT =====

  /**
   * Get all supplier items with optional filtering
   */
  getSupplierItems(supplierId?: string, productId?: string): SupplierItem[] {
    const items = this.getStoredSupplierItems();
    
    if (supplierId && productId) {
      return items.filter(item => item.supplierId === supplierId && item.productId === productId);
    } else if (supplierId) {
      return items.filter(item => item.supplierId === supplierId);
    } else if (productId) {
      return items.filter(item => item.productId === productId);
    }
    
    return items;
  }

  /**
   * Get supplier items for a specific supplier with performance data
   */
  getSupplierCatalog(supplierId: string): SupplierItem[] {
    const items = this.getSupplierItems(supplierId);
    
    // Enrich with recent performance data
    return items.map(item => ({
      ...item,
      ...this.calculateItemPerformance(item.id)
    }));
  }

  /**
   * Add or update supplier item
   */
  saveSupplierItem(item: Omit<SupplierItem, 'id' | 'createdAt' | 'updatedAt'>): SupplierItem {
    const items = this.getStoredSupplierItems();
    const now = new Date().toISOString();
    
    // Check if item already exists
    const existingItemIndex = items.findIndex(
      existing => existing.supplierId === item.supplierId && 
                 existing.productId === item.productId &&
                 existing.supplierPartNumber === item.supplierPartNumber
    );

    let savedItem: SupplierItem;

    if (existingItemIndex >= 0) {
      // Update existing item
      savedItem = {
        ...items[existingItemIndex],
        ...item,
        updatedAt: now
      };
      items[existingItemIndex] = savedItem;
    } else {
      // Create new item
      savedItem = {
        ...item,
        id: `supplier-item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        createdAt: now,
        updatedAt: now
      };
      items.push(savedItem);
    }

    // Save price history if price changed
    if (existingItemIndex >= 0 && items[existingItemIndex].currentPrice !== item.currentPrice) {
      this.addPriceHistory(savedItem.id, item.currentPrice, 'price_update');
    }

    localStorage.setItem(this.SUPPLIER_ITEMS_KEY, JSON.stringify(items));
    return savedItem;
  }

  // ===== PRICE HISTORY MANAGEMENT =====

  /**
   * Get price history for a supplier item
   */
  getPriceHistory(supplierItemId: string): SupplierPriceHistory[] {
    const history = this.getStoredPriceHistory();
    return history
      .filter(entry => entry.supplierItemId === supplierItemId)
      .sort((a, b) => new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime());
  }

  /**
   * Add price history entry
   */
  addPriceHistory(
    supplierItemId: string, 
    price: number, 
    changeReason?: string
  ): SupplierPriceHistory {
    const history = this.getStoredPriceHistory();
    const supplierItem = this.getSupplierItems().find(item => item.id === supplierItemId);
    
    if (!supplierItem) {
      throw new Error('Supplier item not found');
    }

    // Calculate price change percentage
    const previousEntries = this.getPriceHistory(supplierItemId);
    let priceChangePercentage = 0;
    
    if (previousEntries.length > 0) {
      const previousPrice = previousEntries[0].price;
      priceChangePercentage = previousPrice > 0 ? 
        ((price - previousPrice) / previousPrice) * 100 : 0;
    }

    const entry: SupplierPriceHistory = {
      id: `price-history-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      supplierId: supplierItem.supplierId,
      supplierItemId,
      price,
      currency: supplierItem.currency,
      effectiveDate: new Date().toISOString(),
      changeReason,
      priceChangePercentage,
      recordedAt: new Date().toISOString()
    };

    history.push(entry);
    localStorage.setItem(this.PRICE_HISTORY_KEY, JSON.stringify(history));
    return entry;
  }

  // ===== DETAILED PURCHASE HISTORY =====

  /**
   * Get detailed purchase history with supplier information
   */
  getDetailedPurchaseHistory(
    supplierId?: string,
    startDate?: string,
    endDate?: string
  ): DetailedPurchaseHistory[] {
    const history = this.getStoredDetailedHistory();
    
    let filtered = history;
    
    if (supplierId) {
      filtered = filtered.filter(entry => entry.supplierId === supplierId);
    }
    
    if (startDate) {
      filtered = filtered.filter(entry => entry.orderDate >= startDate);
    }
    
    if (endDate) {
      filtered = filtered.filter(entry => entry.orderDate <= endDate);
    }
    
    return filtered.sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime());
  }

  /**
   * Create detailed purchase history from purchase order and receiving
   */
  createDetailedPurchaseHistory(
    purchaseOrder: PurchaseOrder,
    receiving?: PurchaseReceiving
  ): DetailedPurchaseHistory {
    const supplierItems = this.getSupplierItems(purchaseOrder.supplierId);
    
    // Calculate detailed metrics
    const itemCount = purchaseOrder.items.length;
    const totalQuantityOrdered = purchaseOrder.items.reduce((sum, item) => sum + item.quantityOrdered, 0);
    const totalQuantityReceived = receiving ? 
      receiving.items.reduce((sum, item) => sum + item.quantityReceived, 0) : 0;

    // Calculate performance metrics
    const expectedDelivery = new Date(purchaseOrder.expectedDeliveryDate || purchaseOrder.orderDate);
    const actualDelivery = receiving ? new Date(receiving.receivedDate) : null;
    const onTimeDelivery = actualDelivery ? actualDelivery <= expectedDelivery : false;
    const deliveryDelayDays = actualDelivery ? 
      Math.max(0, Math.ceil((actualDelivery.getTime() - expectedDelivery.getTime()) / (1000 * 60 * 60 * 24))) : undefined;

    const completenessScore = totalQuantityOrdered > 0 ? 
      (totalQuantityReceived / totalQuantityOrdered) * 100 : 0;

    // Create detailed items with enriched information
    const detailedItems: DetailedPurchaseItem[] = purchaseOrder.items.map(orderItem => {
      const receivedItem = receiving?.items.find(ri => ri.productId === orderItem.productId);
      const supplierItem = supplierItems.find(si => si.productId === orderItem.productId);
      
      // Get price history for comparison
      const priceHistory = supplierItem ? this.getPriceHistory(supplierItem.id) : [];
      const previousPrice = priceHistory.length > 1 ? priceHistory[1].price : undefined;
      const priceChange = previousPrice ? orderItem.unitCost - previousPrice : 0;
      const priceChangePercentage = previousPrice && previousPrice > 0 ? 
        (priceChange / previousPrice) * 100 : 0;

      return {
        productId: orderItem.productId,
        productName: orderItem.productName,
        supplierPartNumber: supplierItem?.supplierPartNumber,
        quantityOrdered: orderItem.quantityOrdered,
        quantityReceived: receivedItem?.quantityReceived || 0,
        unitCost: orderItem.unitCost,
        totalCost: orderItem.totalCost,
        discount: 0, // TODO: Extract from enhanced order items
        taxAmount: 0, // TODO: Calculate tax
        finalCost: orderItem.totalCost,
        qualityScore: 4.5, // TODO: Implement quality tracking
        defectiveQuantity: 0,
        batchNumbers: receivedItem ? [receivedItem.batchNumber] : [],
        expiryDates: receivedItem?.expiryDate ? [receivedItem.expiryDate] : [],
        previousPrice,
        priceChange: Math.round(priceChange * 100) / 100,
        priceChangePercentage: Math.round(priceChangePercentage * 100) / 100,
        costEfficiency: this.calculateCostEfficiency(priceChangePercentage),
        notes: orderItem.notes
      };
    });

    const detailedHistory: DetailedPurchaseHistory = {
      id: `detailed-history-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      purchaseOrderId: purchaseOrder.id,
      orderNumber: purchaseOrder.orderNumber,
      supplierId: purchaseOrder.supplierId,
      supplierName: purchaseOrder.supplierName,
      orderDate: purchaseOrder.orderDate,
      deliveryDate: receiving?.receivedDate,
      itemCount,
      totalQuantity: totalQuantityOrdered,
      subtotal: purchaseOrder.subtotal,
      totalDiscount: 0, // TODO: Calculate from detailed items
      totalTax: purchaseOrder.tax,
      shippingCost: purchaseOrder.shippingCost,
      finalTotal: purchaseOrder.totalValue,
      onTimeDelivery,
      deliveryDelayDays,
      qualityIssues: false, // TODO: Implement quality issue tracking
      completenessScore: Math.round(completenessScore * 100) / 100,
      items: detailedItems,
      status: receiving ? 'completed' : 'partial',
      paymentStatus: 'pending', // TODO: Implement payment tracking
      createdAt: purchaseOrder.createdAt,
      receivedAt: receiving?.receivedDate
    };

    // Save to storage
    const history = this.getStoredDetailedHistory();
    const existingIndex = history.findIndex(h => h.purchaseOrderId === purchaseOrder.id);
    
    if (existingIndex >= 0) {
      history[existingIndex] = detailedHistory;
    } else {
      history.push(detailedHistory);
    }
    
    localStorage.setItem(this.DETAILED_PURCHASE_HISTORY_KEY, JSON.stringify(history));
    return detailedHistory;
  }

  // ===== SUPPLIER PERFORMANCE ANALYTICS =====

  /**
   * Calculate comprehensive supplier performance metrics
   */
  calculateSupplierPerformance(supplierId: string): SupplierPerformanceMetrics {
    const history = this.getDetailedPurchaseHistory(supplierId);
    const supplierItems = this.getSupplierItems(supplierId);
    
    if (history.length === 0) {
      return this.getDefaultPerformanceMetrics(supplierId);
    }

    // Calculate order statistics
    const totalOrders = history.length;
    const totalValue = history.reduce((sum, h) => sum + h.finalTotal, 0);
    const averageOrderValue = totalValue / totalOrders;
    
    // Calculate delivery performance
    const deliveredOrders = history.filter(h => h.deliveryDate);
    const onTimeDeliveries = deliveredOrders.filter(h => h.onTimeDelivery).length;
    const onTimeDeliveryRate = deliveredOrders.length > 0 ? 
      (onTimeDeliveries / deliveredOrders.length) * 100 : 0;
    
    const totalDeliveryTime = deliveredOrders.reduce((sum, h) => {
      const orderDate = new Date(h.orderDate);
      const deliveryDate = new Date(h.deliveryDate!);
      return sum + Math.ceil((deliveryDate.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24));
    }, 0);
    const averageDeliveryTime = deliveredOrders.length > 0 ? totalDeliveryTime / deliveredOrders.length : 0;

    // Calculate quality metrics
    const qualityScores = history.flatMap(h => 
      h.items.map(item => item.qualityScore).filter(score => score !== undefined)
    ) as number[];
    const averageQualityScore = qualityScores.length > 0 ? 
      qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length : 5;

    // Calculate financial metrics
    const totalSavings = this.calculateTotalSavings(history);
    const averageDiscount = this.calculateAverageDiscount(history);

    // Determine trends
    const recentHistory = history.slice(0, Math.min(5, Math.floor(history.length / 2)));
    const olderHistory = history.slice(Math.min(5, Math.floor(history.length / 2)));
    
    const performanceTrend = this.determinePerformanceTrend(
      this.calculateAveragePerformance(recentHistory),
      this.calculateAveragePerformance(olderHistory)
    );

    const costTrend = this.determineCostTrend(
      this.calculateAverageCost(recentHistory),
      this.calculateAverageCost(olderHistory)
    );

    // Calculate overall rating
    const overallRating = this.calculateOverallRating({
      onTimeDeliveryRate,
      averageQualityScore,
      completenessScore: history.reduce((sum, h) => sum + h.completenessScore, 0) / history.length,
      costEfficiency: this.calculateSupplierCostEfficiency(history)
    });

    return {
      supplierId,
      supplierName: history[0]?.supplierName || 'Unknown',
      totalOrders,
      totalValue: Math.round(totalValue * 100) / 100,
      averageOrderValue: Math.round(averageOrderValue * 100) / 100,
      orderFrequency: this.calculateOrderFrequency(history),
      onTimeDeliveryRate: Math.round(onTimeDeliveryRate * 100) / 100,
      averageDeliveryTime: Math.round(averageDeliveryTime * 10) / 10,
      deliveryReliabilityScore: Math.round(onTimeDeliveryRate * 10) / 10,
      averageQualityScore: Math.round(averageQualityScore * 10) / 10,
      defectRate: this.calculateDefectRate(history),
      returnRate: this.calculateReturnRate(history),
      complaintCount: this.calculateComplaintCount(history),
      totalSavings: Math.round(totalSavings * 100) / 100,
      averageDiscount: Math.round(averageDiscount * 100) / 100,
      paymentTermsCompliance: 95, // TODO: Implement payment tracking
      priceStability: this.calculatePriceStability(supplierItems),
      performanceTrend,
      costTrend,
      overallRating: Math.round(overallRating * 10) / 10,
      marketPosition: this.determineMarketPosition(overallRating),
      lastEvaluationDate: new Date().toISOString(),
      nextReviewDate: this.calculateNextReviewDate()
    };
  }

  // ===== HELPER METHODS =====

  private calculateItemPerformance(itemId: string) {
    const history = this.getStoredDetailedHistory();
    const itemHistory = history.flatMap(h => 
      h.items.filter(item => item.productId === itemId)
    );

    return {
      orderCount: itemHistory.length,
      averageQuality: itemHistory.length > 0 ? 
        itemHistory.reduce((sum, item) => sum + (item.qualityScore || 5), 0) / itemHistory.length : 5,
      lastOrderDate: itemHistory.length > 0 ? 
        Math.max(...history.map(h => new Date(h.orderDate).getTime())) : undefined
    };
  }

  private calculateCostEfficiency(priceChangePercentage: number): 'excellent' | 'good' | 'average' | 'poor' {
    if (priceChangePercentage <= -10) return 'excellent';
    if (priceChangePercentage <= -5) return 'good';
    if (priceChangePercentage <= 5) return 'average';
    return 'poor';
  }

  private calculateTotalSavings(history: DetailedPurchaseHistory[]): number {
    return history.reduce((sum, h) => sum + h.totalDiscount, 0);
  }

  private calculateAverageDiscount(history: DetailedPurchaseHistory[]): number {
    const totalSubtotal = history.reduce((sum, h) => sum + h.subtotal, 0);
    const totalDiscount = history.reduce((sum, h) => sum + h.totalDiscount, 0);
    return totalSubtotal > 0 ? (totalDiscount / totalSubtotal) * 100 : 0;
  }

  private determinePerformanceTrend(recent: number, older: number): 'improving' | 'stable' | 'declining' {
    const diff = recent - older;
    if (Math.abs(diff) < 0.1) return 'stable';
    return diff > 0 ? 'improving' : 'declining';
  }

  private determineCostTrend(recent: number, older: number): 'decreasing' | 'stable' | 'increasing' {
    const diff = recent - older;
    if (Math.abs(diff) < 0.1) return 'stable';
    return diff > 0 ? 'increasing' : 'decreasing';
  }

  private calculateAveragePerformance(history: DetailedPurchaseHistory[]): number {
    if (history.length === 0) return 0;
    const onTimeRate = history.filter(h => h.onTimeDelivery).length / history.length;
    const completenessRate = history.reduce((sum, h) => sum + h.completenessScore, 0) / history.length / 100;
    return (onTimeRate + completenessRate) / 2;
  }

  private calculateAverageCost(history: DetailedPurchaseHistory[]): number {
    if (history.length === 0) return 0;
    return history.reduce((sum, h) => sum + h.finalTotal, 0) / history.length;
  }

  private calculateOverallRating(metrics: {
    onTimeDeliveryRate: number;
    averageQualityScore: number;
    completenessScore: number;
    costEfficiency: number;
  }): number {
    const deliveryScore = metrics.onTimeDeliveryRate / 20; // Max 5 points
    const qualityScore = metrics.averageQualityScore; // Already 1-5
    const completenessScore = metrics.completenessScore / 20; // Max 5 points
    const costScore = metrics.costEfficiency; // 1-5 based on efficiency
    
    return Math.min(5, (deliveryScore + qualityScore + completenessScore + costScore) / 4);
  }

  private determineMarketPosition(rating: number): 'preferred' | 'standard' | 'backup' | 'probation' {
    if (rating >= 4.5) return 'preferred';
    if (rating >= 3.5) return 'standard';
    if (rating >= 2.5) return 'backup';
    return 'probation';
  }

  private calculateOrderFrequency(history: DetailedPurchaseHistory[]): number {
    if (history.length < 2) return 0;
    
    const dates = history.map(h => new Date(h.orderDate).getTime()).sort((a, b) => a - b);
    const totalDays = (dates[dates.length - 1] - dates[0]) / (1000 * 60 * 60 * 24);
    const totalMonths = totalDays / 30;
    
    return totalMonths > 0 ? history.length / totalMonths : 0;
  }

  private calculateDefectRate(history: DetailedPurchaseHistory[]): number {
    const totalItems = history.reduce((sum, h) => sum + h.items.reduce((s, i) => s + i.quantityReceived, 0), 0);
    const defectiveItems = history.reduce((sum, h) => 
      sum + h.items.reduce((s, i) => s + (i.defectiveQuantity || 0), 0), 0);
    return totalItems > 0 ? (defectiveItems / totalItems) * 100 : 0;
  }

  private calculateReturnRate(history: DetailedPurchaseHistory[]): number {
    const totalOrders = history.length;
    const returnedOrders = history.filter(h => h.status === 'returned').length;
    return totalOrders > 0 ? (returnedOrders / totalOrders) * 100 : 0;
  }

  private calculateComplaintCount(history: DetailedPurchaseHistory[]): number {
    return history.filter(h => h.qualityIssues).length;
  }

  private calculatePriceStability(items: SupplierItem[]): number {
    let totalStability = 0;
    let itemCount = 0;

    for (const item of items) {
      const priceHistory = this.getPriceHistory(item.id);
      if (priceHistory.length > 1) {
        const priceChanges = priceHistory.slice(0, -1).map((entry, index) => {
          const nextEntry = priceHistory[index + 1];
          return Math.abs((entry.price - nextEntry.price) / nextEntry.price);
        });
        
        const averageChange = priceChanges.reduce((sum, change) => sum + change, 0) / priceChanges.length;
        const stability = Math.max(0, 100 - (averageChange * 100));
        totalStability += stability;
        itemCount++;
      }
    }

    return itemCount > 0 ? totalStability / itemCount : 100;
  }

  private calculateSupplierCostEfficiency(history: DetailedPurchaseHistory[]): number {
    const efficiencyScores = history.flatMap(h =>
      h.items.map(item => {
        switch (item.costEfficiency) {
          case 'excellent': return 5;
          case 'good': return 4;
          case 'average': return 3;
          case 'poor': return 2;
          default: return 3;
        }
      })
    );

    return efficiencyScores.length > 0 ?
      efficiencyScores.reduce((sum, score) => sum + score, 0) / efficiencyScores.length : 3;
  }

  private calculateNextReviewDate(): string {
    const now = new Date();
    now.setMonth(now.getMonth() + 3); // Review every 3 months
    return now.toISOString();
  }

  private getDefaultPerformanceMetrics(supplierId: string): SupplierPerformanceMetrics {
    return {
      supplierId,
      supplierName: 'Unknown',
      totalOrders: 0,
      totalValue: 0,
      averageOrderValue: 0,
      orderFrequency: 0,
      onTimeDeliveryRate: 0,
      averageDeliveryTime: 0,
      deliveryReliabilityScore: 0,
      averageQualityScore: 5,
      defectRate: 0,
      returnRate: 0,
      complaintCount: 0,
      totalSavings: 0,
      averageDiscount: 0,
      paymentTermsCompliance: 0,
      priceStability: 100,
      performanceTrend: 'stable',
      costTrend: 'stable',
      overallRating: 3,
      marketPosition: 'standard',
      lastEvaluationDate: new Date().toISOString(),
      nextReviewDate: this.calculateNextReviewDate()
    };
  }

  // ===== STORAGE METHODS =====

  private getStoredSupplierItems(): SupplierItem[] {
    const stored = localStorage.getItem(this.SUPPLIER_ITEMS_KEY);
    return stored ? JSON.parse(stored) : [];
  }

  private getStoredPriceHistory(): SupplierPriceHistory[] {
    const stored = localStorage.getItem(this.PRICE_HISTORY_KEY);
    return stored ? JSON.parse(stored) : [];
  }

  private getStoredDetailedHistory(): DetailedPurchaseHistory[] {
    const stored = localStorage.getItem(this.DETAILED_PURCHASE_HISTORY_KEY);
    return stored ? JSON.parse(stored) : [];
  }

  // ===== SAMPLE DATA INITIALIZATION =====

  private createSampleSupplierItems(): void {
    const sampleItems: SupplierItem[] = [
      {
        id: 'si-001',
        supplierId: 'supplier-1',
        supplierName: 'Fresh Farm Supplies',
        productId: 'product-1',
        productName: 'Organic Bananas',
        supplierPartNumber: 'FFS-BAN-ORG-001',
        supplierDescription: 'Premium organic bananas, fair trade certified',
        unitOfMeasure: 'kg',
        packSize: 10,
        minimumOrderQuantity: 50,
        leadTimeDays: 2,
        isActive: true,
        currentPrice: 2.50,
        currency: 'USD',
        priceValidUntil: '2025-12-31',
        priceHistory: [],
        qualityRating: 4.8,
        deliveryReliability: 95,
        lastDeliveryDate: '2025-10-05',
        averageDeliveryTime: 1.8,
        preferredSupplier: true,
        certifications: ['USDA Organic', 'Fair Trade'],
        shelfLife: 7,
        storageRequirements: 'Room temperature, dry place',
        notes: 'Excellent quality, reliable delivery',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];

    localStorage.setItem(this.SUPPLIER_ITEMS_KEY, JSON.stringify(sampleItems));
  }

  private createSamplePriceHistory(): void {
    const sampleHistory: SupplierPriceHistory[] = [
      {
        id: 'ph-001',
        supplierId: 'supplier-1',
        supplierItemId: 'si-001',
        price: 2.50,
        currency: 'USD',
        effectiveDate: '2025-10-01',
        changeReason: 'Seasonal adjustment',
        priceChangePercentage: 4.17,
        recordedAt: new Date().toISOString()
      }
    ];

    localStorage.setItem(this.PRICE_HISTORY_KEY, JSON.stringify(sampleHistory));
  }

  private createSampleDetailedHistory(): void {
    const sampleHistory: DetailedPurchaseHistory[] = [];
    localStorage.setItem(this.DETAILED_PURCHASE_HISTORY_KEY, JSON.stringify(sampleHistory));
  }
}

export default SupplierCatalogService;