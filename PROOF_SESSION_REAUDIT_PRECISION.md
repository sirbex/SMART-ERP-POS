# Aggressive re-verification — Session death / error swallowing / consistency

**Date:** 2026-08-09  
**Scope:** Client auth session lifecycle (post `INVARIANT_SESSION_DEATH_LOGIN_v1`)  
**Final seal:** **PASS** (lock + reliability + download)

---

## Executive verdict

| Area | Result |
|------|--------|
| Original zombie-session (defer definitive while active) | **Closed** |
| Same-tab broadcast-only logout | **Closed** |
| **Additional** holes found on re-audit | **Found & fixed (4)** |
| Permanent lock after re-audit | **PASS** |
| Related suites | **163/163 PASS** |

---

## Residual defects found (precision)

### H1 — 401 after successful refresh retry never forced login

**Where:** `build401Handler`  
**Before:** Only handled `401 && !_retry`. After refresh + retry still 401 (`_retry === true`), handler **rejected only** — no `forceLogoutRedirect`.  
**User impact:** Access invalidated after refresh (reuse/revocation) → toasts, UI stays authenticated.  
**Fix:** Always `forceLogoutRedirect('401_after_retry')` when still 401 after retry; also force logout when refresh clears access before retry.

### H2 — Boot `initAuth` resurrected stale access token

**Where:** `AuthContext.initAuth`  
**Before:**  
```ts
token = localStorage.getItem('auth_token') || token; // resurrected cleared token
catch { /* fall through to profile */ }
// profile 401 → return only; still later paths could mark authenticated inconsistently
```  
**User impact:** After dead refresh cleared storage, in-memory `token` could keep shell alive or race ahead of `location.replace`.  
**Fix:** Never `|| token` after refresh; on dead access → `forceLogoutRedirect('boot_refresh_failed')` + return; profile 401/403/session-gone → forceLogout; refuse `setIsAuthenticated` without access token.

### H3 — Raw `fetch` download path ignored auth death

**Where:** `download.ts`  
**Before:** Native fetch with Bearer only; 401 threw text error, **no refresh, no force login**.  
**User impact:** PDF/export while session dead → error toast only, SPA remains.  
**Fix:** `authorizedFetch` → refresh once on 401 → `forceLogoutRedirect` if still dead.

### H4 — Request interceptors / keepalive swallowed definitive outcomes

**Where:** `api.ts` request interceptor; `useSessionKeepalive`  
**Before:** Empty `catch` on refresh failed (assumed “401 interceptor later”). Missing token → “Session not ready” without force login when session already `EXPIRED`/cleared. Keepalive swallowed all errors with “do not logout” comment (definitive already handled inside `_refreshOnce`, but cleared session without redirect race possible).  
**Fix:** If no access after refresh / EXPIRED → `forceLogoutRedirect`; keepalive only forceLogout when session already dead (not on network).

---

## Still intentionally “swallowed” (not bugs)

| Path | Why acceptable |
|------|----------------|
| Network / 5xx on refresh | Must keep session for ERP offline / retry (policy matrix) |
| Profile validation **abort/timeout** | Soft offline: cached shell allowed |
| Logout server revoke `fetch().catch` | Best-effort; local clear already done |
| Auth broadcast / listener try-catch | Isolated handler failures; not auth death |

---

## Files changed this re-audit

- `samplepos.client/src/hooks/useTokenRefresh.ts` — 401-after-retry harden  
- `samplepos.client/src/contexts/AuthContext.tsx` — boot precision  
- `samplepos.client/src/utils/api.ts` — request-gate force login  
- `samplepos.client/src/utils/download.ts` — fetch 401 path  
- `samplepos.client/src/hooks/useSessionKeepalive.ts` — dead-session safety  
- Lock gates + download test mocks  

---

## Evidence (re-run)

```
node scripts/proof-session-death-login-invariant.mjs
→ PASS — INVARIANT_SESSION_DEATH_LOGIN_v1 sealed

vitest: session-death-login lock + force-login proof + reliability + enterprise + download
→ Tests  15 (lock) + 163 related  PASS
```

Artifacts:

- `PROOF_SESSION_DEATH_LOGIN_INVARIANT_LOCK.md` / `.json`  
- `PERMANENT_GUARANTEE_SESSION_DEATH_LOGIN.md`  
- This file: `PROOF_SESSION_REAUDIT_PRECISION.md`

---

## Residual risk (honest)

| Risk | Severity | Note |
|------|----------|------|
| Other raw `fetch` sites (ProfitLoss, DocumentPreview, use2FA) | Low–med | Still bypass full axios path; 401 may toast without hard nav until next apiClient call. Download fixed as highest binary export path. |
| 401 used as “forbidden” mis-status by an API | Low | After-retry force logout is correct for true auth; mistyped 401→403 on server is server quality. |

Optional hardening follow-up: shared `fetchAuthorized()` for remaining native fetch call sites.

---

## Tester / developer sign-off

Aggressive re-verification **did find residual inconsistency**; all high-impact holes in the auth/interceptor core path are fixed and locked. Zombie-session class is defended at:

1. Policy  
2. Refresh catch  
3. 401 first attempt  
4. **401 after retry** (new)  
5. Boot init  
6. Request interceptor empty session  
7. Downloads  
8. CI hard-fail invariant  

**Verdict: CLEAR for session-death UI inconsistency on primary HTTP stack.** Remaining raw-fetch islands are documented residual risk, not the original product bug class.
