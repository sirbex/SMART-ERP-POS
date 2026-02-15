/**
 * Refresh Token Service
 * 
 * Implements secure refresh token rotation:
 * - Token families for reuse detection
 * - Automatic rotation on each refresh
 * - Revocation of compromised token families
 * - Device/IP tracking for security
 * 
 * Security Features:
 * - Tokens are stored as SHA-256 hashes (not plain text)
 * - Token families detect and prevent token reuse attacks
 * - Old tokens are revoked after rotation
 * - All tokens in a family are revoked if reuse detected
 */

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import pool from '../../db/pool.js';
import logger from '../../utils/logger.js';
import type { UserRole } from '../../../../shared/types/user.js';

// Configuration
const REFRESH_TOKEN_CONFIG = {
    expiryDays: 30, // Refresh token valid for 30 days
    accessTokenExpiryMinutes: 15, // Short-lived access tokens (15 min)
    tokenLength: 64, // Bytes for random token
};

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || JWT_SECRET + '-refresh';

export interface TokenPair {
    accessToken: string;
    refreshToken: string;
    expiresIn: number; // seconds until access token expires
    refreshExpiresAt: Date;
}

export interface RefreshTokenPayload {
    userId: string;
    familyId: string;
    type: 'refresh';
}

/**
 * Generate a cryptographically secure random token
 */
function generateSecureToken(): string {
    return crypto.randomBytes(REFRESH_TOKEN_CONFIG.tokenLength).toString('hex');
}

/**
 * Hash a token for secure storage
 */
function hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generate access token (short-lived JWT)
 */
export function generateAccessToken(user: {
    id: string;
    email: string;
    fullName: string;
    role: UserRole;
}): string {
    const payload = {
        userId: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        type: 'access',
    };

    return jwt.sign(payload, JWT_SECRET, {
        expiresIn: `${REFRESH_TOKEN_CONFIG.accessTokenExpiryMinutes}m`
    });
}

/**
 * Generate refresh token and store in database
 */
export async function generateRefreshToken(
    userId: string,
    deviceInfo?: string,
    ipAddress?: string,
    existingFamilyId?: string
): Promise<{ token: string; familyId: string; expiresAt: Date }> {
    const token = generateSecureToken();
    const tokenHash = hashToken(token);
    const familyId = existingFamilyId || crypto.randomUUID();

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_CONFIG.expiryDays);

    await pool.query(
        `INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at, device_info, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, tokenHash, familyId, expiresAt, deviceInfo || null, ipAddress || null]
    );

    logger.info('Refresh token created', { userId, familyId });

    return { token, familyId, expiresAt };
}

/**
 * Generate complete token pair (access + refresh)
 */
export async function generateTokenPair(
    user: {
        id: string;
        email: string;
        fullName: string;
        role: UserRole;
    },
    deviceInfo?: string,
    ipAddress?: string
): Promise<TokenPair> {
    const accessToken = generateAccessToken(user);
    const { token: refreshToken, expiresAt } = await generateRefreshToken(
        user.id,
        deviceInfo,
        ipAddress
    );

    return {
        accessToken,
        refreshToken,
        expiresIn: REFRESH_TOKEN_CONFIG.accessTokenExpiryMinutes * 60, // Convert to seconds
        refreshExpiresAt: expiresAt,
    };
}

/**
 * Validate and rotate refresh token
 * Returns new token pair if valid, throws if invalid/revoked
 */
export async function rotateRefreshToken(
    refreshToken: string,
    deviceInfo?: string,
    ipAddress?: string
): Promise<TokenPair & { user: { id: string; email: string; fullName: string; role: UserRole } }> {
    const tokenHash = hashToken(refreshToken);

    // Find token in database
    const result = await pool.query(
        `SELECT rt.*, u.email, u.full_name as "fullName", u.role, u.is_active as "isActive"
     FROM refresh_tokens rt
     JOIN users u ON rt.user_id = u.id
     WHERE rt.token_hash = $1`,
        [tokenHash]
    );

    if (result.rows.length === 0) {
        logger.warn('Refresh token not found', { tokenHash: tokenHash.substring(0, 8) });
        throw new Error('Invalid refresh token');
    }

    const tokenRecord = result.rows[0];

    // Check if token is revoked (potential reuse attack!)
    if (tokenRecord.is_revoked) {
        // Token reuse detected - revoke ALL tokens in the family
        await revokeTokenFamily(tokenRecord.family_id);
        logger.error('Refresh token reuse detected! Revoking token family', {
            userId: tokenRecord.user_id,
            familyId: tokenRecord.family_id,
        });
        throw new Error('Token reuse detected. All sessions have been revoked for security.');
    }

    // Check expiration
    if (new Date(tokenRecord.expires_at) < new Date()) {
        logger.warn('Refresh token expired', { userId: tokenRecord.user_id });
        throw new Error('Refresh token expired');
    }

    // Check if user is active
    if (!tokenRecord.isActive) {
        logger.warn('Refresh attempt for inactive user', { userId: tokenRecord.user_id });
        throw new Error('User account is disabled');
    }

    // Mark old token as rotated (not revoked - we track rotation)
    await pool.query(
        `UPDATE refresh_tokens 
     SET is_revoked = true, rotated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
        [tokenRecord.id]
    );

    // Generate new token in same family
    const user = {
        id: tokenRecord.user_id,
        email: tokenRecord.email,
        fullName: tokenRecord.fullName,
        role: tokenRecord.role as UserRole,
    };

    const accessToken = generateAccessToken(user);
    const { token: newRefreshToken, expiresAt } = await generateRefreshToken(
        user.id,
        deviceInfo,
        ipAddress,
        tokenRecord.family_id // Keep same family for rotation tracking
    );

    logger.info('Refresh token rotated', { userId: user.id, familyId: tokenRecord.family_id });

    return {
        accessToken,
        refreshToken: newRefreshToken,
        expiresIn: REFRESH_TOKEN_CONFIG.accessTokenExpiryMinutes * 60,
        refreshExpiresAt: expiresAt,
        user,
    };
}

/**
 * Revoke all tokens in a family (security breach response)
 */
export async function revokeTokenFamily(familyId: string): Promise<number> {
    const result = await pool.query(
        `UPDATE refresh_tokens 
     SET is_revoked = true 
     WHERE family_id = $1 AND is_revoked = false`,
        [familyId]
    );

    const count = result.rowCount || 0;
    logger.warn('Token family revoked', { familyId, tokensRevoked: count });
    return count;
}

/**
 * Revoke all tokens for a user (logout all devices)
 */
export async function revokeAllUserTokens(userId: string): Promise<number> {
    const result = await pool.query(
        `UPDATE refresh_tokens 
     SET is_revoked = true 
     WHERE user_id = $1 AND is_revoked = false`,
        [userId]
    );

    const count = result.rowCount || 0;
    logger.info('All user tokens revoked', { userId, tokensRevoked: count });
    return count;
}

/**
 * Revoke a specific refresh token (single logout)
 */
export async function revokeRefreshToken(refreshToken: string): Promise<boolean> {
    const tokenHash = hashToken(refreshToken);

    const result = await pool.query(
        `UPDATE refresh_tokens 
     SET is_revoked = true 
     WHERE token_hash = $1`,
        [tokenHash]
    );

    const revoked = (result.rowCount || 0) > 0;
    if (revoked) {
        logger.info('Refresh token revoked');
    }
    return revoked;
}

/**
 * Get active sessions for a user
 */
export async function getUserSessions(userId: string): Promise<Array<{
    id: string;
    createdAt: Date;
    expiresAt: Date;
    deviceInfo: string | null;
    ipAddress: string | null;
    isCurrent?: boolean;
}>> {
    const result = await pool.query(
        `SELECT id, created_at as "createdAt", expires_at as "expiresAt", 
            device_info as "deviceInfo", ip_address as "ipAddress"
     FROM refresh_tokens
     WHERE user_id = $1 AND is_revoked = false AND expires_at > CURRENT_TIMESTAMP
     ORDER BY created_at DESC`,
        [userId]
    );

    return result.rows;
}

/**
 * Clean up expired tokens (run periodically)
 */
export async function cleanupExpiredTokens(): Promise<number> {
    const result = await pool.query(
        `DELETE FROM refresh_tokens 
     WHERE expires_at < CURRENT_TIMESTAMP 
        OR (is_revoked = true AND rotated_at < CURRENT_TIMESTAMP - INTERVAL '7 days')`
    );

    const count = result.rowCount || 0;
    if (count > 0) {
        logger.info('Expired tokens cleaned up', { tokensDeleted: count });
    }
    return count;
}

/**
 * Get token configuration (for frontend)
 */
export function getTokenConfig() {
    return {
        accessTokenExpiryMinutes: REFRESH_TOKEN_CONFIG.accessTokenExpiryMinutes,
        refreshTokenExpiryDays: REFRESH_TOKEN_CONFIG.expiryDays,
    };
}
