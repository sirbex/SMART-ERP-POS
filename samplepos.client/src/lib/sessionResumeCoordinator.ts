/**
 * Session Resume Coordinator
 *
 * INVARIANT_SESSION_RESUME_INTEGRITY_v1 — single debounced visibility SSOT.
 *
 * Phases:
 *   auth  — proactive token refresh (runs first, sequentially)
 *   after — deferred work (grouped by delayMs, parallel within each bucket)
 */

import { getAuthState } from './authStateMachine';
import {
  getRefreshToken,
  isTokenExpired,
  willExpireInNext,
  refreshAccessTokenDeduped,
} from '../hooks/useTokenRefresh';

type ResumeCallback = () => void | Promise<void>;

interface ResumeRegistration {
  id: string;
  phase: 'auth' | 'after';
  delayMs: number;
  fn: ResumeCallback;
}

const registrations: ResumeRegistration[] = [];
let visibilityListenerInstalled = false;
let resumeInFlight: Promise<void> | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

const DEBOUNCE_MS = 120;

function nextId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `resume-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function ensureVisibilityListener(): void {
  if (visibilityListenerInstalled || typeof document === 'undefined') return;
  visibilityListenerInstalled = true;
  document.addEventListener('visibilitychange', onVisibilityChange);
}

function onVisibilityChange(): void {
  if (document.visibilityState !== 'visible') return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void runSessionResume();
  }, DEBOUNCE_MS);
}

/**
 * Register a callback to run when the tab becomes visible again.
 * Returns unsubscribe.
 */
export function registerSessionResume(
  fn: ResumeCallback,
  opts: { phase?: 'auth' | 'after'; delayMs?: number } = {},
): () => void {
  const reg: ResumeRegistration = {
    id: nextId(),
    phase: opts.phase ?? 'after',
    delayMs: Math.max(0, opts.delayMs ?? 0),
    fn,
  };
  registrations.push(reg);
  ensureVisibilityListener();
  return () => {
    const idx = registrations.indexOf(reg);
    if (idx >= 0) registrations.splice(idx, 1);
  };
}

/**
 * Run all resume phases. Dedupes concurrent callers (visibility + manual).
 */
export async function runSessionResume(): Promise<void> {
  if (resumeInFlight) return resumeInFlight;

  resumeInFlight = (async () => {
    const authCallbacks = registrations.filter((r) => r.phase === 'auth');
    const afterCallbacks = registrations.filter((r) => r.phase === 'after');

    for (const reg of authCallbacks) {
      try {
        await reg.fn();
      } catch {
        /* auth refresh handles logout; other auth hooks must not block resume */
      }
    }

    const afterByDelay = new Map<number, ResumeRegistration[]>();
    for (const reg of afterCallbacks) {
      const bucket = afterByDelay.get(reg.delayMs) ?? [];
      bucket.push(reg);
      afterByDelay.set(reg.delayMs, bucket);
    }

    const delays = [...afterByDelay.keys()].sort((a, b) => a - b);
    let elapsed = 0;
    for (const delay of delays) {
      const wait = delay - elapsed;
      if (wait > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, wait));
      }
      elapsed = delay;
      const bucket = afterByDelay.get(delay) ?? [];
      await Promise.allSettled(bucket.map((reg) => Promise.resolve(reg.fn())));
    }
  })().finally(() => {
    resumeInFlight = null;
  });

  return resumeInFlight;
}

/**
 * Proactive token refresh before user clicks after idle tab.
 * Call once from AuthProvider.
 */
export function setupSessionResumeAuth(): () => void {
  return registerSessionResume(
    async () => {
      if (!navigator.onLine) return;
      if (!getRefreshToken()) return;
      if (getAuthState() === 'EXPIRED') return;
      if (!isTokenExpired() && !willExpireInNext(5)) return;

      try {
        await refreshAccessTokenDeduped();
      } catch {
        /* _refreshOnce handles definitive logout / deferred notify */
      }
    },
    { phase: 'auth' },
  );
}

/** Test / teardown helper */
export function resetSessionResumeCoordinatorForTests(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  registrations.length = 0;
  resumeInFlight = null;
  if (visibilityListenerInstalled && typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    visibilityListenerInstalled = false;
  }
}
