/**
 * Password Policy API hooks
 * 
 * Provides React Query hooks for password management:
 * - Policy requirements
 * - Password validation
 * - Password change
 * - Expiry status
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

const API_BASE = '/api/auth/password';

export interface PasswordPolicy {
    requirements: {
        minLength: number;
        maxLength: number;
        requireUppercase: boolean;
        requireLowercase: boolean;
        requireDigit: boolean;
        requireSpecial: boolean;
    };
    expiryDays: Record<string, number>;
    historyCount: number;
    maxFailedAttempts: number;
    lockoutMinutes: number;
}

export interface PasswordValidation {
    valid: boolean;
    errors: string[];
    strength: 'weak' | 'fair' | 'good' | 'strong';
    score: number;
}

export interface PasswordExpiryStatus {
    expired: boolean;
    expiresAt: string | null;
    daysUntilExpiry: number | null;
    showWarning: boolean;
}

export interface ChangePasswordData {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
}

/**
 * Get password policy requirements (public - no auth needed)
 */
export function usePasswordPolicy() {
    return useQuery({
        queryKey: ['password-policy'],
        queryFn: async (): Promise<PasswordPolicy> => {
            const response = await axios.get(`${API_BASE}/policy`);
            return response.data.data;
        },
        staleTime: 1000 * 60 * 60, // Cache for 1 hour - policy rarely changes
    });
}

/**
 * Validate password strength (debounced in component)
 */
export function useValidatePassword() {
    return useMutation({
        mutationFn: async (password: string): Promise<PasswordValidation> => {
            const response = await axios.post(`${API_BASE}/validate`, { password });
            return response.data.data;
        },
    });
}

/**
 * Get password expiry status (requires auth)
 */
export function usePasswordExpiry() {
    return useQuery({
        queryKey: ['password-expiry'],
        queryFn: async (): Promise<PasswordExpiryStatus> => {
            const token = localStorage.getItem('auth_token');
            const response = await axios.get(`${API_BASE}/expiry`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            return response.data.data;
        },
        retry: false,
        enabled: !!localStorage.getItem('auth_token'),
    });
}

/**
 * Check if user must change password (requires auth)
 */
export function useMustChangePassword() {
    return useQuery({
        queryKey: ['must-change-password'],
        queryFn: async (): Promise<{ mustChange: boolean; reason: 'expired' | 'first_login' | null }> => {
            const token = localStorage.getItem('auth_token');
            const response = await axios.get(`${API_BASE}/must-change`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            return response.data.data;
        },
        retry: false,
        enabled: !!localStorage.getItem('auth_token'),
    });
}

/**
 * Change password (requires auth)
 */
export function useChangePassword() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: ChangePasswordData): Promise<void> => {
            const token = localStorage.getItem('auth_token');
            await axios.post(`${API_BASE}/change`, data, {
                headers: { Authorization: `Bearer ${token}` },
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['password-expiry'] });
            queryClient.invalidateQueries({ queryKey: ['must-change-password'] });
        },
    });
}
