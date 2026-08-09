# FINAL EVIDENCE — Offline login + PIN + session recovery

**Verdict: PASS**  
**Executed:** 2026-08-09T13:53Z (local: 2026-08-09 16:53 UTC+3)  
**Runner:** Vitest 3.2.4 · `samplepos.client`  
**Result:** **8 files · 211/211 tests passed · 0 failed**

---

## Pack executed (final)

```bash
cd samplepos.client
npx vitest run \
  src/__tests__/offline-login-and-pin.proof.test.ts \
  src/__tests__/session-death-login.invariant.lock.test.ts \
  src/__tests__/session-force-login-redirect.proof.test.ts \
  src/__tests__/session-reliability.spec.ts \
  src/__tests__/session-cold-start-lock.evidence.test.ts \
  src/__tests__/session-active-enterprise.spec.ts \
  src/__tests__/pin-only-login-perf.evidence.test.ts \
  src/__tests__/login-soft-keyboard.proof.test.ts
```

| Suite | Focus | Result |
|---|---|---|
| `offline-login-and-pin.proof.test.ts` | Offline cache, identity isolation, PIN public routes, recovery paths | **PASS** · 52 gates |
| `session-death-login.invariant.lock.test.ts` | Permanent session-death → login invariant | **PASS** · 54 gates |
| `session-force-login-redirect.proof.test.ts` | forceLogout hard-nav + policy | **PASS** |
| `session-reliability.spec.ts` | Tokens, refresh, offline queue, broadcast | **PASS** |
| `session-cold-start-lock.evidence.test.ts` | Cashier PIN after reboot | **PASS** |
| `session-active-enterprise.spec.ts` | Active-user / multi-module logout policy | **PASS** |
| `pin-only-login-perf.evidence.test.ts` | FOH pin-only recovery UX | **PASS** |
| `login-soft-keyboard.proof.test.ts` | PIN pad + soft keyboard | **PASS** |

**Totals:** 211 tests · 0 fails · duration ~3.8s (suite) + re-emit of offline proof

---

## Primary gate artifacts (auto-written)

| Artifact | Content | Latest |
|---|---|---|
| [PROOF_OFFLINE_LOGIN_AND_PIN.md](PROOF_OFFLINE_LOGIN_AND_PIN.md) | Offline+PIN gate matrix | **52/52 PASS** @ `2026-08-09T13:53:30.117Z` |
| [PROOF_OFFLINE_LOGIN_AND_PIN.json](PROOF_OFFLINE_LOGIN_AND_PIN.json) | Machine gates | `pass: 52, fail: 0` |
| [PROOF_OFFLINE_LOGIN_AND_PIN.vitest.json](PROOF_OFFLINE_LOGIN_AND_PIN.vitest.json) | Vitest JSON report | generated this run |
| [PROOF_SESSION_DEATH_LOGIN_INVARIANT_LOCK.json](PROOF_SESSION_DEATH_LOGIN_INVARIANT_LOCK.json) | Session-death permanent lock | **54/54 PASS** @ `2026-08-09T13:53:08.535Z` |
| [PROOF_OFFLINE_LOGIN_AND_PIN_REPORT.md](PROOF_OFFLINE_LOGIN_AND_PIN_REPORT.md) | Hardening report (bugs fixed) | current |

Re-run offline gates alone:

```bash
cd samplepos.client && npm run proof:offline-login-pin
```

---

## What was re-verified (evidence claims)

### Offline password login
| Claim | Evidence gate / test | Status |
|---|---|---|
| Cache + correct password validates | `OFF_CACHE_OK` | PASS |
| Wrong password / unknown email rejected | `OFF_BAD_PWD`, `OFF_UNKNOWN` | PASS |
| Case-insensitive email, multi-user, max 10 | `OFF_EMAIL_CASE`, `OFF_MULTI`, `OFF_EVICT` | PASS |
| Offline session token shape | `OFF_TOKEN_PREFIX` | PASS |
| **Identity isolation:** no JWT/RT reuse, no foreign RBAC | `OFF_ISO_*` | PASS |
| LoginPage uses `beginOfflineLoginSession` (not JWT reuse) | `OFF_PAGE_BEGIN` | PASS |
| `clearTokens` does **not** wipe offline password cache | `OFF_SURVIVES_CLEAR`, `OFF_CLEAR_SRC` | PASS |
| Offline + server-unreachable code paths exist | `OFF_PAGE_OFFLINE_PATH` | PASS |

### PIN / quick-login
| Claim | Evidence | Status |
|---|---|---|
| pin-only / users / pin / check-device public (no AT) | `PIN_PUBLIC_*` | PASS |
| setup route not public by accident | `PIN_SETUP_NOT_PUBLIC_BY_MISTAKE` | PASS |
| forceLogout stays on `/quick-login` + `/login` | `PATH_*`, `FORCE_USES_RECOVERY` | PASS |
| AuthContext recovery SSOT + access-only strips RT | `AUTH_RECOVERY_SSOT`, `AUTH_LOGIN_STRIP_RT` | PASS |
| Cold-start cashier → PIN; admin/manager restore | `COLD_*` | PASS |
| PIN pad + FOH pin-only UX | soft-keyboard + pin-only evidence suites | PASS |

### Session death (still sealed with offline recovery)
| Claim | Evidence | Status |
|---|---|---|
| Definitive auth always force-login | session-death + force-login proofs | PASS |
| Network/5xx keep session offline | `OFF_NET_KEEP`, enterprise active matrix | PASS |
| Same-tab hard redirect on death | forceLogout + invariant lock | PASS |

---

## Production wiring spot-check (this reverify)

- `LoginPage.tsx` — offline + unreachable paths call `beginOfflineLoginSession` only (2 call sites).  
- `offlineLoginCredentials.ts` — identity isolation documented + implemented.  
- No reappearance of `localStorage.getItem('auth_token') || generateOfflineToken` for offline login.

---

## Residual (by design)

| Item | Note |
|---|---|
| PIN while truly offline | Not supported — server bcrypt; password offline only |
| Offline-session token online | Not a valid API JWT; reconnect requires real login/PIN |

---

## Final sign-off

| Metric | Value |
|---|---|
| Final pack | **211/211 PASS** |
| Offline+PIN gates | **52/52 PASS** |
| Session-death lock | **54/54 PASS** |
| Failures | **0** |
| Verdict | **PASS — reverify complete** |
