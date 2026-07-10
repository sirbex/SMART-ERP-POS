// Phase 7: Authentication Middleware - Enhanced JWT & RBAC
// Validates JWT tokens and enforces comprehensive role-based permissions
//
// SECURITY: authenticate() uses req.tenantPool (set by tenantMiddleware)
// to look up users in the correct tenant database. Falls back to the
// global pool ONLY in single-tenant mode when tenantMiddleware is not active.

import '../types/express.js';
import type { Request, Response, NextFunction } from 'express';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { UserRole } from '../../../shared/types/user.js';
import { pool } from '../db/pool.js';
import logger from '../utils/logger.js';
import { loadAuthorizationContext } from '../rbac/middleware.js';

// JWT Payload interface — must match the shape produced by generateToken()
interface JwtPayload {
  [key: string]: unknown;
  userId: string;
  email: string;
  fullName: string;
  username?: string;
  role: UserRole;
  tenantId?: string;
  tenantSlug?: string;
  iat?: number;
  exp?: number;
}

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  const msg = 'FATAL: JWT_SECRET environment variable is not set. Server cannot start without it.';
  if (process.env.NODE_ENV === 'production') {
    console.error(msg);
    process.exit(1);
  }
  console.warn(`⚠️  ${msg} Using insecure default for development only.`);
}
if (JWT_SECRET && JWT_SECRET.length < 32) {
  const msg = `FATAL: JWT_SECRET must be at least 32 characters (got ${JWT_SECRET.length}).`;
  if (process.env.NODE_ENV === 'production') {
    console.error(msg);
    process.exit(1);
  }
  console.warn(`⚠️  ${msg}`);
}
const jwtSecret = JWT_SECRET || 'dev-only-insecure-key-change-me-32ch';

// Express Request.user is already declared in src/types/express.d.ts

/**
 * Extract JWT token from Authorization header
 */
function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  return authHeader.substring(7); // Remove 'Bearer ' prefix
}

/**
 * Enhanced authentication middleware - verifies JWT token and loads full user
 */
export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = extractToken(req);

  if (!token) {
    res.status(401).json({
      success: false,
      error: 'Authentication token required'
    });
    return;
  }

  try {
    // Verify the token
    const payload = jwt.verify(token, jwtSecret) as JwtPayload;
    req.tokenPayload = payload;

    // SECURITY: Use the tenant-scoped pool (set by tenantMiddleware) for user lookup.
    // This ensures we look up the user in the CORRECT tenant database.
    // Falls back to global pool only in single-tenant mode (no tenantMiddleware).
    const queryPool = req.tenantPool || pool;

    // Get full user details from database
    const userResult = await queryPool.query(
      `SELECT id, email, password_hash as "passwordHash", full_name as "fullName", role, is_active as "isActive", created_at as "createdAt", updated_at as "updatedAt"
       FROM users 
       WHERE id = $1 AND is_active = true`,
      [payload.userId]
    );

    if (userResult.rows.length === 0) {
      res.status(401).json({
        success: false,
        error: 'User not found or inactive'
      });
      return;
    }

    const userRow = userResult.rows[0];
    req.user = {
      id: userRow.id,
      email: userRow.email,
      fullName: userRow.fullName,
      role: userRow.role as UserRole,
      tenantId: payload.tenantId,
      tenantSlug: payload.tenantSlug,
    };

    // Load RBAC authorization context (permissions + AuthorizationService) for every authenticated request
    await loadAuthorizationContext(req, res, next);
    return;

  } catch (error) {
    logger.error('Authentication error', { error });
    res.status(401).json({
      success: false,
      error: 'Invalid or expired token'
    });
  }
}

/**
 * @deprecated Use requirePermission() from rbac/middleware.ts instead.
 * Role-name checks must not gate business capabilities — permissions + policies only.
 */
export function authorize(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: `Access denied. Required roles: ${allowedRoles.join(', ')}`,
      });
      return;
    }

    next();
  };
}

/**
 * Optional authentication - attaches user if token is valid, but doesn't fail if missing
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      next();
      return;
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(token, jwtSecret) as JwtPayload;

      // Map JWT payload field names to req.user shape
      // JWT uses 'userId' but req.user expects 'id'
      req.user = {
        id: decoded.userId,
        email: decoded.email ?? '',
        fullName: decoded.fullName ?? '',
        role: decoded.role,
        tenantId: decoded.tenantId,
        tenantSlug: decoded.tenantSlug,
      };
    } catch (error) {
      // Token invalid/expired, but we don't fail - just continue without user
      logger.debug('Optional auth failed, continuing without user', { error });
    }

    next();
  } catch (error) {
    logger.error('Optional authentication error', { error });
    next();
  }
}

/**
 * Generate JWT token for a user
 */
export function generateToken(user: {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  tenantId?: string;
  tenantSlug?: string;
}): string {
  const payload: Record<string, unknown> = {
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
  };

  // Include tenant context if available (multi-tenant mode)
  if (user.tenantId) payload.tenantId = user.tenantId;
  if (user.tenantSlug) payload.tenantSlug = user.tenantSlug;

  // @ts-expect-error JWT types are overly strict; expiresIn accepts string duration
  return jwt.sign(payload, jwtSecret, { expiresIn: process.env.JWT_EXPIRES_IN || '24h' });
}
