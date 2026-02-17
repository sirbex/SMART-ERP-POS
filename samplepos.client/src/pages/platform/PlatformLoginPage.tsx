// Platform Login Page — Super Admin Authentication
import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { usePlatformAuth } from '../../contexts/PlatformAuthContext';
import { platformApi } from '../../services/platformApi';
import { Shield, Server } from 'lucide-react';

export default function PlatformLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, isAuthenticated } = usePlatformAuth();
  const navigate = useNavigate();

  // If already authenticated, redirect to dashboard
  if (isAuthenticated) {
    return <Navigate to="/platform" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await platformApi.login(email, password);

      if (response.data.success && response.data.data) {
        const { token, admin } = response.data.data;
        login(admin, token);
        navigate('/platform');
      } else {
        setError(response.data.error || 'Login failed');
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setError(axiosErr.response?.data?.error || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-xl shadow-2xl">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mb-4">
            <Server className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Platform Admin</h2>
          <p className="mt-1 text-sm text-gray-500">
            Super admin access to manage tenants &amp; platform
          </p>
        </div>

        {/* Form */}
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="platform-email" className="block text-sm font-medium text-gray-700">
                Email address
              </label>
              <input
                id="platform-email"
                name="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="admin@smarterp.com"
              />
            </div>

            <div>
              <label htmlFor="platform-password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                id="platform-password"
                name="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Signing in...' : 'Sign in to Platform'}
          </button>

          <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
            <Shield className="w-3 h-3" />
            <span>Platform-scoped authentication</span>
          </div>
        </form>
      </div>
    </div>
  );
}
