// QuickLoginSettings - User profile section for managing PIN & biometric
// SAP-style: password required to set up quick login methods

import { useState, useEffect } from 'react';
import { useQuickLoginSettings, useTrustedDevices, getDeviceFingerprint } from '../../hooks/useQuickLogin';
import type { TrustedDevice } from '../../hooks/useQuickLogin';
import { useAuth } from '../../hooks/useAuth';
import { toast } from 'react-hot-toast';

export default function QuickLoginSettings() {
    const {
        status,
        isLoading,
        error,
        setupPin,
        removePin,
        registerBiometric,
        removeBiometric,
        clearError,
    } = useQuickLoginSettings();

    const [showPinSetup, setShowPinSetup] = useState(false);
    const [showBiometricSetup, setShowBiometricSetup] = useState(false);
    const [pin, setPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [password, setPassword] = useState('');
    const [biometricAvailable, setBiometricAvailable] = useState<boolean | null>(null);

    const supportsWebAuthn = typeof window !== 'undefined' &&
        !!window.PublicKeyCredential &&
        typeof navigator.credentials?.create === 'function';

    // Check if a platform authenticator (Windows Hello, Touch ID, etc.) is actually available
    useEffect(() => {
        if (supportsWebAuthn && window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable) {
            window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
                .then(available => setBiometricAvailable(available))
                .catch(() => setBiometricAvailable(false));
        } else {
            setBiometricAvailable(false);
        }
    }, [supportsWebAuthn]);

    const handleSetupPin = async () => {
        if (pin.length < 4 || pin.length > 6) {
            toast.error('PIN must be 4-6 digits');
            return;
        }
        if (!/^\d+$/.test(pin)) {
            toast.error('PIN must contain only digits');
            return;
        }
        if (pin !== confirmPin) {
            toast.error('PINs do not match');
            return;
        }
        if (!password) {
            toast.error('Current password is required');
            return;
        }

        try {
            await setupPin(pin, password);
            toast.success('PIN set up successfully');
            setShowPinSetup(false);
            setPin('');
            setConfirmPin('');
            setPassword('');
        } catch {
            // Error is shown via hook
        }
    };

    const handleRemovePin = async () => {
        if (!confirm('Remove your PIN? You will need to set up a new one to use PIN login.')) return;
        try {
            await removePin();
            toast.success('PIN removed');
        } catch {
            toast.error('Failed to remove PIN');
        }
    };

    const handleRegisterBiometric = async () => {
        if (!password) {
            toast.error('Current password is required');
            return;
        }
        try {
            await registerBiometric(password);
            toast.success('Biometric registered successfully');
            setShowBiometricSetup(false);
            setPassword('');
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to register biometric';
            toast.error(msg);
        }
    };

    const handleRemoveBiometric = async () => {
        if (!confirm('Remove biometric login? You will need to register again.')) return;
        try {
            await removeBiometric();
            toast.success('Biometric removed');
        } catch {
            toast.error('Failed to remove biometric');
        }
    };

    if (!status) {
        return (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Quick Login Methods</h3>
                <p className="text-sm text-gray-500">Loading...</p>
            </div>
        );
    }

    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Quick Login Methods</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Set up fast login methods for shared POS terminals. Your password remains required for admin operations.
                </p>
            </div>

            {error && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
                    <button onClick={clearError} className="text-xs text-red-500 hover:text-red-700 mt-1">Dismiss</button>
                </div>
            )}

            {/* Status badge */}
            <div className="flex items-center gap-2 mb-6">
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${status.quickLoginEnabled
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                    }`}>
                    {status.quickLoginEnabled ? '✓ Quick Login Enabled' : 'Quick Login Disabled'}
                </span>
            </div>

            {/* PIN Section */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">🔢</span>
                        <div>
                            <p className="font-medium text-gray-900 dark:text-gray-100">PIN Code</p>
                            <p className="text-xs text-gray-500">
                                {status.hasPIN ? '4-6 digit PIN is configured' : 'No PIN set up'}
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        {status.hasPIN ? (
                            <>
                                <button
                                    onClick={() => { setShowPinSetup(true); clearError(); }}
                                    className="text-sm px-3 py-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg"
                                >
                                    Change
                                </button>
                                <button
                                    onClick={handleRemovePin}
                                    disabled={isLoading}
                                    className="text-sm px-3 py-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                                >
                                    Remove
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={() => { setShowPinSetup(true); clearError(); }}
                                className="text-sm px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                            >
                                Set Up PIN
                            </button>
                        )}
                    </div>
                </div>

                {/* PIN Setup Form */}
                {showPinSetup && (
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                        <div className="space-y-3 max-w-sm">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    New PIN (4-6 digits)
                                </label>
                                <input
                                    type="password"
                                    inputMode="numeric"
                                    maxLength={6}
                                    value={pin}
                                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                             bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                             focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="Enter PIN"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Confirm PIN
                                </label>
                                <input
                                    type="password"
                                    inputMode="numeric"
                                    maxLength={6}
                                    value={confirmPin}
                                    onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                             bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                             focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="Re-enter PIN"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Current Password (required)
                                </label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                             bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                             focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="Your current password"
                                />
                            </div>
                            <div className="flex gap-2 pt-2">
                                <button
                                    onClick={handleSetupPin}
                                    disabled={isLoading}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700
                             disabled:opacity-50 text-sm font-medium"
                                >
                                    {isLoading ? 'Setting up...' : 'Save PIN'}
                                </button>
                                <button
                                    onClick={() => { setShowPinSetup(false); setPin(''); setConfirmPin(''); setPassword(''); }}
                                    className="px-4 py-2 text-gray-600 hover:text-gray-800 dark:text-gray-400 text-sm"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Biometric Section */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">👆</span>
                        <div>
                            <p className="font-medium text-gray-900 dark:text-gray-100">Biometric (Fingerprint / Face)</p>
                            <p className="text-xs text-gray-500">
                                {!supportsWebAuthn
                                    ? 'Not supported on this browser'
                                    : biometricAvailable === false
                                        ? 'No platform authenticator (Windows Hello / Touch ID) detected'
                                        : status.hasBiometric
                                            ? 'Biometric credential registered'
                                            : 'No biometric registered'
                                }
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        {!supportsWebAuthn || biometricAvailable === false ? (
                            <span className="text-xs text-gray-400 px-3 py-1.5">Unavailable</span>
                        ) : status.hasBiometric ? (
                            <>
                                <button
                                    onClick={() => { setShowBiometricSetup(true); clearError(); }}
                                    className="text-sm px-3 py-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg"
                                >
                                    Re-register
                                </button>
                                <button
                                    onClick={handleRemoveBiometric}
                                    disabled={isLoading}
                                    className="text-sm px-3 py-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                                >
                                    Remove
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={() => { setShowBiometricSetup(true); clearError(); }}
                                className="text-sm px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                            >
                                Register
                            </button>
                        )}
                    </div>
                </div>

                {/* Biometric Setup Form */}
                {showBiometricSetup && biometricAvailable && (
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                        <div className="space-y-3 max-w-sm">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Current Password (required)
                                </label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                             bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                             focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="Your current password"
                                />
                            </div>
                            <p className="text-xs text-gray-500">
                                After clicking Register, your device will prompt for fingerprint or face authentication.
                            </p>
                            <div className="flex gap-2 pt-2">
                                <button
                                    onClick={handleRegisterBiometric}
                                    disabled={isLoading}
                                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700
                             disabled:opacity-50 text-sm font-medium"
                                >
                                    {isLoading ? 'Registering...' : 'Register Biometric'}
                                </button>
                                <button
                                    onClick={() => { setShowBiometricSetup(false); setPassword(''); }}
                                    className="px-4 py-2 text-gray-600 hover:text-gray-800 dark:text-gray-400 text-sm"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Security note */}
            <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg">
                <p className="text-xs text-amber-700 dark:text-amber-400">
                    <strong>Security Note:</strong> Quick login methods are for fast POS access only.
                    Your full password is still required for admin panel, reports, settings, and approval operations.
                </p>
            </div>

            {/* Trusted Device Management (Admin/Manager only) */}
            <TrustedDevicesSection />
        </div>
    );
}

// ============================================================
// Trusted Devices Management (Admin/Manager only)
// ============================================================

function TrustedDevicesSection() {
    const { user } = useAuth();
    const isAdmin = user?.role === 'ADMIN' || user?.role === 'MANAGER';

    if (!isAdmin) return null;

    return <TrustedDevicesManager />;
}

function TrustedDevicesManager() {
    const {
        devices,
        isLoading,
        error,
        registerThisDevice,
        deactivateDevice,
        activateDevice,
        refresh,
        clearError,
    } = useTrustedDevices();

    const [showRegister, setShowRegister] = useState(false);
    const [deviceName, setDeviceName] = useState('');
    const [locationName, setLocationName] = useState('');

    const currentFingerprint = getDeviceFingerprint();
    const thisDeviceRegistered = devices.some(
        (d) => d.deviceFingerprint === currentFingerprint && d.isActive
    );

    const handleRegister = async () => {
        if (!deviceName.trim()) {
            toast.error('Device name is required');
            return;
        }
        try {
            await registerThisDevice(deviceName.trim(), locationName.trim() || undefined);
            toast.success('Device registered as trusted');
            setShowRegister(false);
            setDeviceName('');
            setLocationName('');
        } catch {
            // Error shown by hook
        }
    };

    const handleDeactivate = async (device: TrustedDevice) => {
        if (!confirm(`Deactivate "${device.deviceName}"? Quick login will stop working on that device.`)) return;
        try {
            await deactivateDevice(device.id);
            toast.success('Device deactivated');
        } catch {
            toast.error('Failed to deactivate');
        }
    };

    const handleActivate = async (device: TrustedDevice) => {
        try {
            await activateDevice(device.id);
            toast.success('Device re-activated');
        } catch {
            toast.error('Failed to activate');
        }
    };

    return (
        <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        Trusted POS Devices
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Manage which devices can use quick login. Only ADMIN/MANAGER can manage devices.
                    </p>
                </div>
                <button
                    onClick={refresh}
                    disabled={isLoading}
                    className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                    ↻ Refresh
                </button>
            </div>

            {error && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
                    <button onClick={clearError} className="text-xs text-red-500 hover:text-red-700 mt-1">Dismiss</button>
                </div>
            )}

            {/* Register this device button */}
            {!thisDeviceRegistered && !showRegister && (
                <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium text-blue-800 dark:text-blue-300">This device is not registered</p>
                        <p className="text-xs text-blue-600 dark:text-blue-400">Register it to enable quick login here.</p>
                    </div>
                    <button
                        onClick={() => setShowRegister(true)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                    >
                        Register This Device
                    </button>
                </div>
            )}

            {thisDeviceRegistered && (
                <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                    <p className="text-sm text-green-700 dark:text-green-400">✓ This device is registered as trusted.</p>
                </div>
            )}

            {/* Registration form */}
            {showRegister && (
                <div className="mb-4 p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                    <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">Register This Device</h4>
                    <div className="space-y-3 max-w-sm">
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
                                placeholder="e.g. Main Store, Branch 2"
                            />
                        </div>
                        <div className="flex gap-2 pt-2">
                            <button
                                onClick={handleRegister}
                                disabled={isLoading}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700
                           disabled:opacity-50 text-sm font-medium"
                            >
                                {isLoading ? 'Registering...' : 'Register'}
                            </button>
                            <button
                                onClick={() => { setShowRegister(false); setDeviceName(''); setLocationName(''); }}
                                className="px-4 py-2 text-gray-600 hover:text-gray-800 dark:text-gray-400 text-sm"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Device list */}
            {devices.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
                    No trusted devices registered yet.
                </p>
            ) : (
                <div className="space-y-2">
                    {devices.map((device) => (
                        <div
                            key={device.id}
                            className={`flex items-center justify-between p-3 rounded-lg border ${device.isActive
                                    ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800'
                                    : 'border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 opacity-60'
                                }`}
                        >
                            <div className="flex items-center gap-3">
                                <span className="text-lg">{device.isActive ? '🖥️' : '🚫'}</span>
                                <div>
                                    <p className="font-medium text-sm text-gray-900 dark:text-gray-100">
                                        {device.deviceName}
                                        {device.deviceFingerprint === currentFingerprint && (
                                            <span className="ml-2 text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded">
                                                This device
                                            </span>
                                        )}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                        {device.locationName ? `${device.locationName} • ` : ''}
                                        {device.isActive ? 'Active' : 'Deactivated'}
                                        {' • '}
                                        Added {new Date(device.createdAt).toLocaleDateString()}
                                    </p>
                                </div>
                            </div>
                            <div>
                                {device.isActive ? (
                                    <button
                                        onClick={() => handleDeactivate(device)}
                                        disabled={isLoading}
                                        className="text-xs px-3 py-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                                    >
                                        Deactivate
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => handleActivate(device)}
                                        disabled={isLoading}
                                        className="text-xs px-3 py-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg"
                                    >
                                        Re-activate
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
