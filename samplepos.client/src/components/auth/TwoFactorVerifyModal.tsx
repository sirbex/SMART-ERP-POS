/**
 * Two-Factor Authentication Verification Modal
 *
 * Shown during login when 2FA is enabled for the user's account.
 * Touch / coarse pointer: in-app number pad. Desktop: soft-keyboard-friendly input
 * (backup codes may include letters).
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useVerify2FALogin } from '../../hooks/use2FA';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Shield, Loader2, AlertCircle } from 'lucide-react';
import { requestSoftKeyboard, softKeyboardAttrs } from '../../lib/softKeyboard';
import { PinNumPad } from './PinNumPad';
import { useMediaQuery } from '../../hooks/useMediaQuery';

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
  const [useBackup, setUseBackup] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const prefersPad = useMediaQuery('(pointer: coarse)');

  const verify2FA = useVerify2FALogin();

  const runVerify = useCallback(
    async (value: string) => {
      setError(null);
      if (!value || value.length < 6) {
        setError('Please enter a valid 6-digit code');
        return;
      }
      try {
        const result = await verify2FA.mutateAsync({ userId, code: value });
        onSuccess(result);
      } catch (err: unknown) {
        const errorMessage =
          err instanceof Error && 'response' in err
            ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
            : err instanceof Error
              ? err.message
              : undefined;
        setError(errorMessage || 'Invalid code. Please try again.');
        setCode('');
        if (!prefersPad || useBackup) {
          window.setTimeout(() => requestSoftKeyboard(inputRef.current), 50);
        }
      }
    },
    [onSuccess, prefersPad, useBackup, userId, verify2FA],
  );

  useEffect(() => {
    if (!prefersPad || useBackup) {
      window.setTimeout(() => requestSoftKeyboard(inputRef.current), 50);
    }
  }, [prefersPad, useBackup]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await runVerify(code);
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9A-Za-z-]/g, '').slice(0, 9);
    setCode(value);
    setError(null);
  };

  const showPad = prefersPad && !useBackup;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-full bg-blue-100 p-3 dark:bg-blue-900">
            <Shield className="h-6 w-6 text-blue-600 dark:text-blue-400" />
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

        {showPad ? (
          <div className="flex flex-col items-center gap-4">
            <PinNumPad
              length={6}
              onComplete={(pin) => void runVerify(pin)}
              error={error}
              isLoading={verify2FA.isPending}
              masked={false}
              label="6-digit code"
            />
            <button
              type="button"
              className="text-sm text-blue-600 hover:underline"
              onClick={() => setUseBackup(true)}
            >
              Use backup code instead
            </button>
            <Button type="button" variant="outline" onClick={onCancel} className="w-full">
              Cancel
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="2fa-code">Authentication Code</Label>
              <Input
                ref={inputRef}
                id="2fa-code"
                type="text"
                {...softKeyboardAttrs(useBackup ? 'text' : 'numeric', 'done')}
                autoComplete="one-time-code"
                placeholder={useBackup ? 'Backup code' : '000000'}
                value={code}
                onChange={handleCodeChange}
                onFocus={(e) => requestSoftKeyboard(e.currentTarget)}
                className="mt-2 text-center font-mono text-2xl tracking-widest"
                disabled={verify2FA.isPending}
              />
              <p className="mt-2 text-xs text-gray-500">
                {useBackup
                  ? 'Enter a backup code if you do not have your authenticator'
                  : 'Or enter a backup code if you do not have access to your authenticator'}
              </p>
              {prefersPad && useBackup ? (
                <button
                  type="button"
                  className="mt-2 text-sm text-blue-600 hover:underline"
                  onClick={() => {
                    setUseBackup(false);
                    setCode('');
                  }}
                >
                  Back to number pad
                </button>
              ) : null}
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                <AlertCircle className="h-4 w-4" />
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
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  'Verify'
                )}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
