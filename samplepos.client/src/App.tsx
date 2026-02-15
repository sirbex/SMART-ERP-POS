import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Toaster as SonnerToaster } from 'sonner';
import { useAuth } from './hooks/useAuth';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import POSPage from './pages/pos/POSPage';
import CustomersPage from './pages/CustomersPage';
import CustomerDetailPage from './pages/customers/CustomerDetailPage';
import SuppliersPage from './pages/SuppliersPage';
import SalesPage from './pages/SalesPage';
import SettingsPage from './pages/settings/SettingsPage';
import SecuritySettingsPage from './pages/settings/SecuritySettingsPage';
import ReportsPage from './pages/ReportsPage';
import ExpenseReportsPage from './pages/reports/ExpenseReportsPage';
import AdminDataManagementPage from './pages/AdminDataManagementPage';
import InventoryLayout from './components/InventoryLayout';
import StockLevelsPage from './pages/inventory/StockLevelsPage';
import ProductsPage from './pages/inventory/ProductsPage';
import StockMovementsPage from './pages/inventory/StockMovementsPage';
import PurchaseOrdersPage from './pages/inventory/PurchaseOrdersPage';
import GoodsReceiptsPage from './pages/inventory/GoodsReceiptsPage';
import UomManagementPage from './pages/inventory/UomManagementPage';
import BatchManagementPage from './pages/inventory/BatchManagementPage';
import AuditLogPage from './pages/AuditLogPage';
import RoleManagementPage from './pages/admin/RoleManagementPage';
import QuotationsPage from './pages/quotations/QuotationsPage';
import NewQuotationPage from './pages/quotations/NewQuotationPage';
import EditQuotationPage from './pages/quotations/EditQuotationPage';
import QuoteDetailPage from './pages/quotations/QuoteDetailPage';
import QuoteConversionPage from './pages/quotations/QuoteConversionPage';
import AccountingLayout from './components/AccountingLayout';
import ChartOfAccountsPage from './pages/accounting/ChartOfAccountsPage';
import GeneralLedgerPage from './pages/accounting/GeneralLedgerPage';
import TrialBalancePage from './pages/accounting/TrialBalancePage';
import FinancialStatementsPage from './pages/accounting/FinancialStatementsPage';
import AccountingIntegrationDashboard from './pages/accounting/AccountingIntegrationDashboard';
import CustomerFinancialPage from './pages/accounting/CustomerFinancialPage';
import InvoiceLedgerIntegrationPage from './pages/accounting/InvoiceLedgerIntegrationPage';
import ExpensesPage from './pages/accounting/ExpensesPage';
import ExpenseCategoriesPage from './pages/accounting/ExpenseCategoriesPage';
import ComprehensiveInvoicesPage from './pages/accounting/ComprehensiveInvoicesPage';
import CustomerPaymentsPage from './pages/accounting/CustomerPaymentsPage';
import SupplierPaymentsPage from './pages/accounting/SupplierPaymentsPage';
import ProfitLossPage from './pages/ProfitLossPage';
import ReconciliationPage from './pages/ReconciliationPage';
import JournalEntriesPage from './pages/JournalEntriesPage';
import PeriodManagementPage from './pages/PeriodManagementPage';
import BankingPage from './pages/accounting/BankingPage';

function App() {
  const { isAuthenticated, isLoading } = useAuth();

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
    <BrowserRouter>
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
      <Routes>
        <Route path="/login" element={<LoginPage />} />

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

            {/* POS - ADMIN, MANAGER, CASHIER */}
            <Route
              path="/pos"
              element={
                <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER', 'CASHIER']}>
                  <POSPage />
                </ProtectedRoute>
              }
            />

            {/* Sales - ADMIN, MANAGER, CASHIER */}
            <Route
              path="/sales"
              element={
                <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER', 'CASHIER']}>
                  <SalesPage />
                </ProtectedRoute>
              }
            />

            {/* Customers - ADMIN, MANAGER, CASHIER */}
            <Route
              path="/customers"
              element={
                <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER', 'CASHIER']}>
                  <CustomersPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/customers/:id"
              element={
                <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER', 'CASHIER']}>
                  <CustomerDetailPage />
                </ProtectedRoute>
              }
            />

            {/* Suppliers - ADMIN, MANAGER only */}
            <Route
              path="/suppliers"
              element={
                <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']}>
                  <SuppliersPage />
                </ProtectedRoute>
              }
            />

            {/* Quotations - ADMIN, MANAGER, CASHIER */}
            <Route
              path="/quotations"
              element={
                <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER', 'CASHIER']}>
                  <QuotationsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/quotations/new"
              element={
                <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER', 'CASHIER']}>
                  <NewQuotationPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/quotations/:quoteNumber/edit"
              element={
                <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER', 'CASHIER']}>
                  <EditQuotationPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/quotations/:quoteNumber/convert"
              element={
                <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER', 'CASHIER']}>
                  <QuoteConversionPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/quotations/:quoteNumber"
              element={
                <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER', 'CASHIER']}>
                  <QuoteDetailPage />
                </ProtectedRoute>
              }
            />

            {/* Accounting Routes - ADMIN, MANAGER only */}
            <Route
              path="/accounting"
              element={
                <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']}>
                  <AccountingLayout><AccountingIntegrationDashboard /></AccountingLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/accounting/dashboard"
              element={
                <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']}>
                  <AccountingLayout><AccountingIntegrationDashboard /></AccountingLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/accounting/chart-of-accounts"
              element={
                <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']}>
                  <AccountingLayout><ChartOfAccountsPage /></AccountingLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/accounting/general-ledger"
              element={
                <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']}>
                  <AccountingLayout><GeneralLedgerPage /></AccountingLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/accounting/trial-balance"
              element={
                <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']}>
                  <AccountingLayout><TrialBalancePage /></AccountingLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/accounting/financial-statements"
              element={
                <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']}>
                  <AccountingLayout><FinancialStatementsPage /></AccountingLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/accounting/customer-financial"
              element={
                <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']}>
                  <AccountingLayout><CustomerFinancialPage /></AccountingLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/accounting/invoice-integration"
              element={
                <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']}>
                  <AccountingLayout><InvoiceLedgerIntegrationPage /></AccountingLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/accounting/expenses"
              element={
                <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']}>
                  <AccountingLayout><ExpensesPage /></AccountingLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/accounting/expense-categories"
              element={
                <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']}>
                  <AccountingLayout><ExpenseCategoriesPage /></AccountingLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/accounting/invoices"
              element={
                <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']}>
                  <AccountingLayout><ComprehensiveInvoicesPage /></AccountingLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/accounting/customer-payments"
              element={
                <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']}>
                  <AccountingLayout><CustomerPaymentsPage /></AccountingLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/accounting/supplier-payments"
              element={
                <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']}>
                  <AccountingLayout><SupplierPaymentsPage /></AccountingLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/accounting/profit-loss"
              element={
                <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']}>
                  <AccountingLayout><ProfitLossPage /></AccountingLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/accounting/reconciliation"
              element={
                <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']}>
                  <AccountingLayout><ReconciliationPage /></AccountingLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/accounting/journal-entries"
              element={
                <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']}>
                  <AccountingLayout><JournalEntriesPage /></AccountingLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/accounting/periods"
              element={
                <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']}>
                  <AccountingLayout><PeriodManagementPage /></AccountingLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/accounting/banking"
              element={
                <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']}>
                  <AccountingLayout><BankingPage /></AccountingLayout>
                </ProtectedRoute>
              }
            />

            {/* Settings - ADMIN only */}
            <Route
              path="/settings"
              element={
                <ProtectedRoute requiredRoles={['ADMIN']}>
                  <SettingsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings/security"
              element={
                <ProtectedRoute requiredRoles={['ADMIN']}>
                  <SecuritySettingsPage />
                </ProtectedRoute>
              }
            />

            {/* Reports - ADMIN, MANAGER */}
            <Route
              path="/reports"
              element={
                <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']}>
                  <ReportsPage />
                </ProtectedRoute>
              }
            />

            {/* Expense Reports - ADMIN, MANAGER */}
            <Route
              path="/reports/expenses"
              element={
                <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']}>
                  <ExpenseReportsPage />
                </ProtectedRoute>
              }
            />

            {/* Admin Routes - ADMIN only */}
            <Route
              path="/admin/data-management"
              element={
                <ProtectedRoute requiredRoles={['ADMIN']}>
                  <AdminDataManagementPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/audit-trail"
              element={
                <ProtectedRoute requiredRoles={['ADMIN']}>
                  <AuditLogPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/roles"
              element={
                <ProtectedRoute requiredRoles={['ADMIN']}>
                  <RoleManagementPage />
                </ProtectedRoute>
              }
            />

            {/* Inventory Routes - ADMIN, MANAGER, STAFF (view), CASHIER (view) */}
            <Route
              path="/inventory"
              element={
                <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER', 'STAFF', 'CASHIER']}>
                  <InventoryLayout><StockLevelsPage /></InventoryLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/inventory/products"
              element={
                <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']}>
                  <InventoryLayout><ProductsPage /></InventoryLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/inventory/batches"
              element={
                <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']}>
                  <InventoryLayout><BatchManagementPage /></InventoryLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/inventory/stock-movements"
              element={
                <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER', 'STAFF']}>
                  <InventoryLayout><StockMovementsPage /></InventoryLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/inventory/purchase-orders"
              element={
                <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']}>
                  <InventoryLayout><PurchaseOrdersPage /></InventoryLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/inventory/goods-receipts"
              element={
                <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']}>
                  <InventoryLayout><GoodsReceiptsPage /></InventoryLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/inventory/uoms"
              element={
                <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']}>
                  <InventoryLayout><UomManagementPage /></InventoryLayout>
                </ProtectedRoute>
              }
            />

            <Route path="/" element={<Navigate to="/dashboard" replace />} />
          </>
        ) : (
          <Route path="*" element={<Navigate to="/login" replace />} />
        )}
      </Routes>
    </BrowserRouter>
  );
}

export default App;
