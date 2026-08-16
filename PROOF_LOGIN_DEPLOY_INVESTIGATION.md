# Investigation: restaurant login bounce vs deploy `6ff6993e`

**Run:** 2026-08-16T05:15Z (approx)  
**Question:** Was the local “login → instant logout” fix missing from production?

## Verdict

**The auth/FOH fix WAS deployed.** Production SPA for `6ff6993e` contains the login-grace SSOT keys and does **not** re-subscribe to same-tab `auth-changed` for `initAuth`. This is **not** a “forgot to ship AuthContext” gap.

If restaurant tenants still bounce to login, the cause is **downstream of deploy** (stale client tab, SW edge case, or a remaining race that still exists *in* the shipped code).

## Deploy evidence

| Check | Result |
|-------|--------|
| GitHub Deploy | [success](https://github.com/wizard-digital/SMART-ERP-POS/actions/runs/31913308377) · `6ff6993e` |
| Fingerprint gate | `PROOF_PRODUCTION_DEPLOY_FINGERPRINT.md` · **25/25 PASS** |
| Live index | `/assets/index-244GZ-qL.js` (henber + wizarddigital-inv) |

### Auth fix fingerprints (live index)

| Marker | Live? | Meaning |
|--------|-------|---------|
| `auth_login_grace_v1` | YES | Login grace storage key shipped |
| `auth_boot_session_v1` | YES | Boot session key shipped |
| `smarterp_actor_lock_v1` | YES | Actor lock shipped |
| `restaurant-loop-break` | YES | RBAC deny UI (not silent login loop) shipped |
| `addEventListener(...auth-changed)` on AuthProvider | **NO** | Same-tab false-logout path removed |
| `auth-changed` still present | YES (dispatch only) | login/logout still *emit*; POS listens for UI refresh only |

Probe: `scripts/_probe-prod-auth-deploy.mjs` → `PROOF_PROD_AUTH_DEPLOY_PROBE.json`

### FOH markers (live restaurant chunk)

`RestaurantPosPage-DWKBNpDR.js` on both hosts contains:
`data-foh-view-ticket`, `data-foh-order-dock-kot`, `Select a ticket to add items`, `Tap to see`  
(see `PROOF_FOH_DEPLOY_LIVE.json`)

## What local fixed (and is on prod)

1. Same-tab `auth-changed` no longer re-runs `initAuth` (SHARED cold-start wipe).
2. `markLoginGrace()` + `auth_login_grace_v1` so boot gate won’t wipe a fresh login.
3. Restaurant RBAC miss shows **Access Denied** (`data-authz-deny=restaurant-loop-break`) instead of Navigate↔`/restaurant` forever.

## Why tenants can still see a bounce (ranked)

1. **Tab still running pre-deploy JS**  
   Open POS tabs keep the old bundle in memory until full reload. Deploy does not hot-swap React.  
   **Check:** hard refresh or close all app tabs; confirm Network loads `index-244GZ-qL.js`.

2. **Grace is set too late in `login()`** (still in shipped code)  
   Order today: `storeTokens` → **await `fetchPermissionKeys()`** → then `markLoginGrace()`.  
   During that await, tokens exist in `localStorage` but grace is unset. A remount / cross-tab `storage` / SW reload in that window can still cold-start wipe.

3. **SHARED `pagehide` revokes refresh token**  
   After `isAuthenticated`, unload handlers call `beaconRevokeRefreshToken`. Mobile/PWA quirks that fire `pagehide` without leaving the app can kill the RT → next API 401 → `forceLogoutRedirect('…')` → `/login`.

4. **Axios 401 after login on restaurant routing**  
   `resolveHomeAfterAuth` → `GET /restaurant/enabled`. Any definitive 401 after a revoked/missing RT hard-redirects to login (`session_expired_reason` in sessionStorage).

5. **Not actually logout — RBAC deny screen**  
   Missing `restaurant.read` / `restaurant.order` now shows “Restaurant access required” (signed in). Easy to describe as “kicked out” if the UI flash is fast.

6. **SW offline shell only**  
   Navigation is NetworkFirst; stale `./` shell matters mainly when network fetch fails. Less likely for online floor Wi‑Fi, but devices that loaded while offline can keep an old shell until a successful navigation fetch.

## What to capture on a failing device (1 minute)

In DevTools → Application → Session Storage after bounce:

- `session_expired` / `session_expired_reason` (e.g. `refresh_revoked`, `profile_rejected`, `no_refresh_token`)
- Network: which request returned 401 immediately after login
- Confirm document script is `index-244GZ-qL.js` (not an older `index-*.js`)

## Recommended hardening (code — not yet applied)

1. Call `markLoginGrace()` + `clearActorLock()` **immediately after** `storeTokens`, before any await.
2. Do **not** revoke refresh token on `pagehide` while the document is only entering bfcache / same-session visibility quirks (lock is enough; revoke on true logout / cold wipe).
3. Bump `CACHE_VERSION` in `sw.js` on auth-critical releases so shells drop.

## Bottom line

Nothing material from the login false-logout fix was left undeployed. Production serves `6ff6993e` auth + FOH. Remaining restaurant bounce needs a **device-side reason code** (`session_expired_reason`) or the late-grace / pagehide-revoke hardenings above.
