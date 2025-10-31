import { useQuery } from '@tanstack/react-query';
import api from '@/config/api.config';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  Legend,
} from 'recharts';
import { motion } from 'framer-motion';
import {
  Loader2,
  DollarSign,
  ShoppingCart,
  TrendingUp,
  Package,
  Users,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface DashboardData {
  summary: {
    salesToday: number;
    salesThisWeek: number;
    salesThisMonth: number;
    totalRevenue: number;
    ordersToday: number;
    ordersThisWeek: number;
    ordersThisMonth: number;
    lowStockItems: number;
    totalProducts: number;
    totalCustomers: number;
  };
  cashflow: Array<{
    date: string;
    sales: number;
    revenue: number;
  }>;
  topProducts: Array<{
    name: string;
    quantity: number;
    revenue: number;
  }>;
  recentTransactions: Array<{
    id: string;
    time: string;
    customer: string;
    total: number;
    status: string;
  }>;
}

// Fetch dashboard data from your API
async function fetchDashboardData(): Promise<DashboardData> {
  const [salesRes, productsRes, customersRes] = await Promise.allSettled([
    api.get('/sales'),
    api.get('/products'),
    api.get('/customers'),
  ]);

  // Extract data from responses
  const salesData = salesRes.status === 'fulfilled' ? salesRes.value.data?.data || [] : [];
  const productsData = productsRes.status === 'fulfilled' ? productsRes.value.data?.data || [] : [];
  const customersData =
    customersRes.status === 'fulfilled' ? customersRes.value.data?.data || [] : [];

  // Calculate date ranges
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Filter sales by date
  const todaySales = salesData.filter((s: any) => new Date(s.saleDate || s.createdAt) >= todayStart);
  const weekSales = salesData.filter((s: any) => new Date(s.saleDate || s.createdAt) >= weekStart);
  const monthSales = salesData.filter((s: any) => new Date(s.saleDate || s.createdAt) >= monthStart);

  // Calculate revenue
  const calculateRevenue = (sales: any[]) =>
    sales.reduce((sum, s) => sum + (parseFloat(s.totalAmount) || 0), 0);

  // Generate last 14 days cashflow
  const cashflow = Array.from({ length: 14 }).map((_, i) => {
    const d = new Date(now.getTime() - (13 - i) * 24 * 60 * 60 * 1000);
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const daySales = salesData.filter((s: any) => {
      const saleDate = new Date(s.saleDate || s.createdAt);
      return saleDate >= dayStart && saleDate < dayEnd;
    });

    return {
      date: d.toISOString().slice(5, 10), // MM-DD format
      sales: daySales.length,
      revenue: calculateRevenue(daySales),
    };
  });

  // Top 5 products by quantity sold
  const productSales = new Map<string, { name: string; quantity: number; revenue: number }>();
  salesData.forEach((sale: any) => {
    (sale.items || []).forEach((item: any) => {
      const key = item.productId?.toString() || item.name;
      const existing = productSales.get(key) || { name: item.name || 'Unknown', quantity: 0, revenue: 0 };
      existing.quantity += item.quantity || 0;
      existing.revenue += parseFloat(item.price || 0) * (item.quantity || 0);
      productSales.set(key, existing);
    });
  });

  const topProducts = Array.from(productSales.values())
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5);

  // Recent 6 transactions
  const recentTransactions = salesData
    .slice(0, 6)
    .map((sale: any) => ({
      id: sale.invoiceNumber || `SO-${sale.id}`,
      time: new Date(sale.saleDate || sale.createdAt).toLocaleString(),
      customer: sale.customer?.name || sale.customerName || 'Walk-in',
      total: parseFloat(sale.totalAmount || 0),
      status: sale.status || 'completed',
    }));

  return {
    summary: {
      salesToday: todaySales.length,
      salesThisWeek: weekSales.length,
      salesThisMonth: monthSales.length,
      totalRevenue: calculateRevenue(monthSales),
      ordersToday: todaySales.length,
      ordersThisWeek: weekSales.length,
      ordersThisMonth: monthSales.length,
      lowStockItems: productsData.filter((p: any) => (p.currentStock || 0) < (p.reorderLevel || 0)).length,
      totalProducts: productsData.length,
      totalCustomers: customersData.length,
    },
    cashflow,
    topProducts,
    recentTransactions,
  };
}

// Metric Card Component
function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  accent = 'bg-blue-500',
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: any;
  accent?: string;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <div className={`p-2 rounded-lg ${accent} text-white`}>
            <Icon className="h-4 w-4" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{value}</div>
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// Main Dashboard Component
export default function DashboardEnhanced() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['dashboard', 'enhanced'],
    queryFn: fetchDashboardData,
    refetchInterval: 30000, // Auto-refresh every 30 seconds
    staleTime: 15000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>
          {error instanceof Error ? error.message : 'Failed to fetch dashboard data'}
          <Button variant="outline" size="sm" onClick={() => refetch()} className="ml-4">
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const { summary, cashflow, topProducts, recentTransactions } = data;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Business Dashboard</h1>
          <p className="text-sm text-muted-foreground">Real-time overview of sales, cashflow and inventory</p>
        </div>
        <Button onClick={() => refetch()} variant="outline" disabled={isLoading}>
          {isLoading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          Refresh
        </Button>
      </div>

      {/* Summary Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Sales Today"
          value={summary.salesToday.toString()}
          subtitle={`${summary.salesThisMonth} this month`}
          icon={ShoppingCart}
          accent="bg-blue-500"
        />
        <MetricCard
          title="Revenue (Month)"
          value={`UGX ${(summary.totalRevenue / 1000).toFixed(0)}K`}
          subtitle={`${summary.ordersThisMonth} orders`}
          icon={DollarSign}
          accent="bg-green-500"
        />
        <MetricCard
          title="Products"
          value={summary.totalProducts.toString()}
          subtitle={`${summary.lowStockItems} low stock`}
          icon={Package}
          accent="bg-orange-500"
        />
        <MetricCard
          title="Customers"
          value={summary.totalCustomers.toString()}
          subtitle="Active customers"
          icon={Users}
          accent="bg-purple-500"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Cashflow Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Sales Trend</CardTitle>
              <span className="text-sm text-muted-foreground">Last 14 days</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={cashflow} margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" stroke="#6b7280" />
                  <YAxis stroke="#6b7280" />
                  <Tooltip
                    formatter={(value: any) => [`UGX ${value.toLocaleString()}`, 'Revenue']}
                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name="Revenue" />
                  <Line type="monotone" dataKey="sales" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} name="Orders" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Top Products Table */}
        <Card>
          <CardHeader>
            <CardTitle>Top Products</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topProducts.map((product, idx) => (
                <div key={idx} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex-1">
                    <div className="font-medium text-sm">{product.name}</div>
                    <div className="text-xs text-muted-foreground">Qty: {product.quantity}</div>
                  </div>
                  <div className="text-sm font-semibold">UGX {(product.revenue / 1000).toFixed(0)}K</div>
                </div>
              ))}
              {topProducts.length === 0 && (
                <div className="text-center text-muted-foreground py-4">No sales data yet</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row: Recent Transactions & Product Bar Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Transactions */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentTransactions.map((txn) => (
                <div key={txn.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <div className="font-medium">{txn.id}</div>
                    <div className="text-sm text-muted-foreground">
                      {txn.customer} • {txn.time}
                    </div>
                  </div>
                  <div className="font-semibold">UGX {txn.total.toLocaleString()}</div>
                </div>
              ))}
              {recentTransactions.length === 0 && (
                <div className="text-center text-muted-foreground py-4">No recent transactions</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Product Sales Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Sales by Product</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topProducts} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#6b7280" />
                  <YAxis stroke="#6b7280" />
                  <Tooltip
                    formatter={(value: any) => [`UGX ${value.toLocaleString()}`, 'Revenue']}
                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                  />
                  <Bar dataKey="revenue" fill="#10b981" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-3">
        <Button className="bg-blue-600 hover:bg-blue-700">
          <ShoppingCart className="w-4 h-4 mr-2" />
          New Sale
        </Button>
        <Button variant="outline">
          <Package className="w-4 h-4 mr-2" />
          Inventory
        </Button>
        <Button variant="outline">
          <TrendingUp className="w-4 h-4 mr-2" />
          Reports
        </Button>
      </div>
    </div>
  );
}
