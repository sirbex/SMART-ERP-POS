import { createContext, useContext, useState, useEffect, useCallback, ReactNode, useMemo, useRef } from 'react';
import { storeTokens, clearTokens, getRefreshToken, setupAxiosInterceptors, isTokenExpired, willExpireInNext, refreshAccessTokenDeduped, resetAuthState } from '../hooks/useTokenRefresh';
import { apiClient } from '../utils/api';
import { useIdleTimeout } from '../hooks/useIdleTimeout';
import { useSessionKeepalive } from '../hooks/useSessionKeepalive';
import { useGlobalSessionActivity } from '../hooks/useGlobalSessionActivity';
import { setupAuthBroadcastListener, onAuthBroadcast, broadcastAuthEvent } from '../lib/authBroadcast';
import { setupOfflineQueueAutoFlush } from '../lib/offlineRequestQueue';
import { isUserActiveOrGuarded, isTransactionGuardActive } from '../lib/sessionActivity';
import {
  shouldIgnoreCrossTabSessionExpired,
  shouldPerformIdleLogout,
} from '../lib/sessionLogoutPolicy';
import {
  COLD_START_QUICK_LOGIN_HREF,
  markBrowserSessionAlive,
  shouldEnforceColdStartPinGate,
} from '../lib/sessionColdStartLock';
import type { AxiosError } from 'axios';
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
  /** Pre-loaded permission keys (session-embedded, no async race) */
  permissions: Set<string>;
  /** Force re-fetch permissions (e.g. after role change) */
  refreshPermissions: () => Promise<void>;
  login: (userData: User, token: string, refreshToken?: string, expiresIn?: number) => Promise<void>;
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
  const [permissionKeys, setPermissionKeys] = useState<string[]>([]);
  const pendingIdleLogoutRef = useRef(false);
  const IDLE_TIMEOUT_MS = 60 * 60 * 1000;

  // Global activity — all modules/tabs (enterprise SSOT; independent of idle/guard)
  useGlobalSessionActivity(isAuthenticated);

  // Proactive token refresh during long data-entry sessions (any module)
  useSessionKeepalive(isAuthenticated);

  const permissions = useMemo(() => {
    if (permissionKeys.length === 0) return EMPTY_PERMISSIONS;
    return new Set(permissionKeys);
  }, [permissionKeys]);

  useEffect(() => {
    // Initialize authentication state from localStorage
    // ERP pattern: load user + permissions BEFORE rendering routes
    const initAuth = async () => {
      try {
        let token = localStorage.getItem('auth_token');
        const savedUser = localStorage.getItem('user');

        if (token && savedUser) {
          const userData = JSON.parse(savedUser);

          // ── COLD-START / REBOOT PIN GATE (shared POS) ───────────────────────
          // localStorage survives reboot; sessionStorage does not. Without this,
          // the last cashier/waiter is silently restored and anyone can operate.
          if (
            shouldEnforceColdStartPinGate({
              role: userData.role,
              hasStoredSession: true,
            })
          ) {
            clearTokens();
            const path = typeof window !== 'undefined' ? window.location.pathname : '';
            const onAuthScreen =
              path.startsWith('/quick-login') ||
              path.startsWith('/login') ||
              path.startsWith('/platform');
            if (!onAuthScreen && typeof window !== 'undefined') {
              window.location.replace(COLD_START_QUICK_LOGIN_HREF);
            }
            return;
          }

          // ── PROACTIVE TOKEN REFRESH (Fix #1 + #4) ───────────────────────────
          // initAuth() uses raw fetch() below which bypasses the axios interceptor.
          // Refresh here first if the access token is expired or within 2 min of
          // expiry so the profile validation gets a fresh token, not a 401.
          if (navigator.onLine && (isTokenExpired() || willExpireInNext(2)) && getRefreshToken()) {
            try {
              await refreshAccessTokenDeduped();
              // Re-read the freshly stored token for the profile check below
              token = localStorage.getItem('auth_token') || token;
            } catch {
              // Refresh failed (revoked/expired refresh token) — fall through;
              // the profile check will return 401 and force a clean re-login.
            }
          }
          // ────────────────────────────────────────────────────────────────────────

          // ── SERVER-SIDE TOKEN VALIDATION ─────────────────────────────────────
          // SECURITY: Never trust localStorage alone. If online, verify the token
          // is still valid with the server before granting frontend access.
          // This prevents: expired sessions, revoked accounts, spoofed localStorage.
          if (navigator.onLine) {
            try {
              const profileController = new AbortController();
              const profileTimeout = setTimeout(() => profileController.abort(), 12_000);
              const validationRes = await apiClient.get('/auth/profile', {
                signal: profileController.signal,
              });
              clearTimeout(profileTimeout);
              // 200: sync role/id from server to prevent localStorage role spoofing
              if (validationRes.data?.success && validationRes.data?.data) {
                const serverUser = validationRes.data.data;
                userData.id = serverUser.id ?? userData.id;
                userData.email = serverUser.email ?? userData.email;
                userData.fullName = serverUser.fullName ?? serverUser.full_name ?? userData.fullName;
                userData.role = serverUser.role ?? userData.role;
                localStorage.setItem('user', JSON.stringify(userData));
              }
            } catch (err) {
              const axErr = err as AxiosError;
              const status = axErr?.response?.status;
              const aborted =
                axErr?.code === 'ERR_CANCELED' ||
                axErr?.code === 'ECONNABORTED' ||
                axErr?.message?.includes('aborted');
              if (aborted) {
                // Slow/unreachable API — use cached session; do not block the app
              } else if (status === 401 || status === 403) {
                // Token is invalid/revoked — interceptor already called clearTokens().
                // Just bail out of initAuth so we don't set isAuthenticated.
                return;
              }
              // Network error or 5xx — allow cached access (offline support)
            }
          }
          // ─────────────────────────────────────────────────────────────────────

          setUser(userData);
          setIsAuthenticated(true);
          markBrowserSessionAlive();

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
        // Clear corrupted auth data using the single authority
        clearTokens();
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

    // ── Multi-tab broadcast: react to auth events from other tabs ──
    const cleanupBroadcastListener = setupAuthBroadcastListener();
    const unsubscribeBroadcast = onAuthBroadcast((event) => {
      if (event.type === 'LOGOUT') {
        clearTokens();
        setUser(null);
        setIsAuthenticated(false);
        setPermissionKeys([]);
        const onLogin =
          window.location.pathname === '/login' || window.location.pathname.endsWith('/login');
        if (!onLogin) {
          window.location.href = '/login';
        }
        return;
      }
      if (event.type === 'SESSION_EXPIRED') {
        if (shouldIgnoreCrossTabSessionExpired(isUserActiveOrGuarded())) {
          return;
        }
        clearTokens();
        setUser(null);
        setIsAuthenticated(false);
        setPermissionKeys([]);
        const onLogin =
          window.location.pathname === '/login' || window.location.pathname.endsWith('/login');
        try {
          sessionStorage.setItem('session_expired', '1');
        } catch {
          /* ignore */
        }
        if (!onLogin) {
          window.location.href = '/login';
        }
      }
    });

    // ── Offline queue: auto-flush pending mutations when connectivity returns ──
    const cleanupOfflineQueue = setupOfflineQueueAutoFlush(apiClient);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('auth-changed', handleAuthChange);
      cleanupBroadcastListener();
      unsubscribeBroadcast();
      cleanupOfflineQueue();
    };
  }, []);

  const login = async (userData: User, token: string, refreshToken?: string, expiresIn?: number) => {
    if (!token || token === 'undefined' || token.length < 20) {
      throw new Error('Invalid token received from server');
    }

    // Store tokens FIRST (fetchPermissionKeys reads from localStorage)
    if (refreshToken && expiresIn) {
      storeTokens(token, refreshToken, expiresIn);
    } else {
      localStorage.setItem('auth_token', token);
    }
    localStorage.setItem('user', JSON.stringify(userData));

    // ERP pattern: fetch permissions BEFORE marking authenticated
    // This prevents the race where routes render with empty permissions
    const perms = await fetchPermissionKeys();
    if (perms.length > 0) {
      setPermissionKeys(perms);
      localStorage.setItem('rbac_permissions', JSON.stringify(perms));
    }

    // NOW set authenticated — routes will render with permissions already loaded
    setUser(userData);
    setIsAuthenticated(true);
    markBrowserSessionAlive();
    resetAuthState();

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
      // Revoke refresh token server-side (fire-and-forget)
      const refreshToken = getRefreshToken();
      if (refreshToken) {
        const baseUrl = import.meta.env.VITE_API_BASE_URL || '/api';
        const token = localStorage.getItem('auth_token');
        fetch(`${baseUrl}/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ refreshToken }),
          credentials: 'include',
        }).catch(() => { /* best-effort — don't block local cleanup */ });
      }

      // Broadcast to other tabs before clearing tokens
      broadcastAuthEvent({ type: 'LOGOUT' });

      // Clear all tokens using the single authority (also removes user + rbac_permissions)
      clearTokens();
      setUser(null);
      setIsAuthenticated(false);
      setPermissionKeys([]);

      // Notify other tabs/components about auth change
      window.dispatchEvent(new Event('auth-changed'));
    } catch (error) {
      console.error('Error during logout:', error);
    }
  }, []);

  // ── Auto-logout on idle (60 minutes without deliberate interaction) ────────
  const idleLogout = useCallback(() => {
    // SAP/Odoo: never idle-logout while this or any peer tab is still working.
    if (!shouldPerformIdleLogout(isUserActiveOrGuarded(IDLE_TIMEOUT_MS))) {
      return;
    }
    if (isTransactionGuardActive()) {
      pendingIdleLogoutRef.current = true;
      return;
    }
    pendingIdleLogoutRef.current = false;
    logout();
    sessionStorage.setItem('session_expired', '1');
  }, [logout, IDLE_TIMEOUT_MS]);

  useEffect(() => {
    const onGuard = (e: Event) => {
      const detail = (e as CustomEvent<{ active?: boolean }>).detail;
      if (detail?.active) return;
      if (!pendingIdleLogoutRef.current) return;
      if (!shouldPerformIdleLogout(isUserActiveOrGuarded(IDLE_TIMEOUT_MS))) {
        pendingIdleLogoutRef.current = false;
        return;
      }
      pendingIdleLogoutRef.current = false;
      logout();
      sessionStorage.setItem('session_expired', '1');
    };
    window.addEventListener('app:transaction-guard', onGuard);
    return () => window.removeEventListener('app:transaction-guard', onGuard);
  }, [logout, IDLE_TIMEOUT_MS]);

  useIdleTimeout({
    timeoutMs: IDLE_TIMEOUT_MS,
    onIdle: idleLogout,
    onWarning: () => {
      window.dispatchEvent(new CustomEvent('app:session-warning'));
      console.warn('[Auth] Session expiring in 60 seconds due to inactivity');
    },
    enabled: isAuthenticated,
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