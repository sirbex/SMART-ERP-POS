/**
 * Device session policy SSOT — shared POS vs personal office PC.
 *
 * SHARED (default, max security for walk-up terminals):
 *   - Never silent-restore any role after close/reboot/Chrome restore
 *   - Actor lock on pagehide so next opener must re-authenticate
 *   - Short idle → logout
 *   - Refresh-token revoke on lock/boot wipe (best-effort on unload)
 *
 * PERSONAL (opt-in dedicated office workstation):
 *   - ADMIN/MANAGER may restore durable session (legacy ERP behaviour)
 *   - Longer idle window
 *
 * Storage keys live here — AuthContext / cold-start must not invent parallels.
 *
 * Integrity rule: storage failures FAIL CLOSED (assume locked / refuse restore).
 * Never fail-open into a previous actor's session.
 */

export const DEVICE_SESSION_MODES = ['SHARED', 'PERSONAL'] as const;
export type DeviceSessionMode = (typeof DEVICE_SESSION_MODES)[number];

/** localStorage — persists across close; set via env or Settings. */
export const DEVICE_SESSION_MODE_KEY = 'smarterp_device_session_mode';

/**
 * Set on pagehide/beforeunload in SHARED mode.
 * Survives Chrome "continue where you left off" (unlike sessionStorage-only gates).
 */
export const ACTOR_LOCK_KEY = 'smarterp_actor_lock_v1';

/**
 * sessionStorage — marks this browser tab/session as trusted after login/boot.
 * Chrome session restore can revive it; actor lock closes that hole.
 */
export const AUTH_BOOT_SESSION_KEY = 'auth_boot_session_v1';

/**
 * Set for a short window after successful login so initAuth / cross-tab storage
 * handlers cannot apply SHARED cold-start wipe to a brand-new session.
 */
export const AUTH_LOGIN_GRACE_KEY = 'auth_login_grace_v1';
export const AUTH_LOGIN_GRACE_MS = 30_000;

export const SHARED_IDLE_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes
export const PERSONAL_IDLE_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes

export const COLD_START_QUICK_LOGIN_HREF = '/quick-login';

/** JWT / identity keys that MUST be absent after a security wipe. */
export const AUTH_SESSION_WIPE_KEYS = [
  'auth_token',
  'refresh_token',
  'token_expiry',
  'user',
  'rbac_permissions',
] as const;

export class DeviceSessionIntegrityError extends Error {
  readonly code = 'DEVICE_SESSION_INTEGRITY' as const;
  constructor(message: string) {
    super(`[DEVICE_SESSION_INTEGRITY] ${message}`);
    this.name = 'DeviceSessionIntegrityError';
  }
}

export function isDeviceSessionMode(v: unknown): v is DeviceSessionMode {
  return typeof v === 'string' && (DEVICE_SESSION_MODES as readonly string[]).includes(v);
}

/**
 * Resolve mode: explicit storage → Vite env → SHARED (secure default).
 * Env: VITE_DEVICE_SESSION_MODE=shared|personal
 *
 * Non-empty garbage in storage does NOT become PERSONAL — falls to SHARED.
 * Callers that need fail-loud on garbage use assertDeviceSessionModeStored.
 */
export function resolveDeviceSessionMode(input: {
  stored: string | null | undefined;
  envRaw: string | null | undefined;
}): DeviceSessionMode {
  const stored = String(input.stored || '')
    .trim()
    .toUpperCase();
  if (stored.length > 0) {
    if (isDeviceSessionMode(stored)) return stored;
    // Refuse unknown labels as PERSONAL; secure default.
    return 'SHARED';
  }

  const env = String(input.envRaw || '')
    .trim()
    .toUpperCase();
  if (env === 'PERSONAL' || env === 'OFFICE') return 'PERSONAL';
  if (env === 'SHARED' || env === 'POS' || env === 'KIOSK') return 'SHARED';
  if (env.length > 0 && env !== 'SHARED' && env !== 'PERSONAL') {
    // Unknown env → SHARED (never personal by typo)
    return 'SHARED';
  }

  return 'SHARED';
}

/**
 * Fail-loud when an operator explicitly set a non-empty invalid mode string.
 * Used by settings/admin paths — boot path uses resolveDeviceSessionMode (SHARED).
 */
export function assertDeviceSessionModeStored(stored: string | null | undefined): void {
  const raw = String(stored || '').trim();
  if (!raw) return;
  if (!isDeviceSessionMode(raw.toUpperCase())) {
    throw new DeviceSessionIntegrityError(
      `Invalid ${DEVICE_SESSION_MODE_KEY}='${raw}' — allowed: ${DEVICE_SESSION_MODES.join('|')}`,
    );
  }
}

export function idleTimeoutMsForMode(mode: DeviceSessionMode): number {
  if (!isDeviceSessionMode(mode)) {
    throw new DeviceSessionIntegrityError(`idleTimeoutMsForMode: invalid mode '${String(mode)}'`);
  }
  return mode === 'SHARED' ? SHARED_IDLE_TIMEOUT_MS : PERSONAL_IDLE_TIMEOUT_MS;
}

/**
 * Roles that may silent-restore ONLY on PERSONAL devices.
 * SHARED: every role must re-auth (including ADMIN/MANAGER).
 */
export function roleMaySilentRestoreOnPersonal(role: string | null | undefined): boolean {
  const r = String(role || '')
    .trim()
    .toUpperCase();
  return r === 'ADMIN' || r === 'MANAGER';
}

export function roleRequiresReauthGate(input: {
  mode: DeviceSessionMode;
  role: string | null | undefined;
}): boolean {
  if (!isDeviceSessionMode(input.mode)) {
    throw new DeviceSessionIntegrityError(`roleRequiresReauthGate: invalid mode '${String(input.mode)}'`);
  }
  if (input.mode === 'SHARED') return true;
  return !roleMaySilentRestoreOnPersonal(input.role);
}

/**
 * Actor-lock value semantics (fail closed):
 * - null / '' → unlocked
 * - '1' → locked
 * - any other non-empty → locked (corrupt marker still blocks restore)
 */
export function isActorLockRawSet(raw: string | null | undefined): boolean {
  if (raw == null) return false;
  return String(raw).trim().length > 0;
}

/**
 * Unified gate: force re-auth when actor lock, cold browser session, or role policy says so.
 * Login grace (same tab / storage race) must never wipe a session just established.
 */
export function shouldForceReauthOnBoot(input: {
  mode: DeviceSessionMode;
  role: string | null | undefined;
  hasStoredSession: boolean;
  actorLockSet: boolean;
  isBrowserColdStart: boolean;
  /** When true, skip wipe — caller just completed login in this tab. */
  withinLoginGrace?: boolean;
}): boolean {
  if (!isDeviceSessionMode(input.mode)) {
    throw new DeviceSessionIntegrityError(
      `shouldForceReauthOnBoot: invalid mode '${String(input.mode)}'`,
    );
  }
  if (input.withinLoginGrace) return false;
  if (!input.hasStoredSession) return false;
  if (input.actorLockSet) return true;
  if (!input.isBrowserColdStart) return false;
  return roleRequiresReauthGate({ mode: input.mode, role: input.role });
}

/**
 * Fail-loud: after a security wipe, none of the session keys may remain.
 * `read` returns the raw localStorage value (or throws / returns undefined on error).
 * Storage read errors are treated as uncleared (fail closed).
 */
export function assertAuthSessionCleared(read: (key: string) => string | null | undefined): void {
  const leftovers: string[] = [];
  for (const key of AUTH_SESSION_WIPE_KEYS) {
    let value: string | null | undefined;
    try {
      value = read(key);
    } catch {
      leftovers.push(`${key}:unreadable`);
      continue;
    }
    if (value != null && String(value).length > 0) {
      leftovers.push(key);
    }
  }
  if (leftovers.length > 0) {
    throw new DeviceSessionIntegrityError(
      `Session wipe incomplete — remaining: ${leftovers.join(', ')}`,
    );
  }
}
