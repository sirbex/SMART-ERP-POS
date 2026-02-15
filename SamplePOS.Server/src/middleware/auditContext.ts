/**
 * Audit Context Middleware
 * Created: November 23, 2025
 * Purpose: Automatically extract audit context from requests
 * 
 * Attaches AuditContext to request object for use in controllers/services
 */

import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { AuditContext } from '../../../shared/types/audit.js';

// Extend Express Request to include audit context
declare global {
  namespace Express {
    interface Request {
      auditContext?: AuditContext;
      requestId?: string;
    }
  }
}

/**
 * Middleware to attach audit context to request
 * Should be placed AFTER authentication middleware
 */
export function auditContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  try {
    // Generate unique request ID for tracing
    const requestId = randomUUID();
    req.requestId = requestId;

    // Extract user information from JWT (set by auth middleware)
    const user = (req as any).user; // Assuming auth middleware sets req.user

    // Extract session ID from cookie or header
    const sessionId = req.cookies?.sessionId || req.headers['x-session-id'] as string;

    // Get client IP address (handles proxies)
    const ipAddress =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      undefined;

    // Get user agent
    const userAgent = req.headers['user-agent'] || undefined;

    // Build audit context
    const auditContext: AuditContext = {
      userId: user?.id || '00000000-0000-0000-0000-000000000000', // Use null UUID instead of 'SYSTEM'
      userName: user?.full_name || user?.fullName || user?.username || undefined,
      userRole: user?.role || undefined,
      sessionId: sessionId || undefined,
      ipAddress,
      userAgent,
      requestId,
    };

    // Attach to request
    req.auditContext = auditContext;

    // Add request ID to response headers for tracing
    res.setHeader('X-Request-ID', requestId);

    next();
  } catch (error) {
    console.error('Audit context middleware error:', error);
    // Don't fail request if audit context creation fails
    next();
  }
}

/**
 * Helper function to get audit context from request
 * Use this in controllers/services instead of accessing req.auditContext directly
 */
export function getAuditContext(req: Request): AuditContext {
  return req.auditContext || {
    userId: '00000000-0000-0000-0000-000000000000', // Use null UUID instead of 'SYSTEM'
    requestId: req.requestId,
  };
}

/**
 * Middleware to create user session on login
 * Should be called in auth controller after successful login
 */
export async function createUserSessionMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = (req as any).user;

    if (user && req.auditContext) {
      // Import dynamically to avoid circular dependencies
      const { logUserLogin } = await import('../modules/audit/auditService.js');
      const pool = req.app.locals.pool;

      // Create session and log login
      const session = await logUserLogin(
        pool,
        user.id,
        user.full_name || user.username,
        user.role,
        {
          ipAddress: req.auditContext.ipAddress,
          userAgent: req.auditContext.userAgent,
        }
      );

      // Store session ID in cookie
      res.cookie('sessionId', session.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: 'strict',
      });

      // Attach session ID to audit context for this request
      if (req.auditContext) {
        req.auditContext.sessionId = session.id;
      }
    }

    next();
  } catch (error) {
    console.error('Create user session middleware error:', error);
    // Don't fail login if session creation fails
    next();
  }
}

/**
 * Middleware to end user session on logout
 * Should be called in auth controller before logout
 */
export async function endUserSessionMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const sessionId = req.cookies?.sessionId || req.headers['x-session-id'] as string;

    if (sessionId && req.auditContext) {
      // Import dynamically to avoid circular dependencies
      const { logUserLogout } = await import('../modules/audit/auditService.js');
      const pool = req.app.locals.pool;

      // End session and log logout
      await logUserLogout(
        pool,
        sessionId,
        'MANUAL',
        req.auditContext
      );

      // Clear session cookie
      res.clearCookie('sessionId');
    }

    next();
  } catch (error) {
    console.error('End user session middleware error:', error);
    // Don't fail logout if session end fails
    next();
  }
}
