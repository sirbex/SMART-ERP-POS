// Pure Shadcn-only architecture - minimal CSS imports
import './App.css';

// Component imports - Using ONLY Shadcn UI versions
import InventoryBatchManagement from './components/InventoryBatchManagement';
import CustomerLedgerForm from './components/CustomerLedgerFormShadcn';
import ReportsShadcn from './components/ReportsShadcn';
import Sidebar from './components/SidebarShadcn';
import POSScreen from './components/POSScreenShadcn';
import PaymentBillingShadcn from './components/PaymentBillingShadcn';
import Dashboard from './components/Dashboard';
import ErrorBoundary from './components/ErrorBoundary';
import { useState, useEffect } from 'react';
import { CustomerLedgerProvider } from './context/CustomerLedgerContext';
function App() {
  const [screen, setScreen] = useState('dashboard');
  
  // Initialize clean application - complete reset for fresh start
  useEffect(() => {
    document.body.classList.add('app-initialized');
    
    console.log('🧹 Preparing clean application...');
    
    // COMPLETE APPLICATION RESET - Clear ALL data using actual keys from components
    const allStorageKeys = [
      // Dashboard keys
      'pos_transaction_history_v1',
      'pos_inventory_v1',
      
      // Inventory data
      'inventory_items',
      'inventory_movements',
      'inventory_history',
      'simple_inventory_items',
      
      // Transaction and sales data
      'transaction_history',
      'pos_sales',
      'sale_records',
      'receipts',
      'invoices',
      
      // Payment data
      'pos_scheduled_payments',
      'payment_schedules',
      'split_payments',
      'installmentPlans',
      
      // Customer data
      'pos_customers',
      'pos_ledger',
      'customer_ledger',
      'accounts_receivable',
      'customer_balances',
      
      // Reports and other data
      'pos_reports',
      'pos_analytics',
      
      // Settings and configuration
      'pos_settings',
      'app_settings',
      'user_preferences',
      'theme',
      
      // Sample/mock data
      'sample_inventory',
      'demo_transactions',
      'test_data'
    ];
    
    // Clear all localStorage keys
    allStorageKeys.forEach(key => {
      if (localStorage.getItem(key)) {
        console.log(`Clearing ${key}...`);
        localStorage.removeItem(key);
      }
    });
    
    // Also clear any unknown keys that might contain sample data
    Object.keys(localStorage).forEach(key => {
      if (key.includes('sample') || key.includes('demo') || key.includes('test') || key.includes('mock')) {
        console.log(`Removing sample data: ${key}`);
        localStorage.removeItem(key);
      }
    });
    
    // Clear session storage for clean state
    sessionStorage.clear();
    
    // Dispatch storage events to notify all components
    window.dispatchEvent(new Event('storage'));
    
    console.log('✅ Clean application ready - all data cleared');
    console.log('📊 Starting with fresh, empty state');
    console.log('🎯 Ready for new data entry');
    
  }, []);

  let content;
  switch (screen) {
    case 'dashboard':
      content = (
        <ErrorBoundary fallback={
          <div className="error-page p-4 max-w-md mx-auto">
            <h2 className="text-lg font-semibold mb-2">Dashboard Error</h2>
            <p className="text-sm text-muted-foreground mb-4">There was a problem loading the Dashboard. Please try again or contact support.</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full sm:w-auto px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm"
            >
              Reload App
            </button>
          </div>
        }>
          <Dashboard />
        </ErrorBoundary>
      );
      break;
    case 'pos':
      content = (
        <ErrorBoundary fallback={
          <div className="error-page p-4 max-w-md mx-auto">
            <h2 className="text-lg font-semibold mb-2">POS Screen Error</h2>
            <p className="text-sm text-muted-foreground mb-4">There was a problem loading the POS screen. Please try again or contact support.</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full sm:w-auto px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm"
            >
              Reload App
            </button>
          </div>
        }>
          <POSScreen />
        </ErrorBoundary>
      );
      break;
    case 'payment':
      content = (
        <ErrorBoundary fallback={
          <div className="error-page p-4 max-w-md mx-auto">
            <h2 className="text-lg font-semibold mb-2">Payment & Billing Error</h2>
            <p className="text-sm text-muted-foreground mb-4">There was a problem loading the Payment & Billing page. Please try again or contact support.</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full sm:w-auto px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm"
            >
              Reload App
            </button>
          </div>
        }>
          <PaymentBillingShadcn />
        </ErrorBoundary>
      );
      break;
    case 'inventory':
      content = (
        <ErrorBoundary fallback={
          <div className="error-page p-4 max-w-md mx-auto">
            <h2 className="text-lg font-semibold mb-2">Inventory Form Error</h2>
            <p className="text-sm text-muted-foreground mb-4">There was a problem loading the Inventory form. Please try again or contact support.</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full sm:w-auto px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm"
            >
              Reload App
            </button>
          </div>
        }>
          <InventoryBatchManagement />
        </ErrorBoundary>
      );
      break;
    case 'customers':
      content = (
        <ErrorBoundary fallback={
          <div className="error-page p-4 max-w-md mx-auto">
            <h2 className="text-lg font-semibold mb-2">Customer Ledger Error</h2>
            <p className="text-sm text-muted-foreground mb-4">There was a problem loading the Customer Ledger. Please try again or contact support.</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full sm:w-auto px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm"
            >
              Reload App
            </button>
          </div>
        }>
          <CustomerLedgerForm />
        </ErrorBoundary>
      );
      break;
    case 'reports':
      content = (
        <ErrorBoundary fallback={
          <div className="error-page p-4 max-w-md mx-auto">
            <h2 className="text-lg font-semibold mb-2">Reports Error</h2>
            <p className="text-sm text-muted-foreground mb-4">There was a problem loading the Reports screen. Please try again or contact support.</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full sm:w-auto px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm"
            >
              Reload App
            </button>
          </div>
        }>
          <ReportsShadcn />
        </ErrorBoundary>
      );
      break;
    default:
      // Default to dashboard for unknown screens
      setScreen('dashboard');
      content = (
        <ErrorBoundary fallback={
          <div className="error-page p-4 max-w-md mx-auto">
            <h2 className="text-lg font-semibold mb-2">Application Error</h2>
            <p className="text-sm text-muted-foreground mb-4">There was a problem loading the requested screen. Please try again or contact support.</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full sm:w-auto px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm"
            >
              Reload App
            </button>
          </div>
        }>
          <Dashboard />
        </ErrorBoundary>
      );
  }

  // Fully responsive layout with proper mobile handling
  return (
    <div className="flex min-h-screen bg-background">
      <ErrorBoundary fallback={
        <div className="error-page p-4">
          <h2 className="text-lg font-semibold mb-2">Navigation Error</h2>
          <p className="text-sm text-muted-foreground mb-4">There was a problem loading the navigation. Please try again or contact support.</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm"
          >
            Reload App
          </button>
        </div>
      }>
        <Sidebar onSelect={setScreen} selected={screen} />
      </ErrorBoundary>
      
      <main className="flex-1 min-w-0 p-2 sm:p-4 md:p-6 ml-0 lg:ml-56 transition-all duration-300 overflow-x-hidden">
        <div className="w-full max-w-full">
          <CustomerLedgerProvider>
            {content}
          </CustomerLedgerProvider>
        </div>
      </main>
    </div>
  );
}

export default App;