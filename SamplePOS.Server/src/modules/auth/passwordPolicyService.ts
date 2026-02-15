/**
 * Password Policy Service
 * 
 * Implements enterprise-grade password security policies:
 * - Minimum length: 8 characters
 * - Complexity: uppercase, lowercase, digits, special characters
 * - Password expiry: 90 days for admin/manager, 180 days for others
 * - Password history: Prevents reuse of last 5 passwords
 * - Account lockout: 5 failed attempts = 15 minute lockout
 */

import bcrypt from 'bcrypt';
import pool from '../../db/pool.js';
import logger from '../../utils/logger.js';

// Configuration constants
const PASSWORD_CONFIG = {
    minLength: 8,
    maxLength: 128,
    requireUppercase: true,
    requireLowercase: true,
    requireDigit: true,
    requireSpecial: true,
    specialChars: '!@#$%^&*()_+-=[]{}|;:,.<>?',
    // Expiry in days
    expiryDays: {
        ADMIN: 90,
        MANAGER: 90,
        CASHIER: 180,
        STAFF: 180,
    } as Record<string, number>,
    historyCount: 5, // Number of previous passwords to remember
    maxFailedAttempts: 5,
    lockoutMinutes: 15,
    saltRounds: 12, // Increased from 10 for better security
};

export interface PasswordValidationResult {
    valid: boolean;
    errors: string[];
    strength: 'weak' | 'fair' | 'good' | 'strong';
    score: number; // 0-100
}

export interface PasswordExpiryStatus {
    expired: boolean;
    expiresAt: Date | null;
    daysUntilExpiry: number | null;
    warningDays: number;
}

export interface AccountLockoutStatus {
    locked: boolean;
    failedAttempts: number;
    lockoutUntil: Date | null;
    remainingMinutes: number | null;
}

/**
 * Validate password against policy requirements
 */
export function validatePassword(password: string): PasswordValidationResult {
    const errors: string[] = [];
    let score = 0;

    // Length check
    if (password.length < PASSWORD_CONFIG.minLength) {
        errors.push(`Password must be at least ${PASSWORD_CONFIG.minLength} characters`);
    } else {
        score += 20;
    }

    if (password.length > PASSWORD_CONFIG.maxLength) {
        errors.push(`Password must not exceed ${PASSWORD_CONFIG.maxLength} characters`);
    }

    // Uppercase check
    if (PASSWORD_CONFIG.requireUppercase && !/[A-Z]/.test(password)) {
        errors.push('Password must contain at least one uppercase letter');
    } else if (/[A-Z]/.test(password)) {
        score += 20;
    }

    // Lowercase check
    if (PASSWORD_CONFIG.requireLowercase && !/[a-z]/.test(password)) {
        errors.push('Password must contain at least one lowercase letter');
    } else if (/[a-z]/.test(password)) {
        score += 20;
    }

    // Digit check
    if (PASSWORD_CONFIG.requireDigit && !/[0-9]/.test(password)) {
        errors.push('Password must contain at least one number');
    } else if (/[0-9]/.test(password)) {
        score += 20;
    }

    // Special character check
    const specialRegex = new RegExp(`[${PASSWORD_CONFIG.specialChars.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}]`);
    if (PASSWORD_CONFIG.requireSpecial && !specialRegex.test(password)) {
        errors.push('Password must contain at least one special character (!@#$%^&*()_+-=[]{}|;:,.<>?)');
    } else if (specialRegex.test(password)) {
        score += 20;
    }

    // Determine strength
    let strength: 'weak' | 'fair' | 'good' | 'strong';
    if (score < 40) {
        strength = 'weak';
    } else if (score < 60) {
        strength = 'fair';
    } else if (score < 80) {
        strength = 'good';
    } else {
        strength = 'strong';
    }

    return {
        valid: errors.length === 0,
        errors,
        strength,
        score,
    };
}

/**
 * Check if password matches any in history
 */
export async function isPasswordInHistory(
    userId: string,
    newPassword: string
): Promise<boolean> {
    const result = await pool.query(
        'SELECT password_history FROM users WHERE id = $1',
        [userId]
    );

    if (result.rows.length === 0) {
        return false;
    }

    const history: string[] = result.rows[0].password_history || [];

    for (const hashedPassword of history) {
        const matches = await bcrypt.compare(newPassword, hashedPassword);
        if (matches) {
            return true;
        }
    }

    return false;
}

/**
 * Add current password to history before changing
 */
export async function addPasswordToHistory(
    userId: string,
    currentPasswordHash: string
): Promise<void> {
    // Get current history
    const result = await pool.query(
        'SELECT password_history FROM users WHERE id = $1',
        [userId]
    );

    if (result.rows.length === 0) {
        return;
    }

    let history: string[] = result.rows[0].password_history || [];

    // Add current password to beginning
    history.unshift(currentPasswordHash);

    // Keep only last N passwords
    history = history.slice(0, PASSWORD_CONFIG.historyCount);

    await pool.query(
        'UPDATE users SET password_history = $1 WHERE id = $2',
        [history, userId]
    );
}

/**
 * Check password expiry status
 */
export async function getPasswordExpiryStatus(
    userId: string
): Promise<PasswordExpiryStatus> {
    const result = await pool.query(
        'SELECT password_changed_at, role FROM users WHERE id = $1',
        [userId]
    );

    if (result.rows.length === 0) {
        return {
            expired: false,
            expiresAt: null,
            daysUntilExpiry: null,
            warningDays: 14,
        };
    }

    const { password_changed_at, role } = result.rows[0];
    const expiryDays = PASSWORD_CONFIG.expiryDays[role] || 180;

    const changedAt = password_changed_at ? new Date(password_changed_at) : new Date();
    const expiresAt = new Date(changedAt);
    expiresAt.setDate(expiresAt.getDate() + expiryDays);

    const now = new Date();
    const msPerDay = 24 * 60 * 60 * 1000;
    const daysUntilExpiry = Math.ceil((expiresAt.getTime() - now.getTime()) / msPerDay);

    return {
        expired: daysUntilExpiry <= 0,
        expiresAt,
        daysUntilExpiry: daysUntilExpiry > 0 ? daysUntilExpiry : 0,
        warningDays: 14, // Show warning 14 days before expiry
    };
}

/**
 * Record failed login attempt
 */
export async function recordFailedLoginAttempt(
    userId: string
): Promise<AccountLockoutStatus> {
    // Increment failed attempts
    const result = await pool.query(
        `UPDATE users 
     SET failed_login_attempts = COALESCE(failed_login_attempts, 0) + 1,
         lockout_until = CASE 
           WHEN COALESCE(failed_login_attempts, 0) + 1 >= $1 
           THEN CURRENT_TIMESTAMP + INTERVAL '${PASSWORD_CONFIG.lockoutMinutes} minutes'
           ELSE lockout_until
         END
     WHERE id = $2
     RETURNING failed_login_attempts, lockout_until`,
        [PASSWORD_CONFIG.maxFailedAttempts, userId]
    );

    if (result.rows.length === 0) {
        return {
            locked: false,
            failedAttempts: 0,
            lockoutUntil: null,
            remainingMinutes: null,
        };
    }

    const { failed_login_attempts, lockout_until } = result.rows[0];
    const locked = failed_login_attempts >= PASSWORD_CONFIG.maxFailedAttempts;

    let remainingMinutes = null;
    if (lockout_until) {
        const lockoutTime = new Date(lockout_until);
        const now = new Date();
        remainingMinutes = Math.ceil((lockoutTime.getTime() - now.getTime()) / 60000);
        if (remainingMinutes <= 0) {
            remainingMinutes = null;
        }
    }

    logger.warn('Failed login attempt recorded', {
        userId,
        failedAttempts: failed_login_attempts,
        locked,
    });

    return {
        locked,
        failedAttempts: failed_login_attempts,
        lockoutUntil: lockout_until ? new Date(lockout_until) : null,
        remainingMinutes,
    };
}

/**
 * Check if account is locked
 */
export async function checkAccountLockout(
    userId: string
): Promise<AccountLockoutStatus> {
    const result = await pool.query(
        'SELECT failed_login_attempts, lockout_until FROM users WHERE id = $1',
        [userId]
    );

    if (result.rows.length === 0) {
        return {
            locked: false,
            failedAttempts: 0,
            lockoutUntil: null,
            remainingMinutes: null,
        };
    }

    const { failed_login_attempts, lockout_until } = result.rows[0];

    // Check if lockout has expired
    if (lockout_until) {
        const lockoutTime = new Date(lockout_until);
        const now = new Date();

        if (now >= lockoutTime) {
            // Lockout expired - reset
            await resetFailedLoginAttempts(userId);
            return {
                locked: false,
                failedAttempts: 0,
                lockoutUntil: null,
                remainingMinutes: null,
            };
        }

        const remainingMinutes = Math.ceil((lockoutTime.getTime() - now.getTime()) / 60000);

        return {
            locked: true,
            failedAttempts: failed_login_attempts || 0,
            lockoutUntil: lockoutTime,
            remainingMinutes,
        };
    }

    return {
        locked: false,
        failedAttempts: failed_login_attempts || 0,
        lockoutUntil: null,
        remainingMinutes: null,
    };
}

/**
 * Reset failed login attempts after successful login
 */
export async function resetFailedLoginAttempts(userId: string): Promise<void> {
    await pool.query(
        'UPDATE users SET failed_login_attempts = 0, lockout_until = NULL WHERE id = $1',
        [userId]
    );
}

/**
 * Update password with policy enforcement
 * Returns the new password hash
 */
export async function updatePasswordWithPolicy(
    userId: string,
    newPassword: string
): Promise<string> {
    // Validate password meets policy
    const validation = validatePassword(newPassword);
    if (!validation.valid) {
        throw new Error(`Password does not meet policy: ${validation.errors.join(', ')}`);
    }

    // Check password history
    const inHistory = await isPasswordInHistory(userId, newPassword);
    if (inHistory) {
        throw new Error(`Cannot reuse one of your last ${PASSWORD_CONFIG.historyCount} passwords`);
    }

    // Get current password hash to add to history
    const currentResult = await pool.query(
        'SELECT password_hash FROM users WHERE id = $1',
        [userId]
    );

    if (currentResult.rows.length > 0 && currentResult.rows[0].password_hash) {
        await addPasswordToHistory(userId, currentResult.rows[0].password_hash);
    }

    // Hash new password with stronger salt rounds
    const newPasswordHash = await bcrypt.hash(newPassword, PASSWORD_CONFIG.saltRounds);

    // Update password and reset expiry
    await pool.query(
        `UPDATE users 
     SET password_hash = $1, 
         password_changed_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
        [newPasswordHash, userId]
    );

    logger.info('Password updated with policy enforcement', { userId });

    return newPasswordHash;
}

/**
 * Get password policy configuration (for display to users)
 */
export function getPasswordPolicyConfig() {
    return {
        minLength: PASSWORD_CONFIG.minLength,
        maxLength: PASSWORD_CONFIG.maxLength,
        requireUppercase: PASSWORD_CONFIG.requireUppercase,
        requireLowercase: PASSWORD_CONFIG.requireLowercase,
        requireDigit: PASSWORD_CONFIG.requireDigit,
        requireSpecial: PASSWORD_CONFIG.requireSpecial,
        expiryDays: PASSWORD_CONFIG.expiryDays,
        historyCount: PASSWORD_CONFIG.historyCount,
        maxFailedAttempts: PASSWORD_CONFIG.maxFailedAttempts,
        lockoutMinutes: PASSWORD_CONFIG.lockoutMinutes,
    };
}

/**
 * Check if user needs to change password (first login or expired)
 */
export async function mustChangePassword(userId: string): Promise<{
    mustChange: boolean;
    reason: 'expired' | 'first_login' | null;
}> {
    const result = await pool.query(
        'SELECT password_changed_at, role FROM users WHERE id = $1',
        [userId]
    );

    if (result.rows.length === 0) {
        return { mustChange: false, reason: null };
    }

    const { password_changed_at, role } = result.rows[0];

    // First login - password_changed_at is null
    if (!password_changed_at) {
        return { mustChange: true, reason: 'first_login' };
    }

    // Check expiry
    const expiryStatus = await getPasswordExpiryStatus(userId);
    if (expiryStatus.expired) {
        return { mustChange: true, reason: 'expired' };
    }

    return { mustChange: false, reason: null };
}
