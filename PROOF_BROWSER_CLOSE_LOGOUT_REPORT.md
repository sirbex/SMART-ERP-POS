# PROOF REPORT — Browser close logout (bug-free + consistent)

**Date:** 2026-08-16  
**Verdict:** **PASS**  
**Permanent token:** `SECURITY_BROWSER_CLOSE_LOGOUT_v1`  
**Pack:** 9 files · **88/88** tests · 0 failed  

---

## Consistency fix applied during proof

| Bug | Impact | Fix |
|---|---|---|
| bfcache path set **actor lock** without wipe | Resume could re-init and force false logout | bfcache is now a **full no-op** (no lock, no wipe) |
| RT read after first wipe on double event | Second `pagehide` beaconed with `null` | AuthContext snapshots `getRefreshToken()` **before** wipe per event |

---

## Contract (proven)

| Event | SHARED (default POS) | PERSONAL (office) |
|---|---|---|
| Browser / tab **close** | Wipe JWT+RT+user+rbac, actor lock, beacon revoke | Keep session |
| **bfcache** (`persisted`) | No lock, no wipe | N/A |
| Tab switch (same window) | Stay logged in (no pagehide) | Stay logged in |
| Next opener after close | Empty store — must re-auth | May restore admin/manager |
| Offline password cache | Survives wipe | Survives wipe |
| Idle 60m zero input | Logout | Logout |

---

## Evidence artifacts

| Artifact | Result |
|---|---|
| [PROOF_BROWSER_CLOSE_LOGOUT_SECURITY.md](PROOF_BROWSER_CLOSE_LOGOUT_SECURITY.md) | Permanent close-logout gates |
| [PROOF_BROWSER_CLOSE_LOGOUT_SECURITY.json](PROOF_BROWSER_CLOSE_LOGOUT_SECURITY.json) | Machine gates |
| [PROOF_SESSION_IDLE_FALSE_LOGOUT_SECURITY.md](PROOF_SESSION_IDLE_FALSE_LOGOUT_SECURITY.md) | Idle + close wiring |
| [PROOF_SHARED_TERMINAL_SESSION_LOCK.md](PROOF_SHARED_TERMINAL_SESSION_LOCK.md) | Shared terminal lock |

### Re-run

```bash
cd samplepos.client
npx vitest run \
  src/__tests__/browser-close-logout.security.proof.test.ts \
  src/__tests__/session-idle-false-logout.security.proof.test.ts \
  src/__tests__/shared-terminal-session-lock.evidence.test.ts \
  src/lib/deviceSessionPolicy.integrity.test.ts \
  src/__tests__/session-cold-start-lock.evidence.test.ts \
  src/lib/sessionColdStartLock.test.ts \
  src/__tests__/offline-login-and-pin.proof.test.ts \
  src/__tests__/login-no-false-logout.proof.test.ts \
  src/__tests__/session-death-login.invariant.lock.test.ts
```

---

## Critical gates (must never regress)

- `CLOSE_GONE_*` — every `AUTH_SESSION_WIPE_KEYS` entry absent after close  
- `CLOSE_ASSERT_WIPED` — `assertSessionWiped()` passes  
- `BFCACHE_NO_LOCK` — bfcache must not set actor lock  
- `PERSONAL_NO_DESTROY` — office mode never wiped on close  
- `IDEM_EMPTY` — beforeunload → pagehide double event leaves nothing  
- `AUTH_DESTROY_HELPER` — RT snapshot + consistent destroy helper  
- `NEXT_NO_JWT` — next person cannot inherit prior account  

---

## Bottom line

**Browser close on SHARED = logout (proven).**  
**bfcache / tab-switch consistency sealed.**  
**88/88 evidence tests green — bug-free for this contract.**
