import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { storeTokens, clearTokens, setupAxiosInterceptors } from '../hooks/useTokenRefresh';

interface User {
  id: string;
  email: string;
  fullName: string;
  role: string;
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
    try {
      console.log('[AuthContext.login] Starting login process');
      console.log('[AuthContext.login] Token:', token ? `${token.substring(0, 30)}... (length: ${token.length})` : 'NULL/UNDEFINED');

      if (!token || token === 'undefined' || token.length < 20) {
        console.error('[AuthContext.login] Invalid token received!');
        throw new Error('Invalid token received from server');
      }

      // CRITICAL: Set state FIRST to ensure immediate UI updates
      setUser(userData);
      setIsAuthenticated(true);
      console.log('[AuthContext.login] ✅ State set immediately - isAuthenticated = true');

      // Then store tokens (storage operations are sync but state updates need to happen first)
      if (refreshToken && expiresIn) {
        storeTokens(token, refreshToken, expiresIn);
      } else {
        // Fallback for backward compatibility
        localStorage.setItem('auth_token', token);
      }
      localStorage.setItem('user', JSON.stringify(userData));

      // Verify it was saved correctly
      const savedToken = localStorage.getItem('auth_token');
      console.log('[AuthContext.login] ✅ Token saved to localStorage, verified:', savedToken === token);

      // Notify other tabs/components about auth change
      window.dispatchEvent(new Event('auth-changed'));
      console.log('[AuthContext.login] ✅ Login complete, auth-changed event dispatched');
    } catch (error) {
      console.error('Error during login:', error);
      throw new Error('Failed to save authentication data');
    }
  };

  const logout = () => {
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
  };

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