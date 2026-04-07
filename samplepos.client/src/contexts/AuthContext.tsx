import { createContext, useContext, useState, useEffect, useCallback, ReactNode, useMemo } from 'react';
import { storeTokens, clearTokens, setupAxiosInterceptors } from '../hooks/useTokenRefresh';
import { useIdleTimeout } from '../hooks/useIdleTimeout';
import type { UserRole } from '../types';

interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** Pre-loaded permission keys (SAP/Odoo pattern: session-embedded, no async race) */
  permissions: Set<string>;
  /** Force re-fetch permissions (e.g. after role change) */
  refreshPermissions: () => Promise<void>;
  login: (userData: User, token: string, refreshToken?: string, expiresIn?: number) => void;
  logout: () => void;
}

const EMPTY_PERMISSIONS = new Set<string>();

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

// Setup axios interceptors once on load
setupAxiosInterceptors();

/**
 * Fetch permissions from /rbac/me/permissions using raw fetch (no axios dependency
 * risk during auth init). Returns an array of permission key strings.
 */
async function fetchPermissionKeys(): Promise<string[]> {
  try {
    const token = localStorage.getItem('auth_token');
    if (!token) return [];

    const baseUrl = import.meta.env.VITE_API_BASE_URL || '/api';
    const res = await fetch(`${baseUrl}/rbac/me/permissions`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];

    const json = await res.json();
    if (json.success && Array.isArray(json.data)) {
      return json.data.map((p: { permissionKey: string }) => p.permissionKey);
    }
    return [];
  } catch {
    // Network error / offline — use cached permissions
    return [];
  }
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [permissionKeys, setPermissionKeys] = useState<string[]>([]);

  // Memoize the Set so consumers don't re-render unnecessarily
  const permissions = useMemo(() => {
    if (permissionKeys.length === 0) return EMPTY_PERMISSIONS;
    return new Set(permissionKeys);
  }, [permissionKeys]);

  // Track online/offline state for idle timeout
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); };
  }, []);

  useEffect(() => {
    // Initialize authentication state from localStorage
    // SAP/Odoo pattern: load user + permissions BEFORE rendering routes
    const initAuth = async () => {
      try {
        const token = localStorage.getItem('auth_token');
        const savedUser = localStorage.getItem('user');

        if (token && savedUser) {
          const userData = JSON.parse(savedUser);
          setUser(userData);
          setIsAuthenticated(true);

          // Restore cached permissions immediately (prevents flash)
          const cachedPerms = localStorage.getItem('rbac_permissions');
          if (cachedPerms) {
            try { setPermissionKeys(JSON.parse(cachedPerms)); } catch { /* ignore corrupt cache */ }
          }

          // Then fetch fresh permissions from server (updates cache)
          const freshPerms = await fetchPermissionKeys();
          if (freshPerms.length > 0) {
            setPermissionKeys(freshPerms);
            localStorage.setItem('rbac_permissions', JSON.stringify(freshPerms));
          }
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
        // Clear corrupted auth data
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user');
        localStorage.removeItem('rbac_permissions');
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();

    // Listen for auth changes from other tabs/windows
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'auth_token' || event.key === 'user') {
        initAuth();
      }
    };

    // Listen for custom auth change events
    const handleAuthChange = () => {
      initAuth();
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('auth-changed', handleAuthChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('auth-changed', handleAuthChange);
    };
  }, []);

  const login = (userData: User, token: string, refreshToken?: string, expiresIn?: number) => {
    if (!token || token === 'undefined' || token.length < 20) {
      throw new Error('Invalid token received from server');
    }

    // Set state FIRST to ensure immediate UI updates
    setUser(userData);
    setIsAuthenticated(true);

    // Store tokens
    if (refreshToken && expiresIn) {
      storeTokens(token, refreshToken, expiresIn);
    } else {
      localStorage.setItem('auth_token', token);
    }
    localStorage.setItem('user', JSON.stringify(userData));

    // SAP/Odoo pattern: eagerly fetch permissions on login
    fetchPermissionKeys().then(perms => {
      if (perms.length > 0) {
        setPermissionKeys(perms);
        localStorage.setItem('rbac_permissions', JSON.stringify(perms));
      }
    });

    // Notify other tabs/components
    window.dispatchEvent(new Event('auth-changed'));
  };

  /** Force re-fetch permissions from server */
  const refreshPermissions = useCallback(async () => {
    const perms = await fetchPermissionKeys();
    if (perms.length > 0) {
      setPermissionKeys(perms);
      localStorage.setItem('rbac_permissions', JSON.stringify(perms));
    }
  }, []);

  const logout = useCallback(() => {
    try {
      // Clear all tokens using the new system
      clearTokens();
      localStorage.removeItem('user');
      localStorage.removeItem('rbac_permissions');
      setUser(null);
      setIsAuthenticated(false);
      setPermissionKeys([]);

      // Notify other tabs/components about auth change
      window.dispatchEvent(new Event('auth-changed'));
    } catch (error) {
      console.error('Error during logout:', error);
    }
  }, []);

  // ── Auto-logout on idle (10 minutes of inactivity) ────────
  const idleLogout = useCallback(() => {
    logout();
    // Signal the login page to show "session expired" banner
    sessionStorage.setItem('session_expired', '1');
  }, [logout]);

  useIdleTimeout({
    timeoutMs: 10 * 60 * 1000, // 10 minutes
    onIdle: idleLogout,
    onWarning: () => {
      // Could integrate with a toast/notification system
      console.warn('[Auth] Session expiring in 60 seconds due to inactivity');
    },
    enabled: isAuthenticated && isOnline, // Don't idle-logout when offline
  });

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, isLoading, permissions, refreshPermissions, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}