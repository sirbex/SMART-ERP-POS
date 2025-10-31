// Pure Shadcn-only architecture - minimal CSS imports
import './App.css';

// Core components - loaded immediately
import HeaderBar from './components/layout/HeaderBar';
import SidebarNav from './components/layout/SidebarNav';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastContextProvider } from '@/components/ui/toast';

// Lazy-loaded components for code splitting
import { lazy, Suspense, useState, useEffect } from 'react';
import APIStatus from './components/APIStatus';

// Loading components for better UX
import { 
  DashboardLoading, 
  InventoryLoading, 
  CustomerLedgerLoading, 
  POSLoading, 
  PaymentLoading, 
  ReportsLoading, 
  SettingsLoading 
} from './components/LoadingSpinner';

// API Test Page
const ApiTestPage = lazy(() => import('./pages/ApiTestPage'));

// Code-split heavy components
const InventoryManagement = lazy(() => import('./components/InventoryManagement'));
const CustomerLedgerForm = lazy(() => import('./components/CustomerLedgerFormShadcn'));
const ReportsShadcn = lazy(() => import('./components/ReportsShadcn'));
const POSScreenAPI = lazy(() => import('./components/POSScreenAPI'));
const PaymentBillingShadcn = lazy(() => import('./components/PaymentBillingShadcn'));
const Dashboard = lazy(() => import('./components/Dashboard'));
const AdminSettings = lazy(() => import('./components/AdminSettings'));
import { CustomerLedgerProvider } from './context/CustomerLedgerContext';

function App() {
  const [screen, setScreen] = useState('dashboard');
  
  // Initialize application
  useEffect(() => {
    document.body.classList.add('app-initialized');
    
    console.log('🚀 Initializing PostgreSQL application...');
    
    console.log('✅ Application ready');
    console.log('📊 Using PostgreSQL database');
    
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
          <Suspense fallback={<DashboardLoading />}>
            <Dashboard />
          </Suspense>
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
          <Suspense fallback={<POSLoading />}>
            <POSScreenAPI />
          </Suspense>
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
          <Suspense fallback={<PaymentLoading />}>
            <PaymentBillingShadcn />
          </Suspense>
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
          <Suspense fallback={<InventoryLoading />}>
            <InventoryManagement />
          </Suspense>
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
          <Suspense fallback={<CustomerLedgerLoading />}>
            <CustomerLedgerForm />
          </Suspense>
        </ErrorBoundary>
      );
      break;
    case 'ledger':
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
          <Suspense fallback={<CustomerLedgerLoading />}>
            <CustomerLedgerForm />
          </Suspense>
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
          <Suspense fallback={<ReportsLoading />}>
            <ReportsShadcn />
          </Suspense>
        </ErrorBoundary>
      );
      break;
    case 'settings':
      content = (
        <ErrorBoundary fallback={
          <div className="error-page p-4 max-w-md mx-auto">
            <h2 className="text-lg font-semibold mb-2">Settings Error</h2>
            <p className="text-sm text-muted-foreground mb-4">There was a problem loading the settings. Please try again or contact support.</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full sm:w-auto px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm"
            >
              Reload App
            </button>
          </div>
        }>
          <Suspense fallback={<SettingsLoading />}>
            <AdminSettings onBack={() => setScreen('dashboard')} />
          </Suspense>
        </ErrorBoundary>
      );
      break;
    case 'api-test':
      content = (
        <ErrorBoundary fallback={
          <div className="error-page p-4 max-w-md mx-auto">
            <h2 className="text-lg font-semibold mb-2">API Tester Error</h2>
            <p className="text-sm text-muted-foreground mb-4">There was a problem loading the API Test page. Please try again or contact support.</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full sm:w-auto px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm"
            >
              Reload App
            </button>
          </div>
        }>
          <Suspense fallback={<div className="flex items-center justify-center h-40"><span className="text-muted-foreground">Loading API test page...</span></div>}>
            <ApiTestPage />
          </Suspense>
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
          <Suspense fallback={<DashboardLoading />}>
            <Dashboard />
          </Suspense>
        </ErrorBoundary>
      );
  }

  // Fully responsive layout with proper mobile handling
  return (
    <ToastContextProvider>
      <MainLayout selected={screen} onNavigate={setScreen}>
        <ErrorBoundary fallback={
          <div className="error-page p-4">
            <h2 className="text-lg font-semibold mb-2">Application Error</h2>
            <p className="text-sm text-muted-foreground mb-4">There was a problem loading the requested screen. Please try again or contact support.</p>
            <button 
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm"
            >
              Reload App
            </button>
          </div>
        }>
          <div className="flex justify-end mb-4">
            <ErrorBoundary>
              <Suspense fallback={<span>Loading API status...</span>}>
                <APIStatus />
              </Suspense>
            </ErrorBoundary>
          </div>
          <CustomerLedgerProvider>
            {content}
          </CustomerLedgerProvider>
        </ErrorBoundary>
      </MainLayout>
    </ToastContextProvider>
  );
}

export default App;