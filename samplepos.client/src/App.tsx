import { useState, lazy, Suspense } from 'react';
import './App.css';
import ErrorBoundary from './components/ErrorBoundary';
import SidebarNav from './components/layout/SidebarNav';

// Lazy load route components for code splitting
const Dashboard = lazy(() => import('./components/DashboardNew'));
const POSScreen = lazy(() => import('./components/POSScreenAPI'));
const PaymentBilling = lazy(() => import('./components/PaymentBillingRefactored'));
const InventoryBatchManagement = lazy(() => import('./components/InventoryBatchManagement'));
const ReportsShadcn = lazy(() => import('./components/ReportsShadcn'));

// Loading fallback component
const LoadingFallback = () => (
  <div className="flex items-center justify-center h-screen">
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
      <p className="text-gray-600">Loading...</p>
    </div>
  </div>
);

function App() {
  const [screen, setScreen] = useState<string>('dashboard');

  const renderContent = () => {
    switch (screen) {
      case 'dashboard':
        return <Dashboard />;
      case 'pos':
        return <POSScreen />;
      case 'payment':
        return <PaymentBilling />;
      case 'inventory':
        return <InventoryBatchManagement />;
      case 'customers':
        return <div className="p-4">Customers screen</div>;
      case 'reports':
        return <ReportsShadcn />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-qb-gray-50">
      <SidebarNav selected={screen} onSelect={setScreen} />
      <main className="lg:pl-56 p-4">
        <ErrorBoundary>
          <Suspense fallback={<LoadingFallback />}>
            {renderContent()}
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
}

export default App;