import { z } from 'zod';

/**
 * Authentication Validation Schemas
 * 
 * These schemas validate authentication operations for:
 * - User login
 * - User registration
 * - Password reset
 * - Token refresh
 * 
 * Features:
 * - Required fields: username/email, password
 * - Security: Input sanitization, password validation
 * - Rate limiting support
 */

/**
 * Login Schema
 * Used for user authentication via POST /api/auth/login
 */
export const LoginSchema = z.object({
  username: z.string()
    .trim()
    .min(1, 'Username or email is required')
    .max(200, 'Username/email cannot exceed 200 characters'),
  
  password: z.string()
    .min(1, 'Password is required')
    .max(100, 'Password cannot exceed 100 characters'),
  
  rememberMe: z.boolean()
    .optional()
    .default(false),
});

/**
 * Register Schema
 * Used for user registration via POST /api/auth/register
 */
export const RegisterSchema = z.object({
  username: z.string()
    .trim()
    .min(3, 'Username must be at least 3 characters')
    .max(50, 'Username cannot exceed 50 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  
  email: z.string()
    .trim()
    .email('Invalid email format')
    .max(200, 'Email cannot exceed 200 characters'),
  
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(100, 'Password cannot exceed 100 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
      'Password must contain uppercase, lowercase, number, and special character'
    ),
  
  confirmPassword: z.string()
    .min(1, 'Password confirmation is required'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

/**
 * Forgot Password Schema
 * Used to request password reset via POST /api/auth/forgot-password
 */
export const ForgotPasswordSchema = z.object({
  email: z.string()
    .trim()
    .email('Invalid email format')
    .max(200, 'Email cannot exceed 200 characters'),
});

/**
 * Reset Password Schema
 * Used to reset password via POST /api/auth/reset-password
 */
export const ResetPasswordSchema = z.object({
  token: z.string()
    .trim()
    .min(1, 'Reset token is required'),
  
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(100, 'Password cannot exceed 100 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
      'Password must contain uppercase, lowercase, number, and special character'
    ),
  
  confirmPassword: z.string()
    .min(1, 'Password confirmation is required'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

/**
 * Change Password Schema
 * Used to change password for authenticated user via POST /api/auth/change-password
 */
export const ChangePasswordSchema = z.object({
  currentPassword: z.string()
    .min(1, 'Current password is required'),
  
  newPassword: z.string()
    .min(8, 'New password must be at least 8 characters')
    .max(100, 'Password cannot exceed 100 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
      'Password must contain uppercase, lowercase, number, and special character'
    ),
  
  confirmPassword: z.string()
    .min(1, 'Password confirmation is required'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

/**
 * Refresh Token Schema
 * Used to refresh JWT token via POST /api/auth/refresh
 */
export const RefreshTokenSchema = z.object({
  refreshToken: z.string()
    .trim()
    .min(1, 'Refresh token is required'),
});

// TypeScript types for use in route handlers
export type LoginInput = z.infer<typeof LoginSchema>;
export type RegisterInput = z.infer<typeof RegisterSchema>;
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;
export type RefreshTokenInput = z.infer<typeof RefreshTokenSchema>;
