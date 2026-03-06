/**
 * Two-Factor Authentication Verification Modal
 * 
 * Shown during login when 2FA is enabled for the user's account.
 */

import React, { useState, useRef, useEffect } from 'react';
import { useVerify2FALogin } from '../../hooks/use2FA';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Shield, Loader2, AlertCircle } from 'lucide-react';

/** Shape returned by 2FA verify endpoint */
interface AuthLoginResponse {
    user: { id: string; email: string; fullName: string; role: string };
    token: string;
    accessToken?: string;
    refreshToken?: string;
    expiresIn?: number;
}

interface TwoFactorVerifyModalProps {
    userId: string;
    onSuccess: (data: AuthLoginResponse) => void;
    onCancel: () => void;
}

export function TwoFactorVerifyModal({ userId, onSuccess, onCancel }: TwoFactorVerifyModalProps) {
    const [code, setCode] = useState('');
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const verify2FA = useVerify2FALogin();

    useEffect(() => {
        // Focus the input when modal opens
        inputRef.current?.focus();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!code || code.length < 6) {
            setError('Please enter a valid 6-digit code');
            return;
        }

        try {
            const result = await verify2FA.mutateAsync({ userId, code });
            console.log('[TwoFactorVerifyModal] Verification successful, result:', result);
            // Success - onSuccess will handle navigation
            onSuccess(result);
        } catch (err: unknown) {
            const errorMessage = err instanceof Error && 'response' in err
                ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
                : err instanceof Error
                    ? err.message
                    : undefined;
            setError(errorMessage || 'Invalid code. Please try again.');
            // Clear the input field on error to allow fresh retry
            setCode('');
            // Refocus the input
            inputRef.current?.focus();
        }
    };

    const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        // Only allow digits and limit to 8 characters (for backup codes with dash)
        const value = e.target.value.replace(/[^0-9A-Za-z-]/g, '').slice(0, 9);
        setCode(value);
        setError(null);
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-full">
                        <Shield className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                            Two-Factor Authentication
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Enter the code from your authenticator app
                        </p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <Label htmlFor="2fa-code">Authentication Code</Label>
                        <Input
                            ref={inputRef}
                            id="2fa-code"
                            type="text"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            placeholder="000000"
                            value={code}
                            onChange={handleCodeChange}
                            className="text-center text-2xl tracking-widest font-mono mt-2"
                            disabled={verify2FA.isPending}
                        />
                        <p className="text-xs text-gray-500 mt-2">
                            Or enter a backup code if you don't have access to your authenticator
                        </p>
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
                            <AlertCircle className="w-4 h-4" />
                            <span>{error}</span>
                        </div>
                    )}

                    <div className="flex gap-3">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onCancel}
                            disabled={verify2FA.isPending}
                            className="flex-1"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={verify2FA.isPending || code.length < 6}
                            className="flex-1"
                        >
                            {verify2FA.isPending ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Verifying...
                                </>
                            ) : (
                                'Verify'
                            )}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
