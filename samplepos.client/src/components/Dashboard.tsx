import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { clearAllApplicationData, clearInventoryData, clearTransactionData, clearCustomerData } from '../utils/dataReset';
// import CleanAppNotification from './CleanAppNotification'; // Removed - was not Shadcn-only
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Line, Bar, Pie, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
} from 'chart.js';
import 'chart.js/auto';

// Register the components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
);

// Define interfaces for our data structures
interface PaymentDetail {
  amount: number;
  method: string;
  reference: string;
  note?: string;
  timestamp: string;
}

interface SaleItem {
  name: string;
  price: number;
  quantity: number | '';
  batch?: string;
}

interface SaleRecord {
  id: string;
  cart: SaleItem[];
  customer: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  change: number;
  outstanding: number;
  status: 'PAID' | 'PARTIAL' | 'OVERPAID';
  payments: PaymentDetail[];
  paymentType: string;
  note?: string;
  timestamp: string;
  invoiceNumber: string;
}

interface InventoryItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  category: string;
  sku?: string;
  barcode?: string;
  costPrice?: number;
  batch?: string;
  expiryDate?: string;
}

// Helper function to format currency
const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
};

// Helper function to format date
const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

// Dashboard component
const Dashboard: React.FC = () => {
  const TRANSACTION_HISTORY_KEY = 'pos_transaction_history_v1';
  const INVENTORY_KEY = 'pos_inventory_v1';
  
  const [transactions, setTransactions] = useState<SaleRecord[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [timeRange, setTimeRange] = useState<string>('week');
  const [showCleanNotification, setShowCleanNotification] = useState(true);
  const [dashboardStats, setDashboardStats] = useState({
    totalRevenue: 0,
    totalSales: 0,
    averageOrderValue: 0,
    totalItems: 0,
    totalCustomers: 0,
    outstandingPayments: 0,
    totalInventoryValue: 0,
    totalInventoryItems: 0,
    inventoryCostValue: 0,
    // Customer & Ledger metrics
    totalCustomerBalance: 0,
    avgCustomerLifetimeValue: 0,
    customerRetentionRate: 0,
    overduePayments: 0,
    accountsReceivableAging: {
      '0-30': 0,
      '31-60': 0,
      '61-90': 0,
      '90+': 0
    }
  });
  
  // Load data on component mount
  useEffect(() => {
    loadTransactions();
    loadInventory();
    
    // Listen for storage changes to update dashboard when new transactions are added
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === TRANSACTION_HISTORY_KEY) {
        console.log('🔄 Transaction history updated, reloading dashboard data');
        loadTransactions();
      } else if (e.key === INVENTORY_KEY || e.key === 'inventory_items') {
        console.log('📦 Inventory updated, reloading dashboard data');
        loadInventory();
      }
    };
    
    // Also listen for custom storage events (from same tab)
    const handleCustomStorageEvent = () => {
      console.log('🔄 Custom storage event received, refreshing dashboard');
      loadTransactions();
      loadInventory();
    };
    
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('storage', handleCustomStorageEvent);
    
    // Listen for manual refresh events
    const handleManualRefresh = () => {
      console.log('🔄 Manual refresh triggered');
      loadTransactions();
      loadInventory();
      calculateDashboardStats();
    };
    
    // Add a global function to manually refresh dashboard
    (window as any).refreshDashboard = handleManualRefresh;
    
    // Cleanup listeners on unmount
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('storage', handleCustomStorageEvent);
      delete (window as any).refreshDashboard;
    };
  }, []);
  
  // Calculate stats when data changes
  useEffect(() => {
    calculateDashboardStats();
  }, [transactions, inventory]);
  
  // Load transactions from local storage
  const loadTransactions = () => {
    try {
      const storedTransactions = localStorage.getItem(TRANSACTION_HISTORY_KEY);
      if (storedTransactions) {
        const parsedTransactions: SaleRecord[] = JSON.parse(storedTransactions);
        setTransactions(parsedTransactions);
      }
    } catch (error) {
      console.error('Error loading transactions:', error);
    }
  };
  
  // Load inventory from local storage
  const loadInventory = () => {
    try {
      const storedInventory = localStorage.getItem(INVENTORY_KEY);
      if (storedInventory) {
        const parsedInventory: InventoryItem[] = JSON.parse(storedInventory);
        setInventory(parsedInventory);
      }
    } catch (error) {
      console.error('Error loading inventory:', error);
    }
  };
  
  // Calculate dashboard statistics
  const calculateDashboardStats = () => {
    // Calculate transaction statistics
    const totalRevenue = transactions.reduce((sum, transaction) => sum + transaction.paid, 0);
    const totalItems = transactions.reduce((sum, transaction) => 
      sum + transaction.cart.reduce((cartSum, item) => 
        cartSum + (typeof item.quantity === 'number' ? item.quantity : 0), 0), 0);
    
    // Get unique customers
    const uniqueCustomers = new Set(transactions.map(t => t.customer).filter(c => c !== ''));
    
    // Calculate outstanding payments
    const outstandingPayments = transactions.reduce((sum, transaction) => sum + transaction.outstanding, 0);
    
    // Calculate inventory valuation
    const totalInventoryValue = inventory.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const totalInventoryItems = inventory.reduce((sum, item) => sum + item.quantity, 0);
    
    // Calculate inventory cost value if costPrice is available
    const inventoryCostValue = inventory.reduce((sum, item) => {
      const costPrice = item.costPrice || item.price * 0.6; // Use 60% of sale price as default cost if no costPrice
      return sum + (costPrice * item.quantity);
    }, 0);
    
    // Load customer and ledger data
    let customers: any[] = [];
    let ledger: any[] = [];
    try {
      const storedCustomers = localStorage.getItem('pos_customers');
      const storedLedger = localStorage.getItem('pos_ledger');
      customers = storedCustomers ? JSON.parse(storedCustomers) : [];
      ledger = storedLedger ? JSON.parse(storedLedger) : [];
    } catch (error) {
      console.error('Error loading customer/ledger data:', error);
    }
    
    // Calculate customer & ledger metrics
    const totalCustomerBalance = customers.reduce((sum, customer) => sum + customer.balance, 0);
    
    // Calculate customer lifetime value
    const customerValues = new Map<string, number>();
    ledger.forEach(entry => {
      if (entry.type === 'credit') {
        const prevValue = customerValues.get(entry.customer) || 0;
        customerValues.set(entry.customer, prevValue + entry.amount);
      }
    });
    
    const lifetimeValues = Array.from(customerValues.values());
    const avgCustomerLifetimeValue = lifetimeValues.length ? 
      lifetimeValues.reduce((sum, val) => sum + val, 0) / lifetimeValues.length : 0;
    
    // Calculate customer retention (customers who made multiple purchases)
    const customerTransactions = new Map<string, number>();
    transactions.forEach(transaction => {
      if (transaction.customer) {
        const prevCount = customerTransactions.get(transaction.customer) || 0;
        customerTransactions.set(transaction.customer, prevCount + 1);
      }
    });
    
    const repeatCustomers = Array.from(customerTransactions.values())
      .filter(count => count > 1).length;
    const customerRetentionRate = uniqueCustomers.size ? 
      (repeatCustomers / uniqueCustomers.size) * 100 : 0;
      
    // Calculate overdue payments and aging
    const now = new Date();
    let overduePayments = 0;
    const accountsReceivableAging = {
      '0-30': 0,
      '31-60': 0,
      '61-90': 0,
      '90+': 0
    };
    
    // Load scheduled payments
    try {
      const storedPayments = localStorage.getItem('pos_scheduled_payments');
      const scheduledPayments = storedPayments ? JSON.parse(storedPayments) : [];
      
      scheduledPayments.forEach((payment: any) => {
        if (payment.status === 'overdue') {
          overduePayments += payment.amount;
          
          // Calculate days overdue
          const dueDate = new Date(payment.dueDate);
          const diffTime = now.getTime() - dueDate.getTime();
          const diffDays = Math.floor(diffTime / (1000 * 3600 * 24));
          
          if (diffDays <= 30) {
            accountsReceivableAging['0-30'] += payment.amount;
          } else if (diffDays <= 60) {
            accountsReceivableAging['31-60'] += payment.amount;
          } else if (diffDays <= 90) {
            accountsReceivableAging['61-90'] += payment.amount;
          } else {
            accountsReceivableAging['90+'] += payment.amount;
          }
        }
      });
    } catch (error) {
      console.error('Error loading scheduled payments:', error);
    }
    
    setDashboardStats({
      totalRevenue,
      totalSales: transactions.length || 0,
      averageOrderValue: transactions.length ? (totalRevenue / transactions.length) : 0,
      totalItems,
      totalCustomers: uniqueCustomers.size,
      outstandingPayments,
      totalInventoryValue,
      totalInventoryItems,
      inventoryCostValue,
      // Customer & Ledger metrics
      totalCustomerBalance,
      avgCustomerLifetimeValue,
      customerRetentionRate,
      overduePayments,
      accountsReceivableAging
    });
  };
  
  // Filter transactions based on time range
  const getFilteredTransactions = () => {
    const now = new Date();
    let cutoffDate = new Date();
    
    switch (timeRange) {
      case 'today':
        cutoffDate.setHours(0, 0, 0, 0);
        break;
      case 'week':
        cutoffDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        cutoffDate.setMonth(now.getMonth() - 1);
        break;
      case 'year':
        cutoffDate.setFullYear(now.getFullYear() - 1);
        break;
      default:
        cutoffDate.setDate(now.getDate() - 7); // Default to week
    }
    
    return transactions.filter(transaction => 
      new Date(transaction.timestamp) >= cutoffDate
    );
  };
  
  // Prepare sales trend data for the line chart
  const prepareSalesTrendData = () => {
    const filtered = getFilteredTransactions();
    
    // Group by date
    const salesByDate = filtered.reduce<Record<string, number>>((acc, transaction) => {
      const date = new Date(transaction.timestamp).toISOString().split('T')[0];
      acc[date] = (acc[date] || 0) + transaction.total;
      return acc;
    }, {});
    
    // Get dates in order
    const dates = Object.keys(salesByDate).sort();
    
    // Format dates nicely for display
    const labels = dates.map(date => {
      const d = new Date(date);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
    
    const data = dates.map(date => salesByDate[date]);
    
    return {
      labels,
      datasets: [
        {
          label: 'Sales',
          data,
          fill: false,
          backgroundColor: 'rgba(75, 192, 192, 0.2)',
          borderColor: 'rgba(75, 192, 192, 1)',
          tension: 0.1
        }
      ]
    };
  };
  
  // Prepare payment methods data for pie chart
  const preparePaymentMethodsData = () => {
    const filtered = getFilteredTransactions();
    
    // Group by payment method
    const paymentMethods = filtered.reduce<Record<string, number>>((acc, transaction) => {
      transaction.payments.forEach(payment => {
        acc[payment.method] = (acc[payment.method] || 0) + payment.amount;
      });
      return acc;
    }, {});
    
    const labels = Object.keys(paymentMethods);
    const data = Object.values(paymentMethods);
    
    return {
      labels,
      datasets: [
        {
          label: 'Payment Methods',
          data,
          backgroundColor: [
            'rgba(255, 99, 132, 0.6)',
            'rgba(54, 162, 235, 0.6)',
            'rgba(255, 206, 86, 0.6)',
            'rgba(75, 192, 192, 0.6)',
            'rgba(153, 102, 255, 0.6)',
            'rgba(255, 159, 64, 0.6)'
          ],
          borderWidth: 1
        }
      ]
    };
  };
  
  // Prepare top selling products data
  const prepareTopProductsData = () => {
    const filtered = getFilteredTransactions();
    
    // Count products sold
    const productCounts = filtered.reduce<Record<string, number>>((acc, transaction) => {
      transaction.cart.forEach(item => {
        const quantity = typeof item.quantity === 'number' ? item.quantity : 0;
        acc[item.name] = (acc[item.name] || 0) + quantity;
      });
      return acc;
    }, {});
    
    // Convert to array and sort by count
    const sortedProducts = Object.entries(productCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5); // Get top 5
    
    const labels = sortedProducts.map(([name]) => name);
    const data = sortedProducts.map(([, count]) => count);
    
    return {
      labels,
      datasets: [
        {
          label: 'Units Sold',
          data,
          backgroundColor: 'rgba(54, 162, 235, 0.6)',
          borderColor: 'rgba(54, 162, 235, 1)',
          borderWidth: 1
        }
      ]
    };
  };
  
  // Prepare hourly sales distribution data
  const prepareHourlySalesData = () => {
    const filtered = getFilteredTransactions();
    
    // Initialize hours array (0-23)
    const hours = Array(24).fill(0);
    
    // Group sales by hour
    filtered.forEach(transaction => {
      const hour = new Date(transaction.timestamp).getHours();
      hours[hour] += transaction.total;
    });
    
    // Create labels for each hour (24 hour format)
    const labels = hours.map((_, index) => `${index}:00`);
    
    return {
      labels,
      datasets: [
        {
          label: 'Sales by Hour',
          data: hours,
          backgroundColor: 'rgba(153, 102, 255, 0.6)',
          borderColor: 'rgba(153, 102, 255, 1)',
          borderWidth: 1
        }
      ]
    };
  };

  // Prepare payment status data
  const preparePaymentStatusData = () => {
    const filtered = getFilteredTransactions();
    
    // Count transactions by status
    const statusCounts = filtered.reduce<Record<string, number>>((acc, transaction) => {
      acc[transaction.status] = (acc[transaction.status] || 0) + 1;
      return acc;
    }, {});
    
    const labels = Object.keys(statusCounts);
    const data = Object.values(statusCounts);
    
    return {
      labels,
      datasets: [
        {
          label: 'Payment Status',
          data,
          backgroundColor: [
            'rgba(75, 192, 192, 0.6)',
            'rgba(255, 206, 86, 0.6)',
            'rgba(255, 99, 132, 0.6)'
          ],
          borderWidth: 1
        }
      ]
    };
  };
  
  // Prepare inventory valuation data by category
  const prepareInventoryValuationData = () => {
    // Group inventory by category
    const categoryValues = inventory.reduce<Record<string, number>>((acc, item) => {
      const category = item.category || 'Uncategorized';
      acc[category] = (acc[category] || 0) + (item.price * item.quantity);
      return acc;
    }, {});
    
    // Sort by value (descending)
    const sortedCategories = Object.entries(categoryValues)
      .sort(([, a], [, b]) => b - a);
    
    const labels = sortedCategories.map(([category]) => category);
    const data = sortedCategories.map(([, value]) => value);
    
    return {
      labels,
      datasets: [
        {
          label: 'Inventory Value',
          data,
          backgroundColor: [
            'rgba(46, 204, 113, 0.6)',
            'rgba(52, 152, 219, 0.6)',
            'rgba(155, 89, 182, 0.6)',
            'rgba(230, 126, 34, 0.6)',
            'rgba(41, 128, 185, 0.6)',
            'rgba(39, 174, 96, 0.6)',
            'rgba(211, 84, 0, 0.6)'
          ],
          borderWidth: 1
        }
      ]
    };
  };
  
  // Prepare top customers data
  const prepareTopCustomersData = () => {
    let ledger: any[] = [];
    
    try {
      const storedLedger = localStorage.getItem('pos_ledger');
      ledger = storedLedger ? JSON.parse(storedLedger) : [];
    } catch (error) {
      console.error('Error loading customer/ledger data:', error);
      return {
        labels: [],
        datasets: [{ label: 'No Data', data: [] }]
      };
    }
    
    // Calculate customer totals
    const customerTotals = new Map<string, number>();
    ledger.forEach(entry => {
      if (entry.type === 'credit') {
        const prevTotal = customerTotals.get(entry.customer) || 0;
        customerTotals.set(entry.customer, prevTotal + entry.amount);
      }
    });
    
    // Convert to array and sort
    const sortedCustomers = Array.from(customerTotals.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5); // Top 5 customers
    
    const labels = sortedCustomers.map(([name]) => name);
    const data = sortedCustomers.map(([, total]) => total);
    
    return {
      labels,
      datasets: [
        {
          label: 'Customer Value',
          data,
          backgroundColor: 'rgba(54, 162, 235, 0.6)',
          borderColor: 'rgba(54, 162, 235, 1)',
          borderWidth: 1
        }
      ]
    };
  };
  
  // Prepare accounts receivable aging chart
  const prepareAgingData = () => {
    const { accountsReceivableAging } = dashboardStats;
    
    const labels = ['0-30 days', '31-60 days', '61-90 days', '90+ days'];
    const data = [
      accountsReceivableAging['0-30'],
      accountsReceivableAging['31-60'],
      accountsReceivableAging['61-90'],
      accountsReceivableAging['90+']
    ];
    
    return {
      labels,
      datasets: [
        {
          label: 'Accounts Receivable Aging',
          data,
          backgroundColor: [
            'rgba(46, 204, 113, 0.6)',
            'rgba(255, 206, 86, 0.6)',
            'rgba(255, 159, 64, 0.6)',
            'rgba(231, 76, 60, 0.6)'
          ],
          borderWidth: 1
        }
      ]
    };
  };
  
  // Get recent transactions
  const getRecentTransactions = () => {
    return transactions
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 5);
  };
  
  // Get low stock items
  const getLowStockItems = () => {
    return inventory
      .filter(item => item.quantity <= 10)
      .sort((a, b) => a.quantity - b.quantity)
      .slice(0, 5);
  };
  
  // Chart options
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          usePointStyle: true,
          padding: 15,
          font: {
            size: window.innerWidth < 640 ? 10 : 12,
          },
        },
      },
    },
    scales: {
      x: {
        ticks: {
          font: {
            size: window.innerWidth < 640 ? 10 : 12,
          },
        },
      },
      y: {
        ticks: {
          font: {
            size: window.innerWidth < 640 ? 10 : 12,
          },
        },
      },
    },
  };
  
  return (
    <div className="min-h-screen bg-background p-3 sm:p-6 space-y-4 sm:space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Overview of your business performance and key metrics
          </p>
        </div>
      </div>

      {/* Clean Application Notification - Temporarily disabled */}
      {showCleanNotification && (
        <div className="fixed top-4 right-4 bg-primary text-primary-foreground p-4 rounded-md shadow-lg">
          <p>Clean application ready!</p>
          <button onClick={() => setShowCleanNotification(false)} className="ml-2 underline">Dismiss</button>
        </div>
      )}
      
      <Card>
        <CardContent className="pt-4 sm:pt-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <Label htmlFor="time-range-select" className="text-sm font-medium">Time Range:</Label>
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">Last 7 Days</SelectItem>
                <SelectItem value="month">Last 30 Days</SelectItem>
                <SelectItem value="year">Last Year</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
      
      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <span className="text-2xl">💰</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(dashboardStats.totalRevenue)}</div>
            <p className="text-xs text-muted-foreground">
              Revenue for selected period
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
            <span className="text-2xl">🛒</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboardStats.totalSales}</div>
            <p className="text-xs text-muted-foreground">
              Number of completed transactions
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Order</CardTitle>
            <span className="text-2xl">📊</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(dashboardStats.averageOrderValue)}</div>
            <p className="text-xs text-muted-foreground">
              Average order value
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inventory Value</CardTitle>
            <span className="text-2xl">💵</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(dashboardStats.totalInventoryValue)}</div>
            <p className="text-xs text-muted-foreground">
              {dashboardStats.totalInventoryItems} items in stock
            </p>
          </CardContent>
        </Card>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Potential Profit</CardTitle>
            <span className="text-2xl">📈</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(dashboardStats.totalInventoryValue - dashboardStats.inventoryCostValue)}</div>
            <p className="text-xs text-muted-foreground">Based on current stock</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Items Sold</CardTitle>
            <span className="text-2xl">📦</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboardStats.totalItems}</div>
            <p className="text-xs text-muted-foreground">{timeRange === 'today' ? 'Today' : timeRange === 'week' ? 'This week' : timeRange === 'month' ? 'This month' : 'This year'}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Customers</CardTitle>
            <span className="text-2xl">👥</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboardStats.totalCustomers}</div>
            <p className="text-xs text-muted-foreground">Unique customers served</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Outstanding Payments</CardTitle>
            <span className="text-2xl">💰</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(dashboardStats.outstandingPayments)}</div>
            <p className="text-xs text-muted-foreground">Pending payments</p>
          </CardContent>
        </Card>
      </div>
      
      {/* Charts Section */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
        <Card>
          <CardHeader className="pb-2 sm:pb-4">
            <CardTitle className="text-base sm:text-lg">Sales Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 sm:h-80 w-full">
              <Line data={prepareSalesTrendData()} options={chartOptions} />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2 sm:pb-4">
            <CardTitle className="text-base sm:text-lg">Payment Methods</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 sm:h-80 w-full">
              <Doughnut data={preparePaymentMethodsData()} options={chartOptions} />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Top Selling Products</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <Bar data={prepareTopProductsData()} options={chartOptions} />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Sales by Hour</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <Bar data={prepareHourlySalesData()} options={chartOptions} />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Payment Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <Pie data={preparePaymentStatusData()} options={chartOptions} />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Inventory Value by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <Doughnut data={prepareInventoryValuationData()} options={chartOptions} />
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Recent Transactions Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full">
          <thead>
            <tr>
              <th>Invoice #</th>
              <th>Date</th>
              <th>Customer</th>
              <th>Total</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {getRecentTransactions().map(transaction => (
              <tr key={transaction.id}>
                <td>{transaction.invoiceNumber}</td>
                <td>{formatDate(transaction.timestamp)}</td>
                <td>{transaction.customer || 'N/A'}</td>
                <td>{formatCurrency(transaction.total)}</td>
                <td>
                  <span className={`status-badge ${transaction.status.toLowerCase()}`}>
                    {transaction.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </CardContent>
      </Card>
      
      {/* Inventory Metrics */}
      <Card>
        <CardHeader>
          <CardTitle>Inventory Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-secondary rounded-lg">
              <h4 className="text-sm font-medium text-muted-foreground">Total Inventory Value</h4>
              <div className="text-2xl font-bold">{formatCurrency(dashboardStats.totalInventoryValue)}</div>
              <div className="text-xs text-muted-foreground">Retail value of all stock</div>
            </div>
            <div className="text-center p-4 bg-secondary rounded-lg">
              <h4 className="text-sm font-medium text-muted-foreground">Inventory Cost</h4>
              <div className="text-2xl font-bold">{formatCurrency(dashboardStats.inventoryCostValue)}</div>
              <div className="text-xs text-muted-foreground">Cost basis of current inventory</div>
            </div>
            <div className="text-center p-4 bg-secondary rounded-lg">
              <h4 className="text-sm font-medium text-muted-foreground">Potential Profit</h4>
              <div className="text-2xl font-bold">{formatCurrency(dashboardStats.totalInventoryValue - dashboardStats.inventoryCostValue)}</div>
              <div className="text-xs text-muted-foreground">If all inventory sells at listed price</div>
            </div>
            <div className="text-center p-4 bg-secondary rounded-lg">
              <h4 className="text-sm font-medium text-muted-foreground">Total Stock Items</h4>
              <div className="text-2xl font-bold">{dashboardStats.totalInventoryItems}</div>
              <div className="text-xs text-muted-foreground">Total quantity of all products</div>
            </div>
            <div className="text-center p-4 bg-secondary rounded-lg">
              <h4 className="text-sm font-medium text-muted-foreground">Unique Products</h4>
              <div className="text-2xl font-bold">{inventory.length}</div>
              <div className="text-xs text-muted-foreground">Number of unique product SKUs</div>
            </div>
            <div className="text-center p-4 bg-secondary rounded-lg">
              <h4 className="text-sm font-medium text-muted-foreground">Avg. Item Value</h4>
              <div className="text-2xl font-bold">
                {formatCurrency(dashboardStats.totalInventoryItems > 0 
                  ? dashboardStats.totalInventoryValue / dashboardStats.totalInventoryItems 
                  : 0)}
              </div>
              <div className="text-xs text-muted-foreground">Average value per inventory item</div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Customer & Ledger Metrics */}
      <Card>
        <CardHeader>
          <CardTitle>Customer & Accounts Receivable Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-secondary rounded-lg">
              <h4 className="text-sm font-medium text-muted-foreground">Total Customer Balance</h4>
              <div className="text-2xl font-bold">{formatCurrency(dashboardStats.totalCustomerBalance)}</div>
              <div className="text-xs text-muted-foreground">Total balance owed by customers</div>
            </div>
            
            <div className="text-center p-4 bg-secondary rounded-lg">
              <h4 className="text-sm font-medium text-muted-foreground">Avg. Lifetime Value</h4>
              <div className="text-2xl font-bold">{formatCurrency(dashboardStats.avgCustomerLifetimeValue)}</div>
              <div className="text-xs text-muted-foreground">Average customer spending</div>
            </div>
            
            <div className="text-center p-4 bg-secondary rounded-lg">
              <h4 className="text-sm font-medium text-muted-foreground">Customer Retention</h4>
              <div className="text-2xl font-bold">{dashboardStats.customerRetentionRate.toFixed(1)}%</div>
              <div className="text-xs text-muted-foreground">Customers with repeat purchases</div>
            </div>
            
            <div className="text-center p-4 bg-secondary rounded-lg">
              <h4 className="text-sm font-medium text-muted-foreground">Overdue Payments</h4>
              <div className="text-2xl font-bold">{formatCurrency(dashboardStats.overduePayments)}</div>
              <div className="text-xs text-muted-foreground">Total value of overdue payments</div>
            </div>
          </div>
        </CardContent>
      </Card>
        
      {/* Customer Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Top Customers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <Bar data={prepareTopCustomersData()} options={chartOptions} />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Accounts Receivable Aging</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <Pie data={prepareAgingData()} options={chartOptions} />
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Low Stock Items Table */}
      <Card>
        <CardHeader>
          <CardTitle>Low Stock Alerts</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full">
          <thead>
            <tr>
              <th>Product</th>
              <th>Category</th>
              <th>SKU</th>
              <th>Quantity</th>
              <th>Value</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {getLowStockItems().map(item => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>{item.category}</td>
                <td>{item.sku || 'N/A'}</td>
                <td>{item.quantity}</td>
                <td>{formatCurrency(item.price * item.quantity)}</td>
                <td>
                  <span className={`stock-badge ${item.quantity <= 5 ? 'critical' : 'warning'}`}>
                    {item.quantity <= 5 ? 'Critical' : 'Warning'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </CardContent>
      </Card>

      {/* Data Management Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-red-600">⚠️ Data Management</CardTitle>
          <p className="text-sm text-muted-foreground">
            Clear application data when needed. <strong>Warning:</strong> These actions cannot be undone.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Button
              variant="outline"
              onClick={() => {
                if (confirm('Clear all inventory data? This cannot be undone.')) {
                  clearInventoryData();
                  window.location.reload();
                }
              }}
              className="w-full"
            >
              Clear Inventory
            </Button>
            
            <Button
              variant="outline"
              onClick={() => {
                if (confirm('Clear all transaction history? This cannot be undone.')) {
                  clearTransactionData();
                  window.location.reload();
                }
              }}
              className="w-full"
            >
              Clear Transactions
            </Button>
            
            <Button
              variant="outline"
              onClick={() => {
                if (confirm('Clear all customer data? This cannot be undone.')) {
                  clearCustomerData();
                  window.location.reload();
                }
              }}
              className="w-full"
            >
              Clear Customers
            </Button>
            
            <Button
              variant="destructive"
              onClick={() => {
                if (confirm('Clear ALL application data? This will reset everything and cannot be undone.')) {
                  clearAllApplicationData();
                }
              }}
              className="w-full"
            >
              Clear All Data
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;