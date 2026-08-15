# PROOF — Restaurant open must not false-logout

**Generated:** 2026-08-15T22:44:11.434Z  
**Verdict:** **PASS** (21/21 tests)

## Guarantee

Enabling Restaurant and opening FOH must **stay signed in** when the failure is RBAC 403 or a refresh wait race. Session wipe is reserved for proven auth death (401 + dead refresh).

## Fixes locked

| Issue | Fix |
|-------|-----|
| 403 → treated as session death | `HandledApiError.httpStatus=403` + Auth boot ignores forbidden |
| FOH mount storm → `auth_wait_expired` | Logout only if EXPIRED or both tokens gone |
| Cashier restaurant deny loop | In-page Access Denied (stay signed in) |
| Access denied toast spam on floor | `silentForbidden` on tables/waiters |
| Empty catch on enabled flag | `console.error` + cache fallback |

## Reproduce

```bash
node scripts/proof-restaurant-open-no-false-logout.mjs
```
