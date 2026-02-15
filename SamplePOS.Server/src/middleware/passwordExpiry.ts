/**
 * Password Expiry Middleware
 * 
 * Checks if user's password has expired on each authenticated request.
 * Returns 403 with passwordExpired flag if password must be changed.
 * 
 * Excluded routes:
 * - /api/auth/password/* (allow password change)
 * - /api/auth/logout (allow logout)
 * - /api/auth/2fa/* (allow 2FA operations)
 */

import type { Request, Response, NextFunction } from 'express';
import * as passwordPolicy from '../modules/auth/passwordPolicyService.js';
import logger from '../utils/logger.js';

// Routes that are exempt from password expiry check
const EXEMPT_ROUTES = [
    '/api/auth/password',
    '/api/auth/logout',
    '/api/auth/2fa',
];

/**
 * Middleware to check password expiry
 * Must be used AFTER authenticate middleware
 */
export async function checkPasswordExpiry(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    // Skip if no user (not authenticated)
    if (!req.user) {
        next();
        return;
    }

    // Check if route is exempt
    const isExempt = EXEMPT_ROUTES.some(route => req.path.startsWith(route));
    if (isExempt) {
        next();
        return;
    }

    try {
        const { mustChange, reason } = await passwordPolicy.mustChangePassword(req.user.id);

        if (mustChange) {
            logger.warn('User must change password', {
                userId: req.user.id,
                reason,
                path: req.path
            });

            res.status(403).json({
                success: false,
                error: reason === 'expired'
                    ? 'Your password has expired. Please change it to continue.'
                    : 'You must change your password before continuing.',
                code: 'PASSWORD_EXPIRED',
                passwordExpired: true,
                reason,
            });
            return;
        }

        next();
    } catch (error) {
        logger.error('Password expiry check failed', { error, userId: req.user.id });
        // Don't block on error - allow request to proceed
        next();
    }
}

/**
 * Optional middleware to add password expiry warning to response headers
 * Non-blocking - just adds headers for frontend to display warning
 */
export async function addPasswordExpiryHeader(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    // Skip if no user
    if (!req.user) {
        next();
        return;
    }

    try {
        const status = await passwordPolicy.getPasswordExpiryStatus(req.user.id);

        if (status.daysUntilExpiry !== null && status.daysUntilExpiry <= 14) {
            res.setHeader('X-Password-Expiry-Warning', 'true');
            res.setHeader('X-Password-Days-Remaining', status.daysUntilExpiry.toString());
        }
    } catch (error) {
        // Silently ignore errors - this is non-critical
    }

    next();
}
