import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { api } from '../utils/api';
import { TwoFactorVerifyModal } from '../components/auth/TwoFactorVerifyModal';
import { Shield } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await api.auth.login({ email, password });

      if (response.data.success && response.data.data) {
        // Super admin detected — redirect to platform portal
        if (response.data.data.isSuperAdmin && response.data.data.redirectTo) {
          navigate(response.data.data.redirectTo);
          return;
        }

        // Check if 2FA is required
        if (response.data.data.requires2FA) {
          setPendingUserId(response.data.data.userId);
          setRequires2FA(true);
          setLoading(false);
          return;
        }

        // Check if 2FA setup is required (role requires it but not set up)
        if (response.data.data.requires2FASetup) {
          const { user, token, accessToken, refreshToken, expiresIn } = response.data.data;
          login(user, accessToken || token, refreshToken, expiresIn);
          // Redirect to security settings to set up 2FA
          navigate('/settings/security', {
            state: { message: '2FA setup is required for your role. Please set it up now.' }
          });
          return;
        }

        const { user, token, accessToken, refreshToken, expiresIn } = response.data.data;
        login(user, accessToken || token, refreshToken, expiresIn);
        navigate('/dashboard');
      } else {
        setError(response.data.error || 'Login failed');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handle2FASuccess = (data: { user: any; token: string; accessToken?: string; refreshToken?: string; expiresIn?: number }) => {
    console.log('[LoginPage] 2FA Success - Full data:', data);
    console.log('[LoginPage] 2FA Success - User:', data.user);
    console.log('[LoginPage] 2FA Success - Token:', data.token ? `${data.token.substring(0, 30)}...` : 'MISSING');

    const token = data.accessToken || data.token;

    if (!token) {
      console.error('[LoginPage] 2FA Success - NO TOKEN FOUND!');
      setError('Authentication failed: No token received');
      setRequires2FA(false);
      setPendingUserId(null);
      return;
    }

    console.log('[LoginPage] 2FA Success - Calling login with token:', token.substring(0, 30) + '...');

    // Clear 2FA state BEFORE login to prevent any rendering issues
    setRequires2FA(false);
    setPendingUserId(null);

    // Login sets state synchronously now (fixed in AuthContext)
    login(data.user, token, data.refreshToken, data.expiresIn);

    console.log('[LoginPage] 2FA Success - Login complete, navigating immediately');
    // Navigate immediately - AuthContext sets state synchronously now
    navigate('/dashboard', { replace: true });
  };

  const handle2FACancel = () => {
    setRequires2FA(false);
    setPendingUserId(null);
    setEmail('');
    setPassword('');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      {requires2FA && pendingUserId && (
        <TwoFactorVerifyModal
          userId={pendingUserId}
          onSuccess={handle2FASuccess}
          onCancel={handle2FACancel}
        />
      )}

      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow-lg">
        <div>
          <h2 className="text-center text-3xl font-bold text-gray-900">
            SamplePOS
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Sign in to your account
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-50 border border-red-400 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="admin@samplepos.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="••••••••"
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>

          <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
            <Shield className="w-3 h-3" />
            <span>Protected by Two-Factor Authentication</span>
          </div>

          <div className="text-sm text-center text-gray-600">
            <p>Test credentials:</p>
            <p className="font-mono text-xs mt-1">
              test.admin@samplepos.com / TestAdmin123!
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
