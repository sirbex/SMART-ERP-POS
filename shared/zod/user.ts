// Shared Zod Schemas - Users & Authentication
// Used by both frontend and backend for validation

import { z } from 'zod';

export const UserRoleEnum = z.enum(['ADMIN', 'MANAGER', 'CASHIER', 'STAFF']);
export type UserRole = z.infer<typeof UserRoleEnum>;

export const UserSchema = z.object({
  id: z.string().uuid(),
  userNumber: z.string().optional(), // Human-readable ID (e.g., USR-0001)
  email: z.string().email(),
  fullName: z.string().min(1).max(255),
  role: UserRoleEnum,
  isActive: z.boolean().default(true),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();

/**
 * Password policy regex patterns
 */
const passwordPolicy = {
  minLength: 8,
  maxLength: 128,
  hasUppercase: /[A-Z]/,
  hasLowercase: /[a-z]/,
  hasDigit: /[0-9]/,
  hasSpecial: /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/,
};

/**
 * Strong password validation with complexity requirements
 */
const StrongPasswordSchema = z.string()
  .min(passwordPolicy.minLength, `Password must be at least ${passwordPolicy.minLength} characters`)
  .max(passwordPolicy.maxLength, `Password must not exceed ${passwordPolicy.maxLength} characters`)
  .refine((val) => passwordPolicy.hasUppercase.test(val), 'Password must contain at least one uppercase letter')
  .refine((val) => passwordPolicy.hasLowercase.test(val), 'Password must contain at least one lowercase letter')
  .refine((val) => passwordPolicy.hasDigit.test(val), 'Password must contain at least one number')
  .refine((val) => passwordPolicy.hasSpecial.test(val), 'Password must contain at least one special character (!@#$%^&*()_+-=[]{}|;:,.<>?)');

export const CreateUserSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: StrongPasswordSchema,
  fullName: z.string().min(1, 'Full name is required').max(255),
  role: UserRoleEnum.optional(),
  rbacRoleId: z.string().uuid('Invalid RBAC role ID').optional(),
  isActive: z.boolean().optional().default(true),
}).strict().refine(data => data.role || data.rbacRoleId, {
  message: 'Either role or rbacRoleId must be provided',
});

export const UpdateUserSchema = z.object({
  email: z.string().email().optional(),
  fullName: z.string().min(1).max(255).optional(),
  role: UserRoleEnum.optional(),
  rbacRoleId: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
}).strict();

export const LoginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
}).strict();

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: StrongPasswordSchema,
  confirmPassword: z.string().min(1, 'Please confirm new password'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
}).refine((data) => data.currentPassword !== data.newPassword, {
  message: "New password must be different from current password",
  path: ['newPassword'],
});

export const AdminResetPasswordSchema = z.object({
  newPassword: StrongPasswordSchema,
  confirmPassword: z.string().min(1, 'Please confirm new password'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

export type User = z.infer<typeof UserSchema>;
export type CreateUser = z.infer<typeof CreateUserSchema>;
export type UpdateUser = z.infer<typeof UpdateUserSchema>;
export type Login = z.infer<typeof LoginSchema>;
export type ChangePassword = z.infer<typeof ChangePasswordSchema>;
export type AdminResetPassword = z.infer<typeof AdminResetPasswordSchema>;
