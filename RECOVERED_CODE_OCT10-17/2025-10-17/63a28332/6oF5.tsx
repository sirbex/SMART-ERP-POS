import { 
  DollarSign, 
  TrendingUp, 
  Users, 
  Package,
  ShoppingCart,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { MainLayout } from '../components/layout/MainLayout';

interface StatCardProps {
  title: string;
  value: string;
  change: string;
  isPositive: boolean;
  icon: React.ReactNode;
}

const StatCard = ({ title, value, change, isPositive, icon }: StatCardProps) => (
  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-slate-600">{title}</p>
        <p className="text-3xl font-bold text-slate-800 mt-2">{value}</p>
        <div className={`flex items-center space-x-1 mt-2 text-sm ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
          {isPositive ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
          <span className="font-medium">{change}</span>
          <span className="text-slate-500">vs last month</span>
        </div>
      </div>
      <div className="w-14 h-14 bg-gradient-to-br from-teal-500 to-teal-600 rounded-xl flex items-center justify-center text-white shadow-lg">
        {icon}
      </div>
    </div>
  </div>
);

export const DashboardPage = () => {
  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Dashboard</h1>
          <p className="text-slate-600 mt-1">Welcome back! Here's what's happening today.</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          <StatCard
            title="Today's Sales"
            value="$12,847"
            change="+12.5%"
            isPositive={true}
            icon={<DollarSign className="w-7 h-7" />}
          />
          <StatCard
            title="Total Revenue"
            value="$45,231"
            change="+8.2%"
            isPositive={true}
            icon={<TrendingUp className="w-7 h-7" />}
          />
          <StatCard
            title="Customers"
            value="1,234"
            change="+5.1%"
            isPositive={true}
            icon={<Users className="w-7 h-7" />}
          />
          <StatCard
            title="Products Sold"
            value="482"
            change="-2.4%"
            isPositive={false}
            icon={<Package className="w-7 h-7" />}
          />
        </div>

        {/* Charts and Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Sales */}
          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-800">Recent Transactions</h2>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((_, i) => (
                  <div key={i} className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
                        <ShoppingCart className="w-5 h-5 text-teal-600" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-800">Transaction #{1000 + i}</p>
                        <p className="text-sm text-slate-500">Walk-in Customer</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-slate-800">${(Math.random() * 500 + 50).toFixed(2)}</p>
                      <p className="text-sm text-slate-500">{i} mins ago</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Top Products */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-800">Top Products</h2>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {['Product A', 'Product B', 'Product C', 'Product D', 'Product E'].map((product, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-slate-700">{product}</p>
                      <p className="text-sm text-slate-500">{Math.floor(Math.random() * 100 + 50)} sold</p>
                    </div>
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center text-white font-bold">
                      #{i + 1}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <button className="bg-white border-2 border-teal-500 text-teal-600 hover:bg-teal-50 rounded-xl p-6 text-center transition-colors">
            <ShoppingCart className="w-8 h-8 mx-auto mb-2" />
            <p className="font-semibold">New Sale</p>
          </button>
          <button className="bg-white border-2 border-blue-500 text-blue-600 hover:bg-blue-50 rounded-xl p-6 text-center transition-colors">
            <Users className="w-8 h-8 mx-auto mb-2" />
            <p className="font-semibold">Add Customer</p>
          </button>
          <button className="bg-white border-2 border-purple-500 text-purple-600 hover:bg-purple-50 rounded-xl p-6 text-center transition-colors">
            <Package className="w-8 h-8 mx-auto mb-2" />
            <p className="font-semibold">Add Product</p>
          </button>
          <button className="bg-white border-2 border-orange-500 text-orange-600 hover:bg-orange-50 rounded-xl p-6 text-center transition-colors">
            <TrendingUp className="w-8 h-8 mx-auto mb-2" />
            <p className="font-semibold">View Reports</p>
          </button>
        </div>
      </div>
    </MainLayout>
  );
};
