import { useState } from 'react';
import './App.css';
import ErrorBoundary from './components/ErrorBoundary';
import SidebarNav from './components/layout/SidebarNav';
import Dashboard from './components/DashboardNew';
import POSScreen from './components/POSScreenAPI';
import PaymentBilling from './components/PaymentBillingRefactored';
import InventoryBatchManagement from './components/InventoryBatchManagement';
import ReportsShadcn from './components/ReportsShadcn';

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
          {renderContent()}
        </ErrorBoundary>
      </main>
    </div>
  );
}

export default App;
