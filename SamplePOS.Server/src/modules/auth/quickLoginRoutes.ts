// Quick Login Routes - SAP-style fast POS authentication
// PIN + biometric quick login on trusted devices
// Trusted device management + audit endpoints

import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { pool as globalPool } from '../../db/pool.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import { authRateLimit } from '../../middleware/security.js';
import { asyncHandler, ValidationError, NotFoundError, ForbiddenError } from '../../middleware/errorHandler.js';
import * as quickLoginService from './quickLoginService.js';
import { QuickLoginError } from './quickLoginService.js';
import logger from '../../utils/logger.js';
import rateLimit from 'express-rate-limit';

const router = Router();

// ============================================================
// Rate limiting for PIN attempts (stricter than general auth)
// ============================================================
const quickLoginRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 30, // 30 attempts per IP per 15 min (per-user lockout is the real guard)
    message: { success: false, error: 'Too many quick login attempts. Please wait.' },
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
});

// ============================================================
// Zod Schemas
// ============================================================

const QuickLoginPinSchema = z.object({
    userId: z.string().uuid('Valid user ID required'),
    pin: z.string().min(4).max(6).regex(/^\d+$/, 'PIN must be digits only'),
    deviceFingerprint: z.string().min(1, 'Device fingerprint required').max(512),
});

const QuickLoginPinOnlySchema = z.object({
    pin: z.string().min(4).max(6).regex(/^\d+$/, 'PIN must be digits only'),
    deviceFingerprint: z.string().min(1, 'Device fingerprint required').max(512),
});

const QuickLoginBiometricSchema = z.object({
    userId: z.string().uuid('Valid user ID required'),
    webauthnResponse: z.object({
        credentialId: z.string().min(1),
        authenticatorData: z.string().min(1),
        clientDataJSON: z.string().min(1),
        signature: z.string().min(1),
    }),
    deviceFingerprint: z.string().min(1, 'Device fingerprint required').max(512),
});

const SetupPinSchema = z.object({
    pin: z.string().min(4).max(6).regex(/^\d+$/, 'PIN must be digits only'),
    currentPassword: z.string().min(1, 'Current password required'),
});

const RegisterBiometricSchema = z.object({
    credentialId: z.string().min(1),
    publicKey: z.string().min(1),
    currentPassword: z.string().min(1, 'Current password required'),
});

const RegisterDeviceSchema = z.object({
    deviceFingerprint: z.string().min(1).max(512),
    deviceName: z.string().min(1).max(255),
    locationName: z.string().max(255).optional(),
});

const CheckDeviceSchema = z.object({
    deviceFingerprint: z.string().min(1).max(512),
});

// ============================================================
// PUBLIC: Quick Login Authentication (no JWT required)
// ============================================================

/**
 * GET /api/auth/quick-login/users
 * List users available for quick login (public — displayed on POS lock screen)
 * Returns only id, fullName, role, and available methods. No secrets.
 */
router.get('/users', asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const users = await quickLoginService.getQuickLoginUsers(pool);
    res.json({ success: true, data: users });
}));

/**
 * POST /api/auth/quick-login/pin
 * Authenticate with PIN on a trusted device
 */
router.post('/pin', quickLoginRateLimit, asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const { userId, pin, deviceFingerprint } = QuickLoginPinSchema.parse(req.body);

    try {
        const result = await quickLoginService.authenticateWithPin(pool, userId, pin, deviceFingerprint, {
            ipAddress: req.ip || req.socket.remoteAddress,
            userAgent: req.headers['user-agent'],
            tenantId: req.tenantId,
            tenantSlug: req.tenant?.slug,
        });

        // Set refresh token as httpOnly cookie (same pattern as standard login)
        res.cookie('refreshToken', result.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 30 * 24 * 60 * 60 * 1000,
            path: '/api/auth/token',
        });

        res.json({
            success: true,
            data: {
                user: result.user,
                accessToken: result.accessToken,
                token: result.accessToken,
                refreshToken: result.refreshToken,
                expiresIn: result.expiresIn,
                method: result.method,
            },
            message: 'Quick login successful',
        });
    } catch (error) {
        // Artificial delay on PIN failures (prevent timing attacks)
        await new Promise(resolve => setTimeout(resolve, 300));

        if (error instanceof QuickLoginError) {
            const statusCode = error.code === 'PIN_LOCKED' ? 423
                : error.code === 'UNTRUSTED_DEVICE' ? 403
                    : 401;

            res.status(statusCode).json({
                success: false,
                error: error.message,
                error_code: error.code,
                data: error.details,
            });
            return;
        }
        throw error;
    }
}));

/**
 * POST /api/auth/quick-login/pin-only
 * Authenticate with PIN only (no userId) — system identifies user by unique PIN
 */
router.post('/pin-only', quickLoginRateLimit, asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const { pin, deviceFingerprint } = QuickLoginPinOnlySchema.parse(req.body);

    try {
        const result = await quickLoginService.authenticateWithPinOnly(pool, pin, deviceFingerprint, {
            ipAddress: req.ip || req.socket.remoteAddress,
            userAgent: req.headers['user-agent'],
            tenantId: req.tenantId,
            tenantSlug: req.tenant?.slug,
        });

        res.cookie('refreshToken', result.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 30 * 24 * 60 * 60 * 1000,
            path: '/api/auth/token',
        });

        res.json({
            success: true,
            data: {
                user: result.user,
                accessToken: result.accessToken,
                token: result.accessToken,
                refreshToken: result.refreshToken,
                expiresIn: result.expiresIn,
                method: result.method,
            },
            message: 'Quick login successful',
        });
    } catch (error) {
        if (error instanceof QuickLoginError) {
            const statusCode = error.code === 'PIN_LOCKED' ? 423
                : error.code === 'UNTRUSTED_DEVICE' ? 403
                    : 401;

            res.status(statusCode).json({
                success: false,
                error: error.message,
                error_code: error.code,
                data: error.details,
            });
            return;
        }
        throw error;
    }
}));

/**
 * POST /api/auth/quick-login/biometric
 * Authenticate with WebAuthn biometric on a trusted device
 */
router.post('/biometric', quickLoginRateLimit, asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const { userId, webauthnResponse, deviceFingerprint } = QuickLoginBiometricSchema.parse(req.body);

    try {
        const result = await quickLoginService.authenticateWithBiometric(pool, userId, webauthnResponse, deviceFingerprint, {
            ipAddress: req.ip || req.socket.remoteAddress,
            userAgent: req.headers['user-agent'],
            tenantId: req.tenantId,
            tenantSlug: req.tenant?.slug,
        });

        res.cookie('refreshToken', result.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 30 * 24 * 60 * 60 * 1000,
            path: '/api/auth/token',
        });

        res.json({
            success: true,
            data: {
                user: result.user,
                accessToken: result.accessToken,
                token: result.accessToken,
                refreshToken: result.refreshToken,
                expiresIn: result.expiresIn,
                method: result.method,
            },
            message: 'Biometric login successful',
        });
    } catch (error) {
        if (error instanceof QuickLoginError) {
            const statusCode = error.code === 'UNTRUSTED_DEVICE' ? 403 : 401;
            res.status(statusCode).json({
                success: false,
                error: error.message,
                error_code: error.code,
                data: error.details,
            });
            return;
        }
        throw error;
    }
}));

/**
 * POST /api/auth/quick-login/check-device
 * Check if a device is trusted (public — used by POS lock screen)
 */
router.post('/check-device', asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const { deviceFingerprint } = CheckDeviceSchema.parse(req.body);
    const trusted = await quickLoginService.isDeviceTrusted(pool, deviceFingerprint);
    res.json({ success: true, data: { trusted } });
}));

// ============================================================
// PROTECTED: Quick Login Setup (requires JWT)
// ============================================================

/**
 * GET /api/auth/quick-login/status
 * Get the current user's quick login status
 */
router.get('/status', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const status = await quickLoginService.getQuickLoginStatus(pool, req.user!.id);
    res.json({ success: true, data: status });
}));

/**
 * POST /api/auth/quick-login/setup-pin
 * Set or change PIN (requires password confirmation)
 */
router.post('/setup-pin', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const { pin, currentPassword } = SetupPinSchema.parse(req.body);

    try {
        await quickLoginService.setupPin(pool, req.user!.id, pin, currentPassword);
        res.json({ success: true, message: 'PIN set up successfully' });
    } catch (error) {
        if (error instanceof QuickLoginError) {
            const statusCode = error.code === 'INVALID_PASSWORD' ? 401 : 400;
            res.status(statusCode).json({
                success: false,
                error: error.message,
                error_code: error.code,
            });
            return;
        }
        throw error;
    }
}));

/**
 * DELETE /api/auth/quick-login/pin
 * Remove PIN
 */
router.delete('/pin', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    await quickLoginService.removePin(pool, req.user!.id);
    res.json({ success: true, message: 'PIN removed' });
}));

/**
 * POST /api/auth/quick-login/register-biometric
 * Register WebAuthn biometric credential (requires password confirmation)
 */
router.post('/register-biometric', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const { credentialId, publicKey, currentPassword } = RegisterBiometricSchema.parse(req.body);

    try {
        await quickLoginService.registerBiometric(pool, req.user!.id, credentialId, publicKey, currentPassword);
        res.json({ success: true, message: 'Biometric registered successfully' });
    } catch (error) {
        if (error instanceof QuickLoginError) {
            const statusCode = error.code === 'INVALID_PASSWORD' ? 401 : 400;
            res.status(statusCode).json({
                success: false,
                error: error.message,
                error_code: error.code,
            });
            return;
        }
        throw error;
    }
}));

/**
 * DELETE /api/auth/quick-login/biometric
 * Remove biometric credential
 */
router.delete('/biometric', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    await quickLoginService.removeBiometric(pool, req.user!.id);
    res.json({ success: true, message: 'Biometric removed' });
}));

// ============================================================
// ADMIN: Trusted Device Management
// ============================================================

/**
 * GET /api/auth/quick-login/devices
 * List all trusted devices (admin/manager only)
 */
router.get('/devices', authenticate, authorize('ADMIN', 'MANAGER'), asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const devices = await quickLoginService.listTrustedDevices(pool);
    res.json({ success: true, data: devices });
}));

/**
 * POST /api/auth/quick-login/devices
 * Register a new trusted device (admin/manager only)
 */
router.post('/devices', authenticate, authorize('ADMIN', 'MANAGER'), asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const data = RegisterDeviceSchema.parse(req.body);
    const device = await quickLoginService.registerDevice(pool, data, req.user!.id);
    res.status(201).json({ success: true, data: device, message: 'Device registered as trusted' });
}));

/**
 * PATCH /api/auth/quick-login/devices/:id/deactivate
 * Deactivate a trusted device (admin/manager only)
 */
router.patch('/devices/:id/deactivate', authenticate, authorize('ADMIN', 'MANAGER'), asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const success = await quickLoginService.deactivateDevice(pool, req.params.id);
    if (!success) throw new NotFoundError('Device not found');
    res.json({ success: true, message: 'Device deactivated' });
}));

/**
 * PATCH /api/auth/quick-login/devices/:id/activate
 * Re-activate a trusted device (admin/manager only)
 */
router.patch('/devices/:id/activate', authenticate, authorize('ADMIN', 'MANAGER'), asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const success = await quickLoginService.activateDevice(pool, req.params.id);
    if (!success) throw new NotFoundError('Device not found');
    res.json({ success: true, message: 'Device activated' });
}));

// ============================================================
// ADMIN: Audit Log
// ============================================================

/**
 * GET /api/auth/quick-login/audit
 * View quick login audit log (admin/manager only)
 */
router.get('/audit', authenticate, authorize('ADMIN', 'MANAGER'), asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
    const deviceFingerprint = typeof req.query.deviceFingerprint === 'string' ? req.query.deviceFingerprint : undefined;

    const entries = await quickLoginService.getAuditLog(pool, { limit, userId, deviceFingerprint });
    res.json({ success: true, data: entries });
}));

export const quickLoginRoutes = router;
