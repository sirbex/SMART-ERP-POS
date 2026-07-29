/**
 * RBAC-Aware Protected Route Component
 *
 * Runtime authorization = permissions (+ policies via AuthorizationService).
 * Roles are permission containers — route access must not depend on role names.
 */

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { FeatureGate } from './FeatureGate';
import { UserRole } from '../../types';
import { CASHIER_HOME_PATH, isCashierRole } from '../../utils/cashierLockdown';
import { createClientAuthorization } from '../../authorization/authorizationService';
import { useCanAccess } from '../../authorization/useAuthorization';

interface ProtectedRouteProps {
    children: React.ReactNode;
    /**
     * @deprecated Do not use for business authorization. Use requiredPermissions.
     * Retained only for infrastructure routing (e.g. cashier lockdown during migration).
     */
    requiredRoles?: UserRole[];
    requiredPermissions?: string[];
    requiredFeature?: string;
    requireAnyRole?: boolean;
    fallbackPath?: string;
    showUnauthorized?: boolean;
}

export function ProtectedRoute({
    children,
    requiredRoles,
    requiredPermissions,
    requiredFeature,
    requireAnyRole = true,
    fallbackPath = '/login',
    showUnauthorized = false
}: ProtectedRouteProps) {
    const { isAuthenticated, user, permissions } = useAuth();
    const location = useLocation();

    if (!isAuthenticated || !user) {
        return <Navigate to={fallbackPath} state={{ from: location }} replace />;
    }

    if ((!requiredRoles || requiredRoles.length === 0) && (!requiredPermissions || requiredPermissions.length === 0)) {
        return <>{children}</>;
    }

    const authz = createClientAuthorization(user, permissions);

    // Permission-first: business capabilities are gated by RBAC keys only
    const hasPermissionAccess = requiredPermissions && requiredPermissions.length > 0 && authz
        ? requiredPermissions.some((key) => authz.hasPermission(key))
        : false;

    // Legacy role check — only when NO permissions specified (migration compatibility)
    const hasRoleAccess = (!requiredPermissions || requiredPermissions.length === 0)
        && requiredRoles && requiredRoles.length > 0
        ? (requireAnyRole
            ? requiredRoles.includes(user.role)
            : requiredRoles.every(role => user.role === role))
        : false;

    if (hasPermissionAccess || hasRoleAccess) {
        if (requiredFeature) {
            return <FeatureGate feature={requiredFeature}>{children}</FeatureGate>;
        }
        return <>{children}</>;
    }

    if (showUnauthorized) {
        return (
            <div className="flex items-center justify-center h-screen bg-gray-50">
                <div className="text-center">
                    <div className="text-6xl mb-4">🔒</div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
                    <p className="text-gray-600 mb-4">
                        You don&apos;t have permission to access this page.
                    </p>
                    <button
                        onClick={() => window.history.back()}
                        className="mt-6 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        Go Back
                    </button>
                </div>
            </div>
        );
    }

    return (
      <Navigate
        to={isCashierRole(user.role) ? CASHIER_HOME_PATH : '/dashboard'}
        replace
      />
    );
}

/** @deprecated Import useCanAccess from authorization/useAuthorization instead. */
export { useCanAccess };

/**
 * @deprecated Use <Can permission="..." /> from authorization/Can instead.
 */
export function RoleGate({
    children,
    requiredPermissions,
    fallback = null
}: {
    children: React.ReactNode;
    requiredRoles?: UserRole[];
    requiredPermissions?: string[];
    requireAnyRole?: boolean;
    fallback?: React.ReactNode;
}) {
    const canAccess = useCanAccess(undefined, requiredPermissions);
    if (!canAccess) {
        return <>{fallback}</>;
    }
    return <>{children}</>;
}
