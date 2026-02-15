// Auth Routes - Route definitions only
// Maps HTTP endpoints to controllers

import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { authRateLimit } from '../../middleware/security.js';
import { login, register, logout, getProfile } from './authController.js';
import twoFactorRoutes from './twoFactorRoutes.js';
import passwordRoutes from './passwordRoutes.js';
import tokenRoutes from './tokenRoutes.js';

const router = Router();

// Public routes (with rate limiting to prevent brute force)
router.post('/login', authRateLimit, login);
router.post('/register', authRateLimit, register);

// Protected routes
router.post('/logout', authenticate, logout);
router.get('/profile', authenticate, getProfile);

// 2FA routes
router.use('/2fa', twoFactorRoutes);

// Password policy routes
router.use('/password', passwordRoutes);

// Token management routes (refresh, revoke, sessions)
router.use('/token', tokenRoutes);

export const authRoutes = router;
