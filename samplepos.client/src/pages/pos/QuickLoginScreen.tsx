// QuickLoginScreen - SAP-style POS quick login page
// Direct PIN entry — system identifies user by unique PIN

import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuickLogin, useTrustedDevices } from '../../hooks/useQuickLogin';
import { useAuth } from '../../hooks/useAuth';
import { toast } from 'react-hot-toast';

// ============================================================
// PIN Input Component
// ============================================================

function PinInput({ length, onComplete, error, isLoading }: {
    length: number;
    onComplete: (pin: string) => void;
    error: string | null;
    isLoading: boolean;
}) {
    const [digits, setDigits] = useState<string[]>(Array(length).fill(''));
    const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

    useEffect(() => {
        inputsRef.current[0]?.focus();
    }, []);

    // Clear on error
    useEffect(() => {
        if (error) {
            setDigits(Array(length).fill(''));
            inputsRef.current[0]?.focus();
        }
    }, [error, length]);

    // Reset digits when length changes
    useEffect(() => {
        setDigits(Array(length).fill(''));
        inputsRef.current[0]?.focus();
    }, [length]);

    const handleChange = (index: number, value: string) => {
        if (!/^\d?$/.test(value)) return;

        const newDigits = [...digits];
        newDigits[index] = value;
        setDigits(newDigits);

        if (value && index < length - 1) {
            inputsRef.current[index + 1]?.focus();
        }

        // Auto-submit when all digits entered
        if (value && index === length - 1) {
            const pin = newDigits.join('');
            if (pin.length === length) {
                onComplete(pin);
            }
        }
    };

    const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
        if (e.key === 'Backspace' && !digits[index] && index > 0) {
            inputsRef.current[index - 1]?.focus();
        }
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        e.preventDefault();
        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
        if (pasted.length > 0) {
            const newDigits = Array(length).fill('');
            for (let i = 0; i < pasted.length; i++) {
                newDigits[i] = pasted[i];
            }
            setDigits(newDigits);
            if (pasted.length === length) {
                onComplete(pasted);
            } else {
                inputsRef.current[pasted.length]?.focus();
            }
        }
    };

    return (
        <div className="flex flex-col items-center gap-4">
            <div className="flex gap-3" onPaste={handlePaste}>
                {digits.map((digit, i) => (
                    <input
                        key={i}
                        ref={(el) => { inputsRef.current[i] = el; }}
                        type="password"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleChange(i, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(i, e)}
                        disabled={isLoading}
                        className="w-14 h-16 text-center text-2xl font-bold border-2 rounded-xl
                       focus:border-blue-500 focus:ring-2 focus:ring-blue-200
                       disabled:opacity-50 bg-white dark:bg-gray-800
                       border-gray-300 dark:border-gray-600"
                        aria-label={`PIN digit ${i + 1}`}
                    />
                ))}
            </div>

            {error && (
                <p className="text-red-500 text-sm font-medium animate-pulse" role="alert">{error}</p>
            )}

            {isLoading && (
                <div className="flex items-center gap-2 text-gray-500">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span>Verifying...</span>
                </div>
            )}
        </div>
    );
}

// ============================================================
// Untrusted Device Screen (with admin self-registration)
// ============================================================

function UntrustedDeviceScreen({ onPasswordLogin, onRegistered }: { onPasswordLogin: () => void; onRegistered: () => void }) {
    const { user } = useAuth();
    const isAdmin = user?.role === 'ADMIN' || user?.role === 'MANAGER';
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
            // Re-check device trust
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
                    {isAdmin
                        ? ' You can register this device below.'
                        : ' Ask an administrator to register this device.'}
                </p>

                {/* Admin self-registration */}
                {isAdmin && !showForm && (
                    <button
                        onClick={() => setShowForm(true)}
                        className="w-full px-6 py-3 bg-green-600 text-white rounded-xl font-medium
                       hover:bg-green-700 transition-colors mb-3"
                    >
                        Register This Device
                    </button>
                )}

                {isAdmin && showForm && (
                    <div className="text-left mb-4 space-y-3">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Device Name *
                            </label>
                            <input
                                type="text"
                                value={deviceName}
                                onChange={(e) => setDeviceName(e.target.value)}
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
                                value={locationName}
                                onChange={(e) => setLocationName(e.target.value)}
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
            const result = await loginWithPinOnly(pin);
            toast.success(`Welcome, ${result.user.fullName}!`);
            navigate('/pos', { replace: true });
        } catch {
            // Error is handled by hook, shown in PinInput
        }
    }, [loginWithPinOnly, navigate]);

    const handlePasswordLogin = useCallback(() => {
        navigate('/login');
    }, [navigate]);

    // Untrusted device state
    if (isDeviceTrusted === false) {
        return <UntrustedDeviceScreen onPasswordLogin={handlePasswordLogin} onRegistered={refresh} />;
    }

    // Loading state
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
            {/* Header */}
            <div className="text-center mb-10">
                <div className="text-5xl mb-4">🔐</div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                    POS Quick Login
                </h1>
                <p className="text-gray-500 dark:text-gray-400">
                    Enter your PIN to sign in
                </p>
            </div>

            {/* PIN Entry */}
            <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-xl p-8 max-w-md w-full">
                <div className="flex flex-col items-center py-4">
                    <p className="text-sm text-gray-500 mb-6 font-medium">Enter your personal PIN</p>

                    <PinInput
                        length={pinLength}
                        onComplete={handlePinComplete}
                        error={error}
                        isLoading={isLoading}
                    />

                    {/* PIN length toggle */}
                    <div className="flex gap-2 mt-6">
                        {[4, 5, 6].map((len) => (
                            <button
                                key={len}
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

                {/* Actions */}
                <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700 text-center">
                    <button
                        onClick={handlePasswordLogin}
                        className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 font-medium"
                    >
                        Use email & password instead →
                    </button>
                </div>
            </div>

            {/* Footer */}
            <p className="mt-6 text-xs text-gray-400 dark:text-gray-600">
                Trusted POS Terminal • Individual accountability enforced
            </p>
        </div>
    );
}
