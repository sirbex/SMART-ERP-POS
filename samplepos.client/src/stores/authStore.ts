/**
 * Phase 7: Enhanced Auth Store
 * 
 * ⚠️ DEPRECATED - DO NOT USE DIRECTLY ⚠️
 * 
 * This Zustand auth store is deprecated and causes dual-state issues.
 * Use AuthContext instead via: import { useAuth } from '../hooks/useAuth'
 * 
 * The AuthContext (contexts/AuthContext.tsx) is the SINGLE SOURCE OF TRUTH
 * for all authentication state.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '../types';
import { STORAGE_KEYS, USER_ROLES } from '../utils/constants';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

interface AuthStore {
  user: User | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  login: (credentials: { username: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  setUser: (user: User) => void;
  setTokens: (tokens: AuthTokens) => void;
  clearAuth: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  updateUser: (updates: Partial<User>) => void;

  // Legacy compatibility
  token: string | null;

  // Permission checks
  hasRole: (role: keyof typeof USER_ROLES) => boolean;
  hasAnyRole: (roles: Array<keyof typeof USER_ROLES>) => boolean;
  hasPermission: (permission: string) => boolean;
  isAdmin: () => boolean;
  isManager: () => boolean;
  canManageInventory: () => boolean;
  canManageUsers: () => boolean;
  canManageSuppliers: () => boolean;
  canProcessSales: () => boolean;
  canViewReports: () => boolean;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

/**
 * Enhanced Auth Store with JWT Token Management
 */
export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      tokens: null,
      token: null, // Legacy compatibility
      isAuthenticated: false,
      isLoading: false,
      error: null,

      /**
       * Enhanced login with JWT tokens
       */
      login: async (credentials) => {
        set({ isLoading: true, error: null });

        try {
          const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(credentials),
          });

          const data = await response.json();

          if (!response.ok || !data.success) {
            throw new Error(data.error || 'Login failed');
          }

          // Backend returns { token, user } - handle both formats for compatibility
          const { token: backendToken, accessToken, refreshToken, user } = data.data;
          const authToken = accessToken || backendToken; // Use accessToken if available, fallback to token

          if (!authToken) {
            throw new Error('No authentication token received');
          }

          set({
            user,
            tokens: { accessToken: authToken, refreshToken: refreshToken || '' },
            token: authToken, // Legacy compatibility
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });

          // Also set in localStorage for API interceptor
          localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, authToken);
          localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Login failed',
          });
          throw error;
        }
      },

      /**
       * Logout user
       */
      logout: async () => {
        set({
          user: null,
          token: null,
          isAuthenticated: false
        });

        // Clear from localStorage
        localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
        localStorage.removeItem(STORAGE_KEYS.USER);
      },

      /**
       * Update user information
       */
      updateUser: (updates) => {
        const state = get();
        if (!state.user) return;

        const updatedUser = { ...state.user, ...updates };
        set({ user: updatedUser });

        // Update localStorage
        localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(updatedUser));
      },

      /**
       * Check if user has specific role
       */
      hasRole: (role) => {
        const state = get();
        return state.user?.role === USER_ROLES[role];
      },

      /**
       * Check if user has any of the specified roles
       */
      hasAnyRole: (roles) => {
        const state = get();
        if (!state.user) return false;
        return roles.some(role => state.user?.role === USER_ROLES[role]);
      },

      /**
       * Check if user is admin
       */
      isAdmin: () => {
        return get().hasRole('ADMIN');
      },

      /**
       * Check if user is manager or higher
       */
      isManager: () => {
        return get().hasAnyRole(['ADMIN', 'MANAGER']);
      },

      /**
       * Check if user can manage inventory
       */
      canManageInventory: () => {
        return get().hasAnyRole(['ADMIN', 'MANAGER']);
      },

      /**
       * Check if user can manage other users
       */
      canManageUsers: () => {
        return get().isAdmin();
      },

      /**
       * Check if user can manage suppliers
       */
      canManageSuppliers: () => {
        return get().hasAnyRole(['ADMIN', 'MANAGER']);
      },

      /**
       * Check if user can process sales
       */
      canProcessSales: () => {
        return get().hasAnyRole(['ADMIN', 'MANAGER', 'CASHIER']);
      },

      /**
       * Check if user can view reports
       */
      canViewReports: () => {
        return get().hasAnyRole(['ADMIN', 'MANAGER']);
      },

      /**
       * Refresh the authentication token
       */
      refreshToken: async () => {
        const state = get();
        if (!state.tokens?.refreshToken) {
          throw new Error('No refresh token available');
        }

        try {
          const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ refreshToken: state.tokens.refreshToken }),
          });

          const data = await response.json();

          if (!response.ok || !data.success) {
            throw new Error(data.error || 'Token refresh failed');
          }

          const { accessToken, refreshToken: newRefreshToken } = data.data;

          set({
            tokens: { accessToken, refreshToken: newRefreshToken || state.tokens.refreshToken },
            token: accessToken,
          });

          localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, accessToken);
        } catch (error) {
          // On refresh failure, logout
          get().clearAuth();
          throw error;
        }
      },

      /**
       * Set user directly
       */
      setUser: (user) => {
        set({ user });
        if (user) {
          localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
        }
      },

      /**
       * Set tokens directly
       */
      setTokens: (tokens) => {
        set({
          tokens,
          token: tokens.accessToken,
          isAuthenticated: true
        });
        localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, tokens.accessToken);
      },

      /**
       * Clear all auth state
       */
      clearAuth: () => {
        set({
          user: null,
          tokens: null,
          token: null,
          isAuthenticated: false,
          error: null,
        });
        localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
        localStorage.removeItem(STORAGE_KEYS.USER);
      },

      /**
       * Set loading state
       */
      setLoading: (loading) => {
        set({ isLoading: loading });
      },

      /**
       * Set error state
       */
      setError: (error) => {
        set({ error });
      },

      /**
       * Check if user has specific permission
       */
      hasPermission: (permission) => {
        const state = get();
        // Simple permission check based on role - extend as needed
        if (!state.user) return false;

        // Admin has all permissions
        if (state.user.role === USER_ROLES.ADMIN) return true;

        // Add more permission logic as needed
        const rolePermissions: Record<string, string[]> = {
          [USER_ROLES.MANAGER]: ['view_reports', 'manage_inventory', 'manage_suppliers', 'process_sales'],
          [USER_ROLES.CASHIER]: ['process_sales', 'view_own_sales'],
          [USER_ROLES.STAFF]: ['view_inventory'],
        };

        return rolePermissions[state.user.role]?.includes(permission) ?? false;
      }
    }),
    {
      name: 'auth-store',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated
      }),
      // Sync token to localStorage when store rehydrates from persisted storage
      onRehydrateStorage: () => (state) => {
        // Validate token is actually a real JWT (not undefined/null strings)
        const token = state?.token;
        const isValidToken = token && token !== 'undefined' && token !== 'null' && token.length > 20;

        if (isValidToken) {
          localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token);
          if (state.user) {
            localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(state.user));
          }
        } else {
          // Clear invalid persisted auth state
          localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
          localStorage.removeItem(STORAGE_KEYS.USER);
        }
      }
    }
  )
);

/**
 * Hook to get auth status
 */
export function useAuth() {
  const {
    user,
    token,
    isAuthenticated,
    login,
    logout,
    updateUser,
    hasRole,
    hasAnyRole,
    isAdmin,
    isManager,
    canManageInventory,
    canManageUsers,
    canManageSuppliers,
    canProcessSales,
    canViewReports
  } = useAuthStore();

  return {
    user,
    token,
    isAuthenticated,
    login,
    logout,
    updateUser,
    hasRole,
    hasAnyRole,
    isAdmin,
    isManager,
    canManageInventory,
    canManageUsers,
    canManageSuppliers,
    canProcessSales,
    canViewReports
  };
}
