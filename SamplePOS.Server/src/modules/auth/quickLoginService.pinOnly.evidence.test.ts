/**
 * PROOF: PIN-only quick login performance + correctness (shared FOH).
 *
 * Gate for acceptance of the pin-only lag fix after idle/auto-logout.
 * Behavioral: parallel bcrypt + one lockout query — not N× sequential.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { Pool } from 'pg';

type MockFn = (...args: unknown[]) => Promise<unknown>;

const mockFindTrustedDevice = jest.fn<MockFn>();
const mockFindAllUsersWithPin = jest.fn<MockFn>();
const mockGetActivePinLockoutUserIds = jest.fn<MockFn>();
const mockGetPinAttempts = jest.fn<MockFn>();
const mockResetPinAttempts = jest.fn<MockFn>();
const mockUpdateLastQuickLoginAt = jest.fn<MockFn>();
const mockLogQuickLoginAttempt = jest.fn<MockFn>();
const mockGenerateTokenPair = jest.fn<MockFn>();
const mockBcryptCompare = jest.fn<MockFn>();

jest.unstable_mockModule('./quickLoginRepository.js', () => ({
  findTrustedDevice: mockFindTrustedDevice,
  findAllUsersWithPin: mockFindAllUsersWithPin,
  getActivePinLockoutUserIds: mockGetActivePinLockoutUserIds,
  getPinAttempts: mockGetPinAttempts,
  resetPinAttempts: mockResetPinAttempts,
  updateLastQuickLoginAt: mockUpdateLastQuickLoginAt,
  logQuickLoginAttempt: mockLogQuickLoginAttempt,
}));

jest.unstable_mockModule('./refreshTokenService.js', () => ({
  generateTokenPair: mockGenerateTokenPair,
}));

jest.unstable_mockModule('bcrypt', () => ({
  default: { compare: mockBcryptCompare, hash: jest.fn() },
  compare: mockBcryptCompare,
  hash: jest.fn(),
}));

jest.unstable_mockModule('../../utils/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const { authenticateWithPinOnly, QuickLoginError } = await import('./quickLoginService.js');

const pool = {} as Pool;
const deviceFp = 'device-fp-test-abc';
const ctx = { ipAddress: '127.0.0.1', userAgent: 'jest' };

function makeUsers(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    fullName: `Waiter ${i + 1}`,
    role: 'STAFF' as const,
    email: `waiter${i + 1}@test.local`,
    quickLoginEnabled: true,
    pinHash: `hash-${i + 1}`,
    webauthnCredentialId: null,
    webauthnPublicKey: null,
  }));
}

describe('PROOF: authenticateWithPinOnly (FOH pin-only performance)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindTrustedDevice.mockResolvedValue({
      id: 'dev-1',
      deviceFingerprint: deviceFp,
      name: 'FOH',
      isActive: true,
    });
    mockGetActivePinLockoutUserIds.mockResolvedValue(new Set());
    mockResetPinAttempts.mockResolvedValue(undefined);
    mockUpdateLastQuickLoginAt.mockResolvedValue(undefined);
    mockLogQuickLoginAttempt.mockResolvedValue(undefined);
    mockGenerateTokenPair.mockResolvedValue({
      accessToken: 'a'.repeat(40),
      refreshToken: 'r'.repeat(40),
      expiresIn: 3600,
    });
  });

  it('EVIDENCE: uses single lockout query — never N× getPinAttempts', async () => {
    const users = makeUsers(12);
    mockFindAllUsersWithPin.mockResolvedValue(users);
    mockBcryptCompare.mockImplementation(async (_pin, hash) => hash === 'hash-12');

    await authenticateWithPinOnly(pool, '1234', deviceFp, ctx);

    expect(mockGetActivePinLockoutUserIds).toHaveBeenCalledTimes(1);
    expect(mockGetPinAttempts).not.toHaveBeenCalled();
    expect(mockFindAllUsersWithPin).toHaveBeenCalledTimes(1);
  });

  it('EVIDENCE: match is last of many users — wall time is parallel not N-sequential', async () => {
    const users = makeUsers(16);
    mockFindAllUsersWithPin.mockResolvedValue(users);

    const delayMs = 40;
    mockBcryptCompare.mockImplementation(
      (pin: unknown, hash: unknown) =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve(String(hash) === 'hash-16' && String(pin) === '9999');
          }, delayMs);
        }),
    );

    const t0 = Date.now();
    const result = await authenticateWithPinOnly(pool, '9999', deviceFp, ctx);
    const elapsed = Date.now() - t0;

    expect(result.user.id).toBe(users[15].id);
    expect(result.method).toBe('PIN');
    // Sequential would be ~16 * 40ms = 640ms(+overhead). Parallel ~40–200ms.
    // Hard ceiling: well under half of sequential lower bound.
    expect(elapsed).toBeLessThan(16 * delayMs * 0.5);
    expect(mockBcryptCompare).toHaveBeenCalled();
    // All candidates verified in parallel; at least the match ran.
    expect(mockBcryptCompare.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('EVIDENCE: skips locked users (batch lockout set)', async () => {
    const users = makeUsers(3);
    mockFindAllUsersWithPin.mockResolvedValue(users);
    mockGetActivePinLockoutUserIds.mockResolvedValue(new Set([users[0].id]));
    mockBcryptCompare.mockImplementation(async (_p, hash) => hash === 'hash-1');

    await expect(authenticateWithPinOnly(pool, '1111', deviceFp, ctx)).rejects.toMatchObject({
      code: 'INVALID_PIN',
    });
    // Locked first user never compared
    const hashesTried = mockBcryptCompare.mock.calls.map((c) => c[1]);
    expect(hashesTried).not.toContain('hash-1');
  });

  it('EVIDENCE: first unlocked matching PIN wins and issues tokens', async () => {
    const users = makeUsers(4);
    mockFindAllUsersWithPin.mockResolvedValue(users);
    mockBcryptCompare.mockImplementation(async (_p, hash) => hash === 'hash-3');

    const result = await authenticateWithPinOnly(pool, '3333', deviceFp, ctx);
    expect(result.user.email).toBe('waiter3@test.local');
    expect(result.accessToken.length).toBeGreaterThan(20);
    expect(mockResetPinAttempts).toHaveBeenCalledWith(pool, users[2].id);
    expect(mockGenerateTokenPair).toHaveBeenCalled();
  });

  it('EVIDENCE: untrusted device fails fast without bcrypt loop', async () => {
    mockFindTrustedDevice.mockResolvedValue(null);
    await expect(authenticateWithPinOnly(pool, '1234', deviceFp, ctx)).rejects.toMatchObject({
      code: 'UNTRUSTED_DEVICE',
    });
    expect(mockFindAllUsersWithPin).not.toHaveBeenCalled();
    expect(mockBcryptCompare).not.toHaveBeenCalled();
  });

  it('EVIDENCE: no users with PIN → NO_USERS', async () => {
    mockFindAllUsersWithPin.mockResolvedValue([]);
    await expect(authenticateWithPinOnly(pool, '1234', deviceFp, ctx)).rejects.toMatchObject({
      code: 'NO_USERS',
    });
  });

  it('structural gate: pin-only still Promise.any + getActivePinLockoutUserIds', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const src = readFileSync(resolve(process.cwd(), 'src/modules/auth/quickLoginService.ts'), 'utf8');
    const pinOnly = src.slice(src.indexOf('export async function authenticateWithPinOnly'));
    expect(pinOnly).toMatch(/Promise\.any/);
    expect(pinOnly).toMatch(/getActivePinLockoutUserIds/);
    expect(pinOnly).not.toMatch(/getPinAttempts\(pool,\s*user\.id\)/);
  });
});
