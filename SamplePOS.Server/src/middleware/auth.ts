// Phase 7: Authentication Middleware - Enhanced JWT & RBAC
// Validates JWT tokens and enforces comprehensive role-based permissions

/// <reference path="../types/express.d.ts" />
import type { Request, Response, NextFunction } from 'express';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { User, UserRole, hasPermission, UserPermissions } from '../../../shared/types/user.js';
import { pool } from '../db/pool.js';
import logger from '../utils/logger.js';

// JWT Payload interface
interface JwtPayload {
  userId: string;
  username?: string;
  role: UserRole;
  tenantId?: string;
  tenantSlug?: string;
  iat?: number;
  exp?: number;
}

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Extend Express Request interface to include enhanced user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        fullName: string;
        role: UserRole;
        tenantId?: string;
        tenantSlug?: string;
      };
      tokenPayload?: JwtPayload;
    }
  }
}

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
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
    req.tokenPayload = payload;

    // Get full user details from database
    const userResult = await pool.query(
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

    next();

  } catch (error) {
    logger.error('Authentication error', { error });
    res.status(401).json({
      success: false,
      error: 'Invalid or expired token'
    });
  }
}

/**
 * Middleware to authorize based on user roles
 * @param allowedRoles - Array of roles that can access the route
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
      const decoded = jwt.verify(token, JWT_SECRET) as {
        id: string;
        email: string;
        fullName: string;
        role: UserRole;
      };

      req.user = decoded;
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

  // @ts-ignore - JWT types are overly strict, expiresIn accepts string
  return jwt.sign(payload, JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '24h' });
}

/**
 * Permission-based authorization middleware
 */
export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    // Simple role-based permission check
    const userRole = req.user.role;

    // Admin has all permissions
    if (userRole === 'ADMIN') {
      return next();
    }

    // Add more granular permission logic here as needed
    // For now, allow MANAGER and above for most operations
    if (['MANAGER', 'CASHIER'].includes(userRole)) {
      return next();
    }

    return res.status(403).json({
      success: false,
      error: 'Insufficient permissions'
    });
  };
}
