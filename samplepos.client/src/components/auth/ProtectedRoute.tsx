/**
 * RBAC-Aware Protected Route Component
 *
 * Permissions are loaded into AuthContext at login / session restore
 * and stored in localStorage — available SYNCHRONOUSLY, no async race.
 *
 * Access is granted if EITHER the legacy role matches OR the user holds
 * any of the required RBAC permissions.
 */

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { UserRole } from '../../types';

interface ProtectedRouteProps {
    children: React.ReactNode;
    requiredRoles?: UserRole[];
    requiredPermissions?: string[];
    requireAnyRole?: boolean;
    fallbackPath?: string;
    showUnauthorized?: boolean;
}

export function ProtectedRoute({
    children,
    requiredRoles,
    requiredPermissions,
    requireAnyRole = true,
    fallbackPath = '/login',
    showUnauthorized = false
}: ProtectedRouteProps) {
    const { isAuthenticated, user, permissions } = useAuth();
    const location = useLocation();

    // Not authenticated - redirect to login
    if (!isAuthenticated || !user) {
        return <Navigate to={fallbackPath} state={{ from: location }} replace />;
    }

    // No requirements - just needs to be authenticated
    if ((!requiredRoles || requiredRoles.length === 0) && (!requiredPermissions || requiredPermissions.length === 0)) {
        return <>{children}</>;
    }

    // Check legacy role
    const hasRequiredRole = requiredRoles && requiredRoles.length > 0
        ? (requireAnyRole
            ? requiredRoles.includes(user.role)
            : requiredRoles.every(role => user.role === role))
        : false;

    // Check RBAC permissions (synchronous — loaded in AuthContext)
    const hasRbacPermission = requiredPermissions && requiredPermissions.length > 0
        ? requiredPermissions.some(key => permissions.has(key))
        : false;

    // Grant access if EITHER check passes
    if (hasRequiredRole || hasRbacPermission) {
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

    // Redirect to dashboard if unauthorized
    return <Navigate to="/dashboard" replace />;
}

/**
 * Hook to check if user can access a feature
 * Synchronous — reads from AuthContext (no async fetch)
 */
export function useCanAccess(requiredRoles?: UserRole[], requiredPermissions?: string[], requireAnyRole: boolean = true): boolean {
    const { isAuthenticated, user, permissions } = useAuth();

    if (!isAuthenticated || !user) return false;

    // No requirements — always accessible
    if ((!requiredRoles || requiredRoles.length === 0) && (!requiredPermissions || requiredPermissions.length === 0)) return true;

    // Legacy role check
    const hasRole = requiredRoles && requiredRoles.length > 0
        ? (requireAnyRole ? requiredRoles.includes(user.role) : requiredRoles.every(r => user.role === r))
        : false;

    // RBAC permission check (synchronous)
    const hasPerm = requiredPermissions && requiredPermissions.length > 0
        ? requiredPermissions.some(k => permissions.has(k))
        : false;

    return hasRole || hasPerm;
}

/**
 * Component to conditionally show content based on user role or RBAC permission
 */
export function RoleGate({
    children,
    requiredRoles,
    requiredPermissions,
    requireAnyRole = true,
    fallback = null
}: {
    children: React.ReactNode;
    requiredRoles?: UserRole[];
    requiredPermissions?: string[];
    requireAnyRole?: boolean;
    fallback?: React.ReactNode;
}) {
    const canAccess = useCanAccess(requiredRoles, requiredPermissions, requireAnyRole);

    if (!canAccess) {
        return <>{fallback}</>;
    }

    return <>{children}</>;
}
