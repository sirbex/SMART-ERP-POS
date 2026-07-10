# Authorization Inconsistency Report — Manager / Accounts Denials

**Date:** 2026-07-10  
**Tenant audited:** Henber (`pos_tenant_henber_pharmacy`)  
**Scope:** Why users with Manager / Accounts (Accountant) rights are denied after the permission-based authorization refactor  

---

## Executive verdict

Users are not denied because their **role name** is wrong. They are denied because:

1. **Route/UI access now checks RBAC permission keys only** (not `MANAGER` / `STAFF`).
2. **RBAC role seeds for Manager (and parts of Accountant) are narrower than what the product UI expects.**
3. **Legacy role fallback is turned off on the client as soon as any RBAC permissions load** — so the old “Manager can do accounting” behavior no longer applies.

This is a **seed / grant inconsistency**, amplified by the auth refactor — not a random bug in `ProtectedRoute`.

---

## How denial works now (post-refactor)

```
Login → load /api/rbac/me/permissions → AuthContext Set
     → ProtectedRoute / Can / useHasPermission
     → allow only if permission key is in Set
     → legacy users.role (MANAGER) used ONLY if Set is empty
```

| Layer | File | Behavior |
|-------|------|----------|
| Client routes | `samplepos.client/src/components/auth/ProtectedRoute.tsx` | Permission-first; deny → redirect `/dashboard` |
| Client engine | `samplepos.client/src/authorization/authorizationService.ts` | Legacy fallback **only when `permissions.size === 0`** |
| Legacy SSOT | `shared/authorization/legacyRoleFallback.ts` | Manager modules **include `accounting`, `orders`, `distribution`, `quotations`, `hr`** |
| Server middleware | `SamplePOS.Server/src/rbac/middleware.ts` | After RBAC deny, still tries legacy (comment says “no RBAC roles” but code does not check) |
| Server services | `AuthorizationService` / `assertUserPermission` | Legacy only when user has **no** RBAC assignments |

**Result:** A Manager with a non-empty RBAC grant list **cannot** use legacy Manager accounting rights on the client, even though `users.role = MANAGER`.

---

## Production evidence (Henber — live DB)

### Manager role grants

| Permission / module | Granted on Henber? | UI / API needs it? |
|---------------------|--------------------|--------------------|
| `accounting.*` | **NO** (0 accounting keys) | **YES** — almost all `/accounting/*` routes require `accounting.read` |
| `quotations.*` | **NO** | YES — quotations pages |
| `distribution.*` | **NO** | YES — dist APIs |
| `hr.*` | **NO** | YES — HR route |
| `orders.*` | YES | YES |
| `expenses.*` | YES | YES |
| `sales` / `inventory` / `customers` / `banking` | YES | YES |

**Manager modules on Henber:** banking, corrections, crm, customers, delivery, expenses, inventory, orders, pos, purchasing, reports, sales, settings, suppliers — **no accounting, quotations, distribution, hr**.

### Accountant (“Accounts”) role grants

| Permission | Granted on Henber? | UI / API needs it? |
|------------|--------------------|--------------------|
| `accounting.read` / `reconcile` / `period_manage` | YES | YES |
| `accounting.manage` | **NO** | Some control-tower / manage routes |
| `customers.update` | **NO** | **YES** — AR payment create/update (`arPaymentRoutes` + Customer Payments UI) |
| `customers.adjust` | YES | Invoice adjust |
| `distribution.read` | **NO** | Dist APIs |
| `orders.*` / `banking` / `reports` | YES | YES |

Accountant customers keys are effectively: read / create / export / adjust — **not update**.

### Example users affected

| User | Legacy `users.role` | RBAC roles | Likely symptom |
|------|---------------------|------------|----------------|
| `mugisaronaldson@gmail.com` | MANAGER | Manager only | **Blocked from all accounting pages** |
| `Henrymugerwajr@gmail.com` | MANAGER | Manager + Auditor | Accounting may work via Auditor `.read`; write/manage still limited |
| `Douglas@gmail.com` | MANAGER | Manager + Administrator | OK (Administrator covers all) |
| `Kasemeiraflavia@gmail.com` | STAFF | Accountant + Cashier | Accounting OK; **customer payments write denied** (`customers.update`) |
| `tumuhimbiseruth@gmail.com` | STAFF | Accountant + Auditor | Same Accounts gap on `customers.update` |
| `nabatereggavivianmakula@gmail.com` | MANAGER | Accountant + Manager + Warehouse | Accounting OK via Accountant; Manager alone would not be |

---

## Root causes (ranked)

### 1. Highest — Manager RBAC seed omits accounting (and other modules the UI still treats as Manager work)

**Seed (wipe) in** `shared/sql/255_rbac_comprehensive_role_fix.sql`:

```110:113:shared/sql/255_rbac_comprehensive_role_fix.sql
    WHERE module IN (
      'sales', 'inventory', 'purchasing', 'customers', 'suppliers',
      'reports', 'pos', 'banking', 'delivery', 'settings', 'crm'
    );
```

**Legacy Manager SSOT** still includes accounting:

```14:32:shared/authorization/legacyRoleFallback.ts
export const LEGACY_MANAGER_MODULES = [
  'sales', 'inventory', 'purchasing', 'customers', 'suppliers',
  'reports', 'pos', 'accounting', 'banking', 'delivery', 'settings',
  'hr', 'expenses', 'quotations', 'crm', 'orders', 'distribution',
] as const;
```

**App routes** gate accounting with permissions, e.g. `requiredPermissions={['accounting.read']}` in `App.tsx`.

Before refactor: role name `MANAGER` often opened those pages.  
After refactor: Manager without `accounting.read` → **Access Denied / redirect to dashboard**.

`rbac/seed.ts` Manager list also omits `accounting`, `orders`, `distribution` (adds expenses/quotations only) — still inconsistent with legacy.

---

### 2. Highest — Accountant missing `customers.update` while payment APIs require it

- Seed comment in 255 says customers are for payments, but grants only `customers.read|create|export` (no `update`).
- Server: `SamplePOS.Server/src/modules/ar-payments/arPaymentRoutes.ts` uses `requirePermission('customers.update')` on create/update payment routes.
- Client: Customer Payments page gates create with `customers.update`.

**Accounts users can open accounting screens but cannot post customer payments** — looks like “I have rights but I’m denied.”

---

### 3. High — Client vs server legacy fallback mismatch

| Path | Legacy when RBAC assigned? |
|------|----------------------------|
| Client `ClientAuthorizationService` | **No** |
| Server `AuthorizationService` / `assertUserPermission` | **No** |
| Server `requirePermission` middleware | **Yes** (still calls `legacyRoleGrantsPermission` after RBAC deny) |

Effects:
- Manager may get **403 on some service paths** and **UI deny** on others inconsistently.
- Or: API allows via legacy while UI blocks (or the reverse for `assertUserPermission` paths).

This produces “sometimes works / sometimes Access Denied” reports.

---

### 4. High — `orders.*` vs `distribution.*` key mismatch

- Client sales-order routes often gate on `orders.read` / `orders.create`.
- Server distribution routes require `distribution.*`.
- Manager and Accountant on Henber: **orders YES, distribution NO**.

Users can see UI entry points and then fail on API calls.

---

### 5. Medium — Accountant mapped to legacy `STAFF`

```16:21:SamplePOS.Server/src/modules/users/userService.ts
function mapRbacRoleToLegacy(rbacRoleName: string): UserRole {
  ...
  if (name.includes('manager')) return 'MANAGER';
  if (name === 'cashier') return 'CASHIER';
  return 'STAFF';  // Accountant / Accounts → STAFF
}
```

If RBAC ever fails to load (empty Set), Accounts falls back to **STAFF** legacy (mostly `*.read` + `pos.create` / `orders.create`) — **not** accounting write. There is no `ACCOUNTANT` entry in `legacyRoleFallback.ts`.

---

### 6. Medium — Divergent seed sources

| Source | Manager accounting? | Accountant `customers.update`? |
|--------|---------------------|--------------------------------|
| `255_rbac_comprehensive_role_fix.sql` | No | No |
| `rbac/seed.ts` | No | No (has `customers.adjust`) |
| `tenantService.seedDefaultRbac` | No | Thinner still |
| Legacy `LEGACY_MANAGER_MODULES` | Yes | N/A |

Tenant behavior depends on which migration/seed last wiped `rbac_role_permissions`.

---

### 7. Low — Not the cause for Manager/Accounts

- Cashier lockdown (`cashierLockdown.ts`) — only `role === 'CASHIER'`.
- Login redirect — Manager/Accounts go to `/dashboard`, not forced to POS.
- FeatureGate plan features — can look like auth denial but is plan gating (separate from RBAC).

---

## Inconsistency diagram

```
                    ┌─────────────────────────────┐
 Legacy expectation │ MANAGER ⇒ accounting, etc.  │
                    └──────────────┬──────────────┘
                                   │
                    Auth refactor: roles are containers only
                                   │
                                   ▼
                    ┌─────────────────────────────┐
 RBAC Manager seed  │ NO accounting / quotations  │  ← production Henber
                    └──────────────┬──────────────┘
                                   │
              permissions Set non-empty → legacy OFF (client)
                                   │
                                   ▼
                    ┌─────────────────────────────┐
 App.tsx routes     │ require accounting.read     │
                    └──────────────┬──────────────┘
                                   │
                                   ▼
                         DENIED → /dashboard
```

---

## What “having rights” means vs what the system checks

| User belief | System check after refactor |
|-------------|----------------------------|
| “I’m a Manager” | Does **not** open accounting; needs `accounting.read` in RBAC |
| “I’m Accounts / Accountant” | Can open most accounting; **cannot** create AR payments without `customers.update` |
| “I used to access this before deploy” | True — role-name gates / legacy Manager modules previously covered it |

---

## Recommended fix plan (priority order)

1. **Re-seed Manager** to include at least: `accounting`, `quotations`, `orders` (already present on Henber), `distribution`, and decide on `hr` / `expenses` vs legacy SSOT.
2. **Grant Accountant `customers.update`** (and optionally `distribution.read` if they use dist SO/invoices).
3. **Align `requirePermission` middleware** with `AuthorizationService` (legacy only when user has **no** RBAC assignments).
4. **Pick one key family** for sales orders: gate client + server on `distribution.*` **or** accept `orders.*` on both.
5. **Single SSOT** for role grants (one migration / seed path); stop divergent 255 vs seed.ts vs tenantService.
6. Optionally map Accountant → a dedicated legacy role or never rely on legacy for Accounts.

---

## Reproduce on Henber

After migration `534` is applied, Manager should have `accounting.read` and Accountant should have `customers.update`.

```powershell
. .\scripts\load-proof-production-env.ps1
# Verify grants via SQL or Role Management UI after re-login
```

Before the fix: login as Manager-only → accounting pages redirected to dashboard.  
Accountant without `customers.update` → customer payment create denied.

---

## Summary

| Role | Main denial cause |
|------|-------------------|
| **Manager** | RBAC role has **no `accounting.*`**; client no longer trusts role name `MANAGER` |
| **Accounts / Accountant** | Missing **`customers.update`** for payment APIs; also no `distribution.*` / `accounting.manage` for some surfaces |
| **Cross-cutting** | Legacy fallback disabled once RBAC loads; middleware still partially uses legacy → inconsistent allow/deny |

**This is not “permissions broken.”** The permission engine is doing what it was told. The **role permission catalogs are out of sync with product expectations and with the legacy Manager map.**

---

## Fix applied (2026-07-10)

| Item | Change |
|------|--------|
| SSOT | `shared/authorization/systemRoleGrants.ts` — Manager modules = `LEGACY_MANAGER_MODULES`; Accountant extras include `customers.update` + `distribution.read` |
| Seeds | `rbac/seed.ts` + `tenantService.seedDefaultRbac` import SSOT filters |
| SQL | `534_rbac_manager_accountant_grant_align.sql` (additive); `255` + `fix_accountant_permissions.sql` aligned |
| Middleware | `requirePermission` / `requireAny` / `requireAll` legacy only when user has **no** `rbac_user_roles` |
| Controller | `/rbac/me/permissions` legacy path uses shared `legacyRoleGrantsPermission` (includes `distribution`) |

After deploy, run migration `534` on all tenants. Users must re-login (or refresh permissions) to pick up new grants.
