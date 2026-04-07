/**
 * RBAC-Aware Protected Route Component
 * Checks BOTH legacy roles AND granular RBAC permissions.
 * Access is granted if EITHER the legacy role matches OR the user holds
 * any of the required RBAC permissions (fetched from /rbac/me/permissions).
 */

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useMyPermissions } from '../../hooks/useRbac';
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
    const { isAuthenticated, user } = useAuth();
    const location = useLocation();
    const { data: rbacPermissions } = useMyPermissions();

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

    // Check RBAC permissions (from /rbac/me/permissions which includes legacy fallback)
    let hasRbacPermission = false;
    if (requiredPermissions && requiredPermissions.length > 0 && rbacPermissions) {
        const userPermKeys = new Set(rbacPermissions.map(p => p.permissionKey));
        hasRbacPermission = requiredPermissions.some(key => userPermKeys.has(key));
    }

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
 * Hook to check if user can access a feature (checks both legacy roles AND RBAC permissions)
 */
export function useCanAccess(requiredRoles?: UserRole[], requiredPermissions?: string[], requireAnyRole: boolean = true): boolean {
    const { isAuthenticated, user } = useAuth();
    const { data: rbacPermissions } = useMyPermissions();

    if (!isAuthenticated || !user) return false;

    // No requirements — always accessible
    if ((!requiredRoles || requiredRoles.length === 0) && (!requiredPermissions || requiredPermissions.length === 0)) return true;

    // Legacy role check
    const hasRole = requiredRoles && requiredRoles.length > 0
        ? (requireAnyRole ? requiredRoles.includes(user.role) : requiredRoles.every(r => user.role === r))
        : false;

    // RBAC permission check
    let hasPerm = false;
    if (requiredPermissions && requiredPermissions.length > 0 && rbacPermissions) {
        const keys = new Set(rbacPermissions.map(p => p.permissionKey));
        hasPerm = requiredPermissions.some(k => keys.has(k));
    }

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
