import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useRestaurantModeForRouting } from '../../hooks/useRestaurantEnabled';
import {
  isCashierAllowedPath,
  isCashierLockdownActive,
  resolveCashierHomePath,
} from '../../utils/cashierLockdown';
import {
  isRestaurantWaiterProfile,
  isWaiterAllowedPath,
  WAITER_HOME_PATH,
} from '../../utils/restaurantWaiterLockdown';
import { shouldHideRetailPos } from '../../utils/retailPosVisibility';
import { RestaurantModeBoot } from './RestaurantModeBoot';

/**
 * Blocks default cashiers from non-POS routes and waiters from kitchen/config/ERP.
 * Extra Role Management ticks escape lockdown — ProtectedRoute enforces catalog keys.
 */
export function CashierPathGuard() {
  const { user, permissions } = useAuth();
  const location = useLocation();
  const { restaurantEnabled, isReady } = useRestaurantModeForRouting();

  const onRetailPos =
    location.pathname === '/pos' || location.pathname.startsWith('/pos/');

  // Never mount retail POS until the flag is settled — prevents restaurant→retail flash.
  if (onRetailPos && !isReady) {
    return <RestaurantModeBoot />;
  }

  if (
    isCashierLockdownActive({ role: user?.role, permissions }) &&
    !isCashierAllowedPath(location.pathname, { restaurantEnabled, permissions })
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
  if (shouldHideRetailPos(restaurantEnabled) && onRetailPos) {
    return <Navigate to="/restaurant" replace />;
  }

  return <Outlet />;
}
