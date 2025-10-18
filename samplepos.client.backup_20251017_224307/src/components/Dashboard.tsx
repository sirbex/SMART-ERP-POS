import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "./ui/select";
import { 
  AlertCircle, 
  ArrowDown, 
  ArrowUp, 
  BarChart3, 
  Calendar,
  Clock, 
  DollarSign, 
  Filter,
  RefreshCw, 
  ShoppingCart, 
  TrendingDown, 
  TrendingUp, 
  Zap
} from "lucide-react";
import { 
  format, 
  subDays, 
  startOfWeek, 
  endOfWeek, 
  startOfMonth, 
  endOfMonth, 
  startOfYear, 
  endOfYear,
  startOfDay,
  endOfDay,
  isWithinInterval,
  subWeeks,
  subMonths
} from "date-fns";
import { CustomerService } from "../services/UnifiedDataService";
import * as POSServiceAPI from "../services/POSServiceAPI";
import SettingsService from "../services/SettingsService";
import type { SaleRecord } from "../services/UnifiedDataService";


// Types for date filtering
export type DateFilterType = 
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'this_year'
  | 'last_year'
  | 'last_7_days'
  | 'last_30_days'
  | 'all_time';

export interface DateRange {
  start: Date;
  end: Date;
  label: string;
}

export const DATE_FILTER_OPTIONS: Record<DateFilterType, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  this_week: 'This Week',
  last_week: 'Last Week',
  this_month: 'This Month',
  last_month: 'Last Month',
  this_year: 'This Year',
  last_year: 'Last Year',
  last_7_days: 'Last 7 Days',
  last_30_days: 'Last 30 Days',
  all_time: 'All Time'
};

// Utility function to calculate date ranges with precise logic
export const getDateRange = (filterType: DateFilterType): DateRange => {
  const now = new Date();
  
  switch (filterType) {
    case 'today':
      return {
        start: startOfDay(now),
        end: endOfDay(now),
        label: 'Today'
      };
      
    case 'yesterday':
      const yesterday = subDays(now, 1);
      return {
        start: startOfDay(yesterday),
        end: endOfDay(yesterday),
        label: 'Yesterday'
      };
      
    case 'this_week':
      return {
        start: startOfWeek(now, { weekStartsOn: 1 }), // Monday start
        end: endOfWeek(now, { weekStartsOn: 1 }),
        label: 'This Week'
      };
      
    case 'last_week':
      const lastWeek = subWeeks(now, 1);
      return {
        start: startOfWeek(lastWeek, { weekStartsOn: 1 }),
        end: endOfWeek(lastWeek, { weekStartsOn: 1 }),
        label: 'Last Week'
      };
      
    case 'this_month':
      return {
        start: startOfMonth(now),
        end: endOfMonth(now),
        label: 'This Month'
      };
      
    case 'last_month':
      const lastMonth = subMonths(now, 1);
      return {
        start: startOfMonth(lastMonth),
        end: endOfMonth(lastMonth),
        label: 'Last Month'
      };
      
    case 'this_year':
      return {
        start: startOfYear(now),
        end: endOfYear(now),
        label: 'This Year'
      };
      
    case 'last_year':
      const lastYear = subMonths(now, 12);
      return {
        start: startOfYear(lastYear),
        end: endOfYear(lastYear),
        label: 'Last Year'
      };
      
    case 'last_7_days':
      return {
        start: startOfDay(subDays(now, 6)), // Include today
        end: endOfDay(now),
        label: 'Last 7 Days'
      };
      
    case 'last_30_days':
      return {
        start: startOfDay(subDays(now, 29)), // Include today
        end: endOfDay(now),
        label: 'Last 30 Days'
      };
      
    case 'all_time':
    default:
      return {
        start: new Date(0), // Unix epoch
        end: endOfDay(now),
        label: 'All Time'
      };
  }
};

// Filter transactions by date range with precise logic
export const filterTransactionsByDateRange = (
  transactions: SaleRecord[], 
  dateRange: DateRange
): SaleRecord[] => {
  if (dateRange.label === 'All Time') {
    return transactions;
  }
  
  return transactions.filter(transaction => {
    const transactionDate = new Date(transaction.timestamp);
    return isWithinInterval(transactionDate, {
      start: dateRange.start,
      end: dateRange.end
    });
  });
};

// Get comparison period for accurate period-over-period analysis
export const getComparisonDateRange = (filterType: DateFilterType): DateRange => {
  const now = new Date();
  
  switch (filterType) {
    case 'today':
      const yesterday = subDays(now, 1);
      return {
        start: startOfDay(yesterday),
        end: endOfDay(yesterday),
        label: 'Previous Day'
      };
      
    case 'yesterday':
      const dayBeforeYesterday = subDays(now, 2);
      return {
        start: startOfDay(dayBeforeYesterday),
        end: endOfDay(dayBeforeYesterday),
        label: 'Day Before Yesterday'
      };
      
    case 'this_week':
      const lastWeek = subWeeks(now, 1);
      return {
        start: startOfWeek(lastWeek, { weekStartsOn: 1 }),
        end: endOfWeek(lastWeek, { weekStartsOn: 1 }),
        label: 'Previous Week'
      };
      
    case 'last_week':
      const twoWeeksAgo = subWeeks(now, 2);
      return {
        start: startOfWeek(twoWeeksAgo, { weekStartsOn: 1 }),
        end: endOfWeek(twoWeeksAgo, { weekStartsOn: 1 }),
        label: 'Two Weeks Ago'
      };
      
    case 'this_month':
      const lastMonth = subMonths(now, 1);
      return {
        start: startOfMonth(lastMonth),
        end: endOfMonth(lastMonth),
        label: 'Previous Month'
      };
      
    case 'last_month':
      const twoMonthsAgo = subMonths(now, 2);
      return {
        start: startOfMonth(twoMonthsAgo),
        end: endOfMonth(twoMonthsAgo),
        label: 'Two Months Ago'
      };
      
    case 'last_7_days':
      const prev7Days = subDays(now, 13); // 7 days before the 7-day period
      return {
        start: startOfDay(prev7Days),
        end: startOfDay(subDays(now, 7)),
        label: 'Previous 7 Days'
      };
      
    case 'last_30_days':
      const prev30Days = subDays(now, 59); // 30 days before the 30-day period
      return {
        start: startOfDay(prev30Days),
        end: startOfDay(subDays(now, 30)),
        label: 'Previous 30 Days'
      };
      
    case 'this_year':
    case 'last_year':
    case 'all_time':
    default:
      // For yearly and all-time comparisons, compare to same period last year
      const lastYear = subMonths(now, 12);
      return {
        start: new Date(lastYear.getFullYear(), 0, 1),
        end: new Date(lastYear.getFullYear(), 11, 31),
        label: 'Previous Year'
      };
  }
};

interface DashboardStats {
  // Sales Analytics
  totalRevenue: number;
  totalTransactions: number;
  averageTransaction: number;
  totalProfit: number;
  profitMargin: number;
  
  // Period Comparisons
  todayRevenue: number;
  yesterdayRevenue: number;
  weekRevenue: number;
  monthRevenue: number;
  
  // Filtered Period Data
  currentRevenue: number;
  currentProfit: number;
  currentTransactions: number;
  revenueComparison?: PeriodComparison;
  profitComparison?: PeriodComparison;
  
  // Profit Data Quality
  transactionsWithActualProfitData: number;
  transactionsWithEstimatedProfit: number;
  profitDataQuality: number;
  
  // Performance Metrics
  topSellingItems: Array<{
    name: string;
    quantity: number;
    revenue: number;
  }>;
  paymentMethodBreakdown: Record<string, number>;
  hourlyStats: Array<{
    hour: number;
    sales: number;
    transactions: number;
    profit: number;
    averageTransaction: number;
  }>;
  
  // Inventory Metrics
  totalProducts: number;
  lowStockCount: number;
  expiredStockCount: number;
  expiringSoonCount: number;
  totalInventoryValue: number;
  
  // Customer Metrics
  totalCustomers: number;
  activeCustomers: number;
  outstandingBalance: number;
  
  // Recent Activity
  recentTransactions: SaleRecord[];
  alertsCount: number;
}

interface PeriodComparison {
  current: number;
  previous: number;
  change: number;
  changePercent: number;
  isIncrease: boolean;
}

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [activeTab, setActiveTab] = useState("overview");
  const [refreshing, setRefreshing] = useState(false);
  const [dateFilter, setDateFilter] = useState<DateFilterType>('today');
  const [filteredTransactions, setFilteredTransactions] = useState<SaleRecord[]>([]);

  const businessInfo = SettingsService.getInstance().getBusinessInfo();

  // Load dashboard data
  useEffect(() => {
    loadDashboardData();
    
    // Listen for storage changes to auto-refresh
    const handleStorageChange = () => {
      loadDashboardData();
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      loadDashboardData();
    }, 30000);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, [dateFilter]);

  // Helper function to convert API Transaction to SaleRecord
  const convertToSaleRecord = (transaction: any): SaleRecord => {
    // Convert string numbers to actual numbers
    const total = parseFloat(transaction.total) || 0;
    const subtotal = parseFloat(transaction.subtotal) || 0;
    const discount = parseFloat(transaction.discount) || 0;
    const tax = parseFloat(transaction.tax) || 0;
    const amountPaid = parseFloat(transaction.amountPaid) || total;
    const changeAmount = parseFloat(transaction.changeAmount) || 0;
    
    return {
      id: transaction.id,
      invoiceNumber: transaction.id,
      timestamp: transaction.createdAt,
      customer: transaction.customerName || 'Walk-in Customer',
      cart: [], // We don't have item details in the transaction list API
      subtotal: subtotal,
      discount: discount,
      tax: tax,
      total: total,
      paid: amountPaid,
      change: changeAmount,
      outstanding: Math.max(0, total - amountPaid),
      status: transaction.paymentStatus === 'completed' ? 'PAID' : 'PARTIAL',
      payments: [{
        method: transaction.paymentMethod || 'cash',
        amount: amountPaid,
        timestamp: transaction.createdAt,
        reference: transaction.id
      }],
      paymentType: transaction.paymentMethod || 'cash',
      note: transaction.notes || ''
    };
  };

  // Enhanced calculation functions with precision handling
  const calculateTotalRevenue = (txArray: SaleRecord[] = []): number => {
    // Use precise decimal arithmetic to avoid floating-point errors
    const total = txArray.reduce((sum, transaction) => {
      // Validate transaction data
      if (!transaction || typeof transaction.total !== 'number' || isNaN(transaction.total)) {
        console.warn('Invalid transaction data:', transaction);
        return sum;
      }
      // Convert to cents for precise addition, then back to currency units
      return Math.round((sum + transaction.total) * 100) / 100;
    }, 0);
    
    return Number(total.toFixed(2));
  };

  const calculateTotalGrossProfit = (txArray: SaleRecord[] = []): number => {
    const total = txArray.reduce((sum, transaction) => {
      // Validate transaction data
      if (!transaction || typeof transaction.total !== 'number' || isNaN(transaction.total)) {
        console.warn('Invalid transaction data for profit calculation:', transaction);
        return sum;
      }

      let profit = 0;
      
      if (transaction.grossProfit !== undefined && !isNaN(transaction.grossProfit)) {
        // Use existing gross profit if available
        profit = transaction.grossProfit;
      } else if (transaction.totalCost !== undefined && !isNaN(transaction.totalCost)) {
        // Calculate profit from actual cost
        profit = transaction.total - transaction.totalCost;
      } else {
        // Estimate profit with improved cost assumptions based on transaction size
        let costRatio = 0.6; // Default 60% cost assumption
        
        // Adjust cost ratio based on transaction amount (larger orders often have better margins)
        if (transaction.total > 10000) {
          costRatio = 0.55; // 55% cost for large orders
        } else if (transaction.total < 100) {
          costRatio = 0.65; // 65% cost for small orders
        }
        
        const estimatedCost = transaction.total * costRatio;
        profit = transaction.total - estimatedCost;
      }
      
      // Use precise arithmetic
      return Math.round((sum + profit) * 100) / 100;
    }, 0);
    
    return Number(total.toFixed(2));
  };

  const calculateProfitMargin = (revenue: number, profit: number): number => {
    if (!revenue || revenue === 0) return 0;
    const margin = (profit / revenue) * 100;
    return Number(margin.toFixed(2));
  };



  const filterTransactionsByDateRange = (txArray: SaleRecord[], from: Date, to: Date): SaleRecord[] => {
    if (!Array.isArray(txArray)) return [];
    
    return txArray.filter(transaction => {
      // Validate transaction data
      if (!transaction || !transaction.timestamp) {
        console.warn('Transaction missing timestamp:', transaction);
        return false;
      }
      
      try {
        const transactionDate = new Date(transaction.timestamp);
        
        // Validate parsed date
        if (isNaN(transactionDate.getTime())) {
          console.warn('Invalid transaction timestamp:', transaction.timestamp);
          return false;
        }
        
        // Normalize dates to avoid timezone issues
        const txDateOnly = new Date(transactionDate.getFullYear(), transactionDate.getMonth(), transactionDate.getDate());
        const fromDateOnly = new Date(from.getFullYear(), from.getMonth(), from.getDate());
        const toDateOnly = new Date(to.getFullYear(), to.getMonth(), to.getDate());
        
        return txDateOnly >= fromDateOnly && txDateOnly <= toDateOnly;
      } catch (error) {
        console.error('Error parsing transaction date:', error, transaction.timestamp);
        return false;
      }
    });
  };

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      // Get all transactions from database via API
      const apiTransactions = await POSServiceAPI.getAllTransactions();
      
      // Convert API format to SaleRecord format for dashboard calculations
      const transactions = apiTransactions.map(convertToSaleRecord);
      console.log('📊 Dashboard loading transactions from database:', transactions.length);
      

      
      const customers = CustomerService.getAll();
      console.log('📊 Dashboard loading customers:', customers.length);
      console.log('📊 All customer names:', customers.map(c => c.name));
      
      // Specific check for Becca Powers transactions
      const beccaTransactions = transactions.filter(t => 
        t.customer && (t.customer.toLowerCase().includes('becca') || t.customer.toLowerCase().includes('powers'))
      );
      console.log('🎯 Becca Powers transactions found:', beccaTransactions.length);
      console.log('🎯 Becca transactions:', beccaTransactions);
      
      // Check for any customer name variations
      const uniqueCustomerNames = [...new Set(transactions.map(t => t.customer).filter(c => c && c !== 'Walk-in Customer'))];
      console.log('📋 Unique customer names in transactions:', uniqueCustomerNames);
      
      // Cross-reference customer names between transactions and customer list
      const customerNamesInSystem = customers.map(c => c.name);
      const orphanedTransactionCustomers = uniqueCustomerNames.filter(txCustomer => 
        !customerNamesInSystem.some(systemCustomer => 
          systemCustomer.toLowerCase() === txCustomer.toLowerCase()
        )
      );
      
      if (orphanedTransactionCustomers.length > 0) {
        console.log('⚠️ Transactions found for customers not in system:', orphanedTransactionCustomers);
      }
      
      // Check if transactions have the exact customer names
      console.log('🔍 Customer name matching check:');
      customers.forEach(customer => {
        const customerTransactions = transactions.filter(t => 
          t.customer && t.customer.toLowerCase() === customer.name.toLowerCase()
        );
        console.log(`  ${customer.name}: ${customerTransactions.length} transactions`);
      });
      
      // Apply date filter
      const currentDateRange = getDateRange(dateFilter);
      const filtered = filterTransactionsByDateRange(transactions, currentDateRange.start, currentDateRange.end);
      setFilteredTransactions(filtered);
      
      // Calculate comparison period (previous period of same length)
      const comparisonRange = getComparisonDateRange(dateFilter);
      const comparisonTransactions = filterTransactionsByDateRange(transactions, comparisonRange.start, comparisonRange.end);
      
      // Calculate date ranges for standard periods (for other metrics)
      const today = new Date();
      const weekAgo = subDays(today, 7);
      const monthAgo = subDays(today, 30);
      
      // Enhanced date filtering with better timestamp parsing
      const todayTransactions = transactions.filter(transaction => {
        if (!transaction.timestamp) return false;
        try {
          const txDate = new Date(transaction.timestamp);
          if (isNaN(txDate.getTime())) {
            console.warn('Invalid timestamp:', transaction.timestamp);
            return false;
          }
          // Use custom date comparison to avoid timezone issues
          const currentDate = new Date();
          const todayDateString = currentDate.toDateString();
          return txDate.toDateString() === todayDateString;
        } catch (error) {
          console.warn('Error parsing timestamp:', transaction.timestamp, error);
          return false;
        }
      });
      
      console.log('🗓️ Today transactions found:', todayTransactions.length, 'with revenue:', calculateTotalRevenue(todayTransactions));
      
      const currentDate = new Date();
      const yesterdayDate = new Date(currentDate);
      yesterdayDate.setDate(currentDate.getDate() - 1);
      const yesterdayDateString = yesterdayDate.toDateString();
      
      const yesterdayTransactions = transactions.filter(transaction => {
        if (!transaction.timestamp) return false;
        try {
          const txDate = new Date(transaction.timestamp);
          if (isNaN(txDate.getTime())) return false;
          return txDate.toDateString() === yesterdayDateString;
        } catch (error) {
          console.warn('Error parsing yesterday timestamp:', transaction.timestamp, error);
          return false;
        }
      });
      const weekTransactions = filterTransactionsByDateRange(transactions, weekAgo, today);
      const monthTransactions = filterTransactionsByDateRange(transactions, monthAgo, today);
      
      // Calculate basic metrics using filtered data
      const currentRevenue = calculateTotalRevenue(filtered);
      const currentProfit = calculateTotalGrossProfit(filtered);
      const comparisonRevenue = calculateTotalRevenue(comparisonTransactions);
      const comparisonProfit = calculateTotalGrossProfit(comparisonTransactions);
      
      // Analyze profit data quality
      const transactionsWithActualProfitData = filtered.filter(t => t.grossProfit !== undefined).length;
      const transactionsWithEstimatedProfit = filtered.length - transactionsWithActualProfitData;
      const profitDataQuality = filtered.length > 0 ? (transactionsWithActualProfitData / filtered.length) * 100 : 100;
      
      // Calculate period comparisons
      const revenueComparison = calculatePeriodComparison(currentRevenue, comparisonRevenue);
      const profitComparison = calculatePeriodComparison(currentProfit, comparisonProfit);
      
      // Enhanced metrics with validation and precision
      const totalRevenue = calculateTotalRevenue(transactions);
      const totalProfit = calculateTotalGrossProfit(transactions);
      const todayRevenue = calculateTotalRevenue(todayTransactions);
      const yesterdayRevenue = calculateTotalRevenue(yesterdayTransactions);
      const weekRevenue = calculateTotalRevenue(weekTransactions);
      const monthRevenue = calculateTotalRevenue(monthTransactions);
      
      console.log('💰 Today revenue calculated:', todayRevenue, 'UGX from', todayTransactions.length, 'transactions');
      
      // Enhanced top selling items calculation with validation
      const itemSales = new Map<string, { quantity: number; revenue: number; name: string }>();
      filtered.forEach(transaction => {
        if (!transaction.cart || !Array.isArray(transaction.cart)) return;
        
        transaction.cart.forEach(item => {
          if (!item || typeof item.quantity !== 'number' || typeof item.price !== 'number') return;
          
          const existing = itemSales.get(item.name) || { quantity: 0, revenue: 0, name: item.name };
          existing.quantity += item.quantity;
          // Use precise arithmetic for revenue calculation
          const itemRevenue = Math.round((item.price * item.quantity) * 100) / 100;
          existing.revenue = Math.round((existing.revenue + itemRevenue) * 100) / 100;
          itemSales.set(item.name, existing);
        });
      });
      
      const topSellingItems = Array.from(itemSales.values())
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);
      
      // Enhanced payment method breakdown with validation and precision
      const paymentMethodBreakdown = monthTransactions.reduce((acc: Record<string, number>, transaction: SaleRecord) => {
        // Validate transaction data
        if (!transaction || typeof transaction.total !== 'number' || isNaN(transaction.total)) {
          return acc;
        }
        
        const paymentMethod = transaction.paymentType || 'cash';
        const amount = transaction.paid || transaction.total;
        
        // Use precise arithmetic
        const currentAmount = acc[paymentMethod] || 0;
        acc[paymentMethod] = Math.round((currentAmount + amount) * 100) / 100;
        return acc;
      }, {} as Record<string, number>);
      
      // Enhanced hourly stats calculation with validation
      const hourlyStats = Array.from({ length: 24 }, (_, hour) => {
        const hourTransactions = todayTransactions.filter(transaction => {
          if (!transaction.timestamp) return false;
          
          try {
            const transactionDate = new Date(transaction.timestamp);
            if (isNaN(transactionDate.getTime())) return false;
            
            const transactionHour = transactionDate.getHours();
            return transactionHour === hour;
          } catch (error) {
            console.warn('Error parsing transaction timestamp:', transaction.timestamp);
            return false;
          }
        });
        
        return {
          hour,
          sales: calculateTotalRevenue(hourTransactions),
          transactions: hourTransactions.length,
          profit: calculateTotalGrossProfit(hourTransactions),
          averageTransaction: hourTransactions.length > 0 
            ? Math.round((calculateTotalRevenue(hourTransactions) / hourTransactions.length) * 100) / 100 
            : 0
        };
      });
      
      // Get inventory metrics from PostgreSQL API
      let products: any[] = [];
      let lowStockProducts: any[] = [];
      let expiredProducts: any[] = [];
      let expiringSoonProducts: any[] = [];
      let totalInventoryValue = 0;
      
      try {
        // Fetch unified inventory data from PostgreSQL
        const response = await fetch('http://localhost:3001/api/inventory/unified');
        if (response.ok) {
          const unifiedInventory = await response.json();
          
          // Process inventory data
          products = unifiedInventory || [];
          
          // Filter inventory items for dashboard statistics
          lowStockProducts = products.filter(item => item.needsReorder || false);
          expiredProducts = products.filter(item => item.hasExpiredStock || false);
          expiringSoonProducts = products.filter(item => item.hasExpiringSoonStock || false);
          
          // Calculate total inventory value with precision
          totalInventoryValue = products.reduce((sum, item) => {
            try {
              const stock = parseFloat(item.totalStock) || 0;
              const cost = parseFloat(item.averageCost) || 0;
              const value = stock * cost;
              
              if (typeof value !== 'number' || isNaN(value)) return sum;
              return Math.round((sum + value) * 100) / 100;
            } catch (error) {
              console.warn('Error calculating inventory value for item:', item.id, error);
              return sum;
            }
          }, 0);
          
          console.log('📦 Dashboard Inventory Stats from PostgreSQL:', {
            totalProducts: products.length,
            lowStock: lowStockProducts.length,
            expired: expiredProducts.length,
            expiringSoon: expiringSoonProducts.length,
            totalValue: totalInventoryValue
          });
        } else {
          console.warn('Failed to fetch inventory data for dashboard');
        }
      } catch (error) {
        console.error('Error fetching inventory data for dashboard:', error);
      }
      
      // Enhanced customer metrics with validation
      const activeCustomers = customers.filter(customer => {
        return customer && customer.status === 'active';
      });
      
      const outstandingBalance = customers.reduce((sum, customer) => {
        if (!customer || typeof customer.balance !== 'number' || isNaN(customer.balance)) {
          return sum;
        }
        return Math.round((sum + customer.balance) * 100) / 100;
      }, 0);
      
      // Enhanced recent transactions with validation and sorting - use filtered transactions
      console.log('📅 Date filter applied:', dateFilter, 'showing', filtered.length, 'of', transactions.length, 'transactions');
      
      const recentTransactions = filtered
        .filter(t => t && t.timestamp) // Filter out invalid transactions
        .sort((a, b) => {
          try {
            return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
          } catch (error) {
            console.warn('Error sorting transactions by timestamp:', error);
            return 0;
          }
        })
        .slice(0, 10);
      
      // Calculate alerts with validation
      const alertsCount = (lowStockProducts?.length || 0) + (expiredProducts?.length || 0) + (expiringSoonProducts?.length || 0);
      
      // Enhanced dashboard stats with precise calculations
      const dashboardStats: DashboardStats = {
        totalRevenue: Number(totalRevenue.toFixed(2)),
        totalTransactions: transactions.length,
        averageTransaction: transactions.length > 0 
          ? Number((totalRevenue / transactions.length).toFixed(2)) 
          : 0,
        totalProfit: Number(totalProfit.toFixed(2)),
        profitMargin: calculateProfitMargin(totalRevenue, totalProfit),
        
        todayRevenue: Number(todayRevenue.toFixed(2)),
        yesterdayRevenue: Number(yesterdayRevenue.toFixed(2)),
        weekRevenue: Number(weekRevenue.toFixed(2)),
        monthRevenue: Number(monthRevenue.toFixed(2)),
        
        // Enhanced filtered period data with precision
        currentRevenue: Number(currentRevenue.toFixed(2)),
        currentProfit: Number(currentProfit.toFixed(2)),
        currentTransactions: filtered.length,
        revenueComparison,
        profitComparison,
        
        // Profit data quality
        transactionsWithActualProfitData,
        transactionsWithEstimatedProfit,
        profitDataQuality,
        
        topSellingItems,
        paymentMethodBreakdown,
        hourlyStats,
        
        totalProducts: products?.length || 0,
        lowStockCount: lowStockProducts?.length || 0,
        expiredStockCount: expiredProducts?.length || 0,
        expiringSoonCount: expiringSoonProducts?.length || 0,
        totalInventoryValue: Number(totalInventoryValue.toFixed(2)),
        
        totalCustomers: customers?.length || 0,
        activeCustomers: activeCustomers?.length || 0,
        outstandingBalance: Number(outstandingBalance.toFixed(2)),
        
        recentTransactions,
        alertsCount
      };
      
      setStats(dashboardStats);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      
      // Set fallback stats to prevent UI crashes
      setStats({
        totalRevenue: 0,
        totalTransactions: 0,
        averageTransaction: 0,
        totalProfit: 0,
        profitMargin: 0,
        todayRevenue: 0,
        yesterdayRevenue: 0,
        weekRevenue: 0,
        monthRevenue: 0,
        currentRevenue: 0,
        currentProfit: 0,
        currentTransactions: 0,
        revenueComparison: { current: 0, previous: 0, change: 0, changePercent: 0, isIncrease: false },
        profitComparison: { current: 0, previous: 0, change: 0, changePercent: 0, isIncrease: false },
        transactionsWithActualProfitData: 0,
        transactionsWithEstimatedProfit: 0,
        profitDataQuality: 0,
        topSellingItems: [],
        hourlyStats: [],
        paymentMethodBreakdown: {},
        totalProducts: 0,
        lowStockCount: 0,
        expiredStockCount: 0,
        expiringSoonCount: 0,
        totalInventoryValue: 0,
        totalCustomers: 0,
        activeCustomers: 0,
        outstandingBalance: 0,
        recentTransactions: [],
        alertsCount: 0
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  const calculatePeriodComparison = (current: number, previous: number): PeriodComparison => {
    // Validate input values
    const validCurrent = typeof current === 'number' && !isNaN(current) ? current : 0;
    const validPrevious = typeof previous === 'number' && !isNaN(previous) ? previous : 0;
    
    // Calculate change with precision
    const change = Math.round((validCurrent - validPrevious) * 100) / 100;
    
    // Calculate percentage change with proper handling of edge cases
    let changePercent = 0;
    if (validPrevious === 0) {
      // When previous is 0, show 100% if current > 0, otherwise 0%
      changePercent = validCurrent > 0 ? 100 : 0;
    } else {
      // Use absolute value of previous to handle negative previous values correctly
      changePercent = (change / Math.abs(validPrevious)) * 100;
    }
    
    return {
      current: Number(validCurrent.toFixed(2)),
      previous: Number(validPrevious.toFixed(2)),
      change: Number(change.toFixed(2)),
      changePercent: Number(changePercent.toFixed(1)),
      isIncrease: change >= 0
    };
  };

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex items-center space-x-2">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>Loading dashboard...</span>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="p-6">
        <div className="text-center">
          <p>Unable to load dashboard data.</p>
          <Button onClick={handleRefresh} className="mt-2">
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">
              {businessInfo.businessName || 'Sample POS'} Dashboard
            </h1>
            <p className="text-muted-foreground">
              Real-time business analytics and performance metrics
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-sm text-muted-foreground">
              Last updated: {format(lastUpdated, 'HH:mm:ss')}
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleRefresh} 
              disabled={refreshing}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Date Filter */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm font-medium">Period:</span>
            <Select value={dateFilter} onValueChange={(value: DateFilterType) => setDateFilter(value)}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="this_week">This Week</SelectItem>
                <SelectItem value="last_week">Last Week</SelectItem>
                <SelectItem value="this_month">This Month</SelectItem>
                <SelectItem value="last_month">Last Month</SelectItem>
                <SelectItem value="this_year">This Year</SelectItem>
                <SelectItem value="last_year">Last Year</SelectItem>
                <SelectItem value="last_7_days">Last 7 Days</SelectItem>
                <SelectItem value="last_30_days">Last 30 Days</SelectItem>
                <SelectItem value="all_time">All Time</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {filteredTransactions.length > 0 && (
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Filter className="h-4 w-4" />
                <span>{filteredTransactions.length} transactions</span>
              </div>
              <div className="flex items-center gap-1">
                <DollarSign className="h-4 w-4" />
                <span>${calculateTotalRevenue(filteredTransactions).toLocaleString()}</span>
              </div>
            </div>
          )}
        </div>

        {/* Alerts Banner */}
        {stats.alertsCount > 0 && (
          <Card className="border-orange-200 bg-orange-50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-orange-600" />
                <span className="text-sm font-medium text-orange-800">
                  {stats.alertsCount} alert(s) require attention: 
                  {stats.lowStockCount > 0 && ` ${stats.lowStockCount} low stock`}
                  {stats.expiredStockCount > 0 && ` ${stats.expiredStockCount} expired items`}
                  {stats.expiringSoonCount > 0 && ` ${stats.expiringSoonCount} expiring soon`}
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Profit Data Quality Indicator */}
        {stats.profitDataQuality < 100 && (
          <Card className="border-yellow-200 bg-yellow-50">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-yellow-600" />
                <span className="text-sm font-medium text-yellow-800">
                  Profit Data Quality: {stats.profitDataQuality.toFixed(1)}%
                </span>
              </div>
              <div className="text-xs text-yellow-700 mt-1">
                {stats.transactionsWithEstimatedProfit} of {stats.currentTransactions} transactions use estimated profit data (60% cost assumption). 
                Consider updating cost prices for accurate profit analysis.
              </div>
            </CardContent>
          </Card>
        )}

        {/* Key Metrics Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {getDateRange(dateFilter).label} Revenue
              </CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {SettingsService.getInstance().formatCurrency(calculateTotalRevenue(filteredTransactions))}
              </div>
              <div className="flex items-center text-xs text-muted-foreground mt-1">
                {stats.revenueComparison && stats.revenueComparison.isIncrease ? (
                  <ArrowUp className="mr-1 h-3 w-3 text-green-600" />
                ) : (
                  <ArrowDown className="mr-1 h-3 w-3 text-red-600" />
                )}
                <span className={stats.revenueComparison?.isIncrease ? 'text-green-600' : 'text-red-600'}>
                  {stats.revenueComparison ? Math.abs(stats.revenueComparison.changePercent).toFixed(1) : 0}% vs {getComparisonDateRange(dateFilter).label.toLowerCase()}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Transactions</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats.currentTransactions.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">
                {getDateRange(dateFilter).label} period
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Transaction</CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {SettingsService.getInstance().formatCurrency(
                  stats.currentTransactions > 0 ? stats.currentRevenue / stats.currentTransactions : 0
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {stats.currentRevenue > 0 ? ((stats.currentProfit / stats.currentRevenue) * 100).toFixed(1) : 0}% profit margin
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Gross Profit</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {SettingsService.getInstance().formatCurrency(stats.currentProfit)}
              </div>
              <div className="flex items-center text-xs text-muted-foreground mt-1">
                {stats.profitComparison && stats.profitComparison.isIncrease ? (
                  <ArrowUp className="mr-1 h-3 w-3 text-green-600" />
                ) : (
                  <ArrowDown className="mr-1 h-3 w-3 text-red-600" />
                )}
                <span className={stats.profitComparison?.isIncrease ? 'text-green-600' : 'text-red-600'}>
                  {stats.profitComparison ? Math.abs(stats.profitComparison.changePercent).toFixed(1) : 0}% vs {getComparisonDateRange(dateFilter).label.toLowerCase()}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="sales">Sales</TabsTrigger>
            <TabsTrigger value="inventory">Inventory</TabsTrigger>
            <TabsTrigger value="customers">Customers</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {/* Recent Transactions */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Recent Transactions
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {stats.recentTransactions.length === 0 ? (
                      <div className="text-center text-muted-foreground py-4">
                        <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No transactions found for the selected period</p>
                        <p className="text-xs mt-1">Try selecting a different date range</p>
                      </div>
                    ) : (
                      stats.recentTransactions.slice(0, 5).map((transaction) => (
                      <div key={transaction.id} className="flex justify-between items-center p-2 border-b">
                        <div>
                          <div className="font-medium text-sm">{transaction.customer}</div>
                          <div className="text-xs text-muted-foreground">
                            {format(new Date(transaction.timestamp), 'HH:mm')}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-medium">
                            {SettingsService.getInstance().formatCurrency(transaction.total)}
                          </div>
                          <Badge 
                            variant={transaction.status === 'PAID' ? 'default' : 'secondary'}
                            className="text-xs"
                          >
                            {transaction.status}
                          </Badge>
                        </div>
                      </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Top Selling Items */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Top Selling Items (30d)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {stats.topSellingItems.map((item, index) => (
                      <div key={item.name} className="flex justify-between items-center p-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-muted-foreground">
                            #{index + 1}
                          </span>
                          <div>
                            <div className="font-medium text-sm">{item.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {item.quantity} sold
                            </div>
                          </div>
                        </div>
                        <div className="font-medium">
                          {SettingsService.getInstance().formatCurrency(item.revenue)}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Payment Methods */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Payment Methods (30d)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-3">
                  {Object.entries(stats.paymentMethodBreakdown).map(([method, amount]) => (
                    <div key={method} className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                      <span className="font-medium">{method}</span>
                      <span className="font-bold">
                        {SettingsService.getInstance().formatCurrency(amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sales" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Sales Performance</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span>Total Revenue:</span>
                      <span className="font-bold">
                        {SettingsService.getInstance().formatCurrency(stats.totalRevenue)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Total Profit:</span>
                      <span className="font-bold text-green-600">
                        {SettingsService.getInstance().formatCurrency(stats.totalProfit)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Profit Margin:</span>
                      <span className="font-bold">
                        {stats.profitMargin.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Period Comparison</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span>Today:</span>
                      <span className="font-medium">
                        {SettingsService.getInstance().formatCurrency(stats.todayRevenue)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Week:</span>
                      <span className="font-medium">
                        {SettingsService.getInstance().formatCurrency(stats.weekRevenue)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Month:</span>
                      <span className="font-medium">
                        {SettingsService.getInstance().formatCurrency(stats.monthRevenue)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Hourly Sales Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Today's Hourly Sales</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-12 gap-1 h-32 items-end">
                  {stats.hourlyStats.map((stat) => {
                    const maxSales = Math.max(...stats.hourlyStats.map(s => s.sales));
                    const isHigh = maxSales > 0 && (stat.sales / maxSales) > 0.7;
                    const isMedium = maxSales > 0 && (stat.sales / maxSales) > 0.3;
                    
                    return (
                      <div 
                        key={stat.hour} 
                        className={`bg-primary/20 rounded-t flex flex-col items-center justify-end p-1 min-h-[20px] ${
                          isHigh ? 'h-32' : isMedium ? 'h-20' : stat.sales > 0 ? 'h-10' : 'h-2'
                        }`}
                        title={`${stat.hour}:00 - ${SettingsService.getInstance().formatCurrency(stat.sales)}`}
                      >
                        <div className="text-[8px] text-center">
                          <div className="font-medium">{stat.hour}</div>
                          {stat.sales > 0 && (
                            <div className="text-[6px] mt-1">
                              {SettingsService.getInstance().formatCurrency(stat.sales)}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="inventory" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Total Products</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.totalProducts}</div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-1">
                    <TrendingDown className="h-3 w-3 text-red-500" />
                    Low Stock
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">{stats.lowStockCount}</div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-1">
                    <AlertCircle className="h-3 w-3 text-orange-500" />
                    Expiring Soon
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-orange-600">{stats.expiringSoonCount}</div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-1">
                    <Zap className="h-3 w-3 text-red-700" />
                    Expired
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-700">{stats.expiredStockCount}</div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Inventory Alerts</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-muted-foreground">
                  {stats.alertsCount === 0 ? (
                    "No inventory alerts at this time. All products are well-stocked."
                  ) : (
                    `${stats.alertsCount} items require attention. Check the Inventory tab for details.`
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="customers" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Total Customers</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.totalCustomers}</div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Active Customers</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">{stats.activeCustomers}</div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Outstanding Balance</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {SettingsService.getInstance().formatCurrency(stats.outstandingBalance)}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Dashboard;