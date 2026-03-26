/**
 * Report Row Types — Typed interfaces for reportsRepository return values
 * Used by reportsService and reportsController for type-safe data access
 */

// ── Sales Report ──
export interface SalesReportRow {
  period: string;
  totalSales: number;
  totalDiscounts: number;
  netRevenue: number;
  totalCost: number;
  grossProfit: number;
  profitMargin: number;
  transactionCount: number;
  averageTransactionValue: number;
}

// ── Supplier Cost Analysis ──
export interface SupplierCostAnalysisRow {
  supplierId: string;
  supplierNumber: string;
  supplierName: string;
  totalPurchaseOrders: number;
  totalPurchaseValue: number;
  totalItemsReceived: number;
  averageLeadTime?: number;
  onTimeDeliveryRate?: number;
}

// ── Payment Report ──
export interface PaymentReportRow {
  paymentMethod: string;
  transactionCount: number;
  totalAmount: number;
  averageAmount: number;
  percentageOfTotal: number;
}

// ── Inventory Adjustments ──
export interface InventoryAdjustmentRow {
  movementId: string;
  movementDate: string | null;
  movementType: string;
  productName: string;
  sku: string;
  batchNumber: string | null;
  quantityChange: number;
  referenceNumber: string | null;
  notes: string | null;
  performedBy: string | null;
}

// ── Purchase Order Summary ──
export interface PurchaseOrderSummaryRow {
  id: string;
  poNumber: string;
  status: string;
  orderDate: string | null;
  expectedDeliveryDate: string | null;
  supplierNumber: string;
  supplierName: string;
  supplierEmail: string | null;
  supplierPhone: string | null;
  totalAmount: number;
  totalReceipts: number;
  totalReceived: number;
  notes: string | null;
  createdAt: string | null;
}

// ── Stock Movement Analysis ──
export interface StockMovementAnalysisRow {
  transactionCount: number;
  totalIn: number;
  totalOut: number;
  netMovement: number;
  period: string | null;
  // Optional fields depending on groupBy mode
  product_id?: string;
  product_name?: string;
  sku?: string;
  movement_type?: string;
}

// ── Customer Account Statement ──
export interface CustomerStatementCustomer {
  id: string;
  customerNumber: string;
  name: string;
  email: string | null;
  phone: string | null;
  creditLimit: number;
  currentBalance: number;
  customerGroupId: string | null;
}

export interface CustomerStatementTransaction {
  saleId: string;
  saleNumber: string;
  saleDate: string | null;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  paymentStatus: string;
  items: unknown[];
}

export interface CustomerAccountStatementData {
  customer: CustomerStatementCustomer;
  transactions: CustomerStatementTransaction[];
}

// ── Daily Cash Flow ──
export interface DailyCashFlowRow {
  transactionDate: string;
  paymentMethod: string;
  revenueType: string;
  transactionCount: number;
  cashAmount: number;
  totalSales: number;
  totalCost: number;
  grossProfit: number;
  creditCreated: number;
  averageTransactionValue: number;
  profitMargin: number;
  cashFlowImpact: number;
}

// ── Top Customers ──
export interface TopCustomerRow {
  rank: number;
  customerId: string;
  customerNumber: string;
  customerName: string;
  email: string | null;
  phone: string | null;
  totalPurchases: number;
  totalRevenue: number;
  totalProfit: number;
  averagePurchaseValue: number;
  lastPurchaseDate: string | null;
  outstandingBalance: number;
}

// ── Stock Aging ──
export interface StockAgingRow {
  productId: string;
  productName: string;
  sku: string;
  category: string | null;
  batchNumber: string;
  remainingQuantity: number;
  unitCost: number;
  totalValue: number;
  receivedDate: string | null;
  daysInStock: number;
  expiryDate: string | null;
  daysUntilExpiry: number | null;
}

// ── Sales by Category ──
export interface SalesByCategoryRow {
  category: string;
  productCount: number;
  totalQuantitySold: number;
  totalRevenue: number;
  totalCost: number;
  grossProfit: number;
  profitMargin: number;
  totalDiscounts: number;
  transactionCount: number;
  averageTransactionValue: number;
}

// ── Sales by Payment Method ──
export interface SalesByPaymentMethodRow {
  paymentMethod: string;
  transactionCount: number;
  totalRevenue: number;
  totalDiscounts: number;
  averageTransactionValue: number;
  percentageOfTotal: number;
}

// ── Hourly Sales Analysis ──
export interface HourlySalesAnalysisRow {
  hour: number;
  transactionCount: number;
  totalRevenue: number;
  averageTransactionValue: number;
  peakDay?: string;
}

// ── Business Position Report ──
export interface BusinessSalesPerformance {
  transactionsCount: number;
  uniqueCustomers: number;
  totalRevenue: number;
  totalCost: number;
  grossProfit: number;
  avgTransactionValue: number;
  walkInRevenue: number;
  customerRevenue: number;
  salesCashCollected: number;
  creditExtended: number;
}

export interface BusinessCollectionsPerformance {
  collectionTransactions: number;
  totalCollections: number;
  avgCollectionValue: number;
  payingCustomers: number;
}

export interface BusinessInventoryHealth {
  totalProducts: number;
  lowStockItems: number;
  expiringUnits: number;
  inventoryValue: number;
}

export interface BusinessCustomerMetrics {
  totalCustomers: number;
  newCustomers30d: number;
  totalReceivables: number;
  customersWithBalance: number;
  avgCustomerBalance: number;
}

export interface BusinessCashPosition {
  totalCashIn: number;
  newCreditExtended: number;
  outstandingReceivables: number;
  profitMarginPercent: number;
  cashCollectionRate: number;
}

export type RiskLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export interface BusinessRiskAssessment {
  receivablesRisk: RiskLevel;
  inventoryRisk: RiskLevel;
  overallRiskLevel: RiskLevel;
}

export interface BusinessPositionData {
  reportDate: string;
  businessHealthScore: number;
  salesPerformance: BusinessSalesPerformance;
  collectionsPerformance: BusinessCollectionsPerformance;
  inventoryHealth: BusinessInventoryHealth;
  customerMetrics: BusinessCustomerMetrics;
  cashPosition: BusinessCashPosition;
  riskAssessment: BusinessRiskAssessment;
}

// ── Cash Register Session Summary ──
export interface CashRegisterSessionInfo {
  id: string;
  sessionNumber: string;
  registerName: string;
  cashierName: string;
  status: string;
  openedAt?: string;
  closedAt: string | null;
}

export interface CashRegisterBreakdown {
  cashInFloat: number;
  cashInPayment: number;
  cashInOther: number;
  cashOutBank: number;
  cashOutExpense: number;
  cashOutOther: number;
}

export interface CashRegisterSummaryInfo {
  openingFloat: number;
  expectedClosing: number;
  actualClosing: number | null;
  variance: number | null;
  varianceReason: string | null;
  totalCashIn: number;
  totalCashOut: number;
  totalSales: number;
  totalRefunds: number;
  netCashFlow: number;
  movementCount: number;
  breakdown: CashRegisterBreakdown;
}

export interface CashRegisterMovement {
  id: string;
  movementType: string;
  amount: number;
  reason: string | null;
  referenceNumber: string | null;
  createdAt?: string;
  createdByName: string | null;
}

export interface CashRegisterSessionSummaryData {
  reportType: string;
  generatedAt: string;
  session: CashRegisterSessionInfo;
  summary: CashRegisterSummaryInfo;
  paymentSummary: unknown;
  movements: CashRegisterMovement[];
}

// ── Cash Register Movement Breakdown ──
export interface CashRegisterMovementTotals {
  totalCashIn: number;
  totalCashOut: number;
  totalSales: number;
  totalRefunds: number;
  netCashFlow: number;
  sessionCount: number;
  movementCount: number;
}

export interface CashRegisterDailyBreakdown {
  date: string;
  cashInFloat: number;
  cashInPayment: number;
  cashInOther: number;
  cashOutBank: number;
  cashOutExpense: number;
  cashOutOther: number;
  sales: number;
  refunds: number;
  netFlow: number;
}

export interface CashRegisterMovementBreakdownData {
  reportType: string;
  generatedAt: string;
  period: { startDate: string; endDate: string };
  totals: CashRegisterMovementTotals;
  byMovementType: Record<string, { count: number; total: number; percentage: number }>;
  dailyBreakdown: CashRegisterDailyBreakdown[];
}

// ── Cash Register Session History ──
export interface CashRegisterSessionHistorySummary {
  totalSessions: number;
  openSessions: number;
  closedSessions: number;
  totalVariance: number;
  averageVariance: number;
  sessionsWithVariance: number;
}

export interface CashRegisterSessionHistoryEntry {
  id: string;
  sessionNumber: string;
  registerName: string;
  cashierName: string;
  status: string;
  openedAt?: string;
  closedAt: string | null;
  openingFloat: number;
  expectedClosing: number | null;
  actualClosing: number | null;
  variance: number | null;
  varianceReason: string | null;
  movementCount: number;
  totalSales: number;
}

export interface CashRegisterSessionHistoryData {
  reportType: string;
  generatedAt: string;
  period: { startDate: string; endDate: string };
  summary: CashRegisterSessionHistorySummary;
  sessions: CashRegisterSessionHistoryEntry[];
}

// ── Inventory Valuation ──
export interface InventoryValuationRow {
  productId: string;
  productName: string;
  sku: string;
  category: string | null;
  quantityOnHand: number;
  unitCost: number;
  sellingPrice?: number;
  totalValue: number;
  potentialRevenue?: number;
  profitPerUnit?: number;
  potentialProfit?: number;
  profitMargin?: number;
  lastUpdated: string | null;
}

// ── Expiring Items ──
export interface ExpiringItemRow {
  batchId: string;
  productId: string;
  productName: string;
  batchNumber: string;
  expiryDate: string | null;
  daysUntilExpiry: number;
  quantityRemaining: number;
  unitCost: number;
  potentialLoss: number;
}

// ── Low Stock Items ──
export interface LowStockItemRow {
  productId: string;
  productName: string;
  sku: string;
  currentStock: number;
  reorderLevel: number;
  reorderQuantity?: number;
  status: string;
}

// ── Best Selling Products ──
export interface BestSellingProductRow {
  productId: string;
  productName: string;
  sku: string;
  quantitySold: number;
  totalRevenue: number;
  totalCost: number;
  grossProfit: number;
  profitMargin: number;
  transactionCount: number;
}

// ── Goods Received Report ──
export interface GoodsReceivedRow {
  goodsReceiptId: string;
  goodsReceiptNumber: string;
  purchaseOrderNumber: string;
  supplierNumber: string;
  supplierName: string;
  receivedDate: string | null;
  totalValue: number;
  itemsCount: number;
  status: string;
}

// ── Customer Payments Report ──
export interface CustomerPaymentsRow {
  customerId: string;
  customerNumber: string;
  customerName: string;
  totalInvoices: number;
  totalInvoiced: number;
  totalPaid: number;
  totalOutstanding: number;
  overdueAmount: number;
  averagePaymentDays?: number;
  totalDeposited?: number;
  depositAvailable?: number;
}

// ── Profit/Loss Report ──
export interface ProfitLossRow {
  period: string;
  revenue: number;
  costOfGoodsSold: number;
  grossProfit: number;
  grossProfitMargin: number;
  taxCollected?: number;
  totalDiscounts?: number;
}

// ── Deleted Items Report ──
export interface DeletedItemRow {
  productId: string;
  productName: string;
  sku: string;
  deletedDate: string | null;
  description: string | null;
  finalStockLevel: number;
}

// ── Profit Margin by Product ──
export interface ProfitMarginByProductRow {
  productId: string;
  productName: string;
  sku: string;
  category: string | null;
  totalSales: number;
  totalQuantitySold: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  profitMarginPercent: number;
}

// ── Supplier Payment Status ──
export interface SupplierPaymentStatusRow {
  supplierId: string;
  supplierNumber: string;
  supplierName: string;
  email: string | null;
  phone: string | null;
  totalOrders: number;
  totalAmount: number;
  totalPaid: number;
  outstandingBalance: number;
  lastOrderDate: string | null;
  paymentTerms: string | null;
}

// ── Customer Aging ──
export interface CustomerAgingRow {
  customerId: string;
  customerNumber: string;
  customerName: string;
  email: string | null;
  phone: string | null;
  creditLimit: number;
  totalInvoices: number;
  totalOutstanding: number;
  current: number;
  days30: number;
  days60: number;
  days90: number;
  over90: number;
  overdueAmount: number;
  maxDaysOverdue: number;
}

// ── Waste/Damage Report ──
export interface WasteDamageRow {
  movementId: string;
  lossDate: string | null;
  lossType: string;
  productId: string;
  productName: string;
  sku: string;
  category: string | null;
  batchNumber: string | null;
  expiryDate: string | null;
  quantityLost: number;
  unitCost: number;
  totalLossValue: number;
  notes: string | null;
  createdBy: string | null;
}

// ── Reorder Recommendations ──
export interface ReorderRecommendationRow {
  productId: string;
  productName: string;
  sku: string;
  category: string | null;
  reorderLevel: number;
  currentStock: number;
  unitsSoldPeriod: number;
  dailySalesVelocity: number;
  daysUntilStockout: number | null;
  suggestedOrderQuantity: number;
  estimatedOrderCost: number;
  preferredSupplier: string | null;
  priority: string;
  leadTimeDays: number;
  safetyStock: number;
  reorderPoint: number;
  demandTrend: 'INCREASING' | 'DECREASING' | 'STABLE';
  trendRatio: number;
  // Self-learning engine fields (populated when demand_forecast has run)
  forecastDemand30d: number | null;
  seasonalIndex: number | null;
  learningCycles: number;
}

// ── Sales Comparison ──
export interface SalesComparisonRow {
  period: string;
  currentSales: number;
  previousSales: number;
  difference: number;
  percentageChange: number;
  currentTransactions: number;
  previousTransactions: number;
}

// ── Customer Purchase History ──
export interface CustomerPurchaseHistoryRow {
  saleId: string;
  saleNumber: string;
  saleDate: string;
  totalAmount: number;
  amountPaid: number;
  outstandingBalance: number;
  paymentMethod: string;
  itemCount: number;
  status: string;
  customerName?: string;
}
