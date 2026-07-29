import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useRestaurantEnabled } from '../../hooks/useRestaurantEnabled';
import { CASHIER_HOME_PATH, isCashierAllowedPath, isCashierRole } from '../../utils/cashierLockdown';
import {
  isRestaurantWaiterProfile,
  isWaiterAllowedPath,
  WAITER_HOME_PATH,
} from '../../utils/restaurantWaiterLockdown';

/**
 * Blocks cashiers from non-POS routes and waiters from kitchen/config/ERP surfaces.
 * Wrap all authenticated tenant routes in App.tsx.
 */
export function CashierPathGuard() {
  const { user, permissions } = useAuth();
  const location = useLocation();
  const { data: restaurantEnabled = false } = useRestaurantEnabled();

  if (isCashierRole(user?.role) && !isCashierAllowedPath(location.pathname)) {
    return <Navigate to={CASHIER_HOME_PATH} replace />;
  }

  if (
    isRestaurantWaiterProfile({
      role: user?.role,
      permissions,
      restaurantEnabled,
    }) &&
    !isWaiterAllowedPath(location.pathname)
  ) {
    return <Navigate to={WAITER_HOME_PATH} replace />;
  }

  return <Outlet />;
}
