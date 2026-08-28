/**
 * PERMANENT CONTRACT — Tab resume must not freeze UI or ignore first click
 *
 * Token: INVARIANT_SESSION_RESUME_INTEGRITY_v1
 *
 * Failure modes this locks forever (must NEVER return in product):
 * 1. Multiple visibilitychange handlers each firing API bursts on tab resume
 * 2. First user click after idle blocked by token refresh (no proactive resume refresh)
 * 3. Peer-tab token rotation triggers full initAuth() profile storm
 * 4. refetchOnWindowFocus:'always' on global hooks causing focus refetch storms
 *
 * Enforcement:
 * - Structural source greps (required / forbidden strings + visibility SSOT)
 * - Behavioral gates (auth-before-after ordering, proactive refresh, waiter unblock)
 * - CI runner: scripts/proof-session-resume-integrity.mjs (hard fail)
 */

export const SESSION_RESUME_INTEGRITY_INVARIANT_ID =
  'INVARIANT_SESSION_RESUME_INTEGRITY_v1' as const;

/** Only these files may register document visibilitychange listeners. */
export const SESSION_RESUME_VISIBILITY_SSOT_FILES = [
  'src/lib/sessionResumeCoordinator.ts',
  'src/hooks/useIdleTimeout.ts',
] as const;

export const SESSION_RESUME_INTEGRITY_SOURCE_FILES = [
  'src/lib/sessionResumeCoordinator.ts',
  'src/contexts/AuthContext.tsx',
  'src/lib/offlineRequestQueue.ts',
] as const;

export const SESSION_RESUME_INTEGRITY_REQUIRED_SNIPPETS: Record<string, string[]> = {
  'src/lib/sessionResumeCoordinator.ts': [
    SESSION_RESUME_INTEGRITY_INVARIANT_ID,
    'export function registerSessionResume',
    'export async function runSessionResume',
    'export function setupSessionResumeAuth',
    "phase: 'auth'",
  ],
  'src/contexts/AuthContext.tsx': [
    SESSION_RESUME_INTEGRITY_INVARIANT_ID,
    'setupSessionResumeAuth',
    "event.type === 'TOKEN_REFRESH'",
    'resetAuthState()',
    'isAuthenticatedRef',
    'event.key === \'auth_token\'',
    'resetAuthState();',
  ],
  'src/lib/offlineRequestQueue.ts': [
    'registerSessionResume',
    "phase: 'after'",
  ],
  'src/pages/pos/POSPage.tsx': [
    'registerSessionResume',
    "phase: 'after'",
  ],
  'src/contexts/OfflineContext.tsx': [
    'registerSessionResume',
    "phase: 'after'",
  ],
  'src/hooks/useSessionKeepalive.ts': [
    'registerSessionResume',
  ],
  'src/hooks/useCashRegister.ts': [
    'refetchOnWindowFocus: false',
  ],
  'src/hooks/useMultistore.ts': [
    'refetchOnWindowFocus: false',
  ],
};

/** Patterns that must NOT appear — they recreate resume storms / click freeze. */
export const SESSION_RESUME_INTEGRITY_FORBIDDEN_SNIPPETS: string[] = [
  "refetchOnWindowFocus: 'always'",
  'refetchOnWindowFocus: true',
  "document.addEventListener('visibilitychange'",
  "document.removeEventListener('visibilitychange'",
];

/** Files exempt from visibility listener scan (docs / invariant definitions only). */
export const SESSION_RESUME_VISIBILITY_SCAN_SKIP = new Set<string>([
  'src/lib/sessionResumeIntegrityInvariant.ts',
]);
