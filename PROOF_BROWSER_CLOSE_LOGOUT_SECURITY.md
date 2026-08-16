# PROOF: Browser close = logout (SHARED)

- Date: 2026-08-16T07:49:29.955Z
- Token: `SECURITY_BROWSER_CLOSE_LOGOUT_v1`
- Runner: `npx vitest run src/__tests__/browser-close-logout.security.proof.test.ts`
- Gates: 28/28 pass (0 fail, 0 critical fail)
- Verdict: **PASS**

## Contract

| Event | SHARED | PERSONAL |
|---|---|---|
| Browser/tab close | Wipe JWT/RT/user/rbac + actor lock + beacon | Keep session |
| bfcache (persisted) | No lock, no wipe | N/A |
| Next opener | Empty store — must re-auth | May restore (admin/manager) |
| Offline password cache | Survives wipe | Survives wipe |

## Gates

- [x] `WIPE_KEYS_COMPLETE` (CRITICAL) — auth_token,refresh_token,token_expiry,user,rbac_permissions
- [x] `CLEAR_USES_WIPE_SSOT` (CRITICAL) — clearTokens iterates SSOT wipe keys
- [x] `OFFLINE_SURVIVES_WIPE_LIST` (HIGH) — offline password cache not in wipe list
- [x] `CLOSE_DESTROYED` (CRITICAL) — sessionDestroyed
- [x] `CLOSE_LOCK` (CRITICAL) — smarterp_actor_lock_v1
- [x] `CLOSE_GONE_auth_token` (CRITICAL) — auth_token must be absent after close
- [x] `CLOSE_GONE_refresh_token` (CRITICAL) — refresh_token must be absent after close
- [x] `CLOSE_GONE_token_expiry` (CRITICAL) — token_expiry must be absent after close
- [x] `CLOSE_GONE_user` (CRITICAL) — user must be absent after close
- [x] `CLOSE_GONE_rbac_permissions` (CRITICAL) — rbac_permissions must be absent after close
- [x] `CLOSE_ASSERT_WIPED` (CRITICAL) — assertSessionWiped passes
- [x] `CLOSE_KEEPS_OFFLINE_CACHE` (HIGH) — offline_login_credentials survives close wipe
- [x] `BFCACHE_NOT_DESTROYED` (CRITICAL) — no wipe
- [x] `BFCACHE_NO_LOCK` (CRITICAL) — bfcache must not set actor lock (would false-logout on resume)
- [x] `BFCACHE_TOKENS_LIVE` (CRITICAL) — live page keeps session
- [x] `PERSONAL_NO_DESTROY` (CRITICAL) — office restore
- [x] `PERSONAL_TOKENS_LIVE` (CRITICAL) — PERSONAL keeps JWT
- [x] `IDEM_FIRST` (CRITICAL) — first wipe
- [x] `IDEM_SECOND` (HIGH) — second wipe ok
- [x] `IDEM_EMPTY` (CRITICAL) — no leftover identity after double event
- [x] `AUTH_DESTROY_HELPER` (CRITICAL) — RT snapshotted once per event; pagehide/beforeunload consistent
- [x] `AUTH_LISTENERS` (CRITICAL) — both close signals wired
- [x] `POLICY_BFCACHE_NOOP` (CRITICAL) — bfcache early-return no lock/wipe
- [x] `POLICY_ALWAYS_WIPE_ON_DESTROY` (CRITICAL) — destroy path always wipes + beacon
- [x] `SSOT_DOC_CLOSE` (CONTROL) — SSOT documents close logout
- [x] `PROOF_TOKEN` (CONTROL) — SECURITY_BROWSER_CLOSE_LOGOUT_v1
- [x] `NEXT_NO_JWT` (CRITICAL) — next person finds empty session store
- [x] `NEXT_LOCK_SET` (CRITICAL) — actor lock blocks any residual restore path
