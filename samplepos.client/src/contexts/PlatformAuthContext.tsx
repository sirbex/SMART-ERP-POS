// Platform Auth Context — Super Admin Authentication
// Completely separate from tenant AuthContext to avoid token collision

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { PlatformAdmin } from '../services/platformApi';

/** Decode JWT payload without verification (client-side expiry check only) */
function decodeJwtPayload(token: string): { exp?: number } | null {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const payload = JSON.parse(atob(parts[1]));
        return payload;
    } catch {
        return null;
    }
}

/** Check if a JWT token has expired (with 60s buffer for clock skew) */
function isTokenExpired(token: string): boolean {
    const payload = decodeJwtPayload(token);
    if (!payload?.exp) return true;
    return Date.now() >= (payload.exp * 1000) - 60000;
}

interface PlatformAuthState {
    admin: PlatformAdmin | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (admin: PlatformAdmin, token: string) => void;
    logout: () => void;
}

const PlatformAuthContext = createContext<PlatformAuthState | undefined>(undefined);

export function PlatformAuthProvider({ children }: { children: ReactNode }) {
    const [admin, setAdmin] = useState<PlatformAdmin | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Initialize from localStorage on mount — validate token is not expired
    useEffect(() => {
        try {
            const storedToken = localStorage.getItem('platform_token');
            const storedAdmin = localStorage.getItem('platform_admin');
            if (storedToken && storedAdmin) {
                if (isTokenExpired(storedToken)) {
                    // Token expired — clear credentials silently
                    localStorage.removeItem('platform_token');
                    localStorage.removeItem('platform_admin');
                } else {
                    setAdmin(JSON.parse(storedAdmin));
                }
            }
        } catch {
            localStorage.removeItem('platform_token');
            localStorage.removeItem('platform_admin');
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Periodic expiry check — auto-logout when token expires while user is active
    useEffect(() => {
        if (!admin) return;
        const interval = setInterval(() => {
            const token = localStorage.getItem('platform_token');
            if (!token || isTokenExpired(token)) {
                localStorage.removeItem('platform_token');
                localStorage.removeItem('platform_admin');
                setAdmin(null);
            }
        }, 60000); // Check every minute
        return () => clearInterval(interval);
    }, [admin]);

    const login = useCallback((adminData: PlatformAdmin, token: string) => {
        localStorage.setItem('platform_token', token);
        localStorage.setItem('platform_admin', JSON.stringify(adminData));
        setAdmin(adminData);
    }, []);

    const logout = useCallback(() => {
        localStorage.removeItem('platform_token');
        localStorage.removeItem('platform_admin');
        setAdmin(null);
    }, []);

    return (
        <PlatformAuthContext.Provider
            value={{
                admin,
                isAuthenticated: !!admin,
                isLoading,
                login,
                logout,
            }}
        >
            {children}
        </PlatformAuthContext.Provider>
    );
}

export function usePlatformAuth() {
    const context = useContext(PlatformAuthContext);
    if (!context) {
        throw new Error('usePlatformAuth must be used within PlatformAuthProvider');
    }
    return context;
}
