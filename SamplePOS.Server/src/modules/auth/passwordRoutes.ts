/**
 * Password Policy Routes
 * 
 * Endpoints for password management:
 * - GET /policy - Get password requirements
 * - POST /validate - Validate password strength
 * - POST /change - Change password with policy enforcement
 * - GET /expiry - Check password expiry status
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { authRateLimit, strictRateLimit } from '../../middleware/security.js';
import * as passwordPolicy from './passwordPolicyService.js';
import logger from '../../utils/logger.js';
import { asyncHandler } from '../../middleware/errorHandler.js';

const router = Router();

/**
 * GET /api/auth/password/policy
 * Get password policy requirements (public)
 */
router.get('/policy', (req: Request, res: Response) => {
    const config = passwordPolicy.getPasswordPolicyConfig();

    res.json({
        success: true,
        data: {
            requirements: {
                minLength: config.minLength,
                maxLength: config.maxLength,
                requireUppercase: config.requireUppercase,
                requireLowercase: config.requireLowercase,
                requireDigit: config.requireDigit,
                requireSpecial: config.requireSpecial,
            },
            expiryDays: config.expiryDays,
            historyCount: config.historyCount,
            maxFailedAttempts: config.maxFailedAttempts,
            lockoutMinutes: config.lockoutMinutes,
        },
    });
});

/**
 * POST /api/auth/password/validate
 * Validate password strength (no auth required - for forms)
 */
router.post('/validate', authRateLimit, (req: Request, res: Response) => {
    const { password } = req.body;

    if (!password) {
        res.status(400).json({
            success: false,
            error: 'Password is required',
        });
        return;
    }

    const validation = passwordPolicy.validatePassword(password);

    res.json({
        success: true,
        data: validation,
    });
});

/**
 * GET /api/auth/password/expiry
 * Check password expiry status (requires auth)
 */
router.get('/expiry', authenticate, asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const status = await passwordPolicy.getPasswordExpiryStatus(userId);

    res.json({
        success: true,
        data: {
            expired: status.expired,
            expiresAt: status.expiresAt?.toISOString(),
            daysUntilExpiry: status.daysUntilExpiry,
            showWarning: status.daysUntilExpiry !== null && status.daysUntilExpiry <= status.warningDays,
        },
    });
}));

/**
 * POST /api/auth/password/change
 * Change password with policy enforcement (requires auth)
 */
router.post('/change', authenticate, strictRateLimit, asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { currentPassword, newPassword, confirmPassword } = req.body;

    // Basic validation
    if (!currentPassword || !newPassword || !confirmPassword) {
        res.status(400).json({
            success: false,
            error: 'All fields are required',
        });
        return;
    }

    if (newPassword !== confirmPassword) {
        res.status(400).json({
            success: false,
            error: 'New passwords do not match',
        });
        return;
    }

    // Verify current password
    const { findUserByEmail } = await import('./authRepository.js');
    const { default: pool } = await import('../../db/pool.js');
    const bcrypt = await import('bcrypt');

    // Get user with password hash
    const userResult = await pool.query(
        'SELECT email, password_hash FROM users WHERE id = $1',
        [userId]
    );

    if (userResult.rows.length === 0) {
        res.status(404).json({
            success: false,
            error: 'User not found',
        });
        return;
    }

    const isValidPassword = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);
    if (!isValidPassword) {
        res.status(401).json({
            success: false,
            error: 'Current password is incorrect',
        });
        return;
    }

    // Update password with policy enforcement
    await passwordPolicy.updatePasswordWithPolicy(userId, newPassword);

    logger.info('Password changed successfully', { userId });

    res.json({
        success: true,
        message: 'Password changed successfully',
    });
}));

/**
 * GET /api/auth/password/must-change
 * Check if user must change password (requires auth)
 */
router.get('/must-change', authenticate, asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const result = await passwordPolicy.mustChangePassword(userId);

    res.json({
        success: true,
        data: result,
    });
}));

export default router;
