import { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { api } from '../utils/api';
import { TwoFactorVerifyModal } from '../components/auth/TwoFactorVerifyModal';
import type { UserRole } from '../types';
import { Shield, Eye, EyeOff, Loader2, AlertCircle, Store } from 'lucide-react';

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

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

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
          navigate('/settings/security', {
            state: { message: '2FA setup is required for your role. Please set it up now.' }
          });
          return;
        }

        const { user, token, accessToken, refreshToken, expiresIn } = loginData;
        login(user, accessToken || token, refreshToken, expiresIn);
        navigate(from, { replace: true });
      } else {
        setError(response.data.error || 'Login failed');
      }
    } catch (err: unknown) {
      if (err instanceof Error && 'response' in err) {
        const axiosErr = err as { response?: { data?: { error?: string } } };
        setError(axiosErr.response?.data?.error || 'Login failed. Please try again.');
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
