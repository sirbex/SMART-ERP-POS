/**
 * Two-Factor Authentication Setup Component
 * 
 * Allows users to set up 2FA by scanning a QR code with their authenticator app.
 */

import React, { useState } from 'react';
import { AxiosError } from 'axios';
import { useSetup2FA, useVerify2FASetup, useDisable2FA, use2FAStatus, useRegenerateBackupCodes } from '../../hooks/use2FA';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Shield, ShieldCheck, ShieldOff, Copy, Check, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { cn } from '../../lib/utils';

export function TwoFactorSetup() {
    const [step, setStep] = useState<'status' | 'setup' | 'verify' | 'disable' | 'regenerate'>('status');
    const [verifyCode, setVerifyCode] = useState('');
    const [disableCode, setDisableCode] = useState('');
    const [regenerateCode, setRegenerateCode] = useState('');
    const [setupData, setSetupData] = useState<{ qrCodeDataUrl: string; backupCodes: string[] } | null>(null);
    const [newBackupCodes, setNewBackupCodes] = useState<string[] | null>(null);
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);

    const { data: status, isLoading: statusLoading, refetch: refetchStatus } = use2FAStatus();
    const setup2FA = useSetup2FA();
    const verify2FASetup = useVerify2FASetup();
    const disable2FA = useDisable2FA();
    const regenerateBackupCodes = useRegenerateBackupCodes();

    const handleStartSetup = async () => {
        setError(null);
        try {
            const data = await setup2FA.mutateAsync();
            setSetupData(data);
            setStep('setup');
        } catch (err: unknown) {
            const errMsg = err instanceof AxiosError
                ? (err.response?.data as { error?: string })?.error
                : err instanceof Error ? err.message : undefined;
            setError(errMsg || 'Failed to start 2FA setup');
        }
    };

    const handleVerifySetup = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!verifyCode || verifyCode.length !== 6) {
            setError('Please enter a valid 6-digit code');
            return;
        }

        try {
            await verify2FASetup.mutateAsync(verifyCode);
            setStep('status');
            setSetupData(null);
            setVerifyCode('');
            refetchStatus();
        } catch (err: unknown) {
            const errMsg = err instanceof AxiosError
                ? (err.response?.data as { error?: string })?.error
                : err instanceof Error ? err.message : undefined;
            setError(errMsg || 'Invalid code. Please try again.');
        }
    };

    const handleDisable = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        try {
            await disable2FA.mutateAsync(disableCode);
            setStep('status');
            setDisableCode('');
            refetchStatus();
        } catch (err: unknown) {
            const errMsg = err instanceof AxiosError
                ? (err.response?.data as { error?: string })?.error
                : err instanceof Error ? err.message : undefined;
            setError(errMsg || 'Failed to disable 2FA');
        }
    };

    const handleRegenerateBackupCodes = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        try {
            const codes = await regenerateBackupCodes.mutateAsync(regenerateCode);
            setNewBackupCodes(codes);
            setRegenerateCode('');
        } catch (err: unknown) {
            const errMsg = err instanceof AxiosError
                ? (err.response?.data as { error?: string })?.error
                : err instanceof Error ? err.message : undefined;
            setError(errMsg || 'Failed to regenerate backup codes');
        }
    };

    const copyToClipboard = async (text: string, index: number) => {
        await navigator.clipboard.writeText(text);
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 2000);
    };

    const copyAllBackupCodes = async (codes: string[]) => {
        await navigator.clipboard.writeText(codes.join('\n'));
        setCopiedIndex(-1);
        setTimeout(() => setCopiedIndex(null), 2000);
    };

    if (statusLoading) {
        return (
            <Card>
                <CardContent className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </CardContent>
            </Card>
        );
    }

    // Status view
    if (step === 'status') {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        {status?.enabled ? (
                            <ShieldCheck className="w-5 h-5 text-green-600" />
                        ) : (
                            <Shield className="w-5 h-5 text-gray-400" />
                        )}
                        Two-Factor Authentication
                    </CardTitle>
                    <CardDescription>
                        Add an extra layer of security to your account
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className={cn(
                        "flex items-center justify-between p-4 rounded-lg",
                        status?.enabled ? "bg-green-50 dark:bg-green-900/20" : "bg-gray-50 dark:bg-gray-800"
                    )}>
                        <div>
                            <p className="font-medium">
                                {status?.enabled ? '2FA is enabled' : '2FA is not enabled'}
                            </p>
                            <p className="text-sm text-gray-500">
                                {status?.enabled
                                    ? `Enabled on ${new Date(status.verifiedAt!).toLocaleDateString()}`
                                    : status?.required
                                        ? 'Required for your role (Admin/Manager)'
                                        : 'Optional but recommended'
                                }
                            </p>
                        </div>
                        {status?.enabled ? (
                            <ShieldCheck className="w-8 h-8 text-green-600" />
                        ) : status?.required ? (
                            <AlertTriangle className="w-8 h-8 text-amber-500" />
                        ) : null}
                    </div>

                    {status?.required && !status.enabled && (
                        <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-amber-700 dark:text-amber-400">
                            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                            <div className="text-sm">
                                <p className="font-medium">2FA Required</p>
                                <p>Your role requires two-factor authentication. Please set it up to continue using all features.</p>
                            </div>
                        </div>
                    )}

                    <div className="flex gap-3">
                        {!status?.enabled ? (
                            <Button onClick={handleStartSetup} disabled={setup2FA.isPending}>
                                {setup2FA.isPending ? (
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : (
                                    <Shield className="w-4 h-4 mr-2" />
                                )}
                                Enable 2FA
                            </Button>
                        ) : (
                            <>
                                <Button variant="outline" onClick={() => setStep('regenerate')}>
                                    <RefreshCw className="w-4 h-4 mr-2" />
                                    New Backup Codes
                                </Button>
                                <Button variant="destructive" onClick={() => setStep('disable')}>
                                    <ShieldOff className="w-4 h-4 mr-2" />
                                    Disable 2FA
                                </Button>
                            </>
                        )}
                    </div>
                </CardContent>
            </Card>
        );
    }

    // Setup view - show QR code
    if (step === 'setup' && setupData) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Shield className="w-5 h-5 text-blue-600" />
                        Set Up Two-Factor Authentication
                    </CardTitle>
                    <CardDescription>
                        Step 1: Scan this QR code with your authenticator app
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex justify-center">
                        <div className="p-4 bg-white rounded-lg shadow-inner">
                            <img
                                src={setupData.qrCodeDataUrl}
                                alt="2FA QR Code"
                                className="w-48 h-48"
                            />
                        </div>
                    </div>

                    <div>
                        <h4 className="font-medium mb-2">Backup Codes</h4>
                        <p className="text-sm text-gray-500 mb-3">
                            Save these codes in a secure place. You can use them if you lose access to your authenticator.
                        </p>
                        <div className="grid grid-cols-2 gap-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg font-mono text-sm">
                            {setupData.backupCodes.map((code, i) => (
                                <div
                                    key={i}
                                    className="flex items-center justify-between p-2 bg-white dark:bg-gray-700 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                                    onClick={() => copyToClipboard(code, i)}
                                >
                                    <span>{code}</span>
                                    {copiedIndex === i ? (
                                        <Check className="w-4 h-4 text-green-600" />
                                    ) : (
                                        <Copy className="w-4 h-4 text-gray-400" />
                                    )}
                                </div>
                            ))}
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            className="mt-2"
                            onClick={() => copyAllBackupCodes(setupData.backupCodes)}
                        >
                            {copiedIndex === -1 ? (
                                <Check className="w-4 h-4 mr-2" />
                            ) : (
                                <Copy className="w-4 h-4 mr-2" />
                            )}
                            Copy All Codes
                        </Button>
                    </div>

                    <form onSubmit={handleVerifySetup} className="space-y-4">
                        <div>
                            <Label htmlFor="verify-code">Step 2: Enter the 6-digit code from your app</Label>
                            <Input
                                id="verify-code"
                                type="text"
                                inputMode="numeric"
                                placeholder="000000"
                                value={verifyCode}
                                onChange={(e) => {
                                    setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                                    setError(null);
                                }}
                                className="text-center text-xl tracking-widest font-mono mt-2"
                                maxLength={6}
                            />
                        </div>

                        {error && (
                            <p className="text-red-600 text-sm">{error}</p>
                        )}

                        <div className="flex gap-3">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                    setStep('status');
                                    setSetupData(null);
                                    setVerifyCode('');
                                }}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={verifyCode.length !== 6 || verify2FASetup.isPending}
                            >
                                {verify2FASetup.isPending ? (
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : null}
                                Verify & Enable
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        );
    }

    // Disable 2FA view
    if (step === 'disable') {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-red-600">
                        <ShieldOff className="w-5 h-5" />
                        Disable Two-Factor Authentication
                    </CardTitle>
                    <CardDescription>
                        Enter your current 2FA code to disable two-factor authentication
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleDisable} className="space-y-4">
                        <div>
                            <Label htmlFor="disable-code">Current 2FA Code</Label>
                            <Input
                                id="disable-code"
                                type="text"
                                inputMode="numeric"
                                placeholder="000000"
                                value={disableCode}
                                onChange={(e) => {
                                    setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                                    setError(null);
                                }}
                                className="text-center text-xl tracking-widest font-mono mt-2"
                                maxLength={6}
                            />
                        </div>

                        {error && (
                            <p className="text-red-600 text-sm">{error}</p>
                        )}

                        <div className="flex gap-3">
                            <Button type="button" variant="outline" onClick={() => setStep('status')}>
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                variant="destructive"
                                disabled={disableCode.length !== 6 || disable2FA.isPending}
                            >
                                {disable2FA.isPending ? (
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : null}
                                Disable 2FA
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        );
    }

    // Regenerate backup codes view
    if (step === 'regenerate') {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <RefreshCw className="w-5 h-5 text-blue-600" />
                        Regenerate Backup Codes
                    </CardTitle>
                    <CardDescription>
                        Generate new backup codes. Your old codes will no longer work.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {newBackupCodes ? (
                        <div className="space-y-4">
                            <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg text-green-700 dark:text-green-400">
                                <p className="font-medium">New backup codes generated!</p>
                                <p className="text-sm">Save these codes in a secure place.</p>
                            </div>

                            <div className="grid grid-cols-2 gap-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg font-mono text-sm">
                                {newBackupCodes.map((code, i) => (
                                    <div
                                        key={i}
                                        className="flex items-center justify-between p-2 bg-white dark:bg-gray-700 rounded cursor-pointer hover:bg-gray-100"
                                        onClick={() => copyToClipboard(code, i)}
                                    >
                                        <span>{code}</span>
                                        {copiedIndex === i ? (
                                            <Check className="w-4 h-4 text-green-600" />
                                        ) : (
                                            <Copy className="w-4 h-4 text-gray-400" />
                                        )}
                                    </div>
                                ))}
                            </div>

                            <Button onClick={() => { setStep('status'); setNewBackupCodes(null); }}>
                                Done
                            </Button>
                        </div>
                    ) : (
                        <form onSubmit={handleRegenerateBackupCodes} className="space-y-4">
                            <div>
                                <Label htmlFor="regenerate-code">Current 2FA Code</Label>
                                <Input
                                    id="regenerate-code"
                                    type="text"
                                    inputMode="numeric"
                                    placeholder="000000"
                                    value={regenerateCode}
                                    onChange={(e) => {
                                        setRegenerateCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                                        setError(null);
                                    }}
                                    className="text-center text-xl tracking-widest font-mono mt-2"
                                    maxLength={6}
                                />
                            </div>

                            {error && (
                                <p className="text-red-600 text-sm">{error}</p>
                            )}

                            <div className="flex gap-3">
                                <Button type="button" variant="outline" onClick={() => setStep('status')}>
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={regenerateCode.length !== 6 || regenerateBackupCodes.isPending}
                                >
                                    {regenerateBackupCodes.isPending ? (
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    ) : null}
                                    Generate New Codes
                                </Button>
                            </div>
                        </form>
                    )}
                </CardContent>
            </Card>
        );
    }

    return null;
}
