# Authorization Phases — Proof Run

**Generated:** 2026-07-10T10:19:44.915Z

## Summary

| Metric | Value |
|--------|-------|
| Static checks passed | 25 / 31 |
| Test suites executed | 6 |
| Test suites passed | 6 |
| Individual tests passed | 91 |
| Overall | **PASS** |

## Phase map

| Phase | Scope | Proof |
|-------|-------|-------|
| **0** | Shared module, AuthorizationService, auth context wiring | Static + `authorization` + `serviceAuth` + client `authorizationService` |
| **1** | Server services (discount, sales, delivery) | Static + `discountPolicy` + `serviceAuth` |
| **2** | Routes, sales/document/GL policies | Static + `salesRoutes.rbacPolicy` + `salesRoutes.security` + `documentPolicy` |
| **3+** | Client UI, session cleanup, legacy removal | Static + client `warehouseRbac` + App route audit |

## Static checks

- **PASS** Phase 0 — shared legacyRoleFallback SSOT exists
- **PASS** Phase 0 — shared permissionEvaluation exists
- **PASS** Phase 0 — server AuthorizationService exists
- **PASS** Phase 0 — client AuthorizationService exists
- **PASS** Phase 0 — authenticate wires loadAuthorizationContext
- **PASS** Phase 0 — RBAC middleware uses shared legacy fallback
- **PASS** Phase 1 — salesRepository.isManager removed
- **PASS** Phase 1 — salesService uses assertUserPermission
- **PASS** Phase 1 — discountService uses discountPolicy
- **PASS** Phase 1 — deliveryService uses userHasPermission
- **PASS** Phase 1 — serviceAuth helper exists
- **PASS** Phase 2 — salesRoutes imports salesPolicy
- **PASS** Phase 2 — salesRoutes local legacy map removed
- **PASS** Phase 2 — document PDF permission middleware exists
- **PASS** Phase 2 — GL advisor lock uses accounting.period_manage
- **PASS** Phase 2 — GR/IR clearing routes permission-gated
- **PASS** Phase 3 — App.tsx has zero requiredRoles usages
- **PASS** Phase 3 — POSPage uses useDiscountLimitPercent
- **PASS** Phase 3 — DiscountDialog ROLE_LIMITS removed
- **PASS** Phase 3 — SalesPage uses shouldRestrictSalesToOwnUser
- **PASS** Phase 3 — QuickLoginSettings uses system.update
- **PASS** Phase 3 — legacy auth.ts requirePermission stub removed
- **PASS** Phase 3 — sessionService loads RBAC permissions
- **PASS** Phase 3 — deprecated authStore.ts deleted
- **PASS** Phase 3 — no ADMIN/MANAGER/CASHIER business checks in migrated client pages
- **PASS** Phase 0 tests — authorizationService + shared policies — 23 tests passed
- **PASS** Phase 2 tests — salesRoutes.rbacPolicy — 12 tests passed
- **PASS** Phase 2 tests — salesRoutes.security — 47 tests passed
- **PASS** Phase 2 tests — glReconciliationService.auth — 1 tests passed
- **PASS** Phase 0/3 client — authorizationService — 4 tests passed
- **PASS** Phase 3 client — warehouseRbac — 4 tests passed

## Test runs

- **PASS** `Phase 0 tests — authorizationService + shared policies` — pattern: `authorization discountPolicy documentPolicy serviceAuth` (23 tests)
- **PASS** `Phase 2 tests — salesRoutes.rbacPolicy` — pattern: `salesRoutes.rbacPolicy` (12 tests)
- **PASS** `Phase 2 tests — salesRoutes.security` — pattern: `salesRoutes.security` (47 tests)
- **PASS** `Phase 2 tests — glReconciliationService.auth` — pattern: `glReconciliationService.auth` (1 tests)
- **PASS** `Phase 0/3 client — authorizationService` — pattern: `authorizationService` (4 tests)
- **PASS** `Phase 3 client — warehouseRbac` — pattern: `warehouseRbac` (4 tests)

## Re-run

```bash
npm run proof:authorization-phases
```

Or manually:

```bash
cd SamplePOS.Server && npm test -- authorization discountPolicy documentPolicy serviceAuth salesRoutes.rbacPolicy salesRoutes.security glReconciliationService.auth
cd samplepos.client && npm test -- run authorizationService warehouseRbac
```
