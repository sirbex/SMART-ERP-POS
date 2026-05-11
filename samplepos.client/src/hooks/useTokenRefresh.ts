/**
 * Token Refresh API hooks and automatic token refresh logic
 * 
 * Features:
 * - Automatic token refresh before expiry
 * - Token rotation on each refresh
 * - Session management (view/revoke sessions)
 * - Axios interceptor for automatic refresh
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const API_BASE = '/api/auth/token';

// Token storage keys
const ACCESS_TOKEN_KEY = 'auth_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const TOKEN_EXPIRY_KEY = 'token_expiry';

export interface TokenConfig {
    accessTokenExpiryMinutes: number;
    refreshTokenExpiryDays: number;
}

export interface Session {
    id: string;
    createdAt: string;
    expiresAt: string;
    deviceInfo: string | null;
    ipAddress: string | null;
}

export interface TokenResponse {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    user?: {
        id: string;
        email: string;
        fullName: string;
        role: 'ADMIN' | 'MANAGER' | 'CASHIER' | 'STAFF';
    };
}

/**
 * Store tokens in localStorage
 */
export function storeTokens(accessToken: string, refreshToken: string, expiresIn: number) {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);

    // Calculate expiry timestamp (subtract 60 seconds buffer for refresh)
    const expiryTime = Date.now() + (expiresIn - 60) * 1000;
    localStorage.setItem(TOKEN_EXPIRY_KEY, expiryTime.toString());
}

/**
 * Get stored access token
 */
export function getAccessToken(): string | null {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
}

/**
 * Get stored refresh token
 */
export function getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
}

/**
 * Clear ALL authentication state — the single place allowed to do this.
 * Removes tokens, user, permissions, and the cross-tab refresh lock.
 */
export function clearTokens() {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(TOKEN_EXPIRY_KEY);
    localStorage.removeItem('user');
    localStorage.removeItem('rbac_permissions');
    localStorage.removeItem(REFRESH_LOCK_KEY);
}

/**
 * Check if token is expired or about to expire
 */
export function isTokenExpired(): boolean {
    const expiryTime = localStorage.getItem(TOKEN_EXPIRY_KEY);
    if (!expiryTime) return true;
    return Date.now() >= parseInt(expiryTime, 10);
}

/**
 * Check if token will expire within the given number of minutes.
 * Used for proactive refresh on app boot (Fix #4).
 */
export function willExpireInNext(minutes: number): boolean {
    const expiryTime = localStorage.getItem(TOKEN_EXPIRY_KEY);
    if (!expiryTime) return true;
    return Date.now() >= parseInt(expiryTime, 10) - minutes * 60 * 1000;
}

// ── Cross-tab refresh mutex (Fix #2) ─────────────────────────────────────────
// Prevents two browser tabs from refreshing the same refresh token simultaneously,
// which would trigger token-reuse detection and revoke the entire token family.
const REFRESH_LOCK_KEY = 'refresh_lock';
const REFRESH_LOCK_TTL = 5000; // ms — stale lock timeout

async function waitForRefreshLock(): Promise<void> {
    const maxWait = 6000;
    const start = Date.now();
    while (true) {
        const lockTime = localStorage.getItem(REFRESH_LOCK_KEY);
        const lockAge = lockTime ? Date.now() - parseInt(lockTime, 10) : Infinity;
        if (lockAge >= REFRESH_LOCK_TTL) {
            // Lock absent or stale — acquire it
            localStorage.setItem(REFRESH_LOCK_KEY, Date.now().toString());
            return;
        }
        if (Date.now() - start >= maxWait) {
            // Waited too long — force-acquire to prevent deadlock
            localStorage.setItem(REFRESH_LOCK_KEY, Date.now().toString());
            return;
        }
        await new Promise<void>(resolve => setTimeout(resolve, 500));
    }
}

function releaseRefreshLock(): void {
    localStorage.removeItem(REFRESH_LOCK_KEY);
}
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Refresh the access token.
 * Exported so AuthContext.initAuth() can call it directly before the profile
 * check (Fix #1), bypassing the axios interceptor which won't fire for raw fetch().
 *
 * Internally protected by a cross-tab localStorage mutex (Fix #2) so only one
 * tab refreshes at a time.
 */
/**
 * Refresh the access token — the ONLY place in the app allowed to call /auth/token.
 *
 * Protected by a cross-tab localStorage mutex so only one tab refreshes at a time.
 * After acquiring the lock it re-checks: if another tab already refreshed while
 * we were waiting, it returns immediately without making a network request.
 *
 * Throws on genuine auth rejection (expired/revoked refresh token).
 * Does NOT throw on network errors — callers must handle offline gracefully.
 */
export async function refreshAccessToken(): Promise<void> {
    // Acquire cross-tab lock before doing anything
    await waitForRefreshLock();
    try {
        // Re-check after acquiring lock — another tab may have already refreshed.
        if (!isTokenExpired()) {
            return; // Token is still fresh — nothing to do.
        }

        const refreshToken = getRefreshToken();
        if (!refreshToken) {
            throw new Error('No refresh token available');
        }

        const response = await axios.post(`${API_BASE}/refresh`, { refreshToken });
        const data = response.data.data as TokenResponse;

        storeTokens(data.accessToken, data.refreshToken, data.expiresIn);
    } finally {
        releaseRefreshLock();
    }
}

// ── In-process refresh deduplication ─────────────────────────────────────────
// Prevents multiple concurrent requests within the SAME tab from each calling
// refreshAccessToken() simultaneously. The cross-tab lock handles cross-tab.
// Together they ensure exactly ONE network call reaches /auth/token at any time.
let _inProcessRefresh: Promise<void> | null = null;

/**
 * Refresh once, deduplicating concurrent in-tab callers.
 * Returns the shared promise so all callers await the same request.
 */
function _refreshOnce(): Promise<void> {
    if (!_inProcessRefresh) {
        _inProcessRefresh = refreshAccessToken().finally(() => {
            _inProcessRefresh = null;
        });
    }
    return _inProcessRefresh;
}

/**
 * Build a standardised 401 response handler for any axios instance.
 * On 401: refresh once (via _refreshOnce) then retry the original request.
 * On genuine auth failure: clear tokens and redirect to /login.
 * On network error: preserve tokens (offline support).
 */
export function build401Handler(
    instance: ReturnType<typeof axios.create> | typeof axios
) {
    return async (error: AxiosError): Promise<unknown> => {
        const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

        if (error.response?.status === 401 && !originalRequest?._retry) {
            if (!navigator.onLine) return Promise.reject(error);

            originalRequest._retry = true;

            if (getRefreshToken()) {
                try {
                    await _refreshOnce();
                    const token = getAccessToken();
                    if (token && originalRequest.headers) {
                        originalRequest.headers.Authorization = `Bearer ${token}`;
                    }
                    return (instance as typeof axios)(originalRequest);
                } catch (refreshError) {
                    const isNetworkError = refreshError instanceof Error &&
                        (!('response' in refreshError) || (refreshError as AxiosError).response == null);
                    if (navigator.onLine && !isNetworkError) {
                        clearTokens();
                        sessionStorage.setItem('session_expired', '1');
                        if (window.location.pathname !== '/login') {
                            window.location.href = '/login';
                        }
                    }
                    return Promise.reject(refreshError);
                }
            }
            // No refresh token — clear and redirect
            clearTokens();
            sessionStorage.setItem('session_expired', '1');
            if (window.location.pathname !== '/login') {
                window.location.href = '/login';
            }
        }

        return Promise.reject(error);
    };
}

/**
 * Attach standard auth interceptors to any axios instance.
 * Request: attach token + pre-emptive refresh if expired.
 * Response: 401 → refresh once → retry, auth failure → logout.
 */
export function attachAuthInterceptors(
    instance: ReturnType<typeof axios.create>,
    opts?: { extraRequestHeaders?: (config: InternalAxiosRequestConfig) => void }
): void {
    // ── Request: attach token, pre-emptively refresh if about to expire ──
    instance.interceptors.request.use(
        async (config: InternalAxiosRequestConfig) => {
            if (
                config.url?.includes('/login') ||
                config.url?.includes('/register') ||
                config.url?.includes('/token/refresh') ||
                config.url?.includes('/token/config') ||
                config.url?.includes('/password/policy')
            ) {
                return config;
            }

            if (isTokenExpired() && getRefreshToken() && navigator.onLine) {
                try { await _refreshOnce(); } catch { /* handled in response interceptor */ }
            }

            const token = getAccessToken();
            if (token) config.headers.Authorization = `Bearer ${token}`;
            opts?.extraRequestHeaders?.(config);
            return config;
        },
        (error) => Promise.reject(error)
    );

    // ── Response: 401 → refresh once → retry ──
    instance.interceptors.response.use(
        (response) => response,
        build401Handler(instance)
    );
}

/**
 * Setup interceptors on the global axios instance.
 * Called once from AuthContext on app boot.
 */
export function setupAxiosInterceptors(): void {
    // Request interceptor on global axios
    axios.interceptors.request.use(
        async (config: InternalAxiosRequestConfig) => {
            if (
                config.url?.includes('/login') ||
                config.url?.includes('/register') ||
                config.url?.includes('/token/refresh') ||
                config.url?.includes('/token/config') ||
                config.url?.includes('/password/policy')
            ) {
                return config;
            }

            if (isTokenExpired() && getRefreshToken() && navigator.onLine) {
                try { await _refreshOnce(); } catch { /* handled in response interceptor */ }
            }

            const token = getAccessToken();
            if (token) config.headers.Authorization = `Bearer ${token}`;
            return config;
        },
        (error) => Promise.reject(error)
    );

    axios.interceptors.response.use(
        (response) => response,
        build401Handler(axios)
    );
}

/**
 * Hook: Get token configuration
 */
export function useTokenConfig() {
    return useQuery({
        queryKey: ['token-config'],
        queryFn: async (): Promise<TokenConfig> => {
            const response = await axios.get(`${API_BASE}/config`);
            return response.data.data;
        },
        staleTime: 1000 * 60 * 60, // Cache for 1 hour
    });
}

/**
 * Hook: Refresh tokens manually
 */
export function useRefreshToken() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async () => {
            return refreshAccessToken();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['user-sessions'] });
        },
    });
}

/**
 * Hook: Get active sessions
 */
export function useUserSessions() {
    return useQuery({
        queryKey: ['user-sessions'],
        queryFn: async (): Promise<{ sessions: Session[]; count: number }> => {
            const token = getAccessToken();
            const response = await axios.get(`${API_BASE}/sessions`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            return response.data.data;
        },
        enabled: !!getAccessToken(),
    });
}

/**
 * Hook: Revoke a specific session
 */
export function useRevokeSession() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (sessionId: string) => {
            const token = getAccessToken();
            await axios.delete(`${API_BASE}/sessions/${sessionId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['user-sessions'] });
        },
    });
}

/**
 * Hook: Revoke all sessions (logout everywhere)
 */
export function useRevokeAllSessions() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async () => {
            const token = getAccessToken();
            const response = await axios.post(`${API_BASE}/revoke-all`, {}, {
                headers: { Authorization: `Bearer ${token}` },
            });
            return response.data.data;
        },
        onSuccess: () => {
            clearTokens();
            queryClient.clear();
            window.location.href = '/login';
        },
    });
}

/**
 * Hook: Single session logout
 */
export function useLogoutSession() {
    return useMutation({
        mutationFn: async () => {
            const refreshToken = getRefreshToken();
            if (refreshToken) {
                await axios.post(`${API_BASE}/revoke`, { refreshToken });
            }
            clearTokens();
        },
    });
}
