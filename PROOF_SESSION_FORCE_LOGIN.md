# PROOF — Force login on session death

**Generated:** 2026-08-09T13:56:08.137Z  
**Verdict:** **PASS** (11/11 gates)

## Bug (integrity)

1. Definitive auth (refresh revoked / expired) was deferred while user was "active".
2. Broadcast SESSION_EXPIRED does not fire on the originating tab.
3. Result: server killed session; UI stayed open; user only saw token-expired errors.

## Fix

- `shouldPerformAutoLogout`: definitive_auth → always true.
- `forceLogoutRedirect`: clear tokens + `location.replace('/login')` on same tab.
- Peer SESSION_EXPIRED never ignored.

## Gates

| Gate | Result | Detail |
|------|--------|--------|
| `POLICY_ACTIVE_DEFINITIVE` | PASS | active + definitive_auth → logout |
| `POLICY_NETWORK_PRESERVE` | PASS | active + network → stay |
| `POLICY_PEER_SESSION_EXPIRED` | PASS | SESSION_EXPIRED never ignored |
| `CLASSIFY_EXPIRED_MSG` | PASS | Refresh token expired |
| `CLASSIFY_BARE_401` | PASS | bare 401 |
| `FORCE_CLEAR` | PASS | tokens cleared |
| `FORCE_REPLACE` | PASS | location.replace(/login) |
| `FORCE_FLAG` | PASS | session_expired banner flag |
| `HANDLER_CLEAR` | PASS | tokens cleared after 401 path |
| `HANDLER_NAV` | PASS | hard nav attempted |
| `IDLE_INACTIVE_LOGOUT` | PASS | idle definitive still logout |

## Re-run

```bash
cd samplepos.client
npx vitest run src/__tests__/session-force-login-redirect.proof.test.ts
npx vitest run src/__tests__/session-reliability.spec.ts src/__tests__/session-active-enterprise.spec.ts
```
