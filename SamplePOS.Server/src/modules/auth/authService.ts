// Auth Service - Business logic layer
// Handles authentication logic, password hashing, validation

import bcrypt from 'bcrypt';
import { Pool } from 'pg';
// import { LoginSchema, CreateUserSchema } from '../../../../shared/zod/user.js'; // Temporarily disabled - path issue
import { generateToken } from '../../middleware/auth.js';
import { findUserByEmail, findUserById, createUser, type UserRole } from './authRepository.js';
import * as passwordPolicy from './passwordPolicyService.js';
import logger from '../../utils/logger.js';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  fullName: string;
  role: UserRole;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    fullName: string;
    role: UserRole;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
  };
  token: string;
}

/**
 * Authenticate user with email and password
 * @param pool - Database connection pool
 * @param credentials - Login credentials
 * @returns User data with JWT token
 * @throws Error if authentication fails
 */
export async function authenticateUser(
  pool: Pool,
  credentials: LoginCredentials
): Promise<AuthResponse & { passwordExpiry?: { expired: boolean; daysUntilExpiry: number | null } }> {
  // Validate input (basic validation - TODO: restore schema validation)
  if (!credentials.email || !credentials.password) {
    throw new Error('Email and password are required');
  }
  const validatedData = credentials;

  // Find user by email
  const user = await findUserByEmail(pool, validatedData.email);
  if (!user) {
    logger.warn('Login attempt with invalid email', { email: validatedData.email });
    throw new Error('Invalid email or password');
  }

  // Check account lockout status
  const lockoutStatus = await passwordPolicy.checkAccountLockout(user.id);
  if (lockoutStatus.locked) {
    logger.warn('Login attempt for locked account', {
      email: validatedData.email,
      remainingMinutes: lockoutStatus.remainingMinutes
    });
    throw new Error(`Account is locked. Please try again in ${lockoutStatus.remainingMinutes} minutes.`);
  }

  // Check if account is active
  if (!user.isActive) {
    logger.warn('Login attempt for disabled account', { email: validatedData.email });
    throw new Error('Account is disabled');
  }

  // Verify password
  const isValidPassword = await bcrypt.compare(validatedData.password, user.passwordHash);
  if (!isValidPassword) {
    // Record failed attempt
    const failedStatus = await passwordPolicy.recordFailedLoginAttempt(user.id);

    if (failedStatus.locked) {
      throw new Error(`Too many failed attempts. Account locked for ${failedStatus.remainingMinutes} minutes.`);
    }

    const attemptsRemaining = 5 - failedStatus.failedAttempts;
    logger.warn('Login attempt with invalid password', {
      email: validatedData.email,
      attemptsRemaining,
    });
    throw new Error(`Invalid email or password. ${attemptsRemaining} attempts remaining.`);
  }

  // Successful login - reset failed attempts
  await passwordPolicy.resetFailedLoginAttempts(user.id);

  // Check password expiry
  const expiryStatus = await passwordPolicy.getPasswordExpiryStatus(user.id);

  // Generate JWT token
  const token = generateToken(user);

  // Remove password hash from response
  const { passwordHash, ...userWithoutPassword } = user;

  logger.info('User logged in successfully', { userId: user.id, email: user.email });

  return {
    user: userWithoutPassword,
    token,
    passwordExpiry: {
      expired: expiryStatus.expired,
      daysUntilExpiry: expiryStatus.daysUntilExpiry,
    },
  };
}

/**
 * Register new user
 * @param pool - Database connection pool
 * @param data - Registration data
 * @returns User data with JWT token
 * @throws Error if registration fails
 */
export async function registerUser(pool: Pool, data: RegisterData): Promise<AuthResponse> {
  // Validate input (basic validation - TODO: restore schema validation)
  if (!data.email || !data.password || !data.fullName || !data.role) {
    throw new Error('All fields are required');
  }
  const validatedData = data;

  // Validate password meets policy requirements
  const passwordValidation = passwordPolicy.validatePassword(validatedData.password);
  if (!passwordValidation.valid) {
    throw new Error(`Password does not meet requirements: ${passwordValidation.errors.join(', ')}`);
  }

  // Check if user already exists
  const existingUser = await findUserByEmail(pool, validatedData.email);
  if (existingUser) {
    logger.warn('Registration attempt with existing email', { email: validatedData.email });
    throw new Error('Email already registered');
  }

  // Hash password with stronger salt rounds
  const passwordHash = await bcrypt.hash(validatedData.password, 12);

  // Create user
  const user = await createUser(pool, {
    email: validatedData.email,
    passwordHash,
    fullName: validatedData.fullName,
    role: validatedData.role,
  });

  // Generate JWT token
  const token = generateToken(user);

  logger.info('User registered successfully', { userId: user.id, email: user.email });

  return {
    user,
    token,
  };
}

/**
 * Get user profile by ID
 * @param pool - Database connection pool
 * @param userId - User ID
 * @returns User profile data
 * @throws Error if user not found
 */
/**
 * Get user profile by ID (excludes password hash)
 * @param pool - Database connection pool
 * @param userId - User UUID
 * @returns User profile data without sensitive fields
 * @throws Error if user not found
 * 
 * Use Cases:
 * - Profile page display
 * - Admin user management
 * - Audit trail user lookups
 */
export async function getUserProfile(pool: Pool, userId: string) {
  const user = await findUserById(pool, userId);
  if (!user) {
    logger.warn('Profile request for non-existent user', { userId });
    throw new Error('User not found');
  }

  return user;
}
