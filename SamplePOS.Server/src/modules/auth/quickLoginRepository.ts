// Quick Login Repository - Raw SQL queries only
// Handles data access for PIN/biometric quick login, trusted devices, and audit

import type { Pool, PoolClient } from 'pg';
import type { DbConnection } from '../../db/unitOfWork.js';
import type { UserRole } from './authRepository.js';

// ============================================================
// Types
// ============================================================

export interface QuickLoginUser {
    id: string;
    fullName: string;
    role: UserRole;
    email: string;
    quickLoginEnabled: boolean;
    pinHash: string | null;
    webauthnCredentialId: string | null;
    webauthnPublicKey: string | null;
}

export interface TrustedDevice {
    id: string;
    deviceFingerprint: string;
    deviceName: string;
    locationName: string | null;
    isActive: boolean;
    registeredBy: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface QuickLoginAuditRow {
    id: string;
    userId: string;
    userName: string;
    deviceFingerprint: string;
    method: 'PIN' | 'BIOMETRIC';
    success: boolean;
    failureReason: string | null;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: string;
}

export interface PinAttemptStatus {
    failedAttempts: number;
    lastAttemptAt: string | null;
    lockedUntil: string | null;
}

// ============================================================
// Quick Login Users
// ============================================================

export async function findQuickLoginUsers(conn: DbConnection): Promise<QuickLoginUser[]> {
    const result = await conn.query(
        `SELECT id, full_name AS "fullName", role, email,
            quick_login_enabled AS "quickLoginEnabled",
            pin_hash AS "pinHash",
            webauthn_credential_id AS "webauthnCredentialId",
            webauthn_public_key AS "webauthnPublicKey"
     FROM users
     WHERE is_active = true AND quick_login_enabled = true
     ORDER BY full_name`
    );
    return result.rows;
}

export async function findUserForQuickLogin(conn: DbConnection, userId: string): Promise<QuickLoginUser | null> {
    const result = await conn.query(
        `SELECT id, full_name AS "fullName", role, email,
            quick_login_enabled AS "quickLoginEnabled",
            pin_hash AS "pinHash",
            webauthn_credential_id AS "webauthnCredentialId",
            webauthn_public_key AS "webauthnPublicKey"
     FROM users
     WHERE id = $1 AND is_active = true`,
        [userId]
    );
    return result.rows[0] || null;
}

export async function getAllPinHashes(conn: DbConnection, excludeUserId: string): Promise<string[]> {
    const result = await conn.query(
        `SELECT pin_hash FROM users WHERE pin_hash IS NOT NULL AND id != $1 AND is_active = true`,
        [excludeUserId]
    );
    return result.rows.map((r: { pin_hash: string }) => r.pin_hash);
}

export async function findAllUsersWithPin(conn: DbConnection): Promise<QuickLoginUser[]> {
    const result = await conn.query(
        `SELECT id, full_name AS "fullName", role, email,
            quick_login_enabled AS "quickLoginEnabled",
            pin_hash AS "pinHash",
            webauthn_credential_id AS "webauthnCredentialId",
            webauthn_public_key AS "webauthnPublicKey"
     FROM users
     WHERE is_active = true AND quick_login_enabled = true AND pin_hash IS NOT NULL
     ORDER BY full_name`
    );
    return result.rows;
}

export async function updatePinHash(conn: DbConnection, userId: string, pinHash: string): Promise<void> {
    await conn.query(
        `UPDATE users SET pin_hash = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [userId, pinHash]
    );
}

export async function setQuickLoginEnabled(conn: DbConnection, userId: string, enabled: boolean): Promise<void> {
    await conn.query(
        `UPDATE users SET quick_login_enabled = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [userId, enabled]
    );
}

export async function updateWebAuthnCredentials(
    conn: DbConnection,
    userId: string,
    credentialId: string,
    publicKey: string
): Promise<void> {
    await conn.query(
        `UPDATE users
     SET webauthn_credential_id = $2, webauthn_public_key = $3, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
        [userId, credentialId, publicKey]
    );
}

export async function clearWebAuthnCredentials(conn: DbConnection, userId: string): Promise<void> {
    await conn.query(
        `UPDATE users
     SET webauthn_credential_id = NULL, webauthn_public_key = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
        [userId]
    );
}

export async function clearPinHash(conn: DbConnection, userId: string): Promise<void> {
    await conn.query(
        `UPDATE users SET pin_hash = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [userId]
    );
}

export async function updateLastQuickLoginAt(conn: DbConnection, userId: string): Promise<void> {
    await conn.query(
        `UPDATE users SET last_quick_login_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [userId]
    );
}

// ============================================================
// Trusted Devices
// ============================================================

export async function findTrustedDevice(conn: DbConnection, fingerprint: string): Promise<TrustedDevice | null> {
    const result = await conn.query(
        `SELECT id, device_fingerprint AS "deviceFingerprint", device_name AS "deviceName",
            location_name AS "locationName", is_active AS "isActive",
            registered_by AS "registeredBy",
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM trusted_devices
     WHERE device_fingerprint = $1 AND is_active = true`,
        [fingerprint]
    );
    return result.rows[0] || null;
}

export async function findAllTrustedDevices(conn: DbConnection): Promise<TrustedDevice[]> {
    const result = await conn.query(
        `SELECT id, device_fingerprint AS "deviceFingerprint", device_name AS "deviceName",
            location_name AS "locationName", is_active AS "isActive",
            registered_by AS "registeredBy",
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM trusted_devices
     ORDER BY created_at DESC`
    );
    return result.rows;
}

export async function registerTrustedDevice(
    conn: DbConnection,
    data: { deviceFingerprint: string; deviceName: string; locationName?: string; registeredBy: string }
): Promise<TrustedDevice> {
    const result = await conn.query(
        `INSERT INTO trusted_devices (device_fingerprint, device_name, location_name, registered_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (device_fingerprint) DO UPDATE
       SET device_name = $2, location_name = $3, is_active = true, updated_at = CURRENT_TIMESTAMP
     RETURNING id, device_fingerprint AS "deviceFingerprint", device_name AS "deviceName",
               location_name AS "locationName", is_active AS "isActive",
               registered_by AS "registeredBy",
               created_at AS "createdAt", updated_at AS "updatedAt"`,
        [data.deviceFingerprint, data.deviceName, data.locationName || null, data.registeredBy]
    );
    return result.rows[0];
}

export async function deactivateTrustedDevice(conn: DbConnection, deviceId: string): Promise<boolean> {
    const result = await conn.query(
        `UPDATE trusted_devices SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [deviceId]
    );
    return (result.rowCount ?? 0) > 0;
}

export async function activateTrustedDevice(conn: DbConnection, deviceId: string): Promise<boolean> {
    const result = await conn.query(
        `UPDATE trusted_devices SET is_active = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [deviceId]
    );
    return (result.rowCount ?? 0) > 0;
}

// ============================================================
// Quick Login Audit
// ============================================================

export async function logQuickLoginAttempt(
    conn: DbConnection,
    data: {
        userId: string;
        userName: string;
        deviceFingerprint: string;
        method: 'PIN' | 'BIOMETRIC';
        success: boolean;
        failureReason?: string;
        ipAddress?: string;
        userAgent?: string;
    }
): Promise<void> {
    await conn.query(
        `INSERT INTO quick_login_audit (user_id, user_name, device_fingerprint, method, success, failure_reason, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
            data.userId,
            data.userName,
            data.deviceFingerprint,
            data.method,
            data.success,
            data.failureReason || null,
            data.ipAddress || null,
            data.userAgent || null,
        ]
    );
}

export async function getRecentAuditEntries(
    conn: DbConnection,
    opts: { limit?: number; userId?: string; deviceFingerprint?: string }
): Promise<QuickLoginAuditRow[]> {
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    let paramIdx = 1;

    if (opts.userId) {
        conditions.push(`user_id = $${paramIdx++}`);
        params.push(opts.userId);
    }
    if (opts.deviceFingerprint) {
        conditions.push(`device_fingerprint = $${paramIdx++}`);
        params.push(opts.deviceFingerprint);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = opts.limit || 50;

    const result = await conn.query(
        `SELECT id, user_id AS "userId", user_name AS "userName",
            device_fingerprint AS "deviceFingerprint",
            method, success, failure_reason AS "failureReason",
            ip_address AS "ipAddress", user_agent AS "userAgent",
            created_at AS "createdAt"
     FROM quick_login_audit
     ${where}
     ORDER BY created_at DESC
     LIMIT $${paramIdx}`,
        [...params, limit]
    );
    return result.rows;
}

// ============================================================
// PIN Attempt Tracking (Rate Limiting)
// ============================================================

export async function getPinAttempts(conn: DbConnection, userId: string): Promise<PinAttemptStatus | null> {
    const result = await conn.query(
        `SELECT failed_attempts AS "failedAttempts",
            last_attempt_at AS "lastAttemptAt",
            locked_until AS "lockedUntil"
     FROM pin_attempts WHERE user_id = $1`,
        [userId]
    );
    return result.rows[0] || null;
}

export async function recordPinFailure(conn: DbConnection, userId: string, maxAttempts: number, lockoutMinutes: number): Promise<PinAttemptStatus> {
    const result = await conn.query(
        `INSERT INTO pin_attempts (user_id, failed_attempts, last_attempt_at, locked_until)
     VALUES ($1, 1, CURRENT_TIMESTAMP, NULL)
     ON CONFLICT (user_id) DO UPDATE SET
       failed_attempts = pin_attempts.failed_attempts + 1,
       last_attempt_at = CURRENT_TIMESTAMP,
       locked_until = CASE
         WHEN pin_attempts.failed_attempts + 1 >= $2
         THEN CURRENT_TIMESTAMP + INTERVAL '1 minute' * $3
         ELSE pin_attempts.locked_until
       END
     RETURNING failed_attempts AS "failedAttempts",
               last_attempt_at AS "lastAttemptAt",
               locked_until AS "lockedUntil"`,
        [userId, maxAttempts, lockoutMinutes]
    );
    return result.rows[0];
}

export async function resetPinAttempts(conn: DbConnection, userId: string): Promise<void> {
    await conn.query(
        `DELETE FROM pin_attempts WHERE user_id = $1`,
        [userId]
    );
}
