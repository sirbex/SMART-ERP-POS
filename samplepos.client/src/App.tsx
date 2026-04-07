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

// Lazy-loaded pages — each becomes its own chunk
const LoginPage = lazy(() => import('./pages/LoginPage'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const POSPage = lazy(() => import('./pages/pos/POSPage'));
const CustomersPage = lazy(() => import('./pages/CustomersPage'));
const CustomerDetailPage = lazy(() => import('./pages/customers/CustomerDetailPage'));
const SuppliersPage = lazy(() => import('./pages/SuppliersPage'));
const SalesPage = lazy(() => import('./pages/SalesPage'));
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage'));
const SecuritySettingsPage = lazy(() => import('./pages/settings/SecuritySettingsPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const ExpenseReportsPage = lazy(() => import('./pages/reports/ExpenseReportsPage'));
const ReorderDashboardPage = lazy(() => import('./pages/reports/ReorderDashboardPage'));
const BusinessPerformancePage = lazy(() => import('./pages/reports/BusinessPerformancePage'));
const AdminDataManagementPage = lazy(() => import('./pages/AdminDataManagementPage'));
const StockLevelsPage = lazy(() => import('./pages/inventory/StockLevelsPage'));
const ProductsPage = lazy(() => import('./pages/inventory/ProductsPage'));
const StockMovementsPage = lazy(() => import('./pages/inventory/StockMovementsPage'));
const PurchaseOrdersPage = lazy(() => import('./pages/inventory/PurchaseOrdersPage'));
const GoodsReceiptsPage = lazy(() => import('./pages/inventory/GoodsReceiptsPage'));
const UomManagementPage = lazy(() => import('./pages/inventory/UomManagementPage'));
const BatchManagementPage = lazy(() => import('./pages/inventory/BatchManagementPage'));
const InventoryAdjustmentsPage = lazy(() => import('./pages/inventory/InventoryAdjustmentsPage'));
const AuditLogPage = lazy(() => import('./pages/AuditLogPage'));
const RoleManagementPage = lazy(() => import('./pages/admin/RoleManagementPage'));
const QuotationsPage = lazy(() => import('./pages/quotations/QuotationsPage'));
const NewQuotationPage = lazy(() => import('./pages/quotations/NewQuotationPage'));
const EditQuotationPage = lazy(() => import('./pages/quotations/EditQuotationPage'));
const QuoteDetailPage = lazy(() => import('./pages/quotations/QuoteDetailPage'));
const QuoteConversionPage = lazy(() => import('./pages/quotations/QuoteConversionPage'));
const ChartOfAccountsPage = lazy(() => import('./pages/accounting/ChartOfAccountsPage'));
const GeneralLedgerPage = lazy(() => import('./pages/accounting/GeneralLedgerPage'));
const TrialBalancePage = lazy(() => import('./pages/accounting/TrialBalancePage'));
const FinancialStatementsPage = lazy(() => import('./pages/accounting/FinancialStatementsPage'));
const AccountingIntegrationDashboard = lazy(() => import('./pages/accounting/AccountingIntegrationDashboard'));
const CustomerFinancialPage = lazy(() => import('./pages/accounting/CustomerFinancialPage'));
const InvoiceLedgerIntegrationPage = lazy(() => import('./pages/accounting/InvoiceLedgerIntegrationPage'));
const ExpensesPage = lazy(() => import('./pages/accounting/ExpensesPage'));
const ExpenseCategoriesPage = lazy(() => import('./pages/accounting/ExpenseCategoriesPage'));
const ComprehensiveInvoicesPage = lazy(() => import('./pages/accounting/ComprehensiveInvoicesPage'));
const CustomerPaymentsPage = lazy(() => import('./pages/accounting/CustomerPaymentsPage'));
const SupplierPaymentsPage = lazy(() => import('./pages/accounting/SupplierPaymentsPage'));
const CreditDebitNotesPage = lazy(() => import('./pages/accounting/CreditDebitNotesPage'));
const ProfitLossPage = lazy(() => import('./pages/ProfitLossPage'));
const ReconciliationPage = lazy(() => import('./pages/ReconciliationPage'));
const JournalEntriesPage = lazy(() => import('./pages/JournalEntriesPage'));
const PeriodManagementPage = lazy(() => import('./pages/PeriodManagementPage'));
const BankingPage = lazy(() => import('./pages/accounting/BankingPage'));
const DeliveryPage = lazy(() => import('./pages/delivery/DeliveryPage'));
const DeliveryNotesPage = lazy(() => import('./pages/delivery-notes/DeliveryNotesPage'));
const ImportPage = lazy(() => import('./pages/ImportPage'));
const BarcodeLookupPage = lazy(() => import('./pages/inventory/BarcodeLookupPage'));
const CRMPage = lazy(() => import('./pages/crm/CRMPage'));
const HRPage = lazy(() => import('./pages/hr/HRPage'));
const PriceRulesPage = lazy(() => import('./pages/pricing/PriceRulesPage'));
const CategoriesPage = lazy(() => import('./pages/pricing/CategoriesPage'));
const PricePreviewPage = lazy(() => import('./pages/pricing/PricePreviewPage'));

// Platform (Super Admin) imports
import { PlatformAuthProvider, usePlatformAuth } from './contexts/PlatformAuthContext';
const PlatformLoginPage = lazy(() => import('./pages/platform/PlatformLoginPage'));
import PlatformLayout from './components/platform/PlatformLayout';
const PlatformDashboardPage = lazy(() => import('./pages/platform/PlatformDashboardPage'));
const TenantsPage = lazy(() => import('./pages/platform/TenantsPage'));
const AdminsPage = lazy(() => import('./pages/platform/AdminsPage'));
const PlatformHealthPage = lazy(() => import('./pages/platform/PlatformHealthPage'));

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
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER', 'CASHIER']} requiredPermissions={['pos.read', 'pos.create']}>
                        <POSPage />
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
                    path="/accounting/customer-financial"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']} requiredPermissions={['accounting.read']}>
                        <AccountingLayout>
                          <CustomerFinancialPage />
                        </AccountingLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/accounting/invoice-integration"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']} requiredPermissions={['accounting.read']}>
                        <AccountingLayout>
                          <InvoiceLedgerIntegrationPage />
                        </AccountingLayout>
                      </ProtectedRoute>
                    }
                  />
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
                  <Route
                    path="/accounting/invoices"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']} requiredPermissions={['accounting.read']}>
                        <AccountingLayout>
                          <ComprehensiveInvoicesPage />
                        </AccountingLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/accounting/customer-payments"
                    element={
                      <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']} requiredPermissions={['accounting.read']}>
                        <AccountingLayout>
                          <CustomerPaymentsPage />
                        </AccountingLayout>
                      </ProtectedRoute>
                    }
                  />
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
