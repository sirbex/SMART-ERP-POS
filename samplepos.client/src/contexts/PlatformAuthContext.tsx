// Platform Auth Context — Super Admin Authentication
// Completely separate from tenant AuthContext to avoid token collision

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { PlatformAdmin } from '../services/platformApi';

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

  // Initialize from localStorage on mount
  useEffect(() => {
    try {
      const storedToken = localStorage.getItem('platform_token');
      const storedAdmin = localStorage.getItem('platform_admin');
      if (storedToken && storedAdmin) {
        setAdmin(JSON.parse(storedAdmin));
      }
    } catch {
      localStorage.removeItem('platform_token');
      localStorage.removeItem('platform_admin');
    } finally {
      setIsLoading(false);
    }
  }, []);

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
