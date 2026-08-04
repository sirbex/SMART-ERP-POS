// QuickLoginScreen - SAP-style POS quick login page
// Direct PIN entry — system identifies user by unique PIN
// In-app number pad (Windows/OS soft keyboard is unreliable on POS tablets)

import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuickLogin, useTrustedDevices } from '../../hooks/useQuickLogin';
import { useHasPermission } from '../../authorization/useAuthorization';
import { toast } from 'react-hot-toast';
import { resolvePostLoginPath } from '../../utils/cashierLockdown';
import { takeRestaurantPostQuickLoginPath } from '../../utils/restaurantFohAutoLogout';
import { useAuth } from '../../contexts/AuthContext';
import {
  fetchRestaurantEnabled,
  restaurantEnabledQueryKey,
} from '../../hooks/useRestaurantEnabled';
import { useQueryClient } from '@tanstack/react-query';
import { PinNumPad } from '../../components/auth/PinNumPad';
import { requestSoftKeyboard } from '../../lib/softKeyboard';

// ============================================================
// Untrusted Device Screen (with admin self-registration)
// ============================================================

function UntrustedDeviceScreen({ onPasswordLogin, onRegistered }: { onPasswordLogin: () => void; onRegistered: () => void }) {
    const canManageTrustedDevices = useHasPermission('system.update');
    const { registerThisDevice, isLoading } = useTrustedDevices();

    const [showForm, setShowForm] = useState(false);
    const [deviceName, setDeviceName] = useState('');
    const [locationName, setLocationName] = useState('');

    const handleRegister = async () => {
        if (!deviceName.trim()) {
            toast.error('Device name is required');
            return;
        }
        try {
            await registerThisDevice(deviceName.trim(), locationName.trim() || undefined);
            toast.success('Device registered! Refreshing...');
            setShowForm(false);
            onRegistered();
        } catch {
            // Error shown via hook
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950
                    flex flex-col items-center justify-center p-8">
            <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-xl p-10 max-w-md text-center">
                <div className="text-5xl mb-4">🔒</div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-3">
                    Unregistered Device
                </h2>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                    Quick login is only available on trusted POS terminals.
                    {canManageTrustedDevices
                        ? ' You can register this device below.'
                        : ' Ask an administrator to register this device.'}
                </p>

                {canManageTrustedDevices && !showForm && (
                    <button
                        onClick={() => setShowForm(true)}
                        className="w-full px-6 py-3 bg-green-600 text-white rounded-xl font-medium
                       hover:bg-green-700 transition-colors mb-3"
                    >
                        Register This Device
                    </button>
                )}

                {canManageTrustedDevices && showForm && (
                    <div className="text-left mb-4 space-y-3">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Device Name *
                            </label>
                            <input
                                type="text"
                                inputMode="text"
                                enterKeyHint="next"
                                autoComplete="off"
                                value={deviceName}
                                onChange={(e) => setDeviceName(e.target.value)}
                                onFocus={(e) => requestSoftKeyboard(e.currentTarget)}
                                maxLength={255}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                           focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                placeholder="e.g. Front Counter POS"
                                autoFocus
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Location (optional)
                            </label>
                            <input
                                type="text"
                                inputMode="text"
                                enterKeyHint="done"
                                autoComplete="off"
                                value={locationName}
                                onChange={(e) => setLocationName(e.target.value)}
                                onFocus={(e) => requestSoftKeyboard(e.currentTarget)}
                                maxLength={255}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                           focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                placeholder="e.g. Main Store"
                            />
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={handleRegister}
                                disabled={isLoading}
                                className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700
                           disabled:opacity-50 text-sm font-medium"
                            >
                                {isLoading ? 'Registering...' : 'Register'}
                            </button>
                            <button
                                onClick={() => setShowForm(false)}
                                className="px-4 py-2.5 text-gray-600 hover:text-gray-800 dark:text-gray-400 text-sm"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                <button
                    onClick={onPasswordLogin}
                    className="px-6 py-3 bg-blue-600 text-white rounded-xl font-medium
                     hover:bg-blue-700 transition-colors w-full"
                >
                    Use Password Login
                </button>
            </div>
        </div>
    );
}

// ============================================================
// Main Quick Login Screen
// ============================================================

export default function QuickLoginScreen() {
    const navigate = useNavigate();
    const { permissions } = useAuth();
    const queryClient = useQueryClient();
    const {
        isLoading,
        error,
        isDeviceTrusted,
        loginWithPinOnly,
        refresh,
        clearError,
    } = useQuickLogin();

    const [pinLength, setPinLength] = useState(4);

    const handlePinComplete = useCallback(async (pin: string) => {
        try {
            // FOH hard-logout already stashed /restaurant — skip extra restaurant enabled RTT.
            let stashedReturn: string | null = null;
            try {
                stashedReturn = sessionStorage.getItem('restaurant_post_quick_login_path');
            } catch {
                stashedReturn = null;
            }

            const result = await loginWithPinOnly(pin);
            toast.success(`Welcome, ${result.user.fullName}!`);

            let enabled = stashedReturn === '/restaurant' || !!stashedReturn?.startsWith('/restaurant');
            if (!enabled) {
                enabled = await queryClient.fetchQuery({
                    queryKey: restaurantEnabledQueryKey,
                    queryFn: fetchRestaurantEnabled,
                });
            }
            const intended = takeRestaurantPostQuickLoginPath(
              enabled ? '/restaurant' : '/pos',
            );
            let perms: string[] = [];
            try {
                const raw = localStorage.getItem('rbac_permissions');
                if (raw) {
                    const parsed = JSON.parse(raw) as unknown;
                    if (Array.isArray(parsed)) perms = parsed.filter((p): p is string => typeof p === 'string');
                }
            } catch {
                perms = [...permissions];
            }
            navigate(
              resolvePostLoginPath(
                { role: result.user.role, permissions: perms, restaurantEnabled: enabled },
                intended,
              ),
              { replace: true },
            );
        } catch {
            // Error is handled by hook, shown in PinNumPad
        }
    }, [loginWithPinOnly, navigate, permissions, queryClient]);

    const handlePasswordLogin = useCallback(() => {
        navigate('/login');
    }, [navigate]);

    if (isDeviceTrusted === false) {
        return <UntrustedDeviceScreen onPasswordLogin={handlePasswordLogin} onRegistered={refresh} />;
    }

    if (isDeviceTrusted === null) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950
                      flex items-center justify-center">
                <div className="flex items-center gap-3 text-gray-500">
                    <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span className="text-lg">Checking device...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950
                    flex flex-col items-center justify-center p-8">
            <div className="text-center mb-8">
                <div className="text-5xl mb-4">🔐</div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                    POS Quick Login
                </h1>
                <p className="text-gray-500 dark:text-gray-400">
                    Enter your PIN to sign in
                </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-xl p-8 max-w-md w-full">
                <div className="flex flex-col items-center py-2">
                    <PinNumPad
                        length={pinLength}
                        onComplete={handlePinComplete}
                        error={error}
                        isLoading={isLoading}
                        label="Enter your personal PIN"
                    />
                    {isLoading ? (
                        <p className="mt-3 text-sm font-medium text-blue-600 dark:text-blue-400 animate-pulse">
                            Signing in…
                        </p>
                    ) : null}

                    <div className="flex gap-2 mt-6">
                        {[4, 5, 6].map((len) => (
                            <button
                                key={len}
                                type="button"
                                onClick={() => { setPinLength(len); clearError(); }}
                                className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${pinLength === len
                                        ? 'bg-blue-100 text-blue-700 font-medium'
                                        : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                                    }`}
                            >
                                {len}-digit
                            </button>
                        ))}
                    </div>
                </div>

                <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700 text-center">
                    <button
                        type="button"
                        onClick={handlePasswordLogin}
                        className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 font-medium"
                    >
                        Use email & password instead →
                    </button>
                </div>
            </div>

            <p className="mt-6 text-xs text-gray-400 dark:text-gray-600">
                Trusted POS Terminal • Individual accountability enforced
            </p>
        </div>
    );
}
