/**
 * Two-Factor Authentication API hooks
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

const API_BASE = '/api/auth/2fa';

export interface TwoFactorStatus {
    enabled: boolean;
    required: boolean;
    verifiedAt: string | null;
}

export interface TwoFactorSetupResponse {
    qrCodeDataUrl: string;
    backupCodes: string[];
}

// Get 2FA status
export function use2FAStatus() {
    return useQuery({
        queryKey: ['2fa-status'],
        queryFn: async (): Promise<TwoFactorStatus> => {
            const token = localStorage.getItem('auth_token');
            const response = await axios.get(`${API_BASE}/status`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            return response.data.data;
        },
        retry: false,
    });
}

// Initialize 2FA setup
export function useSetup2FA() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (): Promise<TwoFactorSetupResponse> => {
            const token = localStorage.getItem('auth_token');
            const response = await axios.post(`${API_BASE}/setup`, {}, {
                headers: { Authorization: `Bearer ${token}` },
            });
            return response.data.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['2fa-status'] });
        },
    });
}

// Verify 2FA setup
export function useVerify2FASetup() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (code: string): Promise<void> => {
            const token = localStorage.getItem('auth_token');
            await axios.post(`${API_BASE}/verify-setup`, { token: code }, {
                headers: { Authorization: `Bearer ${token}` },
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['2fa-status'] });
        },
    });
}

// Verify 2FA during login (no auth token needed)
export function useVerify2FALogin() {
    return useMutation({
        mutationFn: async ({ userId, code }: { userId: string; code: string }) => {
            const response = await axios.post(`${API_BASE}/verify`, {
                userId,
                token: code,
            });
            return response.data.data;
        },
    });
}

// Disable 2FA
export function useDisable2FA() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (code: string): Promise<void> => {
            const token = localStorage.getItem('auth_token');
            await axios.post(`${API_BASE}/disable`, { token: code }, {
                headers: { Authorization: `Bearer ${token}` },
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['2fa-status'] });
        },
    });
}

// Regenerate backup codes
export function useRegenerateBackupCodes() {
    return useMutation({
        mutationFn: async (code: string): Promise<string[]> => {
            const token = localStorage.getItem('auth_token');
            const response = await axios.post(`${API_BASE}/regenerate-backup-codes`, { token: code }, {
                headers: { Authorization: `Bearer ${token}` },
            });
            return response.data.data.backupCodes;
        },
    });
}
