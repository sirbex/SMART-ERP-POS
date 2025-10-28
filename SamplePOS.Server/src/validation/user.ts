import { z } from 'zod';

/**
 * User Validation Schemas
 * 
 * These schemas validate user data for:
 * - Creating new users
 * - Updating existing users
 * - Changing passwords
 * 
 * Features:
 * - Required fields: username, email, password, role
 * - Optional fields: phone, notes
 * - Security: Password strength validation
 * - Business rules: Valid email, unique username
 */

// Password must be at least 8 characters with uppercase, lowercase, number, and special char
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

/**
 * Create User Schema
 * Used when creating a new user via POST /api/users
 */
export const CreateUserSchema = z.object({
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
      passwordRegex,
      'Password must contain uppercase, lowercase, number, and special character'
    ),
  
  role: z.enum(['ADMIN', 'MANAGER', 'CASHIER'], {
    errorMap: () => ({ message: 'Invalid role. Must be ADMIN, MANAGER, or CASHIER' })
  }),
  
  phone: z.string()
    .trim()
    .max(50, 'Phone number cannot exceed 50 characters')
    .regex(/^[\d\s\-\(\)]+$/, 'Phone number can only contain digits, spaces, dashes, and parentheses')
    .optional()
    .nullable(),
  
  notes: z.string()
    .max(500, 'Notes cannot exceed 500 characters')
    .optional()
    .nullable(),
});

/**
 * Update User Schema
 * Used when updating an existing user via PUT /api/users/:id
 * All fields are optional since this is a partial update
 */
export const UpdateUserSchema = z.object({
  username: z.string()
    .trim()
    .min(3, 'Username must be at least 3 characters')
    .max(50, 'Username cannot exceed 50 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores')
    .optional(),
  
  email: z.string()
    .trim()
    .email('Invalid email format')
    .max(200, 'Email cannot exceed 200 characters')
    .optional(),
  
  role: z.enum(['ADMIN', 'MANAGER', 'CASHIER'])
    .optional(),
  
  phone: z.string()
    .trim()
    .max(50, 'Phone number cannot exceed 50 characters')
    .regex(/^[\d\s\-\(\)]+$/, 'Phone number can only contain digits, spaces, dashes, and parentheses')
    .optional()
    .nullable(),
  
  notes: z.string()
    .max(500, 'Notes cannot exceed 500 characters')
    .optional()
    .nullable(),
  
  isActive: z.boolean()
    .optional(),
});

/**
 * Change Password Schema
 * Used when changing a user's password via POST /api/users/:id/change-password
 */
export const ChangePasswordSchema = z.object({
  currentPassword: z.string()
    .min(1, 'Current password is required'),
  
  newPassword: z.string()
    .min(8, 'New password must be at least 8 characters')
    .max(100, 'New password cannot exceed 100 characters')
    .regex(
      passwordRegex,
      'New password must contain uppercase, lowercase, number, and special character'
    ),
  
  confirmPassword: z.string()
    .min(1, 'Password confirmation is required'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

/**
 * Reset Password Schema
 * Used when admin resets a user's password via POST /api/users/:id/reset-password
 */
export const ResetPasswordSchema = z.object({
  newPassword: z.string()
    .min(8, 'New password must be at least 8 characters')
    .max(100, 'New password cannot exceed 100 characters')
    .regex(
      passwordRegex,
      'New password must contain uppercase, lowercase, number, and special character'
    ),
});

// TypeScript types for use in route handlers
export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;
