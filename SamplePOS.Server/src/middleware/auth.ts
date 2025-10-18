import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '@prisma/client';
import { createError } from './errorHandler.js';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: UserRole;
  };
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      throw createError('No token provided', 401);
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      id: string;
      username: string;
      role: UserRole;
    };

    req.user = decoded;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(createError('Invalid token', 401));
    } else {
      next(error);
    }
  }
};

export const authorize = (allowedRoles: UserRole[] | string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(createError('Unauthorized', 401));
    }

    // Convert both user role and allowed roles to strings for comparison
    const userRoleString = String(req.user.role);
    const allowedRoleStrings = allowedRoles.map(r => String(r));
    
    if (!allowedRoleStrings.includes(userRoleString)) {
      return next(createError('Forbidden: Insufficient permissions', 403));
    }

    next();
  };
};
