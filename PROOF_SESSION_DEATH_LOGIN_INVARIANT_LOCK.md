# PERMANENT LOCK — INVARIANT_SESSION_DEATH_LOGIN_v1

**Generated:** 2026-08-15T05:37:25.086Z  
**Verdict:** **PASS** (54/54 gates)  
**Hard-fail CI job:** `session-death-login-invariant`

## Guarantee

If this artifact and the CI job are green, the inconsistency  
**“server logged user out but UI stayed on protected pages with token errors”**  
has **not** regressed in source or policy behavior.

## Behavioral truth table

| Scenario | Must force login? |
|----------|-------------------|
| Active + definitive auth | **YES** |
| Idle + definitive auth | **YES** |
| Active + network | NO |
| Active + 5xx | NO |
| No refresh token | **YES** |

## Gates

| Gate | Result | Detail |
|------|--------|--------|
| `BEHAVIOR_ACT_DEF` | PASS | ACT_DEF: expected logout=true got=true |
| `BEHAVIOR_IDLE_DEF` | PASS | IDLE_DEF: expected logout=true got=true |
| `BEHAVIOR_ACT_NET` | PASS | ACT_NET: expected logout=false got=false |
| `BEHAVIOR_IDLE_NET` | PASS | IDLE_NET: expected logout=false got=false |
| `BEHAVIOR_ACT_5XX` | PASS | ACT_5XX: expected logout=false got=false |
| `BEHAVIOR_IDLE_5XX` | PASS | IDLE_5XX: expected logout=false got=false |
| `BEHAVIOR_NO_RT` | PASS | NO_RT: expected logout=true got=true |
| `PEER_NEVER_IGNORE_ACTIVE` | PASS | active peer ignore must be false |
| `PEER_NEVER_IGNORE_IDLE` | PASS | idle peer ignore must be false |
| `CLASSIFY_REFRESH_EXPIRED` | PASS | Refresh token expired |
| `CLASSIFY_BARE_401` | PASS | bare 401 |
| `CLASSIFY_REUSE` | PASS | token reuse |
| `TOKEN_src_lib_sessionLogoutPolicy_ts` | PASS | src/lib/sessionLogoutPolicy.ts embeds INVARIANT_SESSION_DEATH_LOGIN_v1 |
| `TOKEN_src_hooks_useTokenRefresh_ts` | PASS | src/hooks/useTokenRefresh.ts embeds INVARIANT_SESSION_DEATH_LOGIN_v1 |
| `TOKEN_src_lib_authBroadcast_ts` | PASS | src/lib/authBroadcast.ts embeds INVARIANT_SESSION_DEATH_LOGIN_v1 |
| `REQ_sessionLogoutPolicy.ts_INVARIANT_SESSION_DEATH_` | PASS | src/lib/sessionLogoutPolicy.ts contains "INVARIANT_SESSION_DEATH_LOGIN_v1" |
| `REQ_sessionLogoutPolicy.ts_if_input_errorKind_` | PASS | src/lib/sessionLogoutPolicy.ts contains "if (input.errorKind === 'definitive_auth')" |
| `REQ_sessionLogoutPolicy.ts_return_true` | PASS | src/lib/sessionLogoutPolicy.ts contains "return true" |
| `REQ_sessionLogoutPolicy.ts_export_function_shouldIg` | PASS | src/lib/sessionLogoutPolicy.ts contains "export function shouldIgnoreCrossTabSessionExpired" |
| `REQ_sessionLogoutPolicy.ts_return_false` | PASS | src/lib/sessionLogoutPolicy.ts contains "return false" |
| `REQ_useTokenRefresh.ts_INVARIANT_SESSION_DEATH_` | PASS | src/hooks/useTokenRefresh.ts contains "INVARIANT_SESSION_DEATH_LOGIN_v1" |
| `REQ_useTokenRefresh.ts_export_function_forceLog` | PASS | src/hooks/useTokenRefresh.ts contains "export function forceLogoutRedirect" |
| `REQ_useTokenRefresh.ts_clearTokens_` | PASS | src/hooks/useTokenRefresh.ts contains "clearTokens()" |
| `REQ_useTokenRefresh.ts_location_replace` | PASS | src/hooks/useTokenRefresh.ts contains "location.replace" |
| `REQ_useTokenRefresh.ts__login` | PASS | src/hooks/useTokenRefresh.ts contains "/login" |
| `REQ_useTokenRefresh.ts_forceLogoutRedirect_` | PASS | src/hooks/useTokenRefresh.ts contains "forceLogoutRedirect(" |
| `REQ_useTokenRefresh.ts_build401Handler` | PASS | src/hooks/useTokenRefresh.ts contains "build401Handler" |
| `REQ_useTokenRefresh.ts_401_after_retry` | PASS | src/hooks/useTokenRefresh.ts contains "401_after_retry" |
| `REQ_authBroadcast.ts_INVARIANT_SESSION_DEATH_` | PASS | src/lib/authBroadcast.ts contains "INVARIANT_SESSION_DEATH_LOGIN_v1" |
| `REQ_authBroadcast.ts_originating_tab_does_NOT` | PASS | src/lib/authBroadcast.ts contains "originating tab does NOT receive" |
| `REQ_authBroadcast.ts_forceLogoutRedirect` | PASS | src/lib/authBroadcast.ts contains "forceLogoutRedirect" |
| `REQ_AuthContext.tsx_event_type_SESSION_` | PASS | src/contexts/AuthContext.tsx contains "event.type === 'SESSION_EXPIRED'" |
| `REQ_AuthContext.tsx_event_type_LOGOUT_` | PASS | src/contexts/AuthContext.tsx contains "event.type === 'LOGOUT'" |
| `REQ_AuthContext.tsx_location_replace` | PASS | src/contexts/AuthContext.tsx contains "location.replace" |
| `REQ_AuthContext.tsx__login` | PASS | src/contexts/AuthContext.tsx contains "/login" |
| `REQ_AuthContext.tsx_forceLogoutRedirect` | PASS | src/contexts/AuthContext.tsx contains "forceLogoutRedirect" |
| `REQ_AuthContext.tsx_boot_refresh_failed` | PASS | src/contexts/AuthContext.tsx contains "boot_refresh_failed" |
| `REQ_download.ts_forceLogoutRedirect` | PASS | src/utils/download.ts contains "forceLogoutRedirect" |
| `REQ_download.ts_authorizedFetch` | PASS | src/utils/download.ts contains "authorizedFetch" |
| `ORDER_DEFINITIVE_BEFORE_ACTIVE_GATE` | PASS | definitive_auth handled before activeOrGuarded→false in shouldPerformAutoLogout |
| `REFRESH_CATCH_FORCE_LOGOUT` | PASS | _refreshOnce catch invokes forceLogoutRedirect |
| `FORCE_USES_LOCATION_REPLACE` | PASS | forceLogoutRedirect uses location.replace(.../login) |
| `BUILD401_FORCE_LOGOUT` | PASS | build401Handler still force-logout on dead refresh |
| `AUTHCTX_NO_IGNORE_PEER` | PASS | AuthContext does not early-return on shouldIgnoreCrossTabSessionExpired |
| `AUTHCTX_SESSION_REPLACE` | PASS | SESSION_EXPIRED hard-nav to login |
| `FORBIDDEN_NEVER_auto_logout_active_user_on_definit` | PASS | must not contain "NEVER auto-logout active user on definitive auth" |
| `FORBIDDEN_defer_until_idle` | PASS | must not contain "defer until idle" |
| `FORBIDDEN_deferred_NO_auto_logout_` | PASS | must not contain "deferred (NO auto-logout)" |
| `FORBIDDEN_IGNORE_peer_SESSION_EXPIRED` | PASS | must not contain "IGNORE peer SESSION_EXPIRED" |
| `RETRY_401_FORCE` | PASS | second 401 after retry forces login |
| `INITAUTH_NO_STALE_FALLBACK` | PASS | boot refuses stale token resurrection + forceLogout on dead refresh |
| `DOWNLOAD_AUTH_FORCE` | PASS | binary download path forces login on 401 |
| `LOCK_MODULE_PRESENT` | PASS | sessionDeathLoginInvariant.ts present |
| `PROOF_TEST_PRESENT` | PASS | behavioral proof test present |

## Re-run / enforce

```bash
cd samplepos.client
npm run proof:session-death-login-lock
# or from repo root:
node scripts/proof-session-death-login-invariant.mjs
```

**Do not merge** when verdict is FAIL.
