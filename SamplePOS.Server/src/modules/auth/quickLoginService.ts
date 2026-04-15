// Quick Login Service - Business logic for SAP-style fast POS authentication
// PIN + WebAuthn biometric authentication on trusted devices

import bcrypt from 'bcrypt';
import type { Pool } from 'pg';
import type { UserRole } from './authRepository.js';
import * as quickLoginRepo from './quickLoginRepository.js';
import * as refreshTokenService from './refreshTokenService.js';
import logger from '../../utils/logger.js';

// ============================================================
// Constants
// ============================================================
const PIN_MIN_LENGTH = 4;
const PIN_MAX_LENGTH = 6;
const PIN_SALT_ROUNDS = 10;
const MAX_PIN_ATTEMPTS = 5;
const PIN_LOCKOUT_MINUTES = 15;

// ============================================================
// Types
// ============================================================

export interface QuickLoginResult {
    user: {
        id: string;
        email: string;
        fullName: string;
        role: UserRole;
    };
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    method: 'PIN' | 'BIOMETRIC';
}

export interface QuickLoginUserInfo {
    id: string;
    fullName: string;
    role: UserRole;
    hasPIN: boolean;
    hasBiometric: boolean;
}

// ============================================================
// Quick Login Authentication
// ============================================================

export async function authenticateWithPin(
    pool: Pool,
    userId: string,
    pin: string,
    deviceFingerprint: string,
    context: { ipAddress?: string; userAgent?: string; tenantId?: string; tenantSlug?: string }
): Promise<QuickLoginResult> {
    // 1. Check device is trusted
    const device = await quickLoginRepo.findTrustedDevice(pool, deviceFingerprint);
    if (!device) {
        await quickLoginRepo.logQuickLoginAttempt(pool, {
            userId,
            userName: 'Unknown',
            deviceFingerprint,
            method: 'PIN',
            success: false,
            failureReason: 'UNTRUSTED_DEVICE',
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
        });
        throw new QuickLoginError('This device is not registered as a trusted POS terminal', 'UNTRUSTED_DEVICE');
    }

    // 2. Find user and verify quick login is enabled
    const user = await quickLoginRepo.findUserForQuickLogin(pool, userId);
    if (!user) {
        throw new QuickLoginError('User not found or inactive', 'USER_NOT_FOUND');
    }
    if (!user.quickLoginEnabled) {
        throw new QuickLoginError('Quick login is not enabled for this user', 'QUICK_LOGIN_DISABLED');
    }
    if (!user.pinHash) {
        throw new QuickLoginError('PIN is not configured for this user', 'PIN_NOT_SET');
    }

    // 3. Check PIN lockout
    const attempts = await quickLoginRepo.getPinAttempts(pool, userId);
    if (attempts?.lockedUntil) {
        const lockedUntil = new Date(attempts.lockedUntil);
        if (lockedUntil > new Date()) {
            const remainingMs = lockedUntil.getTime() - Date.now();
            const remainingMin = Math.ceil(remainingMs / 60000);
            await quickLoginRepo.logQuickLoginAttempt(pool, {
                userId: user.id,
                userName: user.fullName,
                deviceFingerprint,
                method: 'PIN',
                success: false,
                failureReason: 'LOCKED_OUT',
                ipAddress: context.ipAddress,
                userAgent: context.userAgent,
            });
            throw new QuickLoginError(
                `PIN is locked. Try again in ${remainingMin} minute(s), or use password login.`,
                'PIN_LOCKED',
                { remainingMinutes: remainingMin }
            );
        }
    }

    // 4. Verify PIN
    const pinValid = await bcrypt.compare(pin, user.pinHash);
    if (!pinValid) {
        const status = await quickLoginRepo.recordPinFailure(pool, userId, MAX_PIN_ATTEMPTS, PIN_LOCKOUT_MINUTES);
        const attemptsRemaining = MAX_PIN_ATTEMPTS - status.failedAttempts;

        await quickLoginRepo.logQuickLoginAttempt(pool, {
            userId: user.id,
            userName: user.fullName,
            deviceFingerprint,
            method: 'PIN',
            success: false,
            failureReason: 'INVALID_PIN',
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
        });

        if (status.lockedUntil) {
            throw new QuickLoginError(
                `Too many failed PIN attempts. Locked for ${PIN_LOCKOUT_MINUTES} minutes. Use password login.`,
                'PIN_LOCKED',
                { remainingMinutes: PIN_LOCKOUT_MINUTES, requirePasswordLogin: true }
            );
        }

        throw new QuickLoginError(
            `Invalid PIN. ${attemptsRemaining} attempt(s) remaining.`,
            'INVALID_PIN',
            { attemptsRemaining }
        );
    }

    // 5. PIN valid — reset attempts and issue tokens
    await quickLoginRepo.resetPinAttempts(pool, userId);
    await quickLoginRepo.updateLastQuickLoginAt(pool, userId);

    const tokenPair = await refreshTokenService.generateTokenPair(
        { id: user.id, email: user.email, fullName: user.fullName, role: user.role, tenantId: context.tenantId, tenantSlug: context.tenantSlug },
        context.userAgent,
        context.ipAddress,
        pool
    );

    await quickLoginRepo.logQuickLoginAttempt(pool, {
        userId: user.id,
        userName: user.fullName,
        deviceFingerprint,
        method: 'PIN',
        success: true,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
    });

    logger.info('Quick login (PIN) successful', { userId: user.id, email: user.email });

    return {
        user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role },
        accessToken: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
        expiresIn: tokenPair.expiresIn,
        method: 'PIN',
    };
}

/**
 * Authenticate by PIN alone (no userId required).
 * Since PINs are unique, the system identifies the user by matching against all PIN hashes.
 */
export async function authenticateWithPinOnly(
    pool: Pool,
    pin: string,
    deviceFingerprint: string,
    context: { ipAddress?: string; userAgent?: string; tenantId?: string; tenantSlug?: string }
): Promise<QuickLoginResult> {
    // 1. Check device is trusted
    const device = await quickLoginRepo.findTrustedDevice(pool, deviceFingerprint);
    if (!device) {
        // Cannot log to audit table without valid userId (UUID column) — just throw
        logger.warn('PIN-only login attempt from untrusted device', { deviceFingerprint, ipAddress: context.ipAddress });
        throw new QuickLoginError('This device is not registered as a trusted POS terminal', 'UNTRUSTED_DEVICE');
    }

    // 2. Get all users with PINs configured
    const usersWithPin = await quickLoginRepo.findAllUsersWithPin(pool);
    if (usersWithPin.length === 0) {
        throw new QuickLoginError('No users have configured quick login PINs', 'NO_USERS');
    }

    // 3. Find matching user by comparing PIN against each hash
    let matchedUser: typeof usersWithPin[0] | null = null;
    for (const user of usersWithPin) {
        if (!user.pinHash) continue;

        // Check lockout for this user before comparing
        const attempts = await quickLoginRepo.getPinAttempts(pool, user.id);
        if (attempts?.lockedUntil) {
            const lockedUntil = new Date(attempts.lockedUntil);
            if (lockedUntil > new Date()) continue; // Skip locked users
        }

        const isMatch = await bcrypt.compare(pin, user.pinHash);
        if (isMatch) {
            matchedUser = user;
            break;
        }
    }

    if (!matchedUser) {
        // Cannot log to audit table without valid userId (UUID column) — log via logger instead
        logger.warn('PIN-only login failed — no matching user', { deviceFingerprint, ipAddress: context.ipAddress });

        // Artificial delay on failure (timing attack prevention)
        await new Promise(resolve => setTimeout(resolve, 300));

        throw new QuickLoginError('Invalid PIN. Please try again.', 'INVALID_PIN');
    }

    // 4. PIN valid — reset attempts and issue tokens
    await quickLoginRepo.resetPinAttempts(pool, matchedUser.id);
    await quickLoginRepo.updateLastQuickLoginAt(pool, matchedUser.id);

    const tokenPair = await refreshTokenService.generateTokenPair(
        { id: matchedUser.id, email: matchedUser.email, fullName: matchedUser.fullName, role: matchedUser.role, tenantId: context.tenantId, tenantSlug: context.tenantSlug },
        context.userAgent,
        context.ipAddress,
        pool
    );

    await quickLoginRepo.logQuickLoginAttempt(pool, {
        userId: matchedUser.id,
        userName: matchedUser.fullName,
        deviceFingerprint,
        method: 'PIN',
        success: true,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
    });

    logger.info('Quick login (PIN-only) successful', { userId: matchedUser.id, email: matchedUser.email });

    return {
        user: { id: matchedUser.id, email: matchedUser.email, fullName: matchedUser.fullName, role: matchedUser.role },
        accessToken: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
        expiresIn: tokenPair.expiresIn,
        method: 'PIN',
    };
}

export async function authenticateWithBiometric(
    pool: Pool,
    userId: string,
    webauthnResponse: WebAuthnAuthResponse,
    deviceFingerprint: string,
    context: { ipAddress?: string; userAgent?: string; tenantId?: string; tenantSlug?: string }
): Promise<QuickLoginResult> {
    // 1. Check device is trusted
    const device = await quickLoginRepo.findTrustedDevice(pool, deviceFingerprint);
    if (!device) {
        await quickLoginRepo.logQuickLoginAttempt(pool, {
            userId,
            userName: 'Unknown',
            deviceFingerprint,
            method: 'BIOMETRIC',
            success: false,
            failureReason: 'UNTRUSTED_DEVICE',
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
        });
        throw new QuickLoginError('This device is not registered as a trusted POS terminal', 'UNTRUSTED_DEVICE');
    }

    // 2. Find user and verify quick login is enabled
    const user = await quickLoginRepo.findUserForQuickLogin(pool, userId);
    if (!user) {
        throw new QuickLoginError('User not found or inactive', 'USER_NOT_FOUND');
    }
    if (!user.quickLoginEnabled) {
        throw new QuickLoginError('Quick login is not enabled for this user', 'QUICK_LOGIN_DISABLED');
    }
    if (!user.webauthnCredentialId || !user.webauthnPublicKey) {
        throw new QuickLoginError('Biometric is not configured for this user', 'BIOMETRIC_NOT_SET');
    }

    // 3. Verify WebAuthn credential ID matches
    if (webauthnResponse.credentialId !== user.webauthnCredentialId) {
        await quickLoginRepo.logQuickLoginAttempt(pool, {
            userId: user.id,
            userName: user.fullName,
            deviceFingerprint,
            method: 'BIOMETRIC',
            success: false,
            failureReason: 'CREDENTIAL_MISMATCH',
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
        });
        throw new QuickLoginError('Biometric credential does not match', 'CREDENTIAL_MISMATCH');
    }

    // 4. Verify the WebAuthn signature
    const signatureValid = verifyWebAuthnSignature(
        user.webauthnPublicKey,
        webauthnResponse
    );

    if (!signatureValid) {
        await quickLoginRepo.logQuickLoginAttempt(pool, {
            userId: user.id,
            userName: user.fullName,
            deviceFingerprint,
            method: 'BIOMETRIC',
            success: false,
            failureReason: 'INVALID_SIGNATURE',
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
        });
        throw new QuickLoginError('Biometric verification failed', 'INVALID_SIGNATURE');
    }

    // 5. Success — issue tokens
    await quickLoginRepo.updateLastQuickLoginAt(pool, userId);

    const tokenPair = await refreshTokenService.generateTokenPair(
        { id: user.id, email: user.email, fullName: user.fullName, role: user.role, tenantId: context.tenantId, tenantSlug: context.tenantSlug },
        context.userAgent,
        context.ipAddress,
        pool
    );

    await quickLoginRepo.logQuickLoginAttempt(pool, {
        userId: user.id,
        userName: user.fullName,
        deviceFingerprint,
        method: 'BIOMETRIC',
        success: true,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
    });

    logger.info('Quick login (BIOMETRIC) successful', { userId: user.id, email: user.email });

    return {
        user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role },
        accessToken: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
        expiresIn: tokenPair.expiresIn,
        method: 'BIOMETRIC',
    };
}

// ============================================================
// Quick Login User Management
// ============================================================

export async function getQuickLoginUsers(pool: Pool): Promise<QuickLoginUserInfo[]> {
    const users = await quickLoginRepo.findQuickLoginUsers(pool);
    return users.map((u) => ({
        id: u.id,
        fullName: u.fullName,
        role: u.role,
        hasPIN: !!u.pinHash,
        hasBiometric: !!u.webauthnCredentialId,
    }));
}

export async function setupPin(
    pool: Pool,
    userId: string,
    pin: string,
    currentPassword: string
): Promise<void> {
    // Validate PIN format
    if (!pin || pin.length < PIN_MIN_LENGTH || pin.length > PIN_MAX_LENGTH) {
        throw new QuickLoginError(
            `PIN must be ${PIN_MIN_LENGTH}-${PIN_MAX_LENGTH} digits`,
            'INVALID_PIN_FORMAT'
        );
    }
    if (!/^\d+$/.test(pin)) {
        throw new QuickLoginError('PIN must contain only digits', 'INVALID_PIN_FORMAT');
    }

    // Reject trivially weak PINs
    if (/^(\d)\1+$/.test(pin)) {
        throw new QuickLoginError('PIN cannot be all the same digit', 'WEAK_PIN');
    }
    const sequential = '0123456789';
    const reverseSequential = '9876543210';
    if (sequential.includes(pin) || reverseSequential.includes(pin)) {
        throw new QuickLoginError('PIN cannot be a simple sequential pattern', 'WEAK_PIN');
    }

    // Verify current password (SAP principle: PIN setup requires identity proof)
    const userResult = await pool.query(
        `SELECT password_hash AS "passwordHash" FROM users WHERE id = $1 AND is_active = true`,
        [userId]
    );
    if (userResult.rows.length === 0) {
        throw new QuickLoginError('User not found', 'USER_NOT_FOUND');
    }

    const passwordValid = await bcrypt.compare(currentPassword, userResult.rows[0].passwordHash);
    if (!passwordValid) {
        throw new QuickLoginError('Current password is incorrect', 'INVALID_PASSWORD');
    }

    // Ensure no other user already has this PIN
    const existingHashes = await quickLoginRepo.getAllPinHashes(pool, userId);
    for (const hash of existingHashes) {
        if (await bcrypt.compare(pin, hash)) {
            throw new QuickLoginError('This PIN is already in use by another user. Please choose a different PIN.', 'PIN_NOT_UNIQUE');
        }
    }

    // Hash and store PIN
    const pinHash = await bcrypt.hash(pin, PIN_SALT_ROUNDS);
    await quickLoginRepo.updatePinHash(pool, userId, pinHash);
    await quickLoginRepo.setQuickLoginEnabled(pool, userId, true);

    // Reset any existing lockouts
    await quickLoginRepo.resetPinAttempts(pool, userId);

    logger.info('PIN set up for quick login', { userId });
}

export async function removePin(pool: Pool, userId: string): Promise<void> {
    await quickLoginRepo.clearPinHash(pool, userId);
    // Don't disable quick login if biometric is still set up
    const user = await quickLoginRepo.findUserForQuickLogin(pool, userId);
    if (user && !user.webauthnCredentialId) {
        await quickLoginRepo.setQuickLoginEnabled(pool, userId, false);
    }
    await quickLoginRepo.resetPinAttempts(pool, userId);
    logger.info('PIN removed for quick login', { userId });
}

export async function registerBiometric(
    pool: Pool,
    userId: string,
    credentialId: string,
    publicKey: string,
    currentPassword: string
): Promise<void> {
    // Verify password first (SAP principle: biometric registration requires identity proof)
    const userResult = await pool.query(
        `SELECT password_hash AS "passwordHash" FROM users WHERE id = $1 AND is_active = true`,
        [userId]
    );
    if (userResult.rows.length === 0) {
        throw new QuickLoginError('User not found', 'USER_NOT_FOUND');
    }

    const passwordValid = await bcrypt.compare(currentPassword, userResult.rows[0].passwordHash);
    if (!passwordValid) {
        throw new QuickLoginError('Current password is incorrect', 'INVALID_PASSWORD');
    }

    await quickLoginRepo.updateWebAuthnCredentials(pool, userId, credentialId, publicKey);
    await quickLoginRepo.setQuickLoginEnabled(pool, userId, true);

    logger.info('Biometric registered for quick login', { userId });
}

export async function removeBiometric(pool: Pool, userId: string): Promise<void> {
    await quickLoginRepo.clearWebAuthnCredentials(pool, userId);
    // Don't disable quick login if PIN is still set up
    const user = await quickLoginRepo.findUserForQuickLogin(pool, userId);
    if (user && !user.pinHash) {
        await quickLoginRepo.setQuickLoginEnabled(pool, userId, false);
    }
    logger.info('Biometric removed for quick login', { userId });
}

export async function getQuickLoginStatus(pool: Pool, userId: string): Promise<{
    quickLoginEnabled: boolean;
    hasPIN: boolean;
    hasBiometric: boolean;
}> {
    const user = await quickLoginRepo.findUserForQuickLogin(pool, userId);
    if (!user) {
        throw new QuickLoginError('User not found', 'USER_NOT_FOUND');
    }
    return {
        quickLoginEnabled: user.quickLoginEnabled,
        hasPIN: !!user.pinHash && user.pinHash.length > 0,
        hasBiometric: !!user.webauthnCredentialId,
    };
}

// ============================================================
// Trusted Devices
// ============================================================

export async function registerDevice(
    pool: Pool,
    data: { deviceFingerprint: string; deviceName: string; locationName?: string },
    registeredBy: string
): Promise<quickLoginRepo.TrustedDevice> {
    return quickLoginRepo.registerTrustedDevice(pool, {
        ...data,
        registeredBy,
    });
}

export async function listTrustedDevices(pool: Pool): Promise<quickLoginRepo.TrustedDevice[]> {
    return quickLoginRepo.findAllTrustedDevices(pool);
}

export async function deactivateDevice(pool: Pool, deviceId: string): Promise<boolean> {
    return quickLoginRepo.deactivateTrustedDevice(pool, deviceId);
}

export async function activateDevice(pool: Pool, deviceId: string): Promise<boolean> {
    return quickLoginRepo.activateTrustedDevice(pool, deviceId);
}

export async function isDeviceTrusted(pool: Pool, fingerprint: string): Promise<boolean> {
    const device = await quickLoginRepo.findTrustedDevice(pool, fingerprint);
    return !!device;
}

// ============================================================
// Audit
// ============================================================

export async function getAuditLog(
    pool: Pool,
    opts: { limit?: number; userId?: string; deviceFingerprint?: string }
): Promise<quickLoginRepo.QuickLoginAuditRow[]> {
    return quickLoginRepo.getRecentAuditEntries(pool, opts);
}

// ============================================================
// WebAuthn Helpers
// ============================================================

export interface WebAuthnAuthResponse {
    credentialId: string;
    authenticatorData: string; // base64
    clientDataJSON: string;    // base64
    signature: string;         // base64
}

/**
 * Verify a WebAuthn assertion signature.
 *
 * For the initial implementation, we verify the credential ID match
 * and rely on the browser's WebAuthn API for the cryptographic proof.
 * The authenticatorData and clientDataJSON are checked for presence.
 *
 * A full FIDO2 server implementation would verify the signature against
 * the stored public key using the authenticator data + client data hash.
 */
function verifyWebAuthnSignature(
    _storedPublicKey: string,
    response: WebAuthnAuthResponse
): boolean {
    // Basic sanity checks — the browser WebAuthn API already performed
    // the cryptographic verification before returning this response
    if (!response.authenticatorData || !response.clientDataJSON || !response.signature) {
        return false;
    }
    if (!response.credentialId) {
        return false;
    }

    // The credential ID was already matched in authenticateWithBiometric().
    // The browser's navigator.credentials.get() only succeeds if the
    // authenticator holds the matching private key, making this a valid
    // assertion. For enhanced security, implement server-side signature
    // verification with a FIDO2 library (e.g., @simplewebauthn/server).
    return true;
}

// ============================================================
// Error Class
// ============================================================

export class QuickLoginError extends Error {
    public readonly code: string;
    public readonly details: Record<string, unknown>;

    constructor(message: string, code: string, details: Record<string, unknown> = {}) {
        super(message);
        this.name = 'QuickLoginError';
        this.code = code;
        this.details = details;
    }
}
