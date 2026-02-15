/**
 * Two-Factor Authentication (2FA) Service
 * 
 * Implements TOTP-based 2FA for admin and manager accounts.
 * Uses RFC 6238 compliant time-based one-time passwords.
 */

import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import pool from '../../db/pool.js';
import logger from '../../utils/logger.js';
import crypto from 'crypto';

// Configure TOTP settings
// NOTE: window: 2 allows for ±60 seconds of clock drift
authenticator.options = {
    digits: 6,
    step: 30, // 30-second window
    window: 2, // Allow 2 steps before/after for clock drift (±60 seconds)
};

const APP_NAME = process.env.APP_NAME || 'SamplePOS';

// Roles that require 2FA
const ROLES_REQUIRING_2FA = ['ADMIN', 'MANAGER'];

export interface TwoFactorSetupResult {
    secret: string;
    qrCodeDataUrl: string;
    backupCodes: string[];
    otpauthUrl: string;
}

export interface TwoFactorStatus {
    enabled: boolean;
    required: boolean;
    verifiedAt: string | null;
}

/**
 * Generate a new TOTP secret for a user
 */
export function generateSecret(): string {
    return authenticator.generateSecret(20); // 20 bytes = 160 bits
}

/**
 * Generate backup codes for account recovery
 */
export function generateBackupCodes(count: number = 10): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
        // Generate 8-character alphanumeric codes
        const code = crypto.randomBytes(4).toString('hex').toUpperCase();
        codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
    }
    return codes;
}

/**
 * Generate QR code data URL for authenticator app setup
 */
export async function generateQRCode(email: string, secret: string): Promise<string> {
    const otpauthUrl = authenticator.keyuri(email, APP_NAME, secret);

    try {
        const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, {
            errorCorrectionLevel: 'M',
            type: 'image/png',
            margin: 2,
            width: 256,
        });
        return qrCodeDataUrl;
    } catch (error) {
        logger.error('Failed to generate QR code', { error });
        throw new Error('Failed to generate QR code');
    }
}

/**
 * Verify a TOTP token
 */
export function verifyToken(secret: string, token: string): boolean {
    try {
        // Generate expected token for debugging (remove in production)
        const expectedToken = authenticator.generate(secret);
        const serverTime = new Date().toISOString();
        const unixTime = Math.floor(Date.now() / 1000);

        logger.debug('TOTP verification attempt', {
            providedToken: token,
            expectedToken,
            serverTime,
            unixTime,
            step: Math.floor(unixTime / 30),
        });

        const isValid = authenticator.verify({ token, secret });

        if (!isValid) {
            logger.warn('TOTP verification failed', {
                providedToken: token,
                expectedToken,
                serverTime,
                hint: 'Check if phone time matches server time'
            });
        }

        return isValid;
    } catch (error) {
        logger.error('TOTP verification error', { error });
        return false;
    }
}

/**
 * Check if a role requires 2FA
 */
export function roleRequires2FA(role: string): boolean {
    return ROLES_REQUIRING_2FA.includes(role.toUpperCase());
}

/**
 * Initialize 2FA setup for a user
 * Returns secret and QR code, but doesn't enable 2FA until verified
 */
export async function setup2FA(userId: string, email: string): Promise<TwoFactorSetupResult> {
    const secret = generateSecret();
    const backupCodes = generateBackupCodes(10);
    const qrCodeDataUrl = await generateQRCode(email, secret);
    const otpauthUrl = authenticator.keyuri(email, APP_NAME, secret);

    // Store secret temporarily (not enabled yet)
    // Hash backup codes before storing
    const hashedBackupCodes = backupCodes.map(code =>
        crypto.createHash('sha256').update(code).digest('hex')
    );

    await pool.query(
        `UPDATE users 
     SET totp_secret = $1, 
         backup_codes = $2,
         totp_enabled = FALSE,
         totp_verified_at = NULL
     WHERE id = $3`,
        [secret, hashedBackupCodes, userId]
    );

    logger.info('2FA setup initiated', { userId, email });

    return {
        secret,
        qrCodeDataUrl,
        backupCodes,
        otpauthUrl,
    };
}

/**
 * Verify and enable 2FA after user enters correct token
 */
export async function verify2FASetup(userId: string, token: string): Promise<boolean> {
    // Get the stored secret
    const result = await pool.query(
        `SELECT totp_secret, email FROM users WHERE id = $1`,
        [userId]
    );

    if (result.rows.length === 0) {
        throw new Error('User not found');
    }

    const { totp_secret: secret, email } = result.rows[0];

    if (!secret) {
        throw new Error('2FA not set up. Please initiate setup first.');
    }

    // Verify the token
    if (!verifyToken(secret, token)) {
        logger.warn('Invalid 2FA token during setup verification', { userId, email });
        return false;
    }

    // Enable 2FA
    await pool.query(
        `UPDATE users 
     SET totp_enabled = TRUE, 
         totp_verified_at = NOW()
     WHERE id = $1`,
        [userId]
    );

    logger.info('2FA enabled successfully', { userId, email });
    return true;
}

/**
 * Verify 2FA token during login
 */
export async function verify2FALogin(userId: string, token: string): Promise<boolean> {
    const result = await pool.query(
        `SELECT totp_secret, totp_enabled, backup_codes, email FROM users WHERE id = $1`,
        [userId]
    );

    if (result.rows.length === 0) {
        throw new Error('User not found');
    }

    const { totp_secret: secret, totp_enabled: enabled, backup_codes: backupCodes, email } = result.rows[0];

    if (!enabled || !secret) {
        throw new Error('2FA is not enabled for this account');
    }

    // First try TOTP verification
    if (verifyToken(secret, token)) {
        logger.info('2FA login verified via TOTP', { userId, email });
        return true;
    }

    // Try backup code verification
    if (backupCodes && Array.isArray(backupCodes)) {
        const hashedToken = crypto.createHash('sha256').update(token.toUpperCase().replace('-', '')).digest('hex');
        const normalizedToken = token.toUpperCase().includes('-') ? token.toUpperCase() :
            `${token.toUpperCase().slice(0, 4)}-${token.toUpperCase().slice(4)}`;
        const hashedNormalizedToken = crypto.createHash('sha256').update(normalizedToken).digest('hex');

        const codeIndex = backupCodes.findIndex((code: string) =>
            code === hashedToken || code === hashedNormalizedToken
        );

        if (codeIndex !== -1) {
            // Remove used backup code
            const newBackupCodes = [...backupCodes];
            newBackupCodes.splice(codeIndex, 1);

            await pool.query(
                `UPDATE users SET backup_codes = $1 WHERE id = $2`,
                [newBackupCodes, userId]
            );

            logger.warn('2FA login verified via backup code', {
                userId,
                email,
                remainingBackupCodes: newBackupCodes.length
            });
            return true;
        }
    }

    logger.warn('Invalid 2FA token during login', { userId, email });
    return false;
}

/**
 * Disable 2FA for a user
 */
export async function disable2FA(userId: string, token: string): Promise<boolean> {
    // First verify the token
    const verified = await verify2FALogin(userId, token);

    if (!verified) {
        throw new Error('Invalid 2FA token. Cannot disable 2FA.');
    }

    await pool.query(
        `UPDATE users 
     SET totp_secret = NULL, 
         totp_enabled = FALSE, 
         totp_verified_at = NULL,
         backup_codes = NULL
     WHERE id = $1`,
        [userId]
    );

    logger.info('2FA disabled', { userId });
    return true;
}

/**
 * Get 2FA status for a user
 */
export async function get2FAStatus(userId: string): Promise<TwoFactorStatus> {
    const result = await pool.query(
        `SELECT totp_enabled, totp_verified_at, role FROM users WHERE id = $1`,
        [userId]
    );

    if (result.rows.length === 0) {
        throw new Error('User not found');
    }

    const { totp_enabled, totp_verified_at, role } = result.rows[0];

    return {
        enabled: totp_enabled || false,
        required: roleRequires2FA(role),
        verifiedAt: totp_verified_at ? totp_verified_at.toISOString() : null,
    };
}

/**
 * Check if user needs to complete 2FA during login
 */
export async function requires2FAVerification(userId: string): Promise<boolean> {
    const result = await pool.query(
        `SELECT totp_enabled, role FROM users WHERE id = $1`,
        [userId]
    );

    if (result.rows.length === 0) {
        return false;
    }

    const { totp_enabled, role } = result.rows[0];

    // If 2FA is enabled, always require verification
    if (totp_enabled) {
        return true;
    }

    // If role requires 2FA but it's not enabled, they need to set it up
    // (handled separately in login flow)
    return false;
}

/**
 * Regenerate backup codes
 */
export async function regenerateBackupCodes(userId: string, token: string): Promise<string[]> {
    // Verify current 2FA token
    const verified = await verify2FALogin(userId, token);

    if (!verified) {
        throw new Error('Invalid 2FA token');
    }

    const newBackupCodes = generateBackupCodes(10);
    const hashedBackupCodes = newBackupCodes.map(code =>
        crypto.createHash('sha256').update(code).digest('hex')
    );

    await pool.query(
        `UPDATE users SET backup_codes = $1 WHERE id = $2`,
        [hashedBackupCodes, userId]
    );

    logger.info('Backup codes regenerated', { userId });
    return newBackupCodes;
}
