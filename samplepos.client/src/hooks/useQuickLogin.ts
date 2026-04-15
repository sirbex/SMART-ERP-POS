// useQuickLogin - Hook for SAP-style POS quick login
// Handles PIN input, WebAuthn biometric, user list, device trust

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../utils/api';
import { useAuth } from './useAuth';

// ============================================================
// Types
// ============================================================

export interface QuickLoginUser {
    id: string;
    fullName: string;
    role: string;
    hasPIN: boolean;
    hasBiometric: boolean;
}

export interface QuickLoginStatus {
    quickLoginEnabled: boolean;
    hasPIN: boolean;
    hasBiometric: boolean;
}

interface QuickLoginResult {
    user: { id: string; email: string; fullName: string; role: string };
    accessToken: string;
    token: string;
    refreshToken: string;
    expiresIn: number;
    method: 'PIN' | 'BIOMETRIC';
}

// ============================================================
// Device Fingerprint
// ============================================================

/**
 * Generate a browser-based device fingerprint.
 * Uses a combination of navigator properties + canvas + screen.
 * Stored in localStorage for persistence across sessions.
 */
export function getDeviceFingerprint(): string {
    const stored = localStorage.getItem('__pos_device_fp');
    if (stored) return stored;

    const raw = [
        navigator.userAgent,
        navigator.language,
        screen.width,
        screen.height,
        screen.colorDepth,
        new Date().getTimezoneOffset(),
        navigator.hardwareConcurrency || 0,
    ].join('|');

    // Simple hash (cyrb53)
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < raw.length; i++) {
        const ch = raw.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);

    const fp = `fp-${(4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)}`;
    localStorage.setItem('__pos_device_fp', fp);
    return fp;
}

// ============================================================
// Quick Login Hook
// ============================================================

export function useQuickLogin() {
    const { login: authLogin } = useAuth();
    const [users, setUsers] = useState<QuickLoginUser[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isDeviceTrusted, setIsDeviceTrusted] = useState<boolean | null>(null);
    const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const fetchUsers = useCallback(async () => {
        try {
            const res = await apiClient.get('/auth/quick-login/users');
            if (res.data.success) {
                setUsers(res.data.data);
            }
        } catch (err) {
            // Silently fail — user list might not be available offline initially
            console.warn('Failed to fetch quick login users:', err);
        }
    }, []);

    const checkDeviceTrust = useCallback(async () => {
        try {
            const fp = getDeviceFingerprint();
            const res = await apiClient.post('/auth/quick-login/check-device', { deviceFingerprint: fp });
            setIsDeviceTrusted(res.data.data?.trusted ?? false);
        } catch {
            setIsDeviceTrusted(false);
        }
    }, []);

    // Auto-refresh user list every 30 seconds
    useEffect(() => {
        fetchUsers();
        checkDeviceTrust();

        refreshTimerRef.current = setInterval(fetchUsers, 30_000);
        return () => {
            if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
        };
    }, [fetchUsers, checkDeviceTrust]);

    const loginWithPin = useCallback(async (userId: string, pin: string): Promise<QuickLoginResult> => {
        setIsLoading(true);
        setError(null);

        try {
            const fp = getDeviceFingerprint();
            const res = await apiClient.post('/auth/quick-login/pin', {
                userId,
                pin,
                deviceFingerprint: fp,
            });

            if (!res.data.success) {
                throw new Error(res.data.error || 'Quick login failed');
            }

            const data: QuickLoginResult = res.data.data;

            // Use AuthContext login to store tokens + set authenticated state
            await authLogin(
                data.user as { id: string; email: string; fullName: string; role: 'ADMIN' | 'MANAGER' | 'CASHIER' | 'STAFF' },
                data.accessToken,
                data.refreshToken,
                data.expiresIn
            );

            return data;
        } catch (err: unknown) {
            const axiosErr = err as { response?: { data?: { error?: string; error_code?: string; data?: Record<string, unknown> } } };
            const msg = axiosErr.response?.data?.error || (err instanceof Error ? err.message : 'Quick login failed');
            setError(msg);
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [authLogin]);

    const loginWithPinOnly = useCallback(async (pin: string): Promise<QuickLoginResult> => {
        setIsLoading(true);
        setError(null);

        try {
            const fp = getDeviceFingerprint();
            const res = await apiClient.post('/auth/quick-login/pin-only', {
                pin,
                deviceFingerprint: fp,
            });

            if (!res.data.success) {
                throw new Error(res.data.error || 'Quick login failed');
            }

            const data: QuickLoginResult = res.data.data;

            await authLogin(
                data.user as { id: string; email: string; fullName: string; role: 'ADMIN' | 'MANAGER' | 'CASHIER' | 'STAFF' },
                data.accessToken,
                data.refreshToken,
                data.expiresIn
            );

            return data;
        } catch (err: unknown) {
            const axiosErr = err as { response?: { data?: { error?: string; error_code?: string; data?: Record<string, unknown> } } };
            const msg = axiosErr.response?.data?.error || (err instanceof Error ? err.message : 'Quick login failed');
            setError(msg);
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [authLogin]);

    const loginWithBiometric = useCallback(async (userId: string): Promise<QuickLoginResult> => {
        setIsLoading(true);
        setError(null);

        try {
            // Trigger WebAuthn authentication
            const credential = await navigator.credentials.get({
                publicKey: {
                    challenge: crypto.getRandomValues(new Uint8Array(32)),
                    timeout: 60000,
                    rpId: window.location.hostname,
                    userVerification: 'required',
                },
            }) as PublicKeyCredential | null;

            if (!credential) {
                throw new Error('Biometric authentication was cancelled');
            }

            const assertionResponse = credential.response as AuthenticatorAssertionResponse;

            const fp = getDeviceFingerprint();
            const res = await apiClient.post('/auth/quick-login/biometric', {
                userId,
                webauthnResponse: {
                    credentialId: credential.id,
                    authenticatorData: btoa(String.fromCharCode(...new Uint8Array(assertionResponse.authenticatorData))),
                    clientDataJSON: btoa(String.fromCharCode(...new Uint8Array(assertionResponse.clientDataJSON))),
                    signature: btoa(String.fromCharCode(...new Uint8Array(assertionResponse.signature))),
                },
                deviceFingerprint: fp,
            });

            if (!res.data.success) {
                throw new Error(res.data.error || 'Biometric login failed');
            }

            const data: QuickLoginResult = res.data.data;

            await authLogin(
                data.user as { id: string; email: string; fullName: string; role: 'ADMIN' | 'MANAGER' | 'CASHIER' | 'STAFF' },
                data.accessToken,
                data.refreshToken,
                data.expiresIn
            );

            return data;
        } catch (err: unknown) {
            const axiosErr = err as { response?: { data?: { error?: string } } };
            const msg = axiosErr.response?.data?.error || (err instanceof Error ? err.message : 'Biometric login failed');
            setError(msg);
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [authLogin]);

    const refresh = useCallback(() => {
        fetchUsers();
        checkDeviceTrust();
    }, [fetchUsers, checkDeviceTrust]);

    return {
        users,
        isLoading,
        error,
        isDeviceTrusted,
        loginWithPin,
        loginWithPinOnly,
        loginWithBiometric,
        refresh,
        clearError: () => setError(null),
    };
}

// ============================================================
// Quick Login Settings Hook (for profile page)
// ============================================================

export function useQuickLoginSettings() {
    const [status, setStatus] = useState<QuickLoginStatus | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchStatus = useCallback(async () => {
        try {
            const res = await apiClient.get('/auth/quick-login/status');
            if (res.data.success) {
                setStatus(res.data.data);
            }
        } catch (err) {
            console.warn('Failed to fetch quick login status:', err);
        }
    }, []);

    useEffect(() => {
        fetchStatus();
    }, [fetchStatus]);

    const setupPin = useCallback(async (pin: string, currentPassword: string) => {
        setIsLoading(true);
        setError(null);
        try {
            const res = await apiClient.post('/auth/quick-login/setup-pin', { pin, currentPassword });
            if (res.data.success) {
                await fetchStatus();
            }
        } catch (err: unknown) {
            const axiosErr = err as { response?: { data?: { error?: string } } };
            const msg = axiosErr.response?.data?.error || 'Failed to set PIN';
            setError(msg);
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [fetchStatus]);

    const removePin = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            await apiClient.delete('/auth/quick-login/pin');
            await fetchStatus();
        } catch (err: unknown) {
            const axiosErr = err as { response?: { data?: { error?: string } } };
            const msg = axiosErr.response?.data?.error || 'Failed to remove PIN';
            setError(msg);
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [fetchStatus]);

    const registerBiometric = useCallback(async (currentPassword: string) => {
        setIsLoading(true);
        setError(null);
        try {
            // Create WebAuthn credential
            const credential = await navigator.credentials.create({
                publicKey: {
                    challenge: crypto.getRandomValues(new Uint8Array(32)),
                    rp: { name: 'SMART-ERP POS', id: window.location.hostname },
                    user: {
                        id: crypto.getRandomValues(new Uint8Array(16)),
                        name: 'pos-user',
                        displayName: 'POS User',
                    },
                    pubKeyCredParams: [
                        { alg: -7, type: 'public-key' },   // ES256
                        { alg: -257, type: 'public-key' },  // RS256
                    ],
                    authenticatorSelection: {
                        authenticatorAttachment: 'platform',
                        userVerification: 'required',
                    },
                    timeout: 60000,
                },
            }) as PublicKeyCredential | null;

            if (!credential) {
                throw new Error('Biometric registration was cancelled');
            }

            const attestationResponse = credential.response as AuthenticatorAttestationResponse;
            const publicKeyBytes = attestationResponse.getPublicKey?.();
            const publicKeyBase64 = publicKeyBytes
                ? btoa(String.fromCharCode(...new Uint8Array(publicKeyBytes)))
                : btoa(String.fromCharCode(...new Uint8Array(attestationResponse.attestationObject)));

            await apiClient.post('/auth/quick-login/register-biometric', {
                credentialId: credential.id,
                publicKey: publicKeyBase64,
                currentPassword,
            });

            await fetchStatus();
        } catch (err: unknown) {
            let msg = 'Failed to register biometric';
            if (err instanceof DOMException) {
                switch (err.name) {
                    case 'NotAllowedError':
                        msg = 'Biometric registration was cancelled or denied';
                        break;
                    case 'InvalidStateError':
                        msg = 'A credential already exists for this authenticator';
                        break;
                    case 'NotSupportedError':
                        msg = 'No compatible authenticator found on this device';
                        break;
                    case 'SecurityError':
                        msg = 'Biometric registration requires a secure context (HTTPS)';
                        break;
                    case 'AbortError':
                        msg = 'Biometric registration timed out';
                        break;
                    default:
                        msg = `Biometric error: ${err.message}`;
                }
            } else {
                const axiosErr = err as { response?: { data?: { error?: string } } };
                msg = axiosErr.response?.data?.error || (err instanceof Error ? err.message : msg);
            }
            setError(msg);
            throw new Error(msg);
        } finally {
            setIsLoading(false);
        }
    }, [fetchStatus]);

    const removeBiometric = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            await apiClient.delete('/auth/quick-login/biometric');
            await fetchStatus();
        } catch (err: unknown) {
            const axiosErr = err as { response?: { data?: { error?: string } } };
            const msg = axiosErr.response?.data?.error || 'Failed to remove biometric';
            setError(msg);
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [fetchStatus]);

    return {
        status,
        isLoading,
        error,
        setupPin,
        removePin,
        registerBiometric,
        removeBiometric,
        refresh: fetchStatus,
        clearError: () => setError(null),
    };
}

// ============================================================
// Trusted Devices Hook (admin/manager only)
// ============================================================

export interface TrustedDevice {
    id: string;
    deviceFingerprint: string;
    deviceName: string;
    locationName: string | null;
    isActive: boolean;
    registeredBy: string | null;
    createdAt: string;
    updatedAt: string;
}

export function useTrustedDevices() {
    const [devices, setDevices] = useState<TrustedDevice[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchDevices = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await apiClient.get('/auth/quick-login/devices');
            if (res.data.success) {
                setDevices(res.data.data);
            }
        } catch (err: unknown) {
            const axiosErr = err as { response?: { data?: { error?: string } } };
            setError(axiosErr.response?.data?.error || 'Failed to load devices');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchDevices();
    }, [fetchDevices]);

    const registerDevice = useCallback(async (data: { deviceFingerprint: string; deviceName: string; locationName?: string }) => {
        setIsLoading(true);
        setError(null);
        try {
            const res = await apiClient.post('/auth/quick-login/devices', data);
            if (res.data.success) {
                await fetchDevices();
                return res.data.data as TrustedDevice;
            }
            throw new Error('Registration failed');
        } catch (err: unknown) {
            const axiosErr = err as { response?: { data?: { error?: string } } };
            const msg = axiosErr.response?.data?.error || 'Failed to register device';
            setError(msg);
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [fetchDevices]);

    const registerThisDevice = useCallback(async (deviceName: string, locationName?: string) => {
        const fp = getDeviceFingerprint();
        return registerDevice({ deviceFingerprint: fp, deviceName, locationName });
    }, [registerDevice]);

    const deactivateDevice = useCallback(async (deviceId: string) => {
        setIsLoading(true);
        setError(null);
        try {
            await apiClient.patch(`/auth/quick-login/devices/${deviceId}/deactivate`);
            await fetchDevices();
        } catch (err: unknown) {
            const axiosErr = err as { response?: { data?: { error?: string } } };
            setError(axiosErr.response?.data?.error || 'Failed to deactivate device');
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [fetchDevices]);

    const activateDevice = useCallback(async (deviceId: string) => {
        setIsLoading(true);
        setError(null);
        try {
            await apiClient.patch(`/auth/quick-login/devices/${deviceId}/activate`);
            await fetchDevices();
        } catch (err: unknown) {
            const axiosErr = err as { response?: { data?: { error?: string } } };
            setError(axiosErr.response?.data?.error || 'Failed to activate device');
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [fetchDevices]);

    return {
        devices,
        isLoading,
        error,
        registerDevice,
        registerThisDevice,
        deactivateDevice,
        activateDevice,
        refresh: fetchDevices,
        clearError: () => setError(null),
    };
}
