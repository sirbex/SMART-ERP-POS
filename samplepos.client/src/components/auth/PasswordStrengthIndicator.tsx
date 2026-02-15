/**
 * Password Strength Indicator
 * 
 * Visual feedback component showing password strength:
 * - Color-coded progress bar
 * - Requirement checklist
 * - Real-time validation feedback
 */

import { useEffect, useState } from 'react';
import { usePasswordPolicy, useValidatePassword } from '../../hooks/usePasswordPolicy';

interface PasswordStrengthIndicatorProps {
    password: string;
    onChange?: (validation: {
        valid: boolean;
        errors: string[];
        strength: 'weak' | 'fair' | 'good' | 'strong';
        score: number;
    }) => void;
}

export function PasswordStrengthIndicator({ password, onChange }: PasswordStrengthIndicatorProps) {
    const { data: policy } = usePasswordPolicy();
    const validateMutation = useValidatePassword();
    const [validation, setValidation] = useState<{
        valid: boolean;
        errors: string[];
        strength: 'weak' | 'fair' | 'good' | 'strong';
        score: number;
    } | null>(null);

    // Debounce validation
    useEffect(() => {
        if (!password) {
            setValidation(null);
            return;
        }

        const timer = setTimeout(async () => {
            try {
                const result = await validateMutation.mutateAsync(password);
                setValidation(result);
                onChange?.(result);
            } catch (error) {
                // Client-side validation fallback
                const result = validatePasswordLocally(password, policy);
                setValidation(result);
                onChange?.(result);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [password, policy]);

    if (!password) {
        return null;
    }

    const strengthColors = {
        weak: 'bg-red-500',
        fair: 'bg-yellow-500',
        good: 'bg-blue-500',
        strong: 'bg-green-500',
    };

    const strengthLabels = {
        weak: 'Weak',
        fair: 'Fair',
        good: 'Good',
        strong: 'Strong',
    };

    const requirements = [
        { label: 'At least 8 characters', met: password.length >= 8 },
        { label: 'Contains uppercase letter', met: /[A-Z]/.test(password) },
        { label: 'Contains lowercase letter', met: /[a-z]/.test(password) },
        { label: 'Contains number', met: /[0-9]/.test(password) },
        { label: 'Contains special character', met: /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password) },
    ];

    return (
        <div className="mt-2 space-y-2">
            {/* Strength bar */}
            <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                        className={`h-full transition-all duration-300 ${validation ? strengthColors[validation.strength] : 'bg-gray-300'}`}
                        style={{ width: `${validation?.score || 0}%` }}
                    />
                </div>
                {validation && (
                    <span className={`text-xs font-medium ${validation.strength === 'strong' ? 'text-green-600' :
                        validation.strength === 'good' ? 'text-blue-600' :
                            validation.strength === 'fair' ? 'text-yellow-600' :
                                'text-red-600'
                        }`}>
                        {strengthLabels[validation.strength]}
                    </span>
                )}
            </div>

            {/* Requirements checklist */}
            <div className="grid grid-cols-2 gap-1">
                {requirements.map((req, index) => (
                    <div key={index} className="flex items-center gap-1.5 text-xs">
                        {req.met ? (
                            <svg className="w-3.5 h-3.5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                        ) : (
                            <svg className="w-3.5 h-3.5 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm0-2a6 6 0 100-12 6 6 0 000 12z" clipRule="evenodd" />
                            </svg>
                        )}
                        <span className={req.met ? 'text-gray-700' : 'text-gray-400'}>
                            {req.label}
                        </span>
                    </div>
                ))}
            </div>

            {/* Error messages */}
            {validation && !validation.valid && validation.errors.length > 0 && (
                <div className="text-xs text-red-600 mt-1">
                    {validation.errors[0]}
                </div>
            )}
        </div>
    );
}

// Fallback client-side validation
function validatePasswordLocally(password: string, policy?: { requirements: { minLength: number; maxLength: number; requireUppercase: boolean; requireLowercase: boolean; requireDigit: boolean; requireSpecial: boolean } } | null) {
    const minLength = policy?.requirements?.minLength || 8;
    const errors: string[] = [];
    let score = 0;

    if (password.length >= minLength) score += 20;
    else errors.push(`Password must be at least ${minLength} characters`);

    if (/[A-Z]/.test(password)) score += 20;
    else errors.push('Password must contain an uppercase letter');

    if (/[a-z]/.test(password)) score += 20;
    else errors.push('Password must contain a lowercase letter');

    if (/[0-9]/.test(password)) score += 20;
    else errors.push('Password must contain a number');

    if (/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)) score += 20;
    else errors.push('Password must contain a special character');

    let strength: 'weak' | 'fair' | 'good' | 'strong';
    if (score < 40) strength = 'weak';
    else if (score < 60) strength = 'fair';
    else if (score < 80) strength = 'good';
    else strength = 'strong';

    return { valid: errors.length === 0, errors, strength, score };
}

export default PasswordStrengthIndicator;
