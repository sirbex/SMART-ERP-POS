# PROOF: Session idle + false-logout security

- Date: 2026-08-16T07:49:29.947Z
- Token: `SECURITY_IDLE_FALSE_LOGOUT_v1`
- Runner: `npx vitest run src/__tests__/session-idle-false-logout.security.proof.test.ts`
- Gates: 24/24 pass (0 fail, 0 critical fail)
- Verdict: **PASS**

## Security contract

| Control | Requirement |
|---|---|
| Idle logout | 60 minutes zero deliberate input |
| Working user | Never idle-logout |
| Browser/tab close (SHARED) | Wipe JWT/RT + actor lock + beacon revoke |
| bfcache freeze | Keep tokens (same page may restore) |
| Next opener (SHARED) | Cannot inherit prior account |
| Definitive auth death | Always force login |
| Network / 5xx | Never force logout while RT exists |

## Gates

- [x] `IDLE_SSOT_60M` (CRITICAL) — 3600000ms
- [x] `IDLE_MODE_SHARED` (CRITICAL) — SHARED=60m
- [x] `IDLE_MODE_PERSONAL` (CRITICAL) — PERSONAL=60m
- [x] `ACTIVE_WINDOW_ALIGNED` (HIGH) — activity window matches idle SSOT
- [x] `WORKING_NO_IDLE_LOGOUT` (CRITICAL) — recent activity suppresses idle logout
- [x] `TRUE_IDLE_LOGOUT` (CRITICAL) — 60m+ zero input → idle logout allowed
- [x] `EVENTS_HAS_KEY_MOUSE_TOUCH` (HIGH) — mousedown,keydown,input,click,touchstart,pointerdown,paste,compositionstart,compositionupdate
- [x] `EVENTS_NO_PASSIVE_MOVE` (HIGH) — passive move/scroll must not keep session forever
- [x] `UNLOAD_LOCKS` (CRITICAL) — actor lock set
- [x] `UNLOAD_WIPES_TOKENS` (CRITICAL) — close = logout — JWT/RT gone
- [x] `UNLOAD_BEACON_REVOKE` (CRITICAL) — close best-effort server revoke
- [x] `BFCACHE_NO_WIPE` (HIGH) — bfcache freeze: no wipe, no lock
- [x] `AUTH_CLOSE_SSOT` (CRITICAL) — AuthContext wires close logout + bfcache skip
- [x] `NEXT_OPENER_BLOCKED` (CRITICAL) — stale actor lock forces re-auth
- [x] `COLD_NOT_BYPASSED` (CRITICAL) — soft grace never bypasses cold start
- [x] `DEATH_ACT_DEF` (CRITICAL) — definitive_auth active=true → logout=true
- [x] `DEATH_IDLE_DEF` (CRITICAL) — definitive_auth active=false → logout=true
- [x] `DEATH_ACT_NET` (CRITICAL) — network active=true → logout=false
- [x] `DEATH_IDLE_NET` (CRITICAL) — network active=false → logout=false
- [x] `DEATH_ACT_5XX` (CRITICAL) — transient_server active=true → logout=false
- [x] `CLASSIFY_NET` (HIGH) — network classify
- [x] `AUTH_IDLE_MODE` (HIGH) — AuthContext uses mode idle
- [x] `SSOT_DOC_CLOSE_LOGOUT` (CONTROL) — SSOT documents close=logout + 60m idle
- [x] `PROOF_TOKEN` (CONTROL) — permanent proof token present
