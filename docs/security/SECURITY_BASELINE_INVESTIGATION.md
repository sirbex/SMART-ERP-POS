# SMART ERP-POS — Security Baseline Investigation

**Status:** Investigation only — no code, auth, schema, or configuration changes were made.  
**Date:** 2026-08-09  
**Scope:** Current authentication, authorization, tenancy, offline POS, API, device, audit, and deployment posture as implemented in the repository.  
**Purpose:** Establish a factual security baseline before any Microsoft Entra ID / enterprise SSO work.

---

## 1. Executive summary

SMART ERP-POS currently authenticates **tenant users with email + password** against a **per-tenant PostgreSQL database**, issues **HS256 JWT access tokens** (default ~60 minutes) plus **opaque rotating refresh tokens** (30 days, SHA-256 hashed in DB), and enforces business capabilities with a **permission-key RBAC** model. A separate **platform super-admin** identity lives in the master database. **TOTP MFA** exists for ADMIN/MANAGER roles. **Microsoft Entra ID / OIDC / SAML are not implemented.**

**Tenant isolation is primarily database-per-tenant** (subdomain → master registry → dedicated pool), not row-level `tenant_id` filters. **Branch/store RBAC scopes exist in schema but are not enforced on API routes.** Offline POS uses **client-side password verifiers and synthetic sessions** that the server will never accept; access while offline is **cached-session / full SPA UI** with last-known RBAC.

**Overall maturity:** Moderate enterprise baseline for a multi-tenant ERP/POS product — solid DB isolation, RBAC mutation gates, password policy, refresh rotation, and offline identity isolation design — with clear gaps for enterprise SSO customers around **token XSS surface**, **intra-tenant read authorization**, **branch enforcement**, **lifecycle revocation (disable/password change vs offline cache)**, and **OIDC absence**.

| Verdict area | Assessment |
|--------------|------------|
| Authentication | Local password + optional TOTP + PIN quick-login; no SSO |
| Authorization | Dual UI + backend RBAC; ADMIN bypass; some auth-only reads |
| Tenant isolation | Strong via DB-per-tenant + host-derived resolution |
| Branch isolation | Weak — schema support, not route enforcement |
| Offline auth | Working by design; elevated theft/stale-grant risk |
| Entra readiness | Architecturally compatible as IdP add-on; not present today |

---

## 2. Current authentication architecture

### 2.1 Login mechanisms (as implemented)

| # | Mechanism | Entry point | Evidence |
|---|-----------|-------------|----------|
| 1 | Email + password | `POST /api/auth/login` | `SamplePOS.Server/src/modules/auth/authRoutes.ts`, `authController.login` |
| 2 | TOTP second factor | `POST /api/auth/2fa/verify` | `twoFactorService.ts`, `twoFactorRoutes.ts` |
| 3 | PIN / pin-only / WebAuthn quick login | `/api/auth/quick-login/*` | `quickLoginService.ts`, `quickLoginRoutes.ts` |
| 4 | Offline password (client-only) | `LoginPage` when offline | `samplepos.client/src/lib/offlineLoginCredentials.ts` |
| 5 | Platform super-admin | `POST /api/platform/auth/login` | `platformController.ts`, `platformRoutes.ts` |
| 6 | Register | `POST /api/auth/register` | `authController` + `authService.registerUser` |

**Not present:** Passport, OAuth2/OIDC, SAML, Microsoft Entra ID, magic links, email password-reset tokens, email verification.

### 2.2 End-to-end online login flow

```
LoginPage.handleSubmit (samplepos.client/src/pages/LoginPage.tsx)
  → api.auth.login({ email, password })  (utils/api.ts → POST auth/login)
  → Express: tenantMiddleware resolves tenant DB
  → app.use('/api/auth', authRateLimit)  (server.ts)
  → authRoutes POST /login → authController.login
  → LoginSchema (Zod email/password)
  → authenticateUser(pool, credentials)  (authService.ts)
       → findUserByEmail (authRepository)
       → checkAccountLockout (passwordPolicyService)
       → bcrypt.compare(password, passwordHash)
       → recordFailedLoginAttempt / resetFailedLoginAttempts
  → twoFactorService.get2FAStatus
       → if enabled: return { requires2FA, userId } (no tokens)
       → if required but not enabled: issue tokens + requires2FASetup
  → refreshTokenService.generateTokenPair(user + tenantId/slug, …, pool)
       → JWT access (HS256) + opaque RT hashed into refresh_tokens
  → Set-Cookie refreshToken (httpOnly, SameSite=strict), sessionId (audit)
  → JSON body: user, token, accessToken, refreshToken, expiresIn
  → AuthContext.login + useTokenRefresh.storeTokens → localStorage
  → cacheLoginCredential(email, password, user) for offline
  → Subsequent APIs: Authorization: Bearer <access>
       → authenticate middleware → DB active-user check → load RBAC
```

**Key evidence:**

- Controller uses **tenant pool** and embeds tenant into token pair:  
  `authController.ts` lines ~35–112 (`req.tenantPool`, `generateTokenPair` with `tenantId`/`tenantSlug`).
- `authenticateUser` still calls legacy `generateToken()` internally; **login controller discards that** and always uses `generateTokenPair` for live logins (`authService.ts` vs `authController.ts`).
- Client storage of access **and** refresh tokens:  
  `samplepos.client/src/hooks/useTokenRefresh.ts` `storeTokens` lines 72–79 (`auth_token`, `refresh_token`, `token_expiry`).

### 2.3 JWT and session characteristics

| Property | Current state | Evidence |
|----------|---------------|----------|
| Algorithm | HS256 (jsonwebtoken default; no `algorithm` option) | `refreshTokenService.generateAccessToken` lines 109–111 |
| Access lifetime | `ACCESS_TOKEN_EXPIRY_MINUTES` env, default **60**, min 5 | `refreshTokenService.ts` 31–34, 174 |
| Claims | `userId`, `email`, `fullName`, `role`, `type: 'access'`, optional `tenantId`, `tenantSlug` | same file 97–107 |
| Refresh token | Opaque 64-byte hex, **not JWT**; SHA-256 in DB; family rotation + reuse kill-switch | `generateRefreshToken`, `rotateRefreshToken` |
| Refresh lifetime | **30 days** | `REFRESH_TOKEN_CONFIG.expiryDays` |
| Legacy single JWT | `generateToken` TTL `JWT_EXPIRES_IN \|\| '24h'` still in `middleware/auth.ts` and register path | not primary login path |
| Platform JWT | `{ adminId, email, scope: 'platform' }`, **8h**, no refresh pair | `platformController.ts` |
| Access revocation | **No JWT blacklist** — valid until `exp`; user `is_active` rechecked | `middleware/auth.ts` 89–101 |
| Refresh revocation | Per-token, family, revoke-all; session list/delete | `tokenRoutes.ts`, `refreshTokenService` |

### 2.4 Token storage and XSS exposure

| Store | Contents | XSS-exposed? |
|-------|----------|--------------|
| **localStorage** | `auth_token`, `refresh_token`, `token_expiry`, `user`, `rbac_permissions` | **Yes** |
| **localStorage** | `offline_login_credentials` (password verifiers + user snapshot) | **Yes** (verifier, not plaintext) |
| **httpOnly cookies** | `refreshToken` path `/api/auth/token`; `sessionId` audit | Cookie XSS-safe; **not** primary client path |
| **sessionStorage** | cold-start lock, session_expired markers | Limited |

**Finding:** Access tokens are taken from **Bearer / localStorage**, not cookies (`middleware/auth.ts` `extractToken` lines 54–62). **Any XSS can exfiltrate access + refresh tokens.**  
**Finding:** `cookie-parser` is **not** present in the server package usage (grep: zero matches). Server `res.cookie` / `req.cookies` dual-path for refresh is incomplete; body-carried refresh still works.

### 2.5 Logout / invalidation

| Action | Behavior | Evidence |
|--------|----------|----------|
| Client logout | `POST /auth/logout` best-effort; `clearTokens()`; multi-tab broadcast | `AuthContext.logout` |
| Server logout | Audit end session; `revokeRefreshToken`; clear cookies | `authController.logout` |
| Revoke one / all devices | Token routes | `tokenRoutes.ts` |
| Idle logout | **SHARED:** 3 min; **PERSONAL:** 60 min (`idleTimeoutMsForMode`) | `deviceSessionPolicySsot` + `AuthContext` |
| Close without logout (SHARED) | `pagehide` → actor lock (fail-closed: lock write fail ⇒ wipe tokens) + RT revoke; next boot `clearTokens` + **`assertSessionWiped`** → `/quick-login` | `deviceSessionPolicy` + `sessionColdStartLock` |
| Storage read errors | **Fail closed** — treat actor lock as set / browser as cold | `isActorLockSet`, `isBrowserColdStart` |
| Offline credentials after logout | **Survive** `clearTokens()` by design | `offlineLoginCredentials.ts` header comments |

### 2.6 Password hashing and policy

| Control | Value | Evidence |
|---------|-------|----------|
| Online hash | **bcrypt**, **12** rounds | `passwordPolicyService.ts` saltRounds 36; `userRepository` |
| PIN hash | bcrypt rounds **10** | `quickLoginService.ts` |
| Offline verifier | PBKDF2-SHA256 **100k** (+ weak basic fallback) | `offlineLoginCredentials.deriveKey` |
| Min length / complexity | 8–128; upper, lower, digit, special | `PASSWORD_CONFIG` |
| History | last **5** | same |
| Expiry | ADMIN/MANAGER **90d**; CASHIER/STAFF **180d** | same |
| Lockout | **5** fails → **15 min** | same |
| Timing delay | **600ms** on login failures | `authController` ~164–166 |

**Self-service forgot-password / email reset:** **Not implemented.**  
**Admin reset:** `userService.adminResetPassword` + `POST /api/users/:id/reset-password`.  
**Authenticated change:** `POST /api/auth/password/change`.  
**Email verification / activation tokens:** **Not implemented** (`is_active` is admin-controlled enable/disable).

### 2.7 MFA and captcha

- **TOTP** (otplib) for roles in `ROLES_REQUIRING_2FA = ['ADMIN','MANAGER']` — `twoFactorService.ts` lines 25–26. Backup codes stored hashed.
- **Not SMS/email MFA.**
- After ≥3 failed logins server may flag `requiresCaptcha`; UI uses **client-side math CAPTCHA** (`MathCaptcha`) — **not a server-validated CAPTCHA token**.

### 2.8 Rate limiting and failed-login tracking

| Control | Config | Evidence |
|---------|--------|----------|
| Auth IP rate limit | 500 failures / 15 min (skips successful) | `middleware/security.ts` `authRateLimit` |
| Strict rate limit | 20 / min (2FA, platform login) | same; platform/quick-login mounts |
| Quick login | 30 / 15 min / IP | `quickLoginRoutes.ts` |
| Per-user lockout | DB columns `failed_login_attempts`, `lockout_until` | password policy service |
| Audit failed login | `auditService.logLoginFailed` | authController |

**Note:** Primary brute-force defense is **per-user lockout**, not the generous IP auth limiter.

### 2.9 Service accounts / API keys

- Schema artifacts: `api_keys` (historical migration), `tenant_api_keys` (master multi-tenant SQL).
- **No live inbound API-key middleware** found for customer integrations.
- Runtime auth for product APIs = **tenant JWT** or **platform JWT**.

---

## 3. Current authorization architecture

### 3.1 Hierarchy (actual)

```
Host / subdomain
  → tenants (master DB) → tenant PostgreSQL database (req.tenantPool)
      → users (per tenant DB)
          → users.role (legacy enum ADMIN|MANAGER|CASHIER|STAFF)
          → rbac_user_roles → rbac_roles → rbac_role_permissions
              → permission keys (e.g. sales.void, inventory.read)
          → optional scope_type/scope_id on role assignment (branch|warehouse|…)
              → NOT applied on production routes today
      → plan features (requireFeature) beside RBAC
```

**Platform super-admin is outside this tree** (master `super_admins` + platform JWT).

### 3.2 Enforcement surfaces

| Layer | Mechanism | Evidence |
|-------|-----------|----------|
| Backend authn | `authenticate` | `middleware/auth.ts` |
| Backend authz | `requirePermission` / `requireAnyPermission` / `requireAllPermissions` | `rbac/middleware.ts` |
| Document/entity policies | document permission middleware, discount/sales policies | `authorization/*` |
| Plan modules | `requireFeature` | `middleware/requireFeature.ts` |
| Frontend routes | `ProtectedRoute` + `requiredPermissions` on `App.tsx` | client |
| Frontend components | `useBackendPermission`, `Can`, feature gates | client |
| ADMIN bypass | `users.role === 'ADMIN'` allows all permissions server-side and client-side | `authorizationService` / `useBackendPermission` |

**Verdict:** Authorization is **enforced on the backend for most mutations**. Frontend gates UX only. **Several authenticated-only read routes lack permission keys** (intra-tenant information disclosure risk).

### 3.3 Representative gaps (intra-tenant)

| Route pattern | Gate | Risk |
|---------------|------|------|
| `GET /api/sales/:id` | `authenticate` only | Any logged-in tenant user can fetch any sale by id |
| Sales report GETs | `authenticate` only | Comments: “all authenticated users” |
| Customer list/statement reads | router-level `authenticate` without `customers.read` on some GETs | Customer/AR data exposure |
| PO / GR list+get | auth-only (sample findings) | Purchasing data |

Evidence (sales):

```951:957:SamplePOS.Server/src/modules/sales/salesRoutes.ts
salesRoutes.get('/:id', authenticate, asyncHandler(salesController.getSaleById));

// Sales reports - all authenticated users
salesRoutes.get(
  '/reports/product-summary',
  authenticate,
  asyncHandler(salesController.getProductSalesSummary)
);
```

Sensitive write paths (void, tax restatement, reprint, etc.) correctly use `requirePermission`.

### 3.4 Roles and permissions SSOT

- Catalog: `SamplePOS.Server/src/rbac/permissions.ts`
- System grants: `shared/authorization/systemRoleGrants.ts`
- Eval engine: `shared/authorization/permissionEvaluation.ts` + server/client wrappers
- Seed/tables: `shared/sql/20260102_rbac_tables.sql`, `rbac/seed.ts`
- Admin APIs: `/api/rbac/*` (`rbac/routes.ts`)

Documented inconsistencies (manager seed vs expected UI rights) live in `docs/AUTHORIZATION_INCONSISTENCY_REPORT.md` — operational RBAC quality risk, not cross-tenant.

---

## 4. Current tenant isolation architecture

### 4.1 Resolution model

| Source | Trusted for pool selection? | Evidence |
|--------|-----------------------------|----------|
| Subdomain of Host | **Yes** | `tenantMiddleware.ts` extract subdomain |
| Default slug `default` | **Yes** (local/single-tenant) | lines 90–93 |
| `X-Tenant-ID` pre-auth | **No** (intentionally ignored) | middleware header docs lines 7–16, 45–50 |
| JWT `tenantId` | Not for pool select; used only if `verifyTenantAccess` | limited mounts (e.g. sync) |
| Body `tenantId` | Sync rejects mismatch | `syncRoutes` |

Skips: `/health`, `/api/health*`, `/api/platform*`.

### 4.2 Isolation enforcement

1. Master registry `tenants` → `database_name` / host / port (`shared/sql/400_multi_tenant.sql`).
2. `connectionManager.getPool` per tenant (`db/connectionManager.ts`).
3. Authenticated user must exist in **that** tenant DB with `is_active = true`.
4. Physical row isolation: IDs from tenant A are not queryable in tenant B’s database.

**Cross-tenant token reuse on wrong subdomain:** user lookup fails in wrong DB → 401 (user not found), rather than data return.

**User multi-tenant membership:** No `user_tenants` table found. Same person on two customers requires **duplicate user accounts** under each tenant host.

**Super-admin:** Platform routes use master pool + `requireSuperAdmin`; not a tenant ADMIN elevation.

### 4.3 Workers / realtime / offline tenancy

| Path | Tenant binding |
|------|----------------|
| CSV import worker | Payload `tenantPoolConfig` |
| Banking retry | `payload.tenantId` → `getPoolById` |
| WebSocket multi-tenant | **No app WebSocket auth model found** |
| Offline sale push | `authenticate` + `pos.create` + `req.tenantPool` |
| Edge sync | `authenticate` + `verifyTenantAccess` + body match |

### 4.4 IDOR notes

- **Cross-tenant IDOR:** Mitigated by DB separation (primary strength).
- **Intra-tenant BOLA:** Present on auth-only sensitive reads (sale by id, etc.).
- **Global JWT tenant cross-check:** `verifyTenantAccess` is **not** applied to all authenticated routes (only selected, e.g. sync). Residual risk is low given DB isolation but is weaker than belt-and-suspenders.

---

## 5. Branch / store authorization

| Claim | Reality | Evidence |
|-------|---------|----------|
| `rbac_user_roles.scope_type` branch/warehouse | Schema + matcher in `rbac/repository.userHasPermission` | SQL EXISTS with scope clauses |
| Route-level `scopeType` on `requirePermission` | **Not used on production mounts** | Grep: definition only |
| Dedicated branch middleware | **None** | — |
| Multi-store ops | Permission keys + feature flags; store APIs not per-user ACL | `storeLocationRoutes`, transfer perms |
| Plan `max_locations` | Quota, not ACL | tenants plan |

**Verdict:** A user in “Branch A” is **not systematically prevented by the server from reading/writing Branch B resources** if they hold the module permission. Branch isolation is **not enterprise-ready** as an authorization boundary today.

POS **trusted devices** and **cash register sessions** are device/session controls, not branch ACLs (`069_quick_login.sql`, cash register enforcement migrations).

---

## 6. Current offline authentication

### 6.1 Design intent (code)

Documented in `offlineLoginCredentials.ts`:

- Cache up to **10** password verifiers after successful online login.
- Offline auth is **password only** (PIN is online + trusted device).
- Establishing offline session **strips** prior JWT/refresh (identity isolation).
- Offline tokens use prefix `offline-session-` — **not valid server JWTs**.

### 6.2 Access model classification

| Situation | Access type |
|-----------|-------------|
| Online login still open, network loss | **Cached-session** — full SPA, last `rbac_permissions`, APIs fail / journal queues |
| Offline password login | **Cached-session synthetic** — local token + same-user RBAC if retained |
| Offline PIN | **Not supported** |
| Device-bound offline password | **No** (browser-local cache only) |
| Time-limited offline credentials | **None** (only idle logout / logout UX) |
| Reconnect with offline-session | **401** → force online re-login (no RT) |

### 6.3 Scenario matrix

| # | Scenario | Observed behavior |
|---|----------|-------------------|
| 1 | Online login | Real JWT pair + offline credential cache |
| 2 | Lose internet | Keep local session; no force logout when offline (`useTokenRefresh` 401 handler) |
| 3 | Close/reopen PWA | **SHARED (default):** actor lock + cold-start clear tokens for **all roles** → `/quick-login`. **PERSONAL** opt-in: ADMIN/MANAGER may restore LS; floor roles still gated |
| 4 | Auth offline | `validateOfflineLogin` → synthetic token |
| 5 | New device | Empty offline cache |
| 6 | Change branch offline | No offline branch-switch authorization |
| 7 | Account disabled offline | Offline cache **still works** until wiped; online API rejects inactive users |
| 8 | Password changed offline | Offline cache accepts **old password** until rewritten |
| 9 | Role/permission change offline | Stale role + permissions until online refresh |
| 10 | Stolen device | Offline POS data + possible password/verifier + residual RT if present |
| 11 | Internet returns | RT rotation if present; offline-session tokens die → re-login |

### 6.4 Storage map

| Store | Auth-relevant content |
|-------|----------------------|
| localStorage | tokens, user, rbac, offline credentials, offline event journal, `smarterp_actor_lock_v1`, `smarterp_device_session_mode` |
| sessionStorage | cold-start / session_expired (`auth_boot_session_v1`) |
| IndexedDB `pos_offline` | products/stock/customers — not credentials |
| Service worker | GET API caches; can receive auth token from page for background sync |

**Logout does not clear offline credentials or SW caches by design.**

---

## 7. Token / session security

| Topic | State | Evidence |
|-------|-------|----------|
| Signing key | `JWT_SECRET` env; prod fail-fast if missing | `refreshTokenService`, `server.ts` prod validation |
| Refresh secret | `JWT_REFRESH_SECRET` required in prod | currently not used to sign opaque RTs (opaque + DB hash) |
| Key rotation | **No** automated JWT signing-key rotation | — |
| Refresh rotation | Yes; family reuse → revoke family | `rotateRefreshToken` |
| Session listing | Yes (`/api/auth/token/sessions`) | `tokenRoutes` |
| CSRF | No CSRF middleware; reliance on Bearer + SameSite cookies | `server.ts` |
| CORS | Allowlist `CORS_ORIGIN`; credentials true; blocks `*` in prod check | `server.ts` |
| Helmet | **Default** `helmet()` only; richer `securityHeaders` in `security.ts` **not mounted** | `server.ts` vs `middleware/security.ts` |
| CSP / HSTS custom | Defined in unused `securityHeaders`; nginx adds some headers in deploy configs | `nginx.conf` |
| WebSocket auth | N/A — no main WS auth channel | — |

**Production secret validation** (structure): JWT min length, DATABASE_URL, reject `CORS_ORIGIN=*` — `server.ts` ~118–159.

---

## 8. Password security

| Control | Present? | Notes |
|---------|----------|-------|
| bcrypt 12 | Yes | Online passwords |
| Complexity + history + expiry | Yes | passwordPolicyService |
| Lockout | Yes | 5 / 15 min |
| Self-service email reset token | **No** | Admin reset / authenticated change only |
| Server captcha | **No** | Client math only |
| Password logging risk | **Yes (risk)** | Login failure path can log `req.body` which may include password (`authController` catch patterns reported in investigation) |
| Plaintext storage | **No** for online secrets | Offline is salted hash, not password plaintext |

---

## 9. API security

### 9.1 Live middleware chain (order)

Evidence: `SamplePOS.Server/src/server.ts`

1. Prod secret/env validation  
2. `trust proxy = 1`  
3. Default `helmet()`  
4. `correlationId`  
5. CORS  
6. JSON/urlencoded **10mb**  
7. Compression, metrics, request logging  
8. `auditContextMiddleware` (**before** route auth — users often empty)  
9. `tenantMiddleware`  
10. Optional global rate limit when no tenant  
11. `/api/auth` auth rate limit  
12. tenant rate limit  
13. Idempotency  
14. Routes → notFound → Sentry → errorHandler  

**Declared but largely unused in live chain:** `applySecurity()`, `securityHeaders`, `xssProtection`, `preventSqlInjection`, `ipAllowlist` from `middleware/security.ts`.

### 9.2 Validation and SQL

- Zod widely used on auth and many domain handlers (`LoginSchema`, etc.).
- Parameterized SQL is standard practice (`authenticate` user query with `$1`).
- Error handler maps Zod/AppError without intending to leak stack to clients.

### 9.3 Public surfaces (sample)

| Endpoint | Auth |
|----------|------|
| `/health`, `/api/health/*`, `/api/health/metrics` | Public |
| `POST /api/auth/login`, register, 2FA verify paths | Public / rate-limited |
| `POST /api/platform/auth/login` | Public + strict rate limit |
| `/api/tenant/config`, public branding | Unauthenticated by design |
| Business APIs | Bearer JWT + often `requirePermission` |

### 9.4 Sensitive domains

Users/RBAC, admin backup, accounting/banking, POS payments, tax restatement, inventory import: generally **authenticate + permission** patterns present. Completeness varies for **reads**.

---

## 10. Frontend / PWA security

| Topic | Finding | Evidence |
|-------|---------|----------|
| Auth state | React `AuthContext` + localStorage | not Zustand for auth (README may be outdated) |
| Permissions cache | `localStorage.rbac_permissions` | AuthContext |
| Route guards | `ProtectedRoute`, cashier lockdown | UX; not security boundary |
| Service worker | Prod-only registration; caches selected GETs | `main.tsx`, `public/sw.js` |
| Session death invariant | Force `location.replace('/login')` on definitive auth death | `.cursor/rules/session-death-login-invariant.mdc`, client proofs |
| After logout residual data | Offline credentials, journals, SW product cache may remain | intentional for POS resilience |

---

## 11. POS / device security

| Topic | Finding | Evidence |
|-------|---------|----------|
| Device identity | Soft fingerprint (UA/screen + stored `__pos_device_fp`) | `useQuickLogin.getDeviceFingerprint` |
| Trusted devices | Tenant DB `trusted_devices`; PIN requires active trusted row | `quickLoginService`, `069_quick_login.sql` |
| Free movement of password users | Yes (any browser with credentials) | password JWT not device-bound |
| PIN on new device | Fails until device registered | UNTRUSTED_DEVICE |
| Device revoke | Deactivate trusted device stops PIN | does **not** wipe offline password cache |
| Cashier PIN switch | Online replaces tokens | `useQuickLogin` |
| POS idle | 60m client idle logout | AuthContext |
| Session enforcement (cash drawer) | Domain tables for cash register | migrations such as `502_pos_session_enforcement.sql` |

**Stolen device:** Offline operation can continue until credentials wiped / idle / cold-start policies; online PIN can be cut via device deactivate if attacker only used PIN pathway.

---

## 12. Audit / security logging

| Event | Logged? | Where |
|-------|---------|-------|
| Login success + session | Yes | `auditService.logUserLogin` |
| Login fail | Yes | `logLoginFailed` |
| Logout | Yes | `logUserLogout` |
| Quick login attempts | Yes | `quick_login_audit` |
| RBAC assignment changes | Yes | `rbac_audit_logs` |
| Password change audit action | Schema supports; **application writers not consistently found** | migration 027 vs service usage |
| Role/permission denial | Deny audit hooks in RBAC middleware | rbac middleware |

Typical fields: entity, action, user, role, IP, UA, session_id, request_id, severity (tenant-local `audit_log` — no dedicated `tenant_id` column; isolation by DB).

**Tamper resistance:** Application append-oriented design; **no WORM / hash-chain**; privileged DB roles can still modify. Audit failures often **non-fatal**.

---

## 13. Deployment / infrastructure security

| Area | Observation | Evidence |
|------|-------------|----------|
| Containers | Server/client Dockerfiles; compose production requires secrets | `docker-compose*.yml` |
| Postgres/Redis ports | Production compose may **publish 5432/6379** — safe only behind host firewall | compose files |
| Reverse proxy | nginx configs with security headers; root listens often **80** (TLS expected at edge) | `nginx.conf` |
| Railway configs | **None found** in repo | — |
| Secrets | Env-driven; prod fail-fast for JWT/DB; **no secrets printed here** | `server.ts` |
| Debug | Relies on `NODE_ENV` | — |
| Health/metrics | Public, including metrics counters | `routes/health.ts` |
| Dependency scan | Not executed as production SAST in this investigation; `run-security-tests.ps1` is largely **mock** scripts | script root |

---

## 14. Existing security tests / proofs

### 14.1 Client tests run this investigation (2026-08-09)

```
samplepos.client vitest:
  offline-login-and-pin.proof.test.ts
  session-death-login.invariant.lock.test.ts
  sessionColdStartLock.test.ts
  authorizationService.test.ts

Result: 4 files, 36 tests PASSED
```

### 14.2 Server unit tests attempted

Auth/authorization Jest-style tests failed under vitest due to `@jest/globals` / path alias (`@shared/...`) — **not a product security proof run in this environment**. Server security suites exist but require their configured Jest/CI runner.

### 14.3 Representative test inventory

| Area | Examples |
|------|----------|
| Session death / force login | `session-death-login.invariant.lock.test.ts`, `session-force-login-redirect.proof.test.ts` |
| Session reliability | `session-reliability.spec.ts`, `session-active-enterprise.spec.ts` |
| Offline login isolation | `offline-login-and-pin.proof.test.ts` |
| RBAC SSOT | `permissions-ssot.proof.test.ts`, `rbac-permission-catalog-ssot.evidence.test.ts` |
| Authorization engine | server + client `authorizationService.test.ts` |
| Sales route security | `salesRoutes.security.test.ts`, `salesRoutes.rbacPolicy.test.ts` |
| Domain RBAC proofs | banking liquidity, restaurant, sale tax restatement |
| Docs | `docs/AUTHORIZATION_AUDIT.md`, `PROOF_AUTHORIZATION_*`, `PROOF_OFFLINE_*`, `PROOF_PERMISSIONS_SSOT.md`, `docs/OFFLINE_ARCHITECTURE_RULES.md` |

**Gap:** No comprehensive automated **cross-tenant isolation integration suite** found by name. Store policy unit tests exist (`allowedStoreIds`) more than route-level branch isolation proofs.

---

## 15. Confirmed security strengths

1. **Database-per-tenant isolation** with host-based resolution; unauthenticated `X-Tenant-ID` not trusted.  
2. **JWT revalidation of active user** on each authenticated request.  
3. **Refresh token rotation + family reuse detection** with hashed storage.  
4. **bcrypt-12 password policy**, lockout, password history/expiry.  
5. **Permission-gated mutations** across large portions of ERP surface.  
6. **Platform super-admin separated** from tenant admin.  
7. **TOTP MFA path** for high-privilege roles.  
8. **Offline identity isolation** (does not reuse prior user’s refresh token).  
9. **Session-death force-login invariants** heavily tested client-side.  
10. **Quick-login trusted-device model** for PIN.  
11. Production **secret / CORS fail-fast checks**.  
12. Parameterized SQL as standard pattern.

---

## 16. Confirmed weaknesses

1. Access **and** refresh tokens in **localStorage** (XSS = full session theft).  
2. Offline password verifiers + stale RBAC survive logout/disable/password change until rewritten.  
3. **No remote wipe** of offline credentials on account disable.  
4. Password change does **not** revoke all refresh families (investigation finding).  
5. **Branch/warehouse scopes unused** on API routes.  
6. **Authenticated-only sensitive reads** (sales, some AR/customer, etc.).  
7. **No OIDC/SSO/Entra**; enterprise IdP not available.  
8. Client-only captcha; generous auth IP rate limits.  
9. Cookie refresh path without **cookie-parser**.  
10. Rich security middleware **not wired**; default Helmet only.  
11. Public health/metrics; published DB/Redis ports in compose patterns.  
12. Audit before auth; non-fatal audit; weak tamper evidence.  
13. Potential **password-in-logs** on login failure paths.  
14. Device fingerprint is soft/spoofable.  
15. Schema drift risk between historical migrations (`locked_until` vs `lockout_until`, 2FA column names, refresh table shape) and runtime SQL.

---

## 17. Unknowns requiring further investigation

1. Exact production reverse-proxy TLS termination and secret manager (not fully described by monorepo alone).  
2. Live production tenant inventory of whether RBAC tables are always seeded (legacy fallback impact).  
3. Whether all jobs consistently carry `tenantId` (spot-checks yes for banking/import).  
4. Completeness of password-change → RT revoke across all admin reset paths without line-by-line every caller.  
5. Real-world adoption of plan features vs shadowed “open” multi-store.  
6. Dependency CVEs at today (npm audit not authoritative without lockfile refresh + CI).  
7. Customer-specific print-service / Sunmi companion process trust boundaries beyond client fingerprint.  
8. Whether register route remains open in production deployments (exists in code; operational config unknown).

---

## 18. Security risks ranked

### Critical

| Risk | Why |
|------|-----|
| XSS → localStorage access+refresh token theft | Full online account takeover without need to steal password |
| Stolen POS offline session / offline credentials | Continues operations with stale grants after disable/password change until reconnect/wipe |

### High

| Risk | Why |
|------|-----|
| Intra-tenant sensitive read without permission keys | Any authenticated staff may exfiltrate sales/AR |
| No branch ACL enforcement | Multi-store customers cannot confidently segregate cashiers by store |
| Password lifecycle incomplete (no RT revoke / offline hash invalidate) | Compromised or former employee residual access |
| Absence of enterprise SSO/MFA Conditional Access integration | Fails customer’s corporate IdP requirement as-is |

### Medium

| Risk | Why |
|------|-----|
| Client-only CAPTCHA + soft auth rate limit | Scripted password attacks rely mainly on lockout |
| Public metrics/health disclosure | Footprinting |
| Cookie-parser gap / dual session complexity | Misconfigured auth paths, incomplete session kill |
| Soft device fingerprint | Trust overstated for “device binding” |
| Audit completeness/integrity | Compliance / forensic gaps |
| Unused security middleware / helmet defaults only | CSP/HSTS posture uneven |

### Low

| Risk | Why |
|------|-----|
| Legacy 24h JWT generators residual | Not primary path |
| Platform secret fallback chain documentation | Mitigated by prod checks when configured |
| Schema name drift if old migrations applied alone | Ops/migrations risk |

---

## 19. Microsoft Entra SSO readiness

**Summary for procurement:**  
**SSO with Microsoft Entra ID is not supported today.**  
Current methods: **local SMART ERP accounts (email/password), optional TOTP for admin/manager, cashier PIN on trusted devices (online), offline password cache for POS continuity, and separate platform super-admin passwords.**

Detailed analysis: see companion doc  
[`docs/security/ENTERPRISE_SSO_READINESS.md`](./ENTERPRISE_SSO_READINESS.md).

High-level answers:

| Question | Answer |
|----------|--------|
| Can Entra be added without replacing RBAC? | **Yes** — Entra for identity; SMART ERP permission engine remains authz SSOT |
| Entra as IdP + SMART as authz authority? | **Yes, recommended** |
| Mapping Entra → tenant → branch → role → permissions? | Tenant + roles/permissions map is natural; **branch map requires new enforcement** |
| JWT/session compatible? | Yes if Entra OIDC federates into existing access/refresh issuance after identity mapping |
| Offline + Entra disabled user? | Offline cache will still work until wiped unless offline model redesigned |

---

## 20. Recommended target architecture (design only — do not implement yet)

```
[Corporate users]
   Microsoft Entra ID (OIDC + Conditional Access + MFA)
              │
              ▼
   SMART ERP Auth Broker (new)
      · Validate ID token / code
      · Map oid/email → tenant-local user / provisioned subject
      · Emit SMART access JWT + RT (existing refresh_tokens)
              │
              ▼
   Existing tenantMiddleware + authenticate + requirePermission
              │
              ▼
   Tenant DB + RBAC (unchanged SSOT for authorization)
```

Hybrid should remain for POS:

- Entra (online interactive / admin / managers)  
- **or** local + PIN + offline password for floor devices with explicit enterprise acceptance

---

## 21. Migration considerations (non-implementation)

1. Preserve database-per-tenant; never accept free-form tenant headers.  
2. Do not move permission decisions into Entra groups alone (groups → SMART roles, SMART still evaluates).  
3. Admin/platform super-admin should **not** silently become Entra-all-access without explicit binding.  
4. Register/public self-signup must stay off for enterprise tenants.  
5. Password auth may remain for break-glass and offline — document residual risk.  
6. Cookie vs localStorage strategy should be decided **before** enterprise rollout (XSS bar).  

---

## 22. Offline + Entra security considerations

| Event | Current offline impact | Entra introduction impact |
|-------|------------------------|---------------------------|
| Entra user disabled | N/A today | Still works offline if verifier/session cached |
| Entra Conditional Access MFA | N/A offline | Only enforceable online interactive path |
| Password sync with Entra | Separate local password today | If pure OIDC, offline verifier model must change or residual local secrets remain |
| Reconnect | Offline token dies | Should force online OIDC session or SMART refresh revalidation |

**Do not claim Entra MFA protects offline POS without redesign.**

---

## 23. Recommended implementation phases (future)

| Phase | Scope | Gate |
|-------|-------|------|
| 0 | This baseline + customer communication (SSO not yet; list methods) | Docs complete |
| 1 | Security harden (token storage strategy, read RBAC, password→revoke RT, audit password events) | Proof suite green |
| 2 | Optional branch scope enforcement for multi-store enterprises | Isolation proofs |
| 3 | OIDC broker + external_id mapping + hybrid local | Entra lab tenant proof |
| 4 | Conditional Access / MFA verification online; offline policy contract signed | Offline threat model sign-off |
| 5 | Enterprise pilot single customer tenant + runbooks | Production proof gates |

---

## 24. Security proof gates required before production SSO rollout

1. Cross-tenant isolation integration tests (host A token cannot read host B).  
2. OIDC claim mapping tests (wrong Entra tenant / wrong SMART tenant rejected).  
3. Token storage XSS residual risk accepted or mitigated (httpOnly-only RT path verified).  
4. Account disable within ≤ N minutes online; offline residual risk documented.  
5. RBAC mutation + read gates for sensitive finance resources.  
6. Session revoke-all + refresh family reuse proven under load.  
7. Offline identity isolation still holds with hybrid auth.  
8. No password/clear secrets in logs (scan).  
9. Public metrics/health review.  
10. Customer-facing authentication methods statement approved by security/legal.  

---

## 25. Final verdict table

| Area | Current State | Evidence | Risk | Enterprise Requirement | Required Change |
|------|---------------|----------|------|------------------------|-----------------|
| Authentication | Email/password local; PIN; platform admin | `authController`, `quickLoginService`, `platformController` | Medium | Corporate SSO preferred | Add OIDC IdP federation |
| Password security | bcrypt-12, policy, lockout | `passwordPolicyService` | Low–Med | Strong passwords / vaulted IdP | Align residual local pwd + revoke on change |
| MFA | TOTP for ADMIN/MANAGER | `twoFactorService` | Medium | Corporate Conditional Access / Entra MFA | Prefer Entra MFA; map assert `amr`/CA online |
| SSO | **Not supported** | no OIDC/SAML code | **High** for this buyer | Microsoft Entra SSO | Implement OIDC broker |
| JWT/session | HS256 access + rotating RT; LS storage | `refreshTokenService`, `useTokenRefresh` | **High** (XSS) | Hardened session | Prefer httpOnly RT; short AT; revoke on lifecycle |
| Tenant isolation | DB-per-tenant; host resolve | `tenantMiddleware`, `connectionManager` | Low (cross-tenant) | Strict isolation | Keep; add universal post-auth verify optional |
| Branch isolation | Schema only; not route-enforced | `rbac` scope columns unused on routes | **High** multi-store | Store segregation | Enforce scope on APIs |
| Authorization | RBAC keys dual enforced; gaps on reads | `rbac/middleware`, `salesRoutes` | Medium | Least privilege | Close auth-only read routes |
| Offline authentication | Cached password + synthetic session | `offlineLoginCredentials` | **High** theft/stale | Controlled offline | Policy + wipe/TTL + link to disable |
| Device security | Trusted devices for PIN; soft FP | `quickLoginService` | Medium | Device governance | Attestation/revocation story |
| API security | Auth+RBAC widespread; security.ts mostly unused | `server.ts` | Medium | Hardened API | Wire headers, tighten rates, cookie parser if cookies |
| Audit logging | Login fail/success; RBAC audit; incomplete IAM | `auditService`, `rbac_audit_logs` | Medium | Full IAM audit | Log password/role/disable consistently |
| Secret management | Env vars; prod fail-fast | `server.ts` | Medium | Vault / KMS | Ops discipline + key rotation |
| Transport security | Assume TLS at edge; nginx:80 patterns | `nginx.conf` | Medium | HTTPS everywhere | Confirm production TLS |
| Account lifecycle | `is_active`; admin reset; no email activation | users table + services | Medium | Joiners/leavers | Disable → RT kill → offline wipe policy |
| Entra readiness | Authz ready; IdP missing | this doc + companion | High for RFP | Entra SSO | See ENTERPRISE_SSO_READINESS.md |

### CURRENT SECURITY MATURITY

**Moderate (commercial multi-tenant ERP/POS with serious RBAC and tenancy engineering; not yet enterprise IdP / store-ACL / token-XSS hardened).**

### SSO READINESS

**Architecturally ready for “Entra as identity, SMART as authorization” on the online path; product-feature readiness is Incomplete — SSO not implemented; offline POS and localStorage sessions need explicit enterprise design.**

### BIGGEST SECURITY RISKS

1. Tokens (and offline verifiers) in **localStorage** — XSS and device theft.  
2. **Offline residual access** after disable / password / role change.  
3. **Intra-tenant** over-broad authenticated reads.  
4. **No branch authorization enforcement.**  
5. **No Microsoft Entra / corporate SSO** for the prospect requirement.

### WHAT SHOULD NOT BE CHANGED

1. **Database-per-tenant** isolation model and host-based tenant resolution that ignores unauthenticated tenant headers.  
2. **Permission-key RBAC** as authorization SSOT (do not replace with Entra-only authz).  
3. **Refresh token family rotation with reuse detection.**  
4. **Active-user recheck** on each request.  
5. **Offline identity isolation rules** that strip prior user’s tokens when starting offline session.  
6. Separation of **platform super-admin** from tenant users.  
7. Session-death force-login invariants on the SPA.

### WHAT MUST BE IMPROVED BEFORE ENTERPRISE SSO

1. Explicit **hybrid identity model** (Entra + local/offline) with customer-accepted risk statements.  
2. **Identity mapping table** (Entra oid/tid → SMART tenant user) with multi-tenant Entra safety rules.  
3. Harden **session storage** / RT exposure strategy.  
4. **Lifecycle**: disable, password/OIDC unlink → revoke refresh + offline invalidation plan.  
5. Close **sensitive read RBAC** and decide **branch enforcement** for multi-store.  
6. Audit coverage for IAM events.  
7. Online MFA authority (Entra Conditional Access) documentation vs local TOTP.

### RECOMMENDED ENTRA ARCHITECTURE

**Customer-specific Entra configuration / single-tenant Entra app registration per enterprise customer (or multi-tenant Entra app only with explicit `tid` allowlisting)**, hybrid authentication retained for POS offline/break-glass, **SMART ERP remains authorization authority**, issuing existing JWT access + refresh after successful OIDC identity verification. See `ENTERPRISE_SSO_READINESS.md` for model comparison.

---

## Evidence index (primary files)

| Domain | Paths |
|--------|-------|
| Login | `SamplePOS.Server/src/modules/auth/authController.ts`, `authService.ts`, `authRoutes.ts` |
| Tokens | `refreshTokenService.ts`, `tokenRoutes.ts`, `middleware/auth.ts` |
| Password / lockout | `passwordPolicyService.ts`, `passwordRoutes.ts` |
| MFA | `twoFactorService.ts`, `twoFactorRoutes.ts` |
| Quick login | `quickLoginService.ts`, `quickLoginRoutes.ts` |
| Tenant | `middleware/tenantMiddleware.ts`, `db/connectionManager.ts`, `modules/platform/tenantService.ts` |
| RBAC | `rbac/*`, `authorization/*`, `shared/authorization/*` |
| Platform | `modules/platform/platformController.ts`, `platformRoutes.ts` |
| Client auth | `AuthContext.tsx`, `useTokenRefresh.ts`, `LoginPage.tsx` |
| Offline | `offlineLoginCredentials.ts`, `offlineDb.ts`, `offlineEventJournal.ts`, `public/sw.js` |
| Server bootstrap | `server.ts`, `middleware/security.ts` |
| Docs | `docs/AUTHORIZATION_AUDIT.md`, `docs/OFFLINE_ARCHITECTURE_RULES.md` |

---

*End of security baseline investigation. No remediation was implemented.*
