import { useEffect, useState } from 'react';
import api from '@/config/api.config';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Users, Package, ShoppingCart, DollarSign, TrendingUp, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DashboardStats {
  users: { total: number; active: number };
  products: { total: number; lowStock: number };
  customers: { total: number; withCredit: number };
  sales: { today: number; thisWeek: number; thisMonth: number };
}

export default function DashboardNew() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Fetch data from new backend endpoints
      const [usersRes, productsRes, customersRes, salesRes] = await Promise.allSettled([
        api.get('/users'),
        api.get('/products'),
        api.get('/customers'),
        api.get('/sales')
      ]);

      console.log('Dashboard API responses:', {
        users: usersRes,
        products: productsRes,
        customers: customersRes,
        sales: salesRes
      });

      // Process results
      const usersData = usersRes.status === 'fulfilled' ? usersRes.value.data : null;
      const productsData = productsRes.status === 'fulfilled' ? productsRes.value.data : null;
      const customersData = customersRes.status === 'fulfilled' ? customersRes.value.data : null;
      const salesData = salesRes.status === 'fulfilled' ? salesRes.value.data : null;

      setStats({
        users: {
          total: usersData?.data?.length || usersData?.length || 0,
          active: usersData?.data?.filter((u: any) => u.isActive).length || 0
        },
        products: {
          total: productsData?.data?.length || productsData?.length || 0,
          lowStock: productsData?.data?.filter((p: any) => p.currentStock < p.reorderLevel).length || 0
        },
        customers: {
          total: customersData?.data?.length || customersData?.length || 0,
          withCredit: customersData?.data?.filter((c: any) => c.outstandingBalance > 0).length || 0
        },
        sales: {
          today: salesData?.data?.length || salesData?.length || 0,
          thisWeek: salesData?.data?.length || salesData?.length || 0,
          thisMonth: salesData?.data?.length || salesData?.length || 0
        }
      });
    } catch (err: any) {
      console.error('Dashboard fetch error:', err);
      setError(err.message || 'Failed to fetch dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>
          {error}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={fetchDashboardData}
            className="ml-4"
          >
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Welcome to Sample POS - Overview of your business</p>
        </div>
        <Button onClick={fetchDashboardData} variant="outline">
          <TrendingUp className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Users Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.users.total || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.users.active || 0} active users
            </p>
          </CardContent>
        </Card>

        {/* Products Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Products</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.products.total || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.products.lowStock || 0} low stock items
            </p>
          </CardContent>
        </Card>

        {/* Customers Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Customers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.customers.total || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.customers.withCredit || 0} with outstanding credit
            </p>
          </CardContent>
        </Card>

        {/* Sales Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sales</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.sales.today || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.sales.thisMonth || 0} this month
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common tasks and shortcuts</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Button variant="outline" className="h-20 flex flex-col items-center justify-center">
            <ShoppingCart className="w-6 h-6 mb-2" />
            <span>New Sale</span>
          </Button>
          <Button variant="outline" className="h-20 flex flex-col items-center justify-center">
            <Package className="w-6 h-6 mb-2" />
            <span>Add Product</span>
          </Button>
          <Button variant="outline" className="h-20 flex flex-col items-center justify-center">
            <Users className="w-6 h-6 mb-2" />
            <span>New Customer</span>
          </Button>
          <Button variant="outline" className="h-20 flex flex-col items-center justify-center">
            <DollarSign className="w-6 h-6 mb-2" />
            <span>View Reports</span>
          </Button>
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Latest transactions and updates</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground text-center py-8">
            Activity feed coming soon...
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
