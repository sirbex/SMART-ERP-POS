import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { CASHIER_HOME_PATH, isCashierAllowedPath, isCashierRole } from '../../utils/cashierLockdown';

/**
 * Blocks cashiers from non-POS routes (inventory, reports, admin, etc.).
 * Wrap all authenticated tenant routes in App.tsx.
 */
export function CashierPathGuard() {
  const { user } = useAuth();
  const location = useLocation();

  if (isCashierRole(user?.role) && !isCashierAllowedPath(location.pathname)) {
    return <Navigate to={CASHIER_HOME_PATH} replace />;
  }

  return <Outlet />;
}
