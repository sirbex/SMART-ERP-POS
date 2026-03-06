/**
 * Token Routes
 * 
 * Endpoints for token management:
 * - POST /refresh - Rotate refresh token and get new token pair
 * - POST /revoke - Revoke a refresh token (logout)
 * - POST /revoke-all - Revoke all user tokens (logout all devices)
 * - GET /sessions - Get active sessions
 * - GET /config - Get token configuration
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { authRateLimit, strictRateLimit } from '../../middleware/security.js';
import * as refreshTokenService from './refreshTokenService.js';
import { pool as globalPool } from '../../db/pool.js';
import logger from '../../utils/logger.js';
import { asyncHandler } from '../../middleware/errorHandler.js';

const router = Router();

/**
 * POST /api/auth/token/refresh
 * Refresh tokens - get new access/refresh token pair
 */
router.post('/refresh', authRateLimit, asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
        res.status(400).json({
            success: false,
            error: 'Refresh token is required',
        });
        return;
    }

    const deviceInfo = req.headers['user-agent'] || undefined;
    const ipAddress = req.ip || req.socket.remoteAddress || undefined;

    const result = await refreshTokenService.rotateRefreshToken(
        refreshToken,
        deviceInfo,
        ipAddress,
        req.tenantPool || globalPool,
        { tenantId: req.tenantId, tenantSlug: req.tenant?.slug }
    );

    // Set refresh token as httpOnly cookie for security
    res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        path: '/api/auth/token',
    });

    res.json({
        success: true,
        data: {
            accessToken: result.accessToken,
            refreshToken: result.refreshToken, // Also in body for clients that can't use cookies
            expiresIn: result.expiresIn,
            user: {
                id: result.user.id,
                email: result.user.email,
                fullName: result.user.fullName,
                role: result.user.role,
            },
        },
    });
}));

/**
 * POST /api/auth/token/revoke
 * Revoke a specific refresh token (logout current device)
 */
router.post('/revoke', asyncHandler(async (req, res) => {
    const refreshToken = req.body.refreshToken || req.cookies?.refreshToken;

    if (!refreshToken) {
        res.status(400).json({
            success: false,
            error: 'Refresh token is required',
        });
        return;
    }

    await refreshTokenService.revokeRefreshToken(refreshToken, req.tenantPool || globalPool);

    // Clear the cookie
    res.clearCookie('refreshToken', { path: '/api/auth/token' });

    res.json({
        success: true,
        message: 'Token revoked successfully',
    });
}));

/**
 * POST /api/auth/token/revoke-all
 * Revoke all tokens for the authenticated user (logout all devices)
 */
router.post('/revoke-all', authenticate, asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const revokePool = req.tenantPool || globalPool;
    const count = await refreshTokenService.revokeAllUserTokens(userId, revokePool);

    // Clear the cookie
    res.clearCookie('refreshToken', { path: '/api/auth/token' });

    res.json({
        success: true,
        message: `Logged out from ${count} session(s)`,
        data: { sessionsRevoked: count },
    });
}));

/**
 * GET /api/auth/token/sessions
 * Get active sessions for the authenticated user
 */
router.get('/sessions', authenticate, asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const sessionsPool = req.tenantPool || globalPool;
    const sessions = await refreshTokenService.getUserSessions(userId, sessionsPool);

    // Mark current session if we can identify it
    const currentToken = req.cookies?.refreshToken;
    // We can't directly compare since we store hashes, 
    // but we include all sessions for display

    res.json({
        success: true,
        data: {
            sessions: sessions.map(s => ({
                ...s,
                createdAt: s.createdAt.toISOString(),
                expiresAt: s.expiresAt.toISOString(),
            })),
            count: sessions.length,
        },
    });
}));

/**
 * DELETE /api/auth/token/sessions/:sessionId
 * Revoke a specific session
 */
router.delete('/sessions/:sessionId', authenticate, asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { sessionId } = req.params;

    // Verify session belongs to user and revoke
    const deletePool = req.tenantPool || globalPool;
    const result = await deletePool.query(
        `UPDATE refresh_tokens 
       SET is_revoked = true 
       WHERE id = $1 AND user_id = $2 AND is_revoked = false
       RETURNING id`,
        [sessionId, userId]
    );

    if (result.rowCount === 0) {
        res.status(404).json({
            success: false,
            error: 'Session not found',
        });
        return;
    }

    res.json({
        success: true,
        message: 'Session revoked',
    });
}));

/**
 * GET /api/auth/token/config
 * Get token configuration (public)
 */
router.get('/config', (req: Request, res: Response) => {
    const config = refreshTokenService.getTokenConfig();

    res.json({
        success: true,
        data: config,
    });
});

export default router;
