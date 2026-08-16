# Session security guru — evidence pack

**Date:** 2026-08-16  
**Verdict:** **PASS**  
**Permanent token:** `SECURITY_IDLE_FALSE_LOGOUT_v1`  
**Pack:** 9 files · **147/147** tests · 0 failed  

---

## Executive finding

Two post-hardening regressions caused false logouts while users were working:

| # | Defect | Impact | Fix sealed |
|---|---|---|---|
| 1 | SHARED idle = **3 minutes** | Pause mid-sale → logout | Idle = **60 minutes** (SHARED + PERSONAL) |
| 2 | `pagehide` **revoked refresh token** | Tab switch / mobile background / F5 → next API forces login | Unload sets **actor lock only**; RT revoke only on logout / idle / cold-start / forceLogout |

Walk-away security is preserved: **60 minutes with no deliberate keyboard/mouse/touch → auto logout**.

---

## Evidence artifacts

| Artifact | Result |
|---|---|
| [PROOF_SESSION_IDLE_FALSE_LOGOUT_SECURITY.md](PROOF_SESSION_IDLE_FALSE_LOGOUT_SECURITY.md) | **24/24 gates PASS** · 0 critical fail |
| [PROOF_SESSION_IDLE_FALSE_LOGOUT_SECURITY.json](PROOF_SESSION_IDLE_FALSE_LOGOUT_SECURITY.json) | Machine gates |
| [PROOF_SHARED_TERMINAL_SESSION_LOCK.md](PROOF_SHARED_TERMINAL_SESSION_LOCK.md) | Shared lock + 60m idle |
| Canvas: `session-security-guru-audit.canvas.tsx` | Visual audit board |

### Pack command

```bash
cd samplepos.client
npx vitest run \
  src/__tests__/session-idle-false-logout.security.proof.test.ts \
  src/__tests__/shared-terminal-session-lock.evidence.test.ts \
  src/lib/deviceSessionPolicy.integrity.test.ts \
  src/__tests__/session-death-login.invariant.lock.test.ts \
  src/__tests__/session-force-login-redirect.proof.test.ts \
  src/__tests__/session-active-enterprise.spec.ts \
  src/__tests__/offline-login-and-pin.proof.test.ts \
  src/__tests__/login-no-false-logout.proof.test.ts \
  src/__tests__/restaurant-open-no-false-logout.proof.test.ts
```

---

## Control truth table (expert)

| Event | Must logout? | Evidence gate |
|---|---|---|
| Working (input within 60m) | **No** | `WORKING_NO_IDLE_LOGOUT` |
| Idle ≥ 60m zero input | **Yes** | `TRUE_IDLE_LOGOUT` |
| pagehide / tab switch | **No** (keep RT) | `UNLOAD_KEEPS_TOKENS`, `UNLOAD_NO_BEACON` |
| F5 within 15s | **No** | `F5_WARM_OK` |
| Next opener after close (SHARED) | **Yes** (re-auth) | `NEXT_OPENER_BLOCKED` |
| Cold start + soft grace | **Yes** (cannot bypass) | `COLD_NOT_BYPASSED` |
| Definitive auth death (even active) | **Yes** | `DEATH_ACT_DEF` |
| Network / 5xx with RT | **No** | `DEATH_ACT_NET`, `DEATH_ACT_5XX` |
| Passive mousemove only | Does not extend session | `EVENTS_NO_PASSIVE_MOVE` |

---

## Residual (by design)

- Restaurant FOH may still PIN-out after KOT/bill (product policy, not session death).
- Offline synthetic sessions have no server RT; returning online requires real login for APIs.
- Passive scroll/mousemove intentionally ignored so a walking-away desk cannot stay open forever.

---

## Bottom line

**False-logout while working: closed.**  
**60-minute idle walk-away: enforced.**  
**Shared next-opener + session-death: still fail-closed.**  
Permanent proof `SECURITY_IDLE_FALSE_LOGOUT_v1` locks this contract against regression.
