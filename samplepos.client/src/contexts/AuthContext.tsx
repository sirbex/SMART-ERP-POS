import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
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
  login: (userData: User, token: string, refreshToken?: string, expiresIn?: number) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

// Setup axios interceptors once on load
setupAxiosInterceptors();

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Initialize authentication state from localStorage
    const initAuth = () => {
      try {
        const token = localStorage.getItem('auth_token');
        const savedUser = localStorage.getItem('user');

        if (token && savedUser) {
          const userData = JSON.parse(savedUser);
          setUser(userData);
          setIsAuthenticated(true);
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
        // Clear corrupted auth data
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user');
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

    // Notify other tabs/components
    window.dispatchEvent(new Event('auth-changed'));
  };

  const logout = useCallback(() => {
    try {
      // Clear all tokens using the new system
      clearTokens();
      localStorage.removeItem('user');
      setUser(null);
      setIsAuthenticated(false);

      // Notify other tabs/components about auth change
      window.dispatchEvent(new Event('auth-changed'));
    } catch (error) {
      console.error('Error during logout:', error);
    }
  }, []);

  // ── Auto-logout on idle (15 minutes of inactivity) ────────
  const idleLogout = useCallback(() => {
    logout();
    // Signal the login page to show "session expired" banner
    sessionStorage.setItem('session_expired', '1');
  }, [logout]);

  useIdleTimeout({
    timeoutMs: 5 * 60 * 1000, // 5 minutes
    onIdle: idleLogout,
    onWarning: () => {
      // Could integrate with a toast/notification system
      console.warn('[Auth] Session expiring in 60 seconds due to inactivity');
    },
    enabled: isAuthenticated,
  });

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, isLoading, login, logout }}>
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