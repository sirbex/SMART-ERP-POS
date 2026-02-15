// Auth Controller - HTTP request handlers
// Validates input, calls service layer, formats responses

import type { Request, Response, NextFunction } from 'express';
import pool from '../../db/pool.js';
import { authenticateUser, registerUser, getUserProfile } from './authService.js';
import * as auditService from '../audit/auditService.js';
import * as twoFactorService from './twoFactorService.js';
import * as refreshTokenService from './refreshTokenService.js';
import { createUserSessionMiddleware, endUserSessionMiddleware } from '../../middleware/auditContext.js';
import logger from '../../utils/logger.js';

/**
 * Login controller
 * POST /api/auth/login
 */
export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authenticateUser(pool, req.body);

    // Check if 2FA is enabled for this user
    const twoFactorStatus = await twoFactorService.get2FAStatus(result.user.id);

    if (twoFactorStatus.enabled) {
      // 2FA is enabled - return partial login, require 2FA verification
      logger.info('2FA verification required', { userId: result.user.id, email: result.user.email });

      return res.json({
        success: true,
        data: {
          requires2FA: true,
          userId: result.user.id,
          // Don't send token until 2FA is verified
        },
        message: 'Please enter your 2FA code',
      });
    }

    // Check if user's role requires 2FA but it's not set up
    if (twoFactorStatus.required && !twoFactorStatus.enabled) {
      logger.info('2FA setup required for role', { userId: result.user.id, role: result.user.role });

      // Generate token pair even when 2FA setup is required
      const deviceInfo = req.headers['user-agent'] || undefined;
      const ipAddress = req.ip || req.socket.remoteAddress || undefined;
      const tokenPair = await refreshTokenService.generateTokenPair(
        { id: result.user.id, email: result.user.email, fullName: result.user.fullName, role: result.user.role as any },
        deviceInfo,
        ipAddress
      );

      // Set refresh token as httpOnly cookie
      res.cookie('refreshToken', tokenPair.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        path: '/api/auth/token',
      });

      return res.json({
        success: true,
        data: {
          user: result.user,
          token: tokenPair.accessToken, // Keep 'token' for backward compatibility
          accessToken: tokenPair.accessToken,
          refreshToken: tokenPair.refreshToken,
          expiresIn: tokenPair.expiresIn,
          requires2FASetup: true,
          passwordExpiry: result.passwordExpiry,
        },
        message: 'Login successful. 2FA setup is required for your role.',
      });
    }

    // Generate token pair for successful login
    const deviceInfo = req.headers['user-agent'] || undefined;
    const ipAddress = req.ip || req.socket.remoteAddress || undefined;
    const tokenPair = await refreshTokenService.generateTokenPair(
      { id: result.user.id, email: result.user.email, fullName: result.user.fullName, role: result.user.role as any },
      deviceInfo,
      ipAddress
    );

    // Set refresh token as httpOnly cookie
    res.cookie('refreshToken', tokenPair.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      path: '/api/auth/token',
    });

    // Create user session and log login audit entry
    try {
      const auditContext = {
        userId: result.user.id,
        userName: result.user.fullName,
        userRole: result.user.role,
        ipAddress: req.ip || req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
      };

      // Log successful login and create session
      const session = await auditService.logUserLogin(
        pool,
        result.user.id,
        result.user.fullName,
        result.user.role,
        auditContext
      );

      // Store session ID in cookie
      res.cookie('sessionId', session.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: 'strict',
      });
    } catch (auditError) {
      logger.error('Audit logging failed for login (non-fatal)', { error: auditError });
    }

    res.json({
      success: true,
      data: {
        user: result.user,
        token: tokenPair.accessToken, // Keep 'token' for backward compatibility
        accessToken: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
        expiresIn: tokenPair.expiresIn,
        passwordExpiry: result.passwordExpiry,
      },
      message: 'Login successful',
    });
  } catch (error) {
    logger.error('Login failed', { error, body: req.body });

    // Log failed login attempt to audit trail
    try {
      const auditContext = {
        userId: '00000000-0000-0000-0000-000000000000', // System/unknown user UUID
        userName: 'Anonymous',
        userRole: 'NONE' as any,
        ipAddress: req.ip || req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
      };

      await auditService.logLoginFailed(
        pool,
        req.body.email || 'unknown',
        error instanceof Error ? error.message : 'Unknown error',
        auditContext
      );
    } catch (auditError) {
      logger.error('Audit logging failed for failed login (non-fatal)', {
        error: auditError instanceof Error ? auditError.message : String(auditError),
        stack: auditError instanceof Error ? auditError.stack : undefined
      });
    }

    // Handle authentication errors with 401
    if (error instanceof Error) {
      if (
        error.message === 'Invalid email or password' ||
        error.message === 'Account is disabled'
      ) {
        return res.status(401).json({
          success: false,
          error: error.message,
        });
      }
    }

    // Pass other errors to error middleware
    next(error);
  }
}

/**
 * Register controller
 * POST /api/auth/register
 */
export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await registerUser(pool, req.body);

    res.status(201).json({
      success: true,
      data: result,
      message: 'User registered successfully',
    });
  } catch (error) {
    logger.error('Registration failed', { error, body: req.body });

    // Handle duplicate email error with 400
    if (error instanceof Error && error.message === 'Email already registered') {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    // Pass other errors to error middleware
    next(error);
  }
}

/**
 * Logout controller
 * POST /api/auth/logout
 */
export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    const userName = req.user?.fullName;
    const sessionId = req.cookies?.sessionId || (req.headers['x-session-id'] as string);

    if (userId && sessionId) {
      // End user session and log logout
      try {
        const auditContext = {
          userId,
          userName: userName || 'Unknown',
          userRole: req.user?.role || 'STAFF',
          sessionId,
          ipAddress: req.ip || req.socket.remoteAddress,
          userAgent: req.headers['user-agent'],
        };

        await auditService.logUserLogout(pool, sessionId, 'MANUAL', auditContext);

        // Clear session cookie
        res.clearCookie('sessionId');
      } catch (auditError) {
        logger.error('Audit logging failed for logout (non-fatal)', {
          error: auditError instanceof Error ? auditError.message : String(auditError),
          stack: auditError instanceof Error ? auditError.stack : undefined,
          sessionId,
          userId
        });
      }
    }

    // Revoke refresh token if present
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
    if (refreshToken) {
      try {
        await refreshTokenService.revokeRefreshToken(refreshToken);
      } catch (revokeError) {
        logger.error('Failed to revoke refresh token (non-fatal)', { error: revokeError });
      }
    }

    // Clear refresh token cookie
    res.clearCookie('refreshToken', { path: '/api/auth/token' });

    res.json({
      success: true,
      message: 'Logout successful',
    });
  } catch (error) {
    logger.error('Logout failed', { error, userId: req.user?.id });
    next(error);
  }
}

/**
 * Get profile controller
 * GET /api/auth/profile
 */
export async function getProfile(req: Request, res: Response, next: NextFunction) {
  try {
    // req.user is set by authenticate middleware
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated',
      });
    }

    const user = await getUserProfile(pool, userId);

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    logger.error('Get profile failed', { error, userId: req.user?.id });

    // Handle not found error with 404
    if (error instanceof Error && error.message === 'User not found') {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    // Pass other errors to error middleware
    next(error);
  }
}
