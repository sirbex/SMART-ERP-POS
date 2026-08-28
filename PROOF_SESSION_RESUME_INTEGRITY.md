# PERMANENT LOCK — INVARIANT_SESSION_RESUME_INTEGRITY_v1

**Generated:** 2026-08-28T05:57:58.389Z  
**Verdict:** **PASS** (37/37 gates)

## Guarantee

If this artifact is green, the enterprise resume path is wired correctly:

- **One** debounced visibility handler (session resume coordinator)
- Proactive token refresh **before** deferred module work
- No focus-refetch storms on cash register / multistore hooks
- Peer-tab token rotation does **not** re-run full `initAuth()`

## Gates

| Gate | Result | Detail |
|------|--------|--------|
| `TOKEN_src_lib_sessionResumeCoordinator_ts` | PASS | src/lib/sessionResumeCoordinator.ts embeds INVARIANT_SESSION_RESUME_INTEGRITY_v1 |
| `TOKEN_src_contexts_AuthContext_tsx` | PASS | src/contexts/AuthContext.tsx embeds INVARIANT_SESSION_RESUME_INTEGRITY_v1 |
| `TOKEN_src_lib_offlineRequestQueue_ts` | PASS | src/lib/offlineRequestQueue.ts embeds INVARIANT_SESSION_RESUME_INTEGRITY_v1 |
| `REQ_sessionResumeCoordinator.ts_INVARIANT_SESSION_RESUME` | PASS | src/lib/sessionResumeCoordinator.ts contains "INVARIANT_SESSION_RESUME_INTEGRITY_v1" |
| `REQ_sessionResumeCoordinator.ts_export_function_register` | PASS | src/lib/sessionResumeCoordinator.ts contains "export function registerSessionResume" |
| `REQ_sessionResumeCoordinator.ts_export_async_function_ru` | PASS | src/lib/sessionResumeCoordinator.ts contains "export async function runSessionResume" |
| `REQ_sessionResumeCoordinator.ts_export_function_setupSes` | PASS | src/lib/sessionResumeCoordinator.ts contains "export function setupSessionResumeAuth" |
| `REQ_sessionResumeCoordinator.ts_phase_auth_` | PASS | src/lib/sessionResumeCoordinator.ts contains "phase: 'auth'" |
| `REQ_AuthContext.tsx_INVARIANT_SESSION_RESUME` | PASS | src/contexts/AuthContext.tsx contains "INVARIANT_SESSION_RESUME_INTEGRITY_v1" |
| `REQ_AuthContext.tsx_setupSessionResumeAuth` | PASS | src/contexts/AuthContext.tsx contains "setupSessionResumeAuth" |
| `REQ_AuthContext.tsx_event_type_TOKEN_RE` | PASS | src/contexts/AuthContext.tsx contains "event.type === 'TOKEN_REFRESH'" |
| `REQ_AuthContext.tsx_resetAuthState_` | PASS | src/contexts/AuthContext.tsx contains "resetAuthState()" |
| `REQ_AuthContext.tsx_isAuthenticatedRef` | PASS | src/contexts/AuthContext.tsx contains "isAuthenticatedRef" |
| `REQ_AuthContext.tsx_event_key_auth_toke` | PASS | src/contexts/AuthContext.tsx contains "event.key === 'auth_token'" |
| `REQ_AuthContext.tsx_resetAuthState_` | PASS | src/contexts/AuthContext.tsx contains "resetAuthState();" |
| `REQ_offlineRequestQueue.ts_registerSessionResume` | PASS | src/lib/offlineRequestQueue.ts contains "registerSessionResume" |
| `REQ_offlineRequestQueue.ts_phase_after_` | PASS | src/lib/offlineRequestQueue.ts contains "phase: 'after'" |
| `REQ_POSPage.tsx_registerSessionResume` | PASS | src/pages/pos/POSPage.tsx contains "registerSessionResume" |
| `REQ_POSPage.tsx_phase_after_` | PASS | src/pages/pos/POSPage.tsx contains "phase: 'after'" |
| `REQ_OfflineContext.tsx_registerSessionResume` | PASS | src/contexts/OfflineContext.tsx contains "registerSessionResume" |
| `REQ_OfflineContext.tsx_phase_after_` | PASS | src/contexts/OfflineContext.tsx contains "phase: 'after'" |
| `REQ_useSessionKeepalive.ts_registerSessionResume` | PASS | src/hooks/useSessionKeepalive.ts contains "registerSessionResume" |
| `REQ_useCashRegister.ts_refetchOnWindowFocus_fa` | PASS | src/hooks/useCashRegister.ts contains "refetchOnWindowFocus: false" |
| `REQ_useMultistore.ts_refetchOnWindowFocus_fa` | PASS | src/hooks/useMultistore.ts contains "refetchOnWindowFocus: false" |
| `VISIBILITY_SSOT_NO_OFFENDERS` | PASS | only src/lib/sessionResumeCoordinator.ts, src/hooks/useIdleTimeout.ts may listen |
| `VISIBILITY_SSOT_sessionResumeCoordinator.ts` | PASS | src/lib/sessionResumeCoordinator.ts registers visibilitychange |
| `VISIBILITY_SSOT_useIdleTimeout.ts` | PASS | src/hooks/useIdleTimeout.ts registers visibilitychange |
| `AUTHCTX_STORAGE_USER_ONLY_INIT` | PASS | user key triggers initAuth |
| `AUTHCTX_STORAGE_TOKEN_NARROW` | PASS | auth_token rotation resets state without full initAuth when already authenticated |
| `AUTHCTX_TOKEN_REFRESH_BROADCAST` | PASS | peer TOKEN_REFRESH unblocks waiters |
| `FORBIDDEN_refetchOnWindowFocus_always_` | PASS | must not contain "refetchOnWindowFocus: 'always'" |
| `FORBIDDEN_refetchOnWindowFocus_true` | PASS | must not contain "refetchOnWindowFocus: true" |
| `FORBIDDEN_document_addEventListener_visibilit` | PASS | must not contain "document.addEventListener('visibilitychange'" |
| `FORBIDDEN_document_removeEventListener_visibi` | PASS | must not contain "document.removeEventListener('visibilitychange'" |
| `LOCK_MODULE_PRESENT` | PASS | sessionResumeIntegrityInvariant.ts present |
| `PROOF_TEST_PRESENT` | PASS | behavioral proof test present |
| `COORDINATOR_MODULE_PRESENT` | PASS | sessionResumeCoordinator.ts present |

## Re-run

```bash
npm run proof:session-resume-integrity --prefix samplepos.client
# or from repo root:
node scripts/proof-session-resume-integrity.mjs
```

**Do not merge** when verdict is FAIL.
