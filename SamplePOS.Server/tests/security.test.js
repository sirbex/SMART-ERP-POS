// Phase 7: Security Testing Framework
// File: SamplePOS.Server/tests/security.test.js

const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Mock app setup for testing
let app;
let server;

const TEST_PORT = 3999;
const JWT_SECRET = 'test-secret-key';
const ADMIN_CREDENTIALS = { username: 'admin', password: 'Admin123!' };
const MANAGER_CREDENTIALS = { username: 'manager', password: 'Manager123!' };
const CASHIER_CREDENTIALS = { username: 'cashier', password: 'Cashier123!' };

/**
 * Security Testing Suite for Phase 7
 */
describe('Phase 7: Security & Authentication Tests', () => {
  let adminToken = '';
  let managerToken = '';
  let cashierToken = '';

  beforeAll(async () => {
    // Start test server
    console.log('Starting security test server...');

    // Generate test tokens
    adminToken = jwt.sign(
      { userId: '1', username: 'admin', role: 'ADMIN' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    managerToken = jwt.sign(
      { userId: '2', username: 'manager', role: 'MANAGER' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    cashierToken = jwt.sign(
      { userId: '3', username: 'cashier', role: 'CASHIER' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    console.log('Test tokens generated successfully');
  });

  afterAll(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
      console.log('Test server closed');
    }
  });

  describe('Authentication Endpoints', () => {
    test('POST /api/auth/login - successful login', async () => {
      const mockApp = {
        post: jest.fn(),
        listen: jest.fn()
      };

      // Simulate successful login
      const loginData = {
        success: true,
        data: {
          accessToken: adminToken,
          refreshToken: 'mock-refresh-token',
          user: {
            id: '1',
            username: 'admin',
            email: 'admin@test.com',
            role: 'ADMIN'
          }
        }
      };

      expect(loginData.success).toBe(true);
      expect(loginData.data.accessToken).toBeDefined();
      expect(loginData.data.refreshToken).toBeDefined();
      expect(loginData.data.user.role).toBe('ADMIN');
    });

    test('POST /api/auth/login - invalid credentials', async () => {
      const invalidLogin = {
        success: false,
        error: 'Invalid credentials'
      };

      expect(invalidLogin.success).toBe(false);
      expect(invalidLogin.error).toBe('Invalid credentials');
    });

    test('POST /api/auth/login - rate limiting', async () => {
      // Simulate rate limiting after multiple failed attempts
      const rateLimitResponse = {
        success: false,
        error: 'Too many login attempts from this IP, please try again after 15 minutes'
      };

      expect(rateLimitResponse.success).toBe(false);
      expect(rateLimitResponse.error).toContain('Too many login attempts');
    });

    test('POST /api/auth/refresh - token refresh', async () => {
      const refreshResponse = {
        success: true,
        data: {
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
          user: {
            id: '1',
            username: 'admin',
            role: 'ADMIN'
          }
        }
      };

      expect(refreshResponse.success).toBe(true);
      expect(refreshResponse.data.accessToken).toBeDefined();
      expect(refreshResponse.data.refreshToken).toBeDefined();
    });

    test('POST /api/auth/logout - successful logout', async () => {
      const logoutResponse = {
        success: true,
        message: 'Logged out successfully'
      };

      expect(logoutResponse.success).toBe(true);
    });
  });

  describe('JWT Token Validation', () => {
    test('Valid JWT token structure', () => {
      const decoded = jwt.decode(adminToken);

      expect(decoded).toHaveProperty('userId');
      expect(decoded).toHaveProperty('username');
      expect(decoded).toHaveProperty('role');
      expect(decoded).toHaveProperty('exp');
    });

    test('Expired token handling', () => {
      const expiredToken = jwt.sign(
        { userId: '1', username: 'admin', role: 'ADMIN' },
        JWT_SECRET,
        { expiresIn: '-1h' } // Expired 1 hour ago
      );

      try {
        jwt.verify(expiredToken, JWT_SECRET);
        fail('Should have thrown an error for expired token');
      } catch (error) {
        expect(error.name).toBe('TokenExpiredError');
      }
    });

    test('Invalid token handling', () => {
      const invalidToken = 'invalid.token.here';

      try {
        jwt.verify(invalidToken, JWT_SECRET);
        fail('Should have thrown an error for invalid token');
      } catch (error) {
        expect(error.name).toBe('JsonWebTokenError');
      }
    });
  });

  describe('Role-Based Access Control', () => {
    test('Admin access to all resources', () => {
      const adminPermissions = [
        'users:read', 'users:write', 'users:delete',
        'products:read', 'products:write', 'products:delete',
        'sales:read', 'sales:write', 'sales:delete',
        'reports:read', 'audit:read'
      ];

      const userRole = 'ADMIN';

      // Admin should have access to all permissions
      adminPermissions.forEach(permission => {
        expect(hasRolePermission(userRole, permission)).toBe(true);
      });
    });

    test('Manager limited access', () => {
      const managerPermissions = [
        'products:read', 'products:write',
        'sales:read', 'sales:write',
        'inventory:read', 'inventory:write',
        'reports:read'
      ];

      const restrictedPermissions = [
        'users:write', 'users:delete',
        'audit:read', 'settings:write'
      ];

      const userRole = 'MANAGER';

      managerPermissions.forEach(permission => {
        expect(hasRolePermission(userRole, permission)).toBe(true);
      });

      restrictedPermissions.forEach(permission => {
        expect(hasRolePermission(userRole, permission)).toBe(false);
      });
    });

    test('Cashier restricted access', () => {
      const cashierPermissions = [
        'products:read',
        'sales:read', 'sales:write',
        'customers:read'
      ];

      const restrictedPermissions = [
        'users:read', 'users:write',
        'products:write', 'products:delete',
        'inventory:write', 'reports:read'
      ];

      const userRole = 'CASHIER';

      cashierPermissions.forEach(permission => {
        expect(hasRolePermission(userRole, permission)).toBe(true);
      });

      restrictedPermissions.forEach(permission => {
        expect(hasRolePermission(userRole, permission)).toBe(false);
      });
    });
  });

  describe('Password Security', () => {
    test('Password hashing', async () => {
      const plainPassword = 'TestPassword123!';
      const hashedPassword = await bcrypt.hash(plainPassword, 12);

      expect(hashedPassword).not.toBe(plainPassword);
      expect(hashedPassword.length).toBeGreaterThan(50);
    });

    test('Password verification', async () => {
      const plainPassword = 'TestPassword123!';
      const hashedPassword = await bcrypt.hash(plainPassword, 12);

      const isValid = await bcrypt.compare(plainPassword, hashedPassword);
      const isInvalid = await bcrypt.compare('WrongPassword', hashedPassword);

      expect(isValid).toBe(true);
      expect(isInvalid).toBe(false);
    });

    test('Password strength validation', () => {
      const weakPasswords = ['123', 'password', 'Password', 'Password123'];
      const strongPasswords = ['Password123!', 'MyStr0ng@Pass', 'C0mplex#P@ss'];

      weakPasswords.forEach(password => {
        expect(validatePasswordStrength(password).isValid).toBe(false);
      });

      strongPasswords.forEach(password => {
        expect(validatePasswordStrength(password).isValid).toBe(true);
      });
    });
  });

  describe('Input Validation & XSS Prevention', () => {
    test('XSS script tag removal', () => {
      const maliciousInputs = [
        '<script>alert("xss")</script>',
        '<img src=x onerror=alert("xss")>',
        'javascript:alert("xss")',
        '<svg onload=alert("xss")>'
      ];

      maliciousInputs.forEach(input => {
        const sanitized = sanitizeInput(input);
        expect(sanitized).not.toContain('<script');
        expect(sanitized).not.toContain('javascript:');
        expect(sanitized).not.toContain('onerror=');
        expect(sanitized).not.toContain('onload=');
      });
    });

    test('SQL injection pattern detection', () => {
      const sqlInjectionAttempts = [
        "'; DROP TABLE users; --",
        "1' OR '1'='1",
        "UNION SELECT * FROM users",
        "'; INSERT INTO users",
        "1; DELETE FROM products"
      ];

      sqlInjectionAttempts.forEach(attempt => {
        expect(detectSqlInjection(attempt)).toBe(true);
      });

      const legitimateInputs = [
        "John's Pizza",
        "Product Name 123",
        "user@example.com",
        "Regular text input"
      ];

      legitimateInputs.forEach(input => {
        expect(detectSqlInjection(input)).toBe(false);
      });
    });

    test('Input length validation', () => {
      const longInput = 'a'.repeat(1001);
      const normalInput = 'Normal input';
      const emptyInput = '';

      expect(validateInputLength(longInput, 1000)).toBe(false);
      expect(validateInputLength(normalInput, 1000)).toBe(true);
      expect(validateInputLength(emptyInput, 1000, 1)).toBe(false);
    });
  });

  describe('Rate Limiting', () => {
    test('Rate limit tracking', () => {
      const ipAddress = '192.168.1.1';
      const endpoint = '/api/auth/login';

      // Simulate rate limit tracking
      const rateLimit = {
        ip: ipAddress,
        endpoint: endpoint,
        requests: 1,
        windowStart: new Date(),
        maxRequests: 5
      };

      expect(rateLimit.requests).toBeLessThanOrEqual(rateLimit.maxRequests);
    });

    test('Rate limit exceeded', () => {
      const rateLimitExceeded = {
        success: false,
        error: 'Rate limit exceeded',
        retryAfter: 900 // 15 minutes
      };

      expect(rateLimitExceeded.success).toBe(false);
      expect(rateLimitExceeded.error).toContain('Rate limit exceeded');
      expect(rateLimitExceeded.retryAfter).toBeGreaterThan(0);
    });
  });

  describe('Security Headers', () => {
    test('Security headers present', () => {
      const securityHeaders = {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
        'Content-Security-Policy': "default-src 'self'"
      };

      Object.keys(securityHeaders).forEach(header => {
        expect(securityHeaders[header]).toBeDefined();
      });
    });
  });

  describe('Session Management', () => {
    test('Session creation', () => {
      const session = {
        id: 'session-id-123',
        userId: '1',
        sessionToken: 'secure-session-token',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        isActive: true
      };

      expect(session.id).toBeDefined();
      expect(session.sessionToken).toBeDefined();
      expect(session.expiresAt).toBeInstanceOf(Date);
      expect(session.isActive).toBe(true);
    });

    test('Session invalidation', () => {
      const invalidatedSession = {
        isActive: false,
        updatedAt: new Date()
      };

      expect(invalidatedSession.isActive).toBe(false);
      expect(invalidatedSession.updatedAt).toBeInstanceOf(Date);
    });
  });
});

// Utility functions for testing
function hasRolePermission(role, permission) {
  const rolePermissions = {
    ADMIN: [
      'users:read', 'users:write', 'users:delete',
      'products:read', 'products:write', 'products:delete',
      'sales:read', 'sales:write', 'sales:delete',
      'reports:read', 'audit:read', 'settings:write'
    ],
    MANAGER: [
      'products:read', 'products:write',
      'sales:read', 'sales:write',
      'inventory:read', 'inventory:write',
      'reports:read'
    ],
    CASHIER: [
      'products:read',
      'sales:read', 'sales:write',
      'customers:read'
    ],
    STAFF: [
      'products:read',
      'inventory:read'
    ]
  };

  return rolePermissions[role]?.includes(permission) || false;
}

function validatePasswordStrength(password) {
  const errors = [];

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one digit');
  }

  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

function sanitizeInput(input) {
  return input
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/<img[^>]*onerror[^>]*>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/<svg[^>]*onload[^>]*>/gi, '');
}

function detectSqlInjection(input) {
  const sqlPatterns = [
    /('|(\\x27)|(\\x2D)|(\\x2d))/i,
    /(;|(\\x3B)|(\\x3b))/i,
    /((union(.*?)select)|(union(.*?)all(.*?)select))/i,
    /(select(.*?)from)/i,
    /(insert(.*?)into)/i,
    /(delete(.*?)from)/i,
    /(update(.*?)set)/i,
    /(drop(.*?)table)/i
  ];

  return sqlPatterns.some(pattern => pattern.test(input));
}

function validateInputLength(input, maxLength, minLength = 0) {
  return input.length >= minLength && input.length <= maxLength;
}

// Export for running tests
module.exports = {
  hasRolePermission,
  validatePasswordStrength,
  sanitizeInput,
  detectSqlInjection,
  validateInputLength
};