/**
 * Role-Based Protected Route Component
 * Ensures efficient and accurate role-based access control
 */

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { UserRole } from '../../types';

interface ProtectedRouteProps {
    children: React.ReactNode;
    requiredRoles?: UserRole[];
    requireAnyRole?: boolean; // If true, user needs ANY of the roles; if false, needs ALL (default: true)
    fallbackPath?: string;
    showUnauthorized?: boolean;
}

/**
 * ProtectedRoute - Wraps routes that require authentication and specific roles
 * 
 * Features:
 * - Efficient role checking (cached in Zustand store)
 * - Accurate permission validation
 * - Automatic redirect to login if not authenticated
 * - Customizable unauthorized handling
 * 
 * @example
 * // Only admins can access
 * <ProtectedRoute requiredRoles={['ADMIN']}>
 *   <AdminPanel />
 * </ProtectedRoute>
 * 
 * @example
 * // Admins or Managers can access
 * <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']}>
 *   <ReportsPage />
 * </ProtectedRoute>
 */
export function ProtectedRoute({
    children,
    requiredRoles,
    requireAnyRole = true,
    fallbackPath = '/login',
    showUnauthorized = false
}: ProtectedRouteProps) {
    const { isAuthenticated, user } = useAuth();
    const location = useLocation();

    // Not authenticated - redirect to login
    if (!isAuthenticated || !user) {
        return <Navigate to={fallbackPath} state={{ from: location }} replace />;
    }

    // No role requirements - just needs to be authenticated
    if (!requiredRoles || requiredRoles.length === 0) {
        return <>{children}</>;
    }

    // Check if user has required role(s)
    const hasRequiredRole = requireAnyRole
        ? requiredRoles.includes(user.role) // User needs ANY of the roles
        : requiredRoles.every(role => user.role === role); // User needs ALL roles (typically just one)

    if (!hasRequiredRole) {
        if (showUnauthorized) {
            return (
                <div className="flex items-center justify-center h-screen bg-gray-50">
                    <div className="text-center">
                        <div className="text-6xl mb-4">🔒</div>
                        <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
                        <p className="text-gray-600 mb-4">
                            You don't have permission to access this page.
                        </p>
                        <p className="text-sm text-gray-500">
                            Required role(s): {requiredRoles.join(', ')}
                            <br />
                            Your role: {user.role}
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

    // User has required role - render children
    return <>{children}</>;
}

/**
 * Hook to check if user can access a specific feature
 * Useful for conditional rendering without wrapping entire routes
 * 
 * @example
 * const canEdit = useCanAccess(['ADMIN', 'MANAGER']);
 * {canEdit && <EditButton />}
 */
export function useCanAccess(requiredRoles?: UserRole[], requireAnyRole: boolean = true): boolean {
    const { isAuthenticated, user } = useAuth();

    if (!isAuthenticated || !user) return false;
    if (!requiredRoles || requiredRoles.length === 0) return true;

    return requireAnyRole
        ? requiredRoles.includes(user.role)
        : requiredRoles.every(role => user.role === role);
}

/**
 * Component to conditionally show content based on user role
 * 
 * @example
 * <RoleGate requiredRoles={['ADMIN']}>
 *   <DeleteButton />
 * </RoleGate>
 */
export function RoleGate({
    children,
    requiredRoles,
    requireAnyRole = true,
    fallback = null
}: {
    children: React.ReactNode;
    requiredRoles: UserRole[];
    requireAnyRole?: boolean;
    fallback?: React.ReactNode;
}) {
    const canAccess = useCanAccess(requiredRoles, requireAnyRole);

    if (!canAccess) {
        return <>{fallback}</>;
    }

    return <>{children}</>;
}
