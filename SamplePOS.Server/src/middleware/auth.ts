import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '@prisma/client';
import { createError } from './errorHandler.js';
import logger from '../utils/logger.js';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: UserRole;
  };
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      logger.warn('Authentication failed: No Authorization header', {
        path: req.path,
        method: req.method,
        ip: req.ip
      });
      throw createError('No token provided', 401);
    }

    if (!authHeader.startsWith('Bearer ')) {
      logger.warn('Authentication failed: Invalid Authorization format', {
        path: req.path,
        header: authHeader.substring(0, 20) + '...'
      });
      throw createError('Invalid token format. Use: Bearer <token>', 401);
    }

    const token = authHeader.replace('Bearer ', '');

    if (!token || token.trim() === '') {
      logger.warn('Authentication failed: Empty token');
      throw createError('Empty token provided', 401);
    }

    // Verify JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      id: string;
      username: string;
      role: UserRole;
    };

    req.user = decoded;
    
    logger.debug('Authentication successful', {
      userId: decoded.id,
      username: decoded.username,
      role: decoded.role,
      path: req.path
    });

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      logger.warn('JWT verification failed', {
        error: error.message,
        path: req.path
      });
      next(createError('Invalid token', 401));
    } else if (error instanceof jwt.TokenExpiredError) {
      logger.warn('JWT token expired', {
        expiredAt: error.expiredAt,
        path: req.path
      });
      next(createError('Token expired', 401));
    } else {
      next(error);
    }
  }
};

export const authorize = (allowedRoles: UserRole[] | string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      logger.warn('Authorization failed: No user in request');
      return next(createError('Unauthorized', 401));
    }

    const userRoleString = String(req.user.role);
    const allowedRoleStrings = allowedRoles.map(r => String(r));

    if (!allowedRoleStrings.includes(userRoleString)) {
      logger.warn('Authorization failed: Insufficient permissions', {
        userId: req.user.id,
        userRole: req.user.role,
        requiredRoles: allowedRoles,
        path: req.path
      });
      return next(createError('Forbidden: Insufficient permissions', 403));
    }

    next();
  };
};
