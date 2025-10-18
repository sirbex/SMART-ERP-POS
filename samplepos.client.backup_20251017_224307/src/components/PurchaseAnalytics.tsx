import React, { useState, useEffect } from 'react';
import SettingsService from '../services/SettingsService';
import PurchaseManagementService, { type PurchaseOrderSummary, type SupplierPerformance } from '../services/PurchaseManagementService';
import InventoryBatchService from '../services/InventoryBatchService';
import type { PurchaseOrder, PurchaseReceiving } from '../models/BatchInventory';

// Import Shadcn UI components
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
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

interface PurchaseAnalytics {
  totalPurchaseValue: number;
  totalOrders: number;
  averageOrderValue: number;
  topSuppliers: Array<{
    supplierId: string;
    supplierName: string;
    totalValue: number;
    orderCount: number;
  }>;
  monthlyTrends: Array<{
    month: string;
    orderCount: number;
    totalValue: number;
  }>;
  costAnalysis: Array<{
    productId: string;
    productName: string;
    totalQuantity: number;
    totalCost: number;
    averageCost: number;
    lastPurchaseDate: string;
  }>;
}

const PurchaseAnalytics: React.FC = () => {
  const [analytics, setAnalytics] = useState<PurchaseAnalytics | null>(null);
  const [summary, setSummary] = useState<PurchaseOrderSummary | null>(null);
  const [supplierPerformance, setSupplierPerformance] = useState<SupplierPerformance[]>([]);

  
  // Filters
  const [dateFilter, setDateFilter] = useState({
    startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Last 90 days
    endDate: new Date().toISOString().split('T')[0]
  });
  const [selectedSupplier, setSelectedSupplier] = useState<string>('all');

  const purchaseService = PurchaseManagementService.getInstance();
  const inventoryService = InventoryBatchService.getInstance();

  useEffect(() => {
    loadData();
  }, [dateFilter, selectedSupplier]);

  const loadData = () => {
    // Load basic data
    setSummary(purchaseService.getPurchaseOrderSummary());
    setSupplierPerformance(purchaseService.getSupplierPerformance());
    
    // Load filtered data
    let orders = purchaseService.getPurchaseOrders();
    let receivings = inventoryService.getPurchases();

    // Apply date filters
    const startDate = new Date(dateFilter.startDate);
    const endDate = new Date(dateFilter.endDate);
    
    orders = orders.filter(order => {
      const orderDate = new Date(order.orderDate);
      return orderDate >= startDate && orderDate <= endDate;
    });

    receivings = receivings.filter(receiving => {
      const receiveDate = new Date(receiving.receivedDate);
      return receiveDate >= startDate && receiveDate <= endDate;
    });

    // Apply supplier filter
    if (selectedSupplier !== 'all') {
      orders = orders.filter(order => order.supplierId === selectedSupplier);
      receivings = receivings.filter(receiving => receiving.supplierId === selectedSupplier);
    }


    
    // Generate analytics
    generateAnalytics(orders, receivings);
  };

  const generateAnalytics = (orders: PurchaseOrder[], receivings: PurchaseReceiving[]) => {
    // Basic totals
    const totalPurchaseValue = receivings.reduce((sum, r) => sum + r.totalValue, 0);
    const totalOrders = orders.length;
    const averageOrderValue = totalOrders > 0 ? totalPurchaseValue / totalOrders : 0;

    // Top suppliers by value
    const supplierTotals = new Map<string, { name: string; totalValue: number; orderCount: number }>();
    
    receivings.forEach(receiving => {
      const supplierId = receiving.supplierId || receiving.supplier;
      const existing = supplierTotals.get(supplierId) || { name: receiving.supplier, totalValue: 0, orderCount: 0 };
      existing.totalValue += receiving.totalValue;
      existing.orderCount += 1;
      supplierTotals.set(supplierId, existing);
    });

    const topSuppliers = Array.from(supplierTotals.entries())
      .map(([supplierId, data]) => ({
        supplierId,
        supplierName: data.name,
        totalValue: data.totalValue,
        orderCount: data.orderCount
      }))
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, 5);

    // Monthly trends
    const monthlyData = new Map<string, { orderCount: number; totalValue: number }>();
    
    orders.forEach(order => {
      const month = new Date(order.orderDate).toISOString().slice(0, 7); // YYYY-MM
      const existing = monthlyData.get(month) || { orderCount: 0, totalValue: 0 };
      existing.orderCount += 1;
      monthlyData.set(month, existing);
    });

    receivings.forEach(receiving => {
      const month = new Date(receiving.receivedDate).toISOString().slice(0, 7);
      const existing = monthlyData.get(month) || { orderCount: 0, totalValue: 0 };
      existing.totalValue += receiving.totalValue;
      monthlyData.set(month, existing);
    });

    const monthlyTrends = Array.from(monthlyData.entries())
      .map(([month, data]) => ({
        month,
        orderCount: data.orderCount,
        totalValue: data.totalValue
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // Cost analysis by product
    const productCosts = new Map<string, {
      name: string;
      totalQuantity: number;
      totalCost: number;
      lastPurchaseDate: string;
    }>();

    receivings.forEach(receiving => {
      receiving.items.forEach(item => {
        const existing = productCosts.get(item.productId) || {
          name: item.productName,
          totalQuantity: 0,
          totalCost: 0,
          lastPurchaseDate: receiving.receivedDate
        };
        
        existing.totalQuantity += item.quantityReceived;
        existing.totalCost += item.totalCost;
        
        if (new Date(receiving.receivedDate) > new Date(existing.lastPurchaseDate)) {
          existing.lastPurchaseDate = receiving.receivedDate;
        }
        
        productCosts.set(item.productId, existing);
      });
    });

    const costAnalysis = Array.from(productCosts.entries())
      .map(([productId, data]) => ({
        productId,
        productName: data.name,
        totalQuantity: data.totalQuantity,
        totalCost: data.totalCost,
        averageCost: data.totalQuantity > 0 ? data.totalCost / data.totalQuantity : 0,
        lastPurchaseDate: data.lastPurchaseDate
      }))
      .sort((a, b) => b.totalCost - a.totalCost);

    setAnalytics({
      totalPurchaseValue,
      totalOrders,
      averageOrderValue,
      topSuppliers,
      monthlyTrends,
      costAnalysis
    });
  };

  const exportToCSV = () => {
    if (!analytics) return;

    const csvData = [
      ['Purchase Analytics Report'],
      ['Generated:', new Date().toLocaleString()],
      ['Period:', `${dateFilter.startDate} to ${dateFilter.endDate}`],
      [''],
      ['Summary'],
      ['Total Purchase Value', SettingsService.getInstance().formatCurrency(analytics.totalPurchaseValue)],
      ['Total Orders', analytics.totalOrders.toString()],
      ['Average Order Value', SettingsService.getInstance().formatCurrency(analytics.averageOrderValue)],
      [''],
      ['Top Suppliers'],
      ['Supplier Name', 'Total Value', 'Order Count'],
      ...analytics.topSuppliers.map(s => [s.supplierName, SettingsService.getInstance().formatCurrency(s.totalValue), s.orderCount.toString()]),
      [''],
      ['Cost Analysis'],
      ['Product Name', 'Total Quantity', 'Total Cost', 'Average Cost', 'Last Purchase'],
      ...analytics.costAnalysis.map(p => [
        p.productName,
        p.totalQuantity.toString(),
        SettingsService.getInstance().formatCurrency(p.totalCost),
        SettingsService.getInstance().formatCurrency(p.averageCost),
        new Date(p.lastPurchaseDate).toLocaleDateString()
      ])
    ];

    const csv = csvData.map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `purchase-analytics-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const getReorderSuggestions = () => {
    return purchaseService.getRestockSuggestions();
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Purchase Analytics</h1>
          <p className="text-muted-foreground">Analyze purchase costs, trends, and supplier performance</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={exportToCSV} variant="outline">
            Export Report
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 items-end">
            <div>
              <Label>Start Date</Label>
              <Input
                type="date"
                value={dateFilter.startDate}
                onChange={(e) => setDateFilter({ ...dateFilter, startDate: e.target.value })}
              />
            </div>
            <div>
              <Label>End Date</Label>
              <Input
                type="date"
                value={dateFilter.endDate}
                onChange={(e) => setDateFilter({ ...dateFilter, endDate: e.target.value })}
              />
            </div>
            <div>
              <Label>Supplier</Label>
              <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Suppliers</SelectItem>
                  {supplierPerformance.map(supplier => (
                    <SelectItem key={supplier.supplierId} value={supplier.supplierId}>
                      {supplier.supplierName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={loadData}>Apply Filters</Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      {summary && analytics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Purchase Value</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{SettingsService.getInstance().formatCurrency(analytics.totalPurchaseValue)}</div>
              <p className="text-xs text-muted-foreground">Filtered period</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics.totalOrders}</div>
              <p className="text-xs text-muted-foreground">Purchase orders</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Average Order Value</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{SettingsService.getInstance().formatCurrency(analytics.averageOrderValue)}</div>
              <p className="text-xs text-muted-foreground">Per order</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Pending Orders</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.pendingOrders}</div>
              <div className="text-xs text-muted-foreground">
                Value: {SettingsService.getInstance().formatCurrency(summary.pendingValue)}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Top Suppliers */}
      {analytics && analytics.topSuppliers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Top Suppliers by Purchase Value</CardTitle>
            <CardDescription>Suppliers with highest purchase volumes in selected period</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Total Value</TableHead>
                  <TableHead>Order Count</TableHead>
                  <TableHead>Average Order</TableHead>
                  <TableHead>% of Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analytics.topSuppliers.map(supplier => (
                  <TableRow key={supplier.supplierId}>
                    <TableCell className="font-medium">{supplier.supplierName}</TableCell>
                    <TableCell>{SettingsService.getInstance().formatCurrency(supplier.totalValue)}</TableCell>
                    <TableCell>{supplier.orderCount}</TableCell>
                    <TableCell>
                      {SettingsService.getInstance().formatCurrency(supplier.orderCount > 0 ? supplier.totalValue / supplier.orderCount : 0)}
                    </TableCell>
                    <TableCell>
                      {analytics.totalPurchaseValue > 0 ? 
                        ((supplier.totalValue / analytics.totalPurchaseValue) * 100).toFixed(1) : 0}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Monthly Trends */}
      {analytics && analytics.monthlyTrends.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Monthly Purchase Trends</CardTitle>
            <CardDescription>Purchase orders and values by month</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead>Orders Placed</TableHead>
                  <TableHead>Value Received</TableHead>
                  <TableHead>Avg Order Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analytics.monthlyTrends.map(trend => (
                  <TableRow key={trend.month}>
                    <TableCell>{new Date(trend.month + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}</TableCell>
                    <TableCell>{trend.orderCount}</TableCell>
                    <TableCell>{SettingsService.getInstance().formatCurrency(trend.totalValue)}</TableCell>
                    <TableCell>
                      {SettingsService.getInstance().formatCurrency(trend.orderCount > 0 ? trend.totalValue / trend.orderCount : 0)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Cost Analysis */}
      {analytics && analytics.costAnalysis.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Product Cost Analysis</CardTitle>
            <CardDescription>Purchase costs and quantities by product</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Total Quantity</TableHead>
                  <TableHead>Total Cost</TableHead>
                  <TableHead>Average Cost</TableHead>
                  <TableHead>Last Purchase</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analytics.costAnalysis.slice(0, 10).map(product => (
                  <TableRow key={product.productId}>
                    <TableCell className="font-medium">{product.productName}</TableCell>
                    <TableCell>{product.totalQuantity}</TableCell>
                    <TableCell>{SettingsService.getInstance().formatCurrency(product.totalCost)}</TableCell>
                    <TableCell>{SettingsService.getInstance().formatCurrency(product.averageCost)}</TableCell>
                    <TableCell>{new Date(product.lastPurchaseDate).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Restock Suggestions */}
      <Card>
        <CardHeader>
          <CardTitle>Restock Suggestions</CardTitle>
          <CardDescription>Products that may need restocking based on current inventory levels</CardDescription>
        </CardHeader>
        <CardContent>
          {(() => {
            const suggestions = getReorderSuggestions();
            
            if (suggestions.length === 0) {
              return (
                <div className="text-center py-8 text-muted-foreground">
                  No restock suggestions at this time. All products appear to be well-stocked.
                </div>
              );
            }

            return (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Current Stock</TableHead>
                    <TableHead>Reorder Level</TableHead>
                    <TableHead>Suggested Quantity</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suggestions.map(suggestion => (
                    <TableRow key={suggestion.productId}>
                      <TableCell className="font-medium">{suggestion.productName}</TableCell>
                      <TableCell>{suggestion.currentStock}</TableCell>
                      <TableCell>{suggestion.reorderLevel}</TableCell>
                      <TableCell>{suggestion.suggestedOrderQuantity}</TableCell>
                      <TableCell>
                        <Badge variant={suggestion.currentStock <= suggestion.reorderLevel ? 'destructive' : 'outline'}>
                          {suggestion.currentStock <= suggestion.reorderLevel ? 'Low Stock' : 'Monitor'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            );
          })()}
        </CardContent>
      </Card>
    </div>
  );
};

export default PurchaseAnalytics;
