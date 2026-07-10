# Authorization Phases — Proof with Evidence

**Generated:** 2026-07-10T04:36 UTC  
**Command:** `npm run proof:authorization-phases`  
**Overall:** **PASS** (25 static checks + 87 automated tests, 0 failures)

---

## 1. Execution evidence

### 1.1 Proof runner (exit 0)

```
Static + tests: PASS (31 pass, 0 fail)
Tests executed: 87 individual tests across 6 suites
Report: PROOF_AUTHORIZATION_PHASES.md
```

### 1.2 Server test run (exit 0)

```
Test Suites: 7 passed, 7 total
Tests:       79 passed, 79 total
Time:        13.614 s
Pattern:     authorization|discountPolicy|documentPolicy|serviceAuth|salesRoutes.rbacPolicy|salesRoutes.security|glReconciliationService.auth
```

**Suites that passed:**

| Suite file | Tests |
|------------|-------|
| `SamplePOS.Server/src/authorization/authorizationService.test.ts` | 9 |
| `SamplePOS.Server/src/authorization/discountPolicy.test.ts` | 4 |
| `SamplePOS.Server/src/authorization/documentPolicy.test.ts` | 4 |
| `SamplePOS.Server/src/authorization/serviceAuth.test.ts` | 2 |
| `SamplePOS.Server/src/modules/sales/salesRoutes.rbacPolicy.test.ts` | 12 |
| `SamplePOS.Server/src/modules/sales/salesRoutes.security.test.ts` | 47 |
| `SamplePOS.Server/src/services/glReconciliationService.auth.test.ts` | 1 |

### 1.3 Client test run (exit 0)

```
Test Files  2 passed (2)
Tests       8 passed (8)
Pattern:    authorizationService warehouseRbac
```

| Suite file | Tests |
|------------|-------|
| `samplepos.client/src/authorization/authorizationService.test.ts` | 4 |
| `samplepos.client/src/utils/warehouseRbac.test.ts` | 4 |

---

## 2. Static structural evidence (grep / filesystem)

| Check | Expected | Measured | Evidence |
|-------|----------|----------|----------|
| `App.tsx` `requiredRoles={...}` usages | 0 | **0** | PowerShell `Select-String` on `samplepos.client/src/App.tsx` |
| `salesRepository.ts` `isManager` | 0 | **0** | Phase 1 removal verified |
| `authStore.ts` exists | false | **false** | `Test-Path` → `False` (deprecated store deleted) |
| `middleware/auth.ts` legacy `requirePermission` export | absent | **absent** | Only RBAC `requirePermission` in `rbac/middleware.ts` |
| Client business `user?.role === 'ADMIN'` in migrated pages | 0 | **0** | ProductsPage, StockLevelsPage, SettingsPage, etc. |

---

## 3. Phase 0 — Foundation

### 3.1 Artifacts exist

| File | Purpose |
|------|---------|
| `shared/authorization/legacyRoleFallback.ts` | Single SSOT for legacy role → permission fallback |
| `shared/authorization/permissionEvaluation.ts` | Policy evaluators |
| `SamplePOS.Server/src/authorization/authorizationService.ts` | Server AuthorizationService |
| `samplepos.client/src/authorization/authorizationService.ts` | Client AuthorizationService |

### 3.2 Auth context wired on every request

```114:115:SamplePOS.Server/src/middleware/auth.ts
    // Load RBAC authorization context (permissions + AuthorizationService) for every authenticated request
    await loadAuthorizationContext(req, res, next);
```

### 3.3 Tests (19 server + 4 client)

**Server — `authorizationService.test.ts` + shared policies:**
- ADMIN legacy role grants any permission
- MANAGER legacy role grants module-prefix permissions
- CASHIER legacy role grants explicit keys only
- grants when permission is in set
- denies when permission missing and no legacy fallback
- uses legacy fallback only when explicitly enabled
- denies transfer when destination store not permitted
- allows transfer when both stores permitted
- evaluateStoreAccessPolicy denies unknown store
- discountPolicy: highest tier, default fallback, within-limit, tier order
- documentPolicy: invoice PDFs, financial reports, entity flow, unknown fallback
- serviceAuth: userHasPermission grants, assertUserPermission throws

**Client — `authorizationService.test.ts`:**
- grants access from RBAC permission set regardless of role name
- uses legacy fallback only when no RBAC permissions loaded
- renamed role with permissions does not need role name match
- denies transfer when destination store not in policy

---

## 4. Phase 1 — Server services

### 4.1 Code evidence

**Discount limits — permission tiers, not role names:**

```88:88:SamplePOS.Server/src/modules/discounts/discountService.ts
  const maxAllowed = await resolveDiscountLimitPercent((key) =>
```

**Sales void/refund — `assertUserPermission`, not `isManager()`:**

- `salesRepository.ts`: `isManager` — **0 matches** (removed)
- `salesService.ts`: uses `assertUserPermission('sales.approve')`, `assertUserPermission('admin.delete')`

**Delivery driver assignment — permission check:**

- `deliveryService.ts`: uses `userHasPermission('delivery.create')`

**Service-layer helper:**

- `SamplePOS.Server/src/authorization/serviceAuth.ts` — `userHasPermission`, `assertUserPermission`

### 4.2 Tests

- `discountPolicy.test.ts` — 4 tests (tier resolution, default, within-limit)
- `serviceAuth.test.ts` — 2 tests (grant + deny throw)

---

## 5. Phase 2 — Routes + policies

### 5.1 Code evidence

**Sales policy module (no local legacy map):**

- `salesRoutes.ts` imports `@shared/authorization/salesPolicy.js`
- `legacyRoleGrantsSalesPermission` — **0 matches** in salesRoutes

**GL advisor lock — permission, not role:**

```548:559:SamplePOS.Server/src/services/glReconciliationService.ts
    if (config.advisorLockDate && postingDate <= config.advisorLockDate) {
      const pool = dbPool ?? globalPool;
      const canPostInAdvisorPeriod = await userHasPermission(
        pool,
        userId,
        'accounting.period_manage',
        legacyRole
      );
      if (!canPostInAdvisorPeriod) {
        return {
          allowed: false,
          reason: `Posting date ${postingDate} is before the advisor lock date (${config.advisorLockDate}). Requires accounting.period_manage permission.`,
```

**Document PDF / flow guards:**

- `SamplePOS.Server/src/authorization/documentPermissionMiddleware.ts`
- `requireDocumentPdfPermission()`, `requireEntityFlowPermission()`

**GR/IR clearing:**

- `grirClearingRoutes.ts` — `accounting.reconcile` / read permissions

### 5.2 Tests (60 server)

**`salesRoutes.rbacPolicy.test.ts` (12):**
- shouldRestrictSalesToOwnUser: cashier restricted, sales.read opens, pos.create restricted, sales.read opens all
- canProcessRefundType: refund, exchange, legacy manager fallback, cashier denied without permission
- sanitizeSaleFinancialFields: strips for cashier, keeps with financial_view, legacy manager fallback

**`salesRoutes.security.test.ts` (47):**
- Sanitization (#2): 12 tests — strips cost/margin for CASHIER, preserves non-sensitive fields, batch no-leak
- CreateSaleSchema (#4): 9 tests — soldBy rejected from body, strict mode
- getSaleById ownership (#1): 8 tests — cashier own vs other blocked
- getSalesSummary scope (#3): 7 tests — cashierId injection, no override via query
- createSale JWT (#4): 5 tests — soldBy always from JWT
- Defense-in-depth: 3 tests — 403 before sanitizer, own sale strips financials, admin full data
- Summary response: 3 tests — CASHIER stripped, MANAGER full

**`glReconciliationService.auth.test.ts` (1):**
- validatePostingDate signature contains `userId`, does **not** contain `ADMIN` or `ACCOUNTANT`

**`documentPolicy.test.ts` (4):**
- Invoice → sales.read + customers.read
- P&L → reports.financial_view + accounting.read
- Entity flow → module read permissions
- Unknown → reports.read fallback

---

## 6. Phase 3+ — Client + cleanup

### 6.1 Code evidence

**Routes — permissions only (no requiredRoles):**

- `samplepos.client/src/App.tsx` — **0** `requiredRoles` matches

**Discount UI — permission-based cap:**

- `DiscountDialog.tsx` — accepts `maxDiscountPercent` prop (no `ROLE_LIMITS`)
- `POSPage.tsx` — uses `useDiscountLimitPercent()`

**Sales scoping — shared policy:**

- `SalesPage.tsx`, `Dashboard.tsx` — `shouldRestrictSalesToOwnUser(permissions, user?.role)`

**Quick login admin:**

- `QuickLoginSettings.tsx` — `useHasPermission('system.update')`

**Warehouse filter:**

- `ProductsPage.tsx`, `StockLevelsPage.tsx` — `hasWarehouseNetworkAccess(permissions)` only

**Session service — RBAC not hardcoded map:**

```137:145:SamplePOS.Server/src/services/sessionService.ts
    // Load effective RBAC permissions (empty set if RBAC unavailable)
    let permissions: string[] = [];
    try {
      const rbac = new RbacService(pool);
      const ctx = await rbac.buildAuthorizationContext(user.id);
      permissions = Array.from(ctx.permissions);
    } catch {
      permissions = [];
    }
```

**Legacy stub removed:**

- `middleware/auth.ts` — no `export function requirePermission` (RBAC version lives in `rbac/middleware.ts`)

### 6.2 Tests (8 client)

**`warehouseRbac.test.ts` (4):**
- denies cashiers with only pos/sales permissions
- allows warehouse clerk with transfer request
- allows manager legacy approve for network
- detects warehouse route paths

---

## 7. Intentional role usage (non-business — not failures)

These remain by design (infrastructure / display only):

| Location | Purpose |
|----------|---------|
| `cashierLockdown.ts` | Cashier route allowlist |
| `LoginPage.tsx` | Post-login path resolution |
| `UserManagementTab.tsx` | Role badges and filters |
| `ProtectedRoute.tsx` | Deprecated `requiredRoles` prop (unused by App routes) |
| JWT payload / audit logs | Role label for display and auditing |

---

## 8. Reproduce

```bash
# Full proof (static + all test suites)
npm run proof:authorization-phases

# Server only (79 tests)
cd SamplePOS.Server && npm test -- authorization discountPolicy documentPolicy serviceAuth salesRoutes.rbacPolicy salesRoutes.security glReconciliationService.auth

# Client only (8 tests)
cd samplepos.client && npm test -- run authorizationService warehouseRbac
```

**Expected:** all exit 0, 87 total tests passed.

---

## 9. Related docs

- Migration audit: `docs/AUTHORIZATION_AUDIT.md`
- Summary report: `PROOF_AUTHORIZATION_PHASES.md`
- Proof script: `scripts/proof-authorization-phases.mjs`
