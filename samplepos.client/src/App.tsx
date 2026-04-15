import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster, toast } from 'react-hot-toast';
import { Toaster as SonnerToaster } from 'sonner';
import { useAuth } from './hooks/useAuth';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import NetworkStatusBanner from './components/NetworkStatusBanner';
import OfflineAutoSync from './components/OfflineAutoSync';

// Layouts stay static (small, shared across routes)
import InventoryLayout from './components/InventoryLayout';
import AccountingLayout from './components/AccountingLayout';

/**
 * Lazy-load wrapper that auto-reloads the page on stale chunk errors.
 * After a deployment, Vite's hashed filenames change. If the browser still
 * has the old index cached, it tries to fetch removed chunk files → 404.
 * This wrapper catches that and does a single hard reload.
 */
function lazyWithRetry(factory: () => Promise<{ default: React.ComponentType }>) {
  return lazy(() =>
    factory().catch((err: unknown) => {
      const alreadyReloaded = sessionStorage.getItem('chunk_reload');
      if (!alreadyReloaded) {
        sessionStorage.setItem('chunk_reload', '1');
        window.location.reload();
        // Return a never-resolving promise so React doesn't render the error
        return new Promise(() => { });
      }
      // Already reloaded once — let ErrorBoundary handle it
      sessionStorage.removeItem('chunk_reload');
      throw err;
    })
  );
}

// Clear the reload flag on successful page load
if (sessionStorage.getItem('chunk_reload')) {
  sessionStorage.removeItem('chunk_reload');
}

// Lazy-loaded pages — each becomes its own chunk
const LoginPage = lazyWithRetry(() => import('./pages/LoginPage'));
const Dashboard = lazyWithRetry(() => import('./pages/Dashboard'));
const POSPage = lazyWithRetry(() => import('./pages/pos/POSPage'));
const CustomersPage = lazyWithRetry(() => import('./pages/CustomersPage'));
const CustomerDetailPage = lazyWithRetry(() => import('./pages/customers/CustomerDetailPage'));
const SuppliersPage = lazyWithRetry(() => import('./pages/SuppliersPage'));
const SalesPage = lazyWithRetry(() => import('./pages/SalesPage'));
const SettingsPage = lazyWithRetry(() => import('./pages/settings/SettingsPage'));
const SecuritySettingsPage = lazyWithRetry(() => import('./pages/settings/SecuritySettingsPage'));
const ReportsPage = lazyWithRetry(() => import('./pages/ReportsPage'));
const ExpenseReportsPage = lazyWithRetry(() => import('./pages/reports/ExpenseReportsPage'));
const ReorderDashboardPage = lazyWithRetry(() => import('./pages/reports/ReorderDashboardPage'));
const BusinessPerformancePage = lazyWithRetry(() => import('./pages/reports/BusinessPerformancePage'));
const AdminDataManagementPage = lazyWithRetry(() => import('./pages/AdminDataManagementPage'));
const StockLevelsPage = lazyWithRetry(() => import('./pages/inventory/StockLevelsPage'));
const ProductsPage = lazyWithRetry(() => import('./pages/inventory/ProductsPage'));
const StockMovementsPage = lazyWithRetry(() => import('./pages/inventory/StockMovementsPage'));
const PurchaseOrdersPage = lazyWithRetry(() => import('./pages/inventory/PurchaseOrdersPage'));
const GoodsReceiptsPage = lazyWithRetry(() => import('./pages/inventory/GoodsReceiptsPage'));
const UomManagementPage = lazyWithRetry(() => import('./pages/inventory/UomManagementPage'));
const BatchManagementPage = lazyWithRetry(() => import('./pages/inventory/BatchManagementPage'));
const InventoryAdjustmentsPage = lazyWithRetry(() => import('./pages/inventory/InventoryAdjustmentsPage'));
const AuditLogPage = lazyWithRetry(() => import('./pages/AuditLogPage'));
const RoleManagementPage = lazyWithRetry(() => import('./pages/admin/RoleManagementPage'));
const QuotationsPage = lazyWithRetry(() => import('./pages/quotations/QuotationsPage'));
const NewQuotationPage = lazyWithRetry(() => import('./pages/quotations/NewQuotationPage'));
const EditQuotationPage = lazyWithRetry(() => import('./pages/quotations/EditQuotationPage'));
const QuoteDetailPage = lazyWithRetry(() => import('./pages/quotations/QuoteDetailPage'));
const QuoteConversionPage = lazyWithRetry(() => import('./pages/quotations/QuoteConversionPage'));
const ChartOfAccountsPage = lazyWithRetry(() => import('./pages/accounting/ChartOfAccountsPage'));
const GeneralLedgerPage = lazyWithRetry(() => import('./pages/accounting/GeneralLedgerPage'));
const TrialBalancePage = lazyWithRetry(() => import('./pages/accounting/TrialBalancePage'));
const FinancialStatementsPage = lazyWithRetry(() => import('./pages/accounting/FinancialStatementsPage'));
const BalanceSheetPage = lazyWithRetry(() => import('./pages/accounting/BalanceSheetPage'));
const AccountingIntegrationDashboard = lazyWithRetry(() => import('./pages/accounting/AccountingIntegrationDashboard'));
const ExpensesPage = lazyWithRetry(() => import('./pages/accounting/ExpensesPage'));
const ExpenseCategoriesPage = lazyWithRetry(() => import('./pages/accounting/ExpenseCategoriesPage'));
const SupplierPaymentsPage = lazyWithRetry(() => import('./pages/accounting/SupplierPaymentsPage'));
const CreditDebitNotesPage = lazyWithRetry(() => import('./pages/accounting/CreditDebitNotesPage'));
const ProfitLossPage = lazyWithRetry(() => import('./pages/ProfitLossPage'));
const ReconciliationPage = lazyWithRetry(() => import('./pages/ReconciliationPage'));
const JournalEntriesPage = lazyWithRetry(() => import('./pages/JournalEntriesPage'));
const PeriodManagementPage = lazyWithRetry(() => import('./pages/PeriodManagementPage'));
const BankingPage = lazyWithRetry(() => import('./pages/accounting/BankingPage'));
const CostCentersPage = lazyWithRetry(() => import('./pages/accounting/CostCentersPage'));
const GrirClearingPage = lazyWithRetry(() => import('./pages/accounting/GrirClearingPage'));
const DunningPage = lazyWithRetry(() => import('./pages/accounting/DunningPage'));
const WithholdingTaxPage = lazyWithRetry(() => import('./pages/accounting/WithholdingTaxPage'));
const AssetAccountingPage = lazyWithRetry(() => import('./pages/accounting/AssetAccountingPage'));
const OrdersQueuePage = lazyWithRetry(() => import('./pages/orders/OrdersQueuePage'));
const OrderPaymentPage = lazyWithRetry(() => import('./pages/orders/OrderPaymentPage'));
const JeApprovalPage = lazyWithRetry(() => import('./pages/accounting/JeApprovalPage'));
const PaymentProgramPage = lazyWithRetry(() => import('./pages/accounting/PaymentProgramPage'));
const MultiCurrencyPage = lazyWithRetry(() => import('./pages/accounting/MultiCurrencyPage'));
const FiscalYearClosePage = lazyWithRetry(() => import('./pages/accounting/FiscalYearClosePage'));
const GLReconciliationPage = lazyWithRetry(() => import('./pages/accounting/GLReconciliationPage'));
const TaxEnginePage = lazyWithRetry(() => import('./pages/accounting/TaxEnginePage'));
const CurrencyRevaluationPage = lazyWithRetry(() => import('./pages/accounting/CurrencyRevaluationPage'));
const GLIntegrityPage = lazyWithRetry(() => import('./pages/accounting/GLIntegrityPage'));
const AgedBalancePage = lazyWithRetry(() => import('./pages/accounting/AgedBalancePage'));
const DeliveryPage = lazyWithRetry(() => import('./pages/delivery/DeliveryPage'));
const DeliveryNotesPage = lazyWithRetry(() => import('./pages/delivery-notes/DeliveryNotesPage'));
const ImportPage = lazyWithRetry(() => import('./pages/ImportPage'));
const BarcodeLookupPage = lazyWithRetry(() => import('./pages/inventory/BarcodeLookupPage'));
const CRMPage = lazyWithRetry(() => import('./pages/crm/CRMPage'));
const HRPage = lazyWithRetry(() => import('./pages/hr/HRPage'));
const PriceRulesPage = lazyWithRetry(() => import('./pages/pricing/PriceRulesPage'));
const CategoriesPage = lazyWithRetry(() => import('./pages/pricing/CategoriesPage'));
const PricePreviewPage = lazyWithRetry(() => import('./pages/pricing/PricePreviewPage'));
const QuickLoginScreen = lazyWithRetry(() => import('./pages/pos/QuickLoginScreen'));
const MyQuickLoginPage = lazyWithRetry(() => import('./pages/settings/MyQuickLoginPage'));

// Platform (Super Admin) imports
import { PlatformAuthProvider, usePlatformAuth } from './contexts/PlatformAuthContext';
const PlatformLoginPage = lazyWithRetry(() => import('./pages/platform/PlatformLoginPage'));
import PlatformLayout from './components/platform/PlatformLayout';
const PlatformDashboardPage = lazyWithRetry(() => import('./pages/platform/PlatformDashboardPage'));
const TenantsPage = lazyWithRetry(() => import('./pages/platform/TenantsPage'));
const AdminsPage = lazyWithRetry(() => import('./pages/platform/AdminsPage'));
const PlatformHealthPage = lazyWithRetry(() => import('./pages/platform/PlatformHealthPage'));

// Platform route guard
function PlatformProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = usePlatformAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/platform/login" replace />;
  }

  return <>{children}</>;
}

function App() {
  const { isAuthenticated, isLoading } = useAuth();

  // Global 403 Forbidden listener — shows toast when backend rejects due to missing permissions
  useEffect(() => {
    const handler = (e: Event) => {
      const msg = (e as CustomEvent).detail || 'You do not have permission to perform this action';
      toast.error(msg, { duration: 6000, icon: '🔒' });
    };
    window.addEventListener('app:forbidden', handler);
    return () => window.removeEventListener('app:forbidden', handler);
  }, []);

  // Session expiry warning — visible toast when idle timeout is about to fire
  useEffect(() => {
    const handler = () => {
      toast('Session expiring soon — move your mouse or press any key to stay logged in', {
        duration: 55000,
        icon: '⏳',
        style: { background: '#fef3c7', border: '1px solid #f59e0b', fontWeight: 500 },
      });
    };
    window.addEventListener('app:session-warning', handler);
    return () => window.removeEventListener('app:session-warning', handler);
  }, []);

  // Show loading screen while authentication is being initialized
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <PlatformAuthProvider>
      <BrowserRouter>
        <NetworkStatusBanner />
        <OfflineAutoSync />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3000,
            style: {
              background: '#363636',
              color: '#fff',
            },
            success: {
              duration: 2000,
              iconTheme: {
                primary: '#10b981',
                secondary: '#fff',
              },
            },
            error: {
              duration: 4000,
              iconTheme: {
                primary: '#ef4444',
                secondary: '#fff',
              },
            },
          }}
        />
        <SonnerToaster position="top-right" richColors />
        <ErrorBoundary section="Application">
          <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
            </div>
          }>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/quick-login" element={<QuickLoginScreen />} />

              {/* Platform (Super Admin) Routes — own auth context */}
              <Route path="/platform/login" element={<PlatformLoginPage />} />
              <Route
                path="/platform"
                element={
                  <PlatformProtectedRoute>
                    <PlatformLayout />
                  </PlatformProtectedRoute>
                }
              >
                <Route index element={<PlatformDashboardPage />} />
                <Route path="tenants" element={<TenantsPage />} />
                <Route path="admins" element={<AdminsPage />} />
                <Route path="health" element={<PlatformHealthPage />} />
              </Route>

              {isAuthenticated ? (
                <>
                  {/* Dashboard - All authenticated users */}
                  <Route
                    path="/dashboard"
                    element={
                      <ProtectedRoute>
                        <Dashboard />
                      </ProtectedRoute>
                    }
                  />

                  {/* POS */}
                  <Route
                    path="/pos"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER', 'CASHIER', 'STAFF']} requiredPermissions={['pos.read', 'pos.create']}>
                        <POSPage />
                      </ProtectedRoute>
                    }
                  />

                  {/* Orders Queue */}
                  <Route
                    path="/orders-queue"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER', 'CASHIER', 'STAFF']} requiredPermissions={['orders.read']}>
                        <OrdersQueuePage />
                      </ProtectedRoute>
                    }
                  />

                  {/* Order Payment */}
                  <Route
                    path="/orders/:id/pay"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER', 'CASHIER']} requiredPermissions={['orders.pay']}>
                        <OrderPaymentPage />
                      </ProtectedRoute>
                    }
                  />

                  {/* Sales */}
                  <Route
                    path="/sales"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER', 'CASHIER']} requiredPermissions={['sales.read']}>
                        <SalesPage />
                      </ProtectedRoute>
                    }
                  />

                  {/* Customers */}
                  <Route
                    path="/customers"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER', 'CASHIER']} requiredPermissions={['customers.read']}>
                        <CustomersPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/customers/:id"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER', 'CASHIER']} requiredPermissions={['customers.read']}>
                        <CustomerDetailPage />
                      </ProtectedRoute>
                    }
                  />

                  {/* Suppliers */}
                  <Route
                    path="/suppliers"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']} requiredPermissions={['suppliers.read']}>
                        <SuppliersPage />
                      </ProtectedRoute>
                    }
                  />

                  {/* Quotations */}
                  <Route
                    path="/quotations"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER', 'CASHIER']} requiredPermissions={['quotations.read']}>
                        <QuotationsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/quotations/new"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER', 'CASHIER']} requiredPermissions={['quotations.create']}>
                        <NewQuotationPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/quotations/:quoteNumber/edit"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER', 'CASHIER']} requiredPermissions={['quotations.update']}>
                        <EditQuotationPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/quotations/:quoteNumber/convert"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER', 'CASHIER']} requiredPermissions={['sales.create']}>
                        <QuoteConversionPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/quotations/:quoteNumber"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER', 'CASHIER']} requiredPermissions={['quotations.read']}>
                        <QuoteDetailPage />
                      </ProtectedRoute>
                    }
                  />

                  {/* CRM */}
                  <Route
                    path="/crm"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']} requiredPermissions={['crm.read']}>
                        <CRMPage />
                      </ProtectedRoute>
                    }
                  />

                  {/* HR & Payroll */}
                  <Route
                    path="/hr"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']} requiredPermissions={['hr.read']}>
                        <HRPage />
                      </ProtectedRoute>
                    }
                  />

                  {/* Pricing - ADMIN, MANAGER */}
                  <Route
                    path="/pricing"
                    element={<Navigate to="/pricing/rules" replace />}
                  />
                  <Route
                    path="/pricing/rules"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']} requiredPermissions={['settings.read']}>
                        <PriceRulesPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/pricing/categories"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']} requiredPermissions={['settings.read']}>
                        <CategoriesPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/pricing/preview"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']} requiredPermissions={['settings.read']}>
                        <PricePreviewPage />
                      </ProtectedRoute>
                    }
                  />

                  {/* Accounting Routes */}
                  <Route
                    path="/accounting"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']} requiredPermissions={['accounting.read']}>
                        <AccountingLayout>
                          <AccountingIntegrationDashboard />
                        </AccountingLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/accounting/dashboard"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']} requiredPermissions={['accounting.read']}>
                        <AccountingLayout>
                          <AccountingIntegrationDashboard />
                        </AccountingLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/accounting/chart-of-accounts"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']} requiredPermissions={['accounting.chart_manage', 'accounting.read']}>
                        <AccountingLayout>
                          <ChartOfAccountsPage />
                        </AccountingLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/accounting/general-ledger"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']} requiredPermissions={['accounting.read']}>
                        <AccountingLayout>
                          <GeneralLedgerPage />
                        </AccountingLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/accounting/trial-balance"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']} requiredPermissions={['accounting.read']}>
                        <AccountingLayout>
                          <TrialBalancePage />
                        </AccountingLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/accounting/financial-statements"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']} requiredPermissions={['accounting.read', 'reports.financial_view']}>
                        <AccountingLayout>
                          <FinancialStatementsPage />
                        </AccountingLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/accounting/balance-sheet"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']} requiredPermissions={['accounting.read', 'reports.financial_view']}>
                        <AccountingLayout>
                          <BalanceSheetPage />
                        </AccountingLayout>
                      </ProtectedRoute>
                    }
                  />
                  {/* Removed duplicates — redirect to canonical pages */}
                  <Route path="/accounting/customer-financial" element={<Navigate to="/accounting/aged-balances" replace />} />
                  <Route path="/accounting/invoice-integration" element={<Navigate to="/accounting/general-ledger" replace />} />
                  <Route
                    path="/accounting/expenses"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']} requiredPermissions={['expenses.read']}>
                        <AccountingLayout>
                          <ExpensesPage />
                        </AccountingLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/accounting/expense-categories"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']} requiredPermissions={['expenses.read']}>
                        <AccountingLayout>
                          <ExpenseCategoriesPage />
                        </AccountingLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route path="/accounting/invoices" element={<Navigate to="/accounting/aged-balances" replace />} />
                  <Route path="/accounting/customer-payments" element={<Navigate to="/accounting/banking" replace />} />
                  <Route
                    path="/accounting/supplier-payments"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']} requiredPermissions={['accounting.read']}>
                        <AccountingLayout>
                          <SupplierPaymentsPage />
                        </AccountingLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/accounting/credit-debit-notes"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']} requiredPermissions={['accounting.read']}>
                        <AccountingLayout>
                          <CreditDebitNotesPage />
                        </AccountingLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/accounting/profit-loss"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']} requiredPermissions={['accounting.read', 'reports.financial_view']}>
                        <AccountingLayout>
                          <ProfitLossPage />
                        </AccountingLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/accounting/reconciliation"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']} requiredPermissions={['accounting.reconcile', 'accounting.read']}>
                        <AccountingLayout>
                          <ReconciliationPage />
                        </AccountingLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/accounting/journal-entries"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']} requiredPermissions={['accounting.post', 'accounting.read']}>
                        <AccountingLayout>
                          <JournalEntriesPage />
                        </AccountingLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/accounting/periods"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']} requiredPermissions={['accounting.period_manage', 'accounting.read']}>
                        <AccountingLayout>
                          <PeriodManagementPage />
                        </AccountingLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/accounting/banking"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']} requiredPermissions={['banking.read']}>
                        <AccountingLayout>
                          <BankingPage />
                        </AccountingLayout>
                      </ProtectedRoute>
                    }
                  />

                  {/* Advanced Accounting Modules */}
                  <Route
                    path="/accounting/cost-centers"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']} requiredPermissions={['accounting.read']}>
                        <AccountingLayout>
                          <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
                            <CostCentersPage />
                          </Suspense>
                        </AccountingLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/accounting/period-control"
                    element={<Navigate to="/accounting/periods" replace />}
                  />
                  <Route
                    path="/accounting/grir-clearing"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']} requiredPermissions={['accounting.read']}>
                        <AccountingLayout>
                          <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
                            <GrirClearingPage />
                          </Suspense>
                        </AccountingLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/accounting/dunning"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']} requiredPermissions={['accounting.read']}>
                        <AccountingLayout>
                          <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
                            <DunningPage />
                          </Suspense>
                        </AccountingLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/accounting/withholding-tax"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']} requiredPermissions={['accounting.read']}>
                        <AccountingLayout>
                          <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
                            <WithholdingTaxPage />
                          </Suspense>
                        </AccountingLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/accounting/assets"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']} requiredPermissions={['accounting.read']}>
                        <AccountingLayout>
                          <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
                            <AssetAccountingPage />
                          </Suspense>
                        </AccountingLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/accounting/je-approval"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']} requiredPermissions={['accounting.post', 'accounting.read']}>
                        <AccountingLayout>
                          <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
                            <JeApprovalPage />
                          </Suspense>
                        </AccountingLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/accounting/payment-program"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']} requiredPermissions={['accounting.read']}>
                        <AccountingLayout>
                          <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
                            <PaymentProgramPage />
                          </Suspense>
                        </AccountingLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/accounting/multi-currency"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']} requiredPermissions={['accounting.read']}>
                        <AccountingLayout>
                          <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
                            <MultiCurrencyPage />
                          </Suspense>
                        </AccountingLayout>
                      </ProtectedRoute>
                    }
                  />

                  {/* Enterprise Accounting */}
                  <Route
                    path="/accounting/fiscal-year-close"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']} requiredPermissions={['accounting.read']}>
                        <AccountingLayout>
                          <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
                            <FiscalYearClosePage />
                          </Suspense>
                        </AccountingLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/accounting/gl-reconciliation"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']} requiredPermissions={['accounting.reconcile', 'accounting.read']}>
                        <AccountingLayout>
                          <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
                            <GLReconciliationPage />
                          </Suspense>
                        </AccountingLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/accounting/tax-engine"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']} requiredPermissions={['accounting.read']}>
                        <AccountingLayout>
                          <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
                            <TaxEnginePage />
                          </Suspense>
                        </AccountingLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/accounting/currency-revaluation"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']} requiredPermissions={['accounting.read']}>
                        <AccountingLayout>
                          <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
                            <CurrencyRevaluationPage />
                          </Suspense>
                        </AccountingLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/accounting/gl-integrity"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']} requiredPermissions={['accounting.read']}>
                        <AccountingLayout>
                          <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
                            <GLIntegrityPage />
                          </Suspense>
                        </AccountingLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/accounting/aged-balances"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']} requiredPermissions={['accounting.read']}>
                        <AccountingLayout>
                          <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
                            <AgedBalancePage />
                          </Suspense>
                        </AccountingLayout>
                      </ProtectedRoute>
                    }
                  />

                  {/* Quick Login Setup - ALL authenticated users */}
                  <Route
                    path="/my/quick-login"
                    element={
                      <ProtectedRoute>
                        <MyQuickLoginPage />
                      </ProtectedRoute>
                    }
                  />

                  {/* Settings - ADMIN only */}
                  <Route
                    path="/settings"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN']} requiredPermissions={['system.manage']}>
                        <SettingsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/settings/security"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN']} requiredPermissions={['system.manage']}>
                        <SecuritySettingsPage />
                      </ProtectedRoute>
                    }
                  />

                  {/* Reports */}
                  <Route
                    path="/reports"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']} requiredPermissions={['reports.read', 'reports.sales_view', 'reports.inventory_view', 'reports.financial_view', 'reports.purchasing_view', 'reports.customers_view', 'reports.banking_view']}>
                        <ReportsPage />
                      </ProtectedRoute>
                    }
                  />

                  {/* Expense Reports */}
                  <Route
                    path="/reports/expenses"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']} requiredPermissions={['expenses.read', 'reports.financial_view']}>
                        <ExpenseReportsPage />
                      </ProtectedRoute>
                    }
                  />

                  {/* Business Performance Report */}
                  <Route
                    path="/reports/business-performance"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']} requiredPermissions={['reports.financial_view']}>
                        <BusinessPerformancePage />
                      </ProtectedRoute>
                    }
                  />

                  {/* Reorder Dashboard */}
                  <Route
                    path="/reports/reorder"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']} requiredPermissions={['reports.inventory_view', 'inventory.read']}>
                        <ReorderDashboardPage />
                      </ProtectedRoute>
                    }
                  />

                  {/* Admin Routes - ADMIN only */}
                  <Route
                    path="/admin/data-management"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN']} requiredPermissions={['admin.delete']}>
                        <AdminDataManagementPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/audit-trail"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN']} requiredPermissions={['admin.read']}>
                        <AuditLogPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/roles"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN']} requiredPermissions={['admin.update']}>
                        <RoleManagementPage />
                      </ProtectedRoute>
                    }
                  />

                  {/* Delivery */}
                  <Route
                    path="/delivery"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']} requiredPermissions={['delivery.read']}>
                        <DeliveryPage />
                      </ProtectedRoute>
                    }
                  />

                  {/* Wholesale Delivery Notes */}
                  <Route
                    path="/delivery-notes"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']} requiredPermissions={['delivery.read']}>
                        <DeliveryNotesPage />
                      </ProtectedRoute>
                    }
                  />

                  {/* CSV Import */}
                  <Route
                    path="/import"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']} requiredPermissions={['admin.create']}>
                        <ImportPage />
                      </ProtectedRoute>
                    }
                  />

                  {/* Inventory Routes */}
                  <Route
                    path="/inventory"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER', 'STAFF', 'CASHIER']} requiredPermissions={['inventory.read']}>
                        <InventoryLayout>
                          <StockLevelsPage />
                        </InventoryLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/inventory/products"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']} requiredPermissions={['inventory.read', 'inventory.create']}>
                        <InventoryLayout>
                          <ProductsPage />
                        </InventoryLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/inventory/batches"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']} requiredPermissions={['inventory.read']}>
                        <InventoryLayout>
                          <BatchManagementPage />
                        </InventoryLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/inventory/stock-movements"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER', 'STAFF']} requiredPermissions={['inventory.read']}>
                        <InventoryLayout>
                          <StockMovementsPage />
                        </InventoryLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/inventory/adjustments"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']} requiredPermissions={['inventory.adjust']}>
                        <InventoryLayout>
                          <InventoryAdjustmentsPage />
                        </InventoryLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/inventory/purchase-orders"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']} requiredPermissions={['purchasing.read']}>
                        <InventoryLayout>
                          <PurchaseOrdersPage />
                        </InventoryLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/inventory/goods-receipts"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']} requiredPermissions={['purchasing.read']}>
                        <InventoryLayout>
                          <GoodsReceiptsPage />
                        </InventoryLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/inventory/uoms"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']} requiredPermissions={['inventory.read']}>
                        <InventoryLayout>
                          <UomManagementPage />
                        </InventoryLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/inventory/barcode-lookup"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER', 'STAFF', 'CASHIER']} requiredPermissions={['inventory.read']}>
                        <InventoryLayout>
                          <BarcodeLookupPage />
                        </InventoryLayout>
                      </ProtectedRoute>
                    }
                  />

                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                </>
              ) : (
                <Route path="*" element={<Navigate to="/login" replace />} />
              )}
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </BrowserRouter>
    </PlatformAuthProvider>
  );
}

export default App;
