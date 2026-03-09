/**
 * authService unit tests
 * Tests authentication, registration, and profile retrieval logic.
 */
import { jest } from '@jest/globals';

// Mock dependencies before importing the module under test
const mockFindUserByEmail = jest.fn<any>();
const mockFindUserById = jest.fn<any>();
const mockCreateUser = jest.fn<any>();
const mockGenerateToken = jest.fn<any>();
const mockBcryptCompare = jest.fn<any>();
const mockBcryptHash = jest.fn<any>();
const mockCheckAccountLockout = jest.fn<any>();
const mockRecordFailedLoginAttempt = jest.fn<any>();
const mockResetFailedLoginAttempts = jest.fn<any>();
const mockGetPasswordExpiryStatus = jest.fn<any>();
const mockValidatePassword = jest.fn<any>();

jest.unstable_mockModule('./authRepository.js', () => ({
  findUserByEmail: mockFindUserByEmail,
  findUserById: mockFindUserById,
  createUser: mockCreateUser,
  UserRole: { ADMIN: 'ADMIN', CASHIER: 'CASHIER', MANAGER: 'MANAGER', STAFF: 'STAFF' },
}));

jest.unstable_mockModule('../../middleware/auth.js', () => ({
  generateToken: mockGenerateToken,
}));

jest.unstable_mockModule('bcrypt', () => ({
  default: { compare: mockBcryptCompare, hash: mockBcryptHash },
  compare: mockBcryptCompare,
  hash: mockBcryptHash,
}));

jest.unstable_mockModule('./passwordPolicyService.js', () => ({
  validatePassword: mockValidatePassword,
  checkAccountLockout: mockCheckAccountLockout,
  recordFailedLoginAttempt: mockRecordFailedLoginAttempt,
  resetFailedLoginAttempts: mockResetFailedLoginAttempts,
  getPasswordExpiryStatus: mockGetPasswordExpiryStatus,
  isPasswordInHistory: jest.fn<any>().mockResolvedValue(false),
  addPasswordToHistory: jest.fn<any>().mockResolvedValue(undefined),
  updatePasswordWithPolicy: jest.fn<any>(),
  getPasswordPolicyConfig: jest.fn<any>().mockReturnValue({}),
}));

const { authenticateUser, registerUser, getUserProfile } = await import('./authService.js');

const mockPool = {} as any;

describe('authService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default happy-path mocks
    mockCheckAccountLockout.mockResolvedValue({
      locked: false,
      failedAttempts: 0,
      lockoutUntil: null,
      remainingMinutes: null,
    });
    mockResetFailedLoginAttempts.mockResolvedValue(undefined);
    mockGetPasswordExpiryStatus.mockResolvedValue({
      expired: false,
      expiresAt: null,
      daysUntilExpiry: null,
      warningDays: 30,
    });
    mockValidatePassword.mockReturnValue({ valid: true, errors: [], strength: 'strong', score: 5 });
  });

  describe('authenticateUser', () => {
    it('should return token for valid credentials', async () => {
      const user = {
        id: 'u1',
        email: 'a@b.com',
        fullName: 'Test',
        role: 'CASHIER',
        passwordHash: 'hashed',
        isActive: true,
        createdAt: '2025-01-01',
        updatedAt: '2025-01-01',
      };
      mockFindUserByEmail.mockResolvedValue(user);
      mockBcryptCompare.mockResolvedValue(true);
      mockGenerateToken.mockReturnValue('jwt-token-123');

      const result = await authenticateUser(mockPool, { email: 'a@b.com', password: 'pass123' });

      expect(result.token).toBe('jwt-token-123');
      expect(result.user.email).toBe('a@b.com');
      expect(mockFindUserByEmail).toHaveBeenCalledWith(mockPool, 'a@b.com');
      expect(mockCheckAccountLockout).toHaveBeenCalledWith('u1');
    });

    it('should throw for unknown email', async () => {
      mockFindUserByEmail.mockResolvedValue(null);

      await expect(
        authenticateUser(mockPool, { email: 'bad@x.com', password: 'x' })
      ).rejects.toThrow('Invalid email or password');
    });

    it('should throw for wrong password', async () => {
      const user = {
        id: 'u1',
        email: 'a@b.com',
        passwordHash: 'hashed',
        role: 'CASHIER',
        isActive: true,
      };
      mockFindUserByEmail.mockResolvedValue(user);
      mockBcryptCompare.mockResolvedValue(false);
      mockRecordFailedLoginAttempt.mockResolvedValue({ locked: false, failedAttempts: 1 });

      await expect(
        authenticateUser(mockPool, { email: 'a@b.com', password: 'wrong' })
      ).rejects.toThrow();
      expect(mockRecordFailedLoginAttempt).toHaveBeenCalledWith('u1');
    });
  });

  describe('registerUser', () => {
    it('should hash password and create user', async () => {
      mockFindUserByEmail.mockResolvedValue(null);
      mockBcryptHash.mockResolvedValue('hashed-pw');
      mockCreateUser.mockResolvedValue({
        id: 'u2',
        email: 'new@x.com',
        fullName: 'New User',
        role: 'CASHIER',
        isActive: true,
        createdAt: '2025-01-01',
        updatedAt: '2025-01-01',
      });
      mockGenerateToken.mockReturnValue('new-token');

      const result = await registerUser(mockPool, {
        email: 'new@x.com',
        password: 'Str0ngP@ss!',
        fullName: 'New User',
        role: 'CASHIER',
      });

      expect(result.token).toBe('new-token');
      expect(mockBcryptHash).toHaveBeenCalled();
      expect(mockCreateUser).toHaveBeenCalled();
    });

    it('should reject duplicate email', async () => {
      mockFindUserByEmail.mockResolvedValue({ id: 'existing' });

      await expect(
        registerUser(mockPool, {
          email: 'dup@x.com',
          password: 'P@ss1234',
          fullName: 'Dup',
          role: 'CASHIER',
        })
      ).rejects.toThrow('Email already registered');
    });
  });

  describe('getUserProfile', () => {
    it('should return user profile', async () => {
      mockFindUserById.mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        fullName: 'Test',
        role: 'ADMIN',
      });

      const profile = await getUserProfile(mockPool, 'u1');

      expect(profile).toBeDefined();
      expect(mockFindUserById).toHaveBeenCalledWith(mockPool, 'u1');
    });

    it('should throw for non-existent user', async () => {
      mockFindUserById.mockResolvedValue(null);

      await expect(getUserProfile(mockPool, 'ghost')).rejects.toThrow('User not found');
    });
  });
});
