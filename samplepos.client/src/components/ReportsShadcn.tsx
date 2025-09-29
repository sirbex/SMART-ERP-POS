import React, { useState, useEffect } from 'react';
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Calendar } from "./ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { CalendarIcon, Download, FileText, TrendingUp, Package, Users } from "lucide-react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";

// Import Chart components for data visualization
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  PointElement,
  LineElement,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  PointElement,
  LineElement
);

// Interfaces for data types - PaymentRecord removed (unused)

interface InventoryItem {
  name: string;
  batch: string;
  expiry?: string;
  hasExpiry: boolean;
  quantity: number | '';
  reorderLevel: number | '';
  category?: string;
  price: number | '';
  supplier?: string;
}

interface LedgerEntry {
  id: string;
  customer: string;
  date: string;
  amount: number;
  type: 'credit' | 'debit';
  note: string;
  balance: number;
}

interface SaleRecord {
  id: string;
  invoiceNumber: string;
  timestamp: string;
  customer: string;
  cart: Array<{
    name: string;
    quantity: number | '';
    price: number;
  }>;
  total: number;
  status: string;
}

// Utility functions
const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
};

const exportToCSV = (data: any[], filename: string) => {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row => 
      headers.map(header => 
        JSON.stringify(row[header] || '')
      ).join(',')
    )
  ].join('\n');
  
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const ReportsShadcn: React.FC = () => {
  const [activeTab, setActiveTab] = useState('sales');
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    to: new Date()
  });
  
  // Data states
  const [salesData, setSalesData] = useState<SaleRecord[]>([]);
  const [inventoryData, setInventoryData] = useState<InventoryItem[]>([]);
  const [ledgerData, setLedgerData] = useState<LedgerEntry[]>([]);
  
  // Filter states
  const [salesFilter, setSalesFilter] = useState({ status: 'all', customer: 'all' });
  const [inventoryFilter] = useState({ category: 'all', lowStock: false, expiring: false });
  const [ledgerFilter] = useState({ customer: 'all', type: 'all' });
  
  // Load data from localStorage
  useEffect(() => {
    const loadData = () => {
      // Load sales data
      const storedSales = localStorage.getItem('pos_transaction_history_v1');
      if (storedSales) {
        try {
          const parsed = JSON.parse(storedSales);
          if (Array.isArray(parsed)) {
            setSalesData(parsed);
            console.log('📊 Reports: Sales data loaded successfully');
          }
        } catch (error) {
          console.error('Error loading sales data:', error);
        }
      }
      
      // Load inventory data  
      const storedInventory = localStorage.getItem('inventory_items');
      if (storedInventory) {
        try {
          const parsed = JSON.parse(storedInventory);
          if (Array.isArray(parsed)) {
            setInventoryData(parsed);
            console.log('📊 Reports: Inventory data loaded successfully');
          }
        } catch (error) {
          console.error('Error loading inventory data:', error);
        }
      }
      
      // Load ledger data
      const storedLedger = localStorage.getItem('pos_ledger');
      if (storedLedger) {
        try {
          const parsed = JSON.parse(storedLedger);
          if (Array.isArray(parsed)) {
            setLedgerData(parsed);
            console.log('📊 Reports: Ledger data loaded successfully');
          }
        } catch (error) {
          console.error('Error loading ledger data:', error);
        }
      }
    };
    
    // Initial load
    loadData();
    
    // Listen for storage changes
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'pos_transaction_history_v1' || e.key === 'inventory_items' || e.key === 'pos_ledger') {
        console.log('📊 Reports: Data updated, reloading...');
        loadData();
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // Filter data based on date range and filters
  const getFilteredSalesData = () => {
    return salesData.filter(sale => {
      const saleDate = new Date(sale.timestamp);
      const withinDateRange = !dateRange?.from || !dateRange?.to || 
        (saleDate >= dateRange.from && saleDate <= dateRange.to);
      
      const matchesStatus = salesFilter.status === 'all' || sale.status === salesFilter.status;
      const matchesCustomer = salesFilter.customer === 'all' || sale.customer === salesFilter.customer;
      
      return withinDateRange && matchesStatus && matchesCustomer;
    });
  };

  const getFilteredInventoryData = () => {
    return inventoryData.filter(item => {
      const matchesCategory = inventoryFilter.category === 'all' || 
        item.category === inventoryFilter.category;
      
      const isLowStock = inventoryFilter.lowStock ? 
        (typeof item.quantity === 'number' && typeof item.reorderLevel === 'number' && 
         item.quantity <= item.reorderLevel) : true;
      
      const isExpiring = inventoryFilter.expiring ? 
        (item.hasExpiry && item.expiry && 
         new Date(item.expiry) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)) : true;
      
      return matchesCategory && isLowStock && isExpiring;
    });
  };

  const getFilteredLedgerData = () => {
    return ledgerData.filter(entry => {
      const entryDate = new Date(entry.date);
      const withinDateRange = !dateRange?.from || !dateRange?.to || 
        (entryDate >= dateRange.from && entryDate <= dateRange.to);
      
      const matchesCustomer = ledgerFilter.customer === 'all' || entry.customer === ledgerFilter.customer;
      const matchesType = ledgerFilter.type === 'all' || entry.type === ledgerFilter.type;
      
      return withinDateRange && matchesCustomer && matchesType;
    });
  };

  // Generate chart data
  const getSalesChartData = () => {
    const filteredSales = getFilteredSalesData();
    const salesByDate = filteredSales.reduce((acc, sale) => {
      const date = new Date(sale.timestamp).toLocaleDateString();
      acc[date] = (acc[date] || 0) + sale.total;
      return acc;
    }, {} as Record<string, number>);

    return {
      labels: Object.keys(salesByDate).slice(-7), // Last 7 days
      datasets: [{
        label: 'Daily Sales',
        data: Object.values(salesByDate).slice(-7),
        backgroundColor: 'rgba(59, 130, 246, 0.5)',
        borderColor: 'rgba(59, 130, 246, 1)',
        borderWidth: 2,
      }]
    };
  };

  const getInventoryChartData = () => {
    const filteredInventory = getFilteredInventoryData();
    const categories = filteredInventory.reduce((acc, item) => {
      const category = item.category || 'Uncategorized';
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      labels: Object.keys(categories),
      datasets: [{
        label: 'Items by Category',
        data: Object.values(categories),
        backgroundColor: [
          'rgba(239, 68, 68, 0.5)',
          'rgba(34, 197, 94, 0.5)', 
          'rgba(59, 130, 246, 0.5)',
          'rgba(168, 85, 247, 0.5)',
          'rgba(245, 158, 11, 0.5)',
        ],
        borderColor: [
          'rgba(239, 68, 68, 1)',
          'rgba(34, 197, 94, 1)', 
          'rgba(59, 130, 246, 1)',
          'rgba(168, 85, 247, 1)',
          'rgba(245, 158, 11, 1)',
        ],
        borderWidth: 2,
      }]
    };
  };

  // Calculate summary statistics
  const getSalesSummary = () => {
    const filteredSales = getFilteredSalesData();
    const totalRevenue = filteredSales.reduce((sum, sale) => sum + sale.total, 0);
    const averageSale = filteredSales.length > 0 ? totalRevenue / filteredSales.length : 0;
    const totalTransactions = filteredSales.length;

    return { totalRevenue, averageSale, totalTransactions };
  };

  const getInventorySummary = () => {
    const filteredInventory = getFilteredInventoryData();
    const totalItems = filteredInventory.length;
    const lowStockItems = filteredInventory.filter(item => 
      typeof item.quantity === 'number' && typeof item.reorderLevel === 'number' && 
      item.quantity <= item.reorderLevel
    ).length;
    const expiringItems = filteredInventory.filter(item =>
      item.hasExpiry && item.expiry && 
      new Date(item.expiry) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    ).length;

    return { totalItems, lowStockItems, expiringItems };
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Reports & Analytics</h1>
          <p className="text-muted-foreground">
            Comprehensive reporting and business intelligence dashboard
          </p>
        </div>

        {/* Date Range Filter */}
        <Card>
          <CardHeader>
            <CardTitle>Report Filters</CardTitle>
            <CardDescription>Select date range and filters for your reports</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4 items-end">
              <div className="space-y-2">
                <Label>Date Range</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-[300px] justify-start text-left">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateRange?.from ? (
                        dateRange.to ? (
                          <>
                            {format(dateRange.from, "LLL dd, y")} -{" "}
                            {format(dateRange.to, "LLL dd, y")}
                          </>
                        ) : (
                          format(dateRange.from, "LLL dd, y")
                        )
                      ) : (
                        <span>Pick a date range</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      initialFocus
                      mode="range"
                      defaultMonth={dateRange?.from}
                      selected={dateRange}
                      onSelect={setDateRange}
                      numberOfMonths={2}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              
              <Button 
                onClick={() => setDateRange({
                  from: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
                  to: new Date()
                })}
                variant="outline"
              >
                This Month
              </Button>
              
              <Button 
                onClick={() => setDateRange({
                  from: new Date(new Date().getFullYear(), 0, 1),
                  to: new Date()
                })}
                variant="outline"
              >
                This Year
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Reports Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="sales" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Sales Report
            </TabsTrigger>
            <TabsTrigger value="inventory" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Inventory Report
            </TabsTrigger>
            <TabsTrigger value="ledger" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Customer Ledger
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Analytics
            </TabsTrigger>
          </TabsList>

          {/* Sales Report Tab */}
          <TabsContent value="sales" className="space-y-6">
            {(() => {
              const summary = getSalesSummary();
              const filteredSales = getFilteredSalesData();
              
              return (
                <>
                  {/* Sales Summary Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(summary.totalRevenue)}</div>
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Average Sale</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(summary.averageSale)}</div>
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Total Transactions</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{summary.totalTransactions}</div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Sales Filters */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Sales Filters</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex gap-4">
                        <div className="space-y-2">
                          <Label>Status</Label>
                          <Select value={salesFilter.status} onValueChange={(value) => 
                            setSalesFilter({ ...salesFilter, status: value })
                          }>
                            <SelectTrigger className="w-[180px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Status</SelectItem>
                              <SelectItem value="PAID">Paid</SelectItem>
                              <SelectItem value="PARTIAL">Partial</SelectItem>
                              <SelectItem value="OVERPAID">Overpaid</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        
                        <div className="space-y-2">
                          <Label>Customer</Label>
                          <Select value={salesFilter.customer} onValueChange={(value) => 
                            setSalesFilter({ ...salesFilter, customer: value })
                          }>
                            <SelectTrigger className="w-[180px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Customers</SelectItem>
                              {Array.from(new Set(salesData.map(s => s.customer).filter(Boolean))).map(customer => (
                                <SelectItem key={customer} value={customer}>{customer}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        
                        <div className="flex items-end">
                          <Button 
                            onClick={() => exportToCSV(filteredSales, 'sales-report.csv')}
                            variant="outline"
                            className="flex items-center gap-2"
                          >
                            <Download className="h-4 w-4" />
                            Export CSV
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Sales Table */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Sales Transactions ({filteredSales.length})</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {filteredSales.length > 0 ? (
                        <div className="rounded-md border">
                          <table className="w-full">
                            <thead className="border-b bg-muted/50">
                              <tr>
                                <th className="p-3 text-left">Invoice #</th>
                                <th className="p-3 text-left">Date</th>
                                <th className="p-3 text-left">Customer</th>
                                <th className="p-3 text-left">Items</th>
                                <th className="p-3 text-left">Total</th>
                                <th className="p-3 text-left">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredSales.map((sale) => (
                                <tr key={sale.id} className="border-b hover:bg-muted/30">
                                  <td className="p-3 font-medium">{sale.invoiceNumber}</td>
                                  <td className="p-3">{new Date(sale.timestamp).toLocaleDateString()}</td>
                                  <td className="p-3">{sale.customer || 'N/A'}</td>
                                  <td className="p-3">{sale.cart.length} items</td>
                                  <td className="p-3 font-semibold">{formatCurrency(sale.total)}</td>
                                  <td className="p-3">
                                    <Badge variant={sale.status === 'PAID' ? 'default' : 'secondary'}>
                                      {sale.status}
                                    </Badge>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <p>No sales data found for the selected filters.</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </>
              );
            })()}
          </TabsContent>

          {/* Inventory Report Tab */}
          <TabsContent value="inventory" className="space-y-6">
            {(() => {
              const summary = getInventorySummary();
              const filteredInventory = getFilteredInventoryData();
              
              return (
                <>
                  {/* Inventory Summary Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Total Items</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{summary.totalItems}</div>
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Low Stock Items</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-red-600">{summary.lowStockItems}</div>
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Expiring Items</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-orange-600">{summary.expiringItems}</div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Inventory Table */}
                  <Card>
                    <CardHeader>
                      <div className="flex justify-between items-center">
                        <div>
                          <CardTitle>Inventory Items ({filteredInventory.length})</CardTitle>
                          <CardDescription>Current inventory status and details</CardDescription>
                        </div>
                        <Button 
                          onClick={() => exportToCSV(filteredInventory, 'inventory-report.csv')}
                          variant="outline"
                          className="flex items-center gap-2"
                        >
                          <Download className="h-4 w-4" />
                          Export CSV
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {filteredInventory.length > 0 ? (
                        <div className="rounded-md border">
                          <table className="w-full">
                            <thead className="border-b bg-muted/50">
                              <tr>
                                <th className="p-3 text-left">Name</th>
                                <th className="p-3 text-left">Batch</th>
                                <th className="p-3 text-left">Category</th>
                                <th className="p-3 text-left">Quantity</th>
                                <th className="p-3 text-left">Reorder Level</th>
                                <th className="p-3 text-left">Price</th>
                                <th className="p-3 text-left">Expiry</th>
                                <th className="p-3 text-left">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredInventory.map((item, idx) => {
                                const isLowStock = typeof item.quantity === 'number' && 
                                  typeof item.reorderLevel === 'number' && 
                                  item.quantity <= item.reorderLevel;
                                const isExpiring = item.hasExpiry && item.expiry && 
                                  new Date(item.expiry) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                                
                                return (
                                  <tr key={`${item.name}-${item.batch}-${idx}`} className="border-b hover:bg-muted/30">
                                    <td className="p-3 font-medium">{item.name}</td>
                                    <td className="p-3">{item.batch}</td>
                                    <td className="p-3">{item.category || 'N/A'}</td>
                                    <td className="p-3">{item.quantity}</td>
                                    <td className="p-3">{item.reorderLevel}</td>
                                    <td className="p-3">{typeof item.price === 'number' ? formatCurrency(item.price) : 'N/A'}</td>
                                    <td className="p-3">
                                      {item.hasExpiry && item.expiry ? (
                                        new Date(item.expiry).toLocaleDateString()
                                      ) : (
                                        <span className="text-muted-foreground">No Expiry</span>
                                      )}
                                    </td>
                                    <td className="p-3">
                                      <div className="space-y-1">
                                        {isLowStock && <Badge variant="destructive">Low Stock</Badge>}
                                        {isExpiring && <Badge variant="outline">Expiring Soon</Badge>}
                                        {!isLowStock && !isExpiring && <Badge variant="default">Normal</Badge>}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <p>No inventory data found for the selected filters.</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </>
              );
            })()}
          </TabsContent>

          {/* Customer Ledger Tab */}
          <TabsContent value="ledger" className="space-y-6">
            {(() => {
              const filteredLedger = getFilteredLedgerData();
              const totalBalance = filteredLedger.reduce((sum, entry) => 
                sum + (entry.type === 'credit' ? entry.amount : -entry.amount), 0);
              
              return (
                <>
                  {/* Ledger Summary */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Customer Ledger Summary</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        Net Balance: {formatCurrency(totalBalance)}
                      </div>
                      <p className="text-muted-foreground">
                        {filteredLedger.length} transactions found
                      </p>
                    </CardContent>
                  </Card>

                  {/* Ledger Table */}
                  <Card>
                    <CardHeader>
                      <div className="flex justify-between items-center">
                        <div>
                          <CardTitle>Customer Transactions</CardTitle>
                          <CardDescription>Detailed customer payment and purchase history</CardDescription>
                        </div>
                        <Button 
                          onClick={() => exportToCSV(filteredLedger, 'customer-ledger.csv')}
                          variant="outline"
                          className="flex items-center gap-2"
                        >
                          <Download className="h-4 w-4" />
                          Export CSV
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {filteredLedger.length > 0 ? (
                        <div className="rounded-md border">
                          <table className="w-full">
                            <thead className="border-b bg-muted/50">
                              <tr>
                                <th className="p-3 text-left">Customer</th>
                                <th className="p-3 text-left">Date</th>
                                <th className="p-3 text-left">Type</th>
                                <th className="p-3 text-left">Amount</th>
                                <th className="p-3 text-left">Note</th>
                                <th className="p-3 text-left">Balance</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredLedger.map((entry) => (
                                <tr key={entry.id} className="border-b hover:bg-muted/30">
                                  <td className="p-3 font-medium">{entry.customer}</td>
                                  <td className="p-3">{new Date(entry.date).toLocaleDateString()}</td>
                                  <td className="p-3">
                                    <Badge variant={entry.type === 'credit' ? 'default' : 'secondary'}>
                                      {entry.type === 'credit' ? 'Payment' : 'Purchase'}
                                    </Badge>
                                  </td>
                                  <td className="p-3 font-semibold">
                                    <span className={entry.type === 'credit' ? 'text-green-600' : 'text-red-600'}>
                                      {entry.type === 'credit' ? '+' : '-'}{formatCurrency(entry.amount)}
                                    </span>
                                  </td>
                                  <td className="p-3">{entry.note}</td>
                                  <td className="p-3 font-semibold">
                                    <span className={entry.balance >= 0 ? 'text-green-600' : 'text-red-600'}>
                                      {formatCurrency(Math.abs(entry.balance))}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <p>No ledger entries found for the selected filters.</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </>
              );
            })()}
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Sales Trend</CardTitle>
                  <CardDescription>Daily sales over time</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="chart-container">
                    <Line 
                      data={getSalesChartData()} 
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                          legend: { position: 'top' as const },
                          title: { display: false }
                        }
                      }} 
                    />
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Inventory Distribution</CardTitle>
                  <CardDescription>Items by category</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="chart-container">
                    <Bar 
                      data={getInventoryChartData()} 
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                          legend: { position: 'top' as const },
                          title: { display: false }
                        }
                      }} 
                    />
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

export default ReportsShadcn;