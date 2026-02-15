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
        role: string;
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
 * Clear all tokens
 */
export function clearTokens() {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(TOKEN_EXPIRY_KEY);
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
 * Refresh the access token
 */
async function refreshAccessToken(): Promise<TokenResponse> {
    const refreshToken = getRefreshToken();

    if (!refreshToken) {
        throw new Error('No refresh token available');
    }

    const response = await axios.post(`${API_BASE}/refresh`, { refreshToken });
    const data = response.data.data as TokenResponse;

    // Store the new tokens
    storeTokens(data.accessToken, data.refreshToken, data.expiresIn);

    return data;
}

// Track if we're currently refreshing to prevent multiple refresh calls
let isRefreshing = false;
let refreshPromise: Promise<TokenResponse> | null = null;

/**
 * Axios request interceptor - adds auth header and refreshes token if needed
 */
export function setupAxiosInterceptors() {
    // Request interceptor
    axios.interceptors.request.use(
        async (config: InternalAxiosRequestConfig) => {
            // Skip auth for public routes
            if (
                config.url?.includes('/login') ||
                config.url?.includes('/register') ||
                config.url?.includes('/token/refresh') ||
                config.url?.includes('/token/config') ||
                config.url?.includes('/password/policy')
            ) {
                return config;
            }

            // Check if token needs refresh
            if (isTokenExpired() && getRefreshToken()) {
                if (!isRefreshing) {
                    isRefreshing = true;
                    refreshPromise = refreshAccessToken()
                        .finally(() => {
                            isRefreshing = false;
                            refreshPromise = null;
                        });
                }

                try {
                    await refreshPromise;
                } catch (error) {
                    // If refresh fails, clear tokens and redirect to login
                    clearTokens();
                    window.location.href = '/login';
                    throw error;
                }
            }

            // Add current access token to request
            const token = getAccessToken();
            if (token) {
                config.headers.Authorization = `Bearer ${token}`;
            }

            return config;
        },
        (error) => Promise.reject(error)
    );

    // Response interceptor - handle 401 errors
    axios.interceptors.response.use(
        (response) => response,
        async (error: AxiosError) => {
            const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

            // If 401 and not already retried, try to refresh
            if (error.response?.status === 401 && !originalRequest._retry) {
                originalRequest._retry = true;

                const refreshToken = getRefreshToken();
                if (refreshToken) {
                    try {
                        await refreshAccessToken();

                        // Retry the original request with new token
                        const token = getAccessToken();
                        if (token) {
                            originalRequest.headers.Authorization = `Bearer ${token}`;
                        }
                        return axios(originalRequest);
                    } catch (refreshError) {
                        // Refresh failed - clear tokens and redirect
                        clearTokens();
                        window.location.href = '/login';
                        return Promise.reject(refreshError);
                    }
                }
            }

            return Promise.reject(error);
        }
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
