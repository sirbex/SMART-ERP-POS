import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useRestaurantEnabled } from '../../hooks/useRestaurantEnabled';
import {
  isCashierAllowedPath,
  isCashierRole,
  resolveCashierHomePath,
} from '../../utils/cashierLockdown';
import {
  isRestaurantWaiterProfile,
  isWaiterAllowedPath,
  WAITER_HOME_PATH,
} from '../../utils/restaurantWaiterLockdown';
import { shouldHideRetailPos } from '../../utils/retailPosVisibility';

/**
 * Blocks cashiers from non-POS routes and waiters from kitchen/config/ERP surfaces.
 * When restaurant mode is on, retail /pos is blocked (Restaurant FOH instead).
 * Wrap all authenticated tenant routes in App.tsx.
 */
export function CashierPathGuard() {
  const { user, permissions } = useAuth();
  const location = useLocation();
  const { data: restaurantEnabled = false } = useRestaurantEnabled();

  if (
    isCashierRole(user?.role) &&
    !isCashierAllowedPath(location.pathname, { restaurantEnabled })
  ) {
    return <Navigate to={resolveCashierHomePath(restaurantEnabled)} replace />;
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

  // Restaurant tenant: do not leave anyone on retail POS.
  if (
    shouldHideRetailPos(restaurantEnabled) &&
    (location.pathname === '/pos' || location.pathname.startsWith('/pos/'))
  ) {
    return <Navigate to="/restaurant" replace />;
  }

  return <Outlet />;
}
