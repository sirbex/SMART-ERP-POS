import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { api } from '../utils/api';
import { TwoFactorVerifyModal } from '../components/auth/TwoFactorVerifyModal';
import type { UserRole } from '../types';
import { Shield, Eye, EyeOff, Loader2, AlertCircle, Store, WifiOff } from 'lucide-react';

/** Shape returned by POST /auth/login inside `data.data` */
interface LoginResponseData {
  isSuperAdmin?: boolean;
  redirectTo?: string;
  requires2FA?: boolean;
  userId?: string;
  requires2FASetup?: boolean;
  user: { id: string; email: string; fullName: string; role: UserRole };
  token: string;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
}

// ── Offline Login Utilities ──────────────────────────────────────
const OFFLINE_CREDENTIALS_KEY = 'offline_login_credentials';
const MAX_OFFLINE_USERS = 10;

interface OfflineCachedUser {
  email: string; // lowercase for matching
  hash: string; // PBKDF2-derived key (hex)
  salt: string; // per-user random salt (hex)
  user: { id: string; email: string; fullName: string; role: UserRole };
  cachedAt: number; // timestamp — evict oldest when over limit
}

/** Derive a key using PBKDF2-SHA256 with 100k iterations */
async function deriveKey(password: string, saltHex: string): Promise<string> {
  const enc = new TextEncoder();
  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map(b => parseInt(b, 16)));
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' }, keyMaterial, 256);
  return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function randomSalt(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Cache credential for offline login — supports up to MAX_OFFLINE_USERS */
export async function cacheLoginCredential(email: string, password: string, user: { id: string; email: string; fullName: string; role: UserRole }) {
  const normalEmail = email.toLowerCase().trim();
  const salt = randomSalt();
  const hash = await deriveKey(password, salt);

  let credentials: OfflineCachedUser[] = [];
  try {
    credentials = JSON.parse(localStorage.getItem(OFFLINE_CREDENTIALS_KEY) || '[]');
  } catch { /* corrupted — start fresh */ }

  // Remove existing entry for this user (update it)
  credentials = credentials.filter(c => c.email !== normalEmail);

  // Add new entry
  credentials.push({ email: normalEmail, hash, salt, user, cachedAt: Date.now() });

  // Evict oldest if over limit
  if (credentials.length > MAX_OFFLINE_USERS) {
    credentials.sort((a, b) => b.cachedAt - a.cachedAt);
    credentials = credentials.slice(0, MAX_OFFLINE_USERS);
  }

  localStorage.setItem(OFFLINE_CREDENTIALS_KEY, JSON.stringify(credentials));
}

/** Validate offline login against cached credentials (multi-user) */
async function validateOfflineLogin(email: string, password: string): Promise<{ id: string; email: string; fullName: string; role: UserRole } | null> {
  const normalEmail = email.toLowerCase().trim();

  // ── Try new multi-user cache (PBKDF2) ──
  let credentials: OfflineCachedUser[] = [];
  try {
    credentials = JSON.parse(localStorage.getItem(OFFLINE_CREDENTIALS_KEY) || '[]');
  } catch { /* corrupted */ }

  const entry = credentials.find(c => c.email === normalEmail);
  if (entry) {
    const inputHash = await deriveKey(password, entry.salt);
    if (inputHash === entry.hash) return entry.user;
    return null; // Wrong password — don't fall through to old key
  }

  // ── Fallback: migrate old single-user SHA-256 cache ──
  const OLD_KEY = 'offline_login_credential';
  try {
    const raw = localStorage.getItem(OLD_KEY);
    if (raw) {
      const { hash, user } = JSON.parse(raw);
      // Verify with the old SHA-256 method
      const enc = new TextEncoder();
      const data = enc.encode(`${normalEmail}:${password}`);
      const buf = await crypto.subtle.digest('SHA-256', data);
      const oldHash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
      if (oldHash === hash) {
        // Migrate to new format then clean up old key
        cacheLoginCredential(email, password, user).catch(() => { });
        localStorage.removeItem(OLD_KEY);
        return user;
      }
    }
  } catch { /* old key corrupted or crypto unavailable */ }

  return null;
}

/** Generate a distinct offline session token */
function generateOfflineToken(): string {
  const id = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('');
  return `offline-session-${Date.now()}-${id}`;
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); };
  }, []);

  // Where to go after login — honours ProtectedRoute's "from" state
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/dashboard';

  // Redirect if already authenticated
  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  // Show idle-logout message if redirected from session timeout
  const sessionExpired = (() => {
    const flag = sessionStorage.getItem('session_expired');
    if (flag) {
      sessionStorage.removeItem('session_expired'); // one-time display
      return true;
    }
    return (location.state as { sessionExpired?: boolean })?.sessionExpired === true;
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Offline login: validate against cached credentials
      if (!navigator.onLine) {
        try {
          const offlineUser = await validateOfflineLogin(email, password);
          if (offlineUser) {
            const existingToken = localStorage.getItem('auth_token') || generateOfflineToken();
            login(offlineUser, existingToken);
            navigate(from, { replace: true });
            return;
          }
        } catch {
          // crypto.subtle may be unavailable in non-HTTPS contexts
        }
        setError('Offline login failed. You must have logged in online at least once with these credentials.');
        return;
      }

      const response = await api.auth.login({ email, password });

      if (response.data.success && response.data.data) {
        const loginData = response.data.data as LoginResponseData;

        // Super admin detected — redirect to platform portal
        if (loginData.isSuperAdmin && loginData.redirectTo) {
          navigate(loginData.redirectTo);
          return;
        }

        // Check if 2FA is required
        if (loginData.requires2FA) {
          setPendingUserId(loginData.userId ?? null);
          setRequires2FA(true);
          setLoading(false);
          return;
        }

        // Check if 2FA setup is required (role requires it but not set up)
        if (loginData.requires2FASetup) {
          const { user, token, accessToken, refreshToken, expiresIn } = loginData;
          login(user, accessToken || token, refreshToken, expiresIn);
          // Cache for offline login
          await cacheLoginCredential(email, password, user);
          navigate('/settings/security', {
            state: { message: '2FA setup is required for your role. Please set it up now.' }
          });
          return;
        }

        const { user, token, accessToken, refreshToken, expiresIn } = loginData;
        login(user, accessToken || token, refreshToken, expiresIn);
        // Cache for offline login
        await cacheLoginCredential(email, password, user);
        navigate(from, { replace: true });
      } else {
        setError(response.data.error || 'Login failed');
      }
    } catch (err: unknown) {
      // Determine if this is a server-unreachable error (not a clear auth rejection)
      const axiosErr = err as { code?: string; response?: { status?: number; data?: { error?: string } } };
      const status = axiosErr.response?.status;
      const isServerUnreachable =
        !navigator.onLine ||
        axiosErr.code === 'ERR_NETWORK' ||
        axiosErr.code === 'ECONNABORTED' ||
        status === 502 || status === 503 || status === 504 ||
        !axiosErr.response; // No response at all = server unreachable

      // If server is unreachable, try offline login before showing error
      if (isServerUnreachable) {
        try {
          const offlineUser = await validateOfflineLogin(email, password);
          if (offlineUser) {
            const existingToken = localStorage.getItem('auth_token') || generateOfflineToken();
            login(offlineUser, existingToken);
            navigate(from, { replace: true });
            return;
          }
        } catch {
          // Offline validation failed (e.g. crypto.subtle unavailable) — fall through to error
        }
      }

      if (axiosErr.response?.data?.error) {
        setError(axiosErr.response.data.error);
      } else {
        setError(err instanceof Error ? err.message : 'Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handle2FASuccess = (data: {
    user: { id: string; email: string; fullName: string; role: string };
    token: string;
    accessToken?: string;
    refreshToken?: string;
    expiresIn?: number;
  }): void => {
    const token = data.accessToken || data.token;

    if (!token) {
      setError('Authentication failed: No token received');
      setRequires2FA(false);
      setPendingUserId(null);
      return;
    }

    // Clear 2FA state BEFORE login to prevent any rendering issues
    setRequires2FA(false);
    setPendingUserId(null);

    const authUser = {
      ...data.user,
      role: data.user.role as UserRole,
    };
    login(authUser, token, data.refreshToken, data.expiresIn);
    // Cache for offline login (email/password are still in component state)
    if (email && password) {
      cacheLoginCredential(email, password, authUser).catch(() => { });
    }
    navigate(from, { replace: true });
  };

  const handle2FACancel = () => {
    setRequires2FA(false);
    setPendingUserId(null);
    setEmail('');
    setPassword('');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 px-4">
      {requires2FA && pendingUserId && (
        <TwoFactorVerifyModal
          userId={pendingUserId}
          onSuccess={handle2FASuccess}
          onCancel={handle2FACancel}
        />
      )}

      <div className="max-w-md w-full">
        {/* Logo / Branding */}
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg mb-4">
            <Store className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
            SMART ERP
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Point of Sale &amp; Inventory Management
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">
            Sign in to your account
          </h2>

          {/* Session-expired banner */}
          {sessionExpired && !error && (
            <div className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>Your session expired due to inactivity. Please sign in again.</span>
            </div>
          )}

          {/* Offline mode banner */}
          {!isOnline && (
            <div className="mb-4 flex items-start gap-2 rounded-lg bg-orange-50 border border-orange-200 px-4 py-3 text-sm text-orange-800">
              <WifiOff className="w-4 h-4 mt-0.5 shrink-0" />
              <span>You are offline. Sign in with your last used credentials to continue working.</span>
            </div>
          )}

          <form className="space-y-5" onSubmit={handleSubmit}>
            {/* Error alert */}
            {error && (
              <div
                role="alert"
                aria-live="assertive"
                className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
              >
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                autoFocus
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                placeholder="you@company.com"
              />
            </div>

            {/* Password with visibility toggle */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full px-3 py-2.5 pr-10 border border-gray-300 rounded-lg text-sm shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-6 flex items-center justify-center gap-1.5 text-xs text-gray-400">
            <Shield className="w-3.5 h-3.5" />
            <span>Protected by Two-Factor Authentication</span>
          </div>
        </div>

        {/* Copyright */}
        <p className="mt-6 text-center text-xs text-gray-400">
          &copy; {new Date().getFullYear()} SMART ERP. All rights reserved.
        </p>
      </div>
    </div>
  );
}
