# Authorization Audit & Migration Plan

**Date:** 2026-07-07  
**Objective:** Every authorization decision is driven by **permissions + policies**. Roles are permission containers only — never runtime security logic.

## Target Architecture

```
Runtime authorization = Permission + Policy evaluation

Roles (templates)     → group permissions in admin UI
Permissions (authority) → sales.refund, inventory.transfer.create, orders.read
Policies (context)      → store access, ownership, workflow state, company scope
AuthorizationService  → single engine for API, UI, services, jobs
```

### AuthorizationService API (server + client)

| Method | Purpose |
|--------|---------|
| `hasPermission(user, permission)` | Boolean permission check |
| `authorize(user, { permission, context })` | Permission + policy; throws/returns denial |
| `evaluatePolicy(user, action, resource)` | Contextual rules after permission granted |
| `getEffectivePermissions(user)` | Full permission set for UI |
| `getDeniedReason(result)` | Human-readable denial for API/UI |

**Implemented:**
- Server: `SamplePOS.Server/src/authorization/authorizationService.ts`
- Client: `samplepos.client/src/authorization/authorizationService.ts`
- Shared: `shared/authorization/` (types, legacy fallback SSOT, policy evaluators)

---

## Classification Legend

| Class | Action |
|-------|--------|
| **Business authorization** | Replace with `requirePermission` / `AuthorizationService` |
| **UI display** | Keep role labels for display only |
| **Logging/auditing** | Keep `userRole` in audit payloads |
| **Bootstrap/system** | Keep for JWT, 2FA policy, cashier path lockdown |
| **Legacy compatibility** | Migrate then remove |

---

## Server Audit Summary

| Pattern | Count | Status |
|---------|-------|--------|
| `requirePermission(` | ~590 | ✅ Primary route guard |
| `user.role` / `req.user.role` | 37 | 🔄 Mixed — many audit-only |
| `role ===` / `role !==` | 19 | 🔄 Migrate business checks |
| `authorize(...roles)` | 5 | ✅ Migrated quick-login → `system.update` |
| `isManager` / `isCashierRole` | 9 | 🔄 Migrate to permissions |
| Duplicate legacy maps | 4 | ✅ Consolidated to `shared/authorization` |

### Business Authorization — Migrated (this pass)

| File | Was | Now |
|------|-----|-----|
| `tenantConfigRoutes.ts` | `user.role !== 'ADMIN'` | `requirePermission('settings.update')` |
| `quotationController.ts` | ADMIN for permanent delete | `authorize({ permission: 'admin.delete' })` |
| `cashRegisterRoutes.ts` | `ADMIN/MANAGER` for all registers | `hasPermission('pos.approve')` |
| `quickLoginRoutes.ts` | `authorize('ADMIN','MANAGER')` | `requirePermission('system.update')` |
| `transferPermissionUtils.ts` | Duplicate `legacyGrantsTransfer` | `AuthorizationService.hasPermission` |
| `rbac/middleware.ts` | Local `LEGACY_ROLE_PERMISSIONS` | `@shared/authorization/legacyRoleFallback` |
| `middleware/auth.ts` | No auth context on login | `loadAuthorizationContext` after authenticate |

### Business Authorization — Migrated (Phase 1: server services)

| File | Was | Now |
|------|-----|-----|
| `discountService.ts` | `userRole !== 'ADMIN'`, `ROLE_LIMITS` by role name | Route guards + `discountPolicy.ts` permission tiers |
| `discountService.approveDiscount` | `MANAGER/ADMIN` role check | `assertUserPermission('sales.approve')` |
| `salesService.voidSale` | ADMIN force-void, `isManager()` | `admin.delete` force-void, `sales.approve` approvals |
| `salesService.refund` | `isManager()` approver | `assertUserPermission('sales.approve')` |
| `salesRepository.isManager()` | SQL on `users.role` | **Removed** |
| `deliveryService.assignDriver` | SQL `role IN (...)` | `userHasPermission('delivery.create')` |
| `authorization/serviceAuth.ts` | — | New helper for service-layer permission checks |

### Business Authorization — Migrated (Phase 2: routes + policies)

| File | Was | Now |
|------|-----|-----|
| `salesRoutes.ts` | Role-based scoping, legacy sales permission map | `shared/authorization/salesPolicy.ts` |
| `salesRoutes.ts` | `sanitizeSaleForRole(role)` | `sanitizeSaleFinancialFields(permissions)` |
| `glReconciliationService.ts` | `ADMIN/ACCOUNTANT/ADVISOR` advisor lock | `userHasPermission('accounting.period_manage')` |
| `grirClearingRoutes.ts` | authenticate only | `accounting.reconcile` / read permissions |
| `documentRoutes.ts` (PDF) | authenticate only | `requireDocumentPdfPermission()` per type |
| `documentFlowRoutes.ts` | authenticate only | `requireEntityFlowPermission()` per entity |
| `documentController.ts` | authenticate only | read/upload/delete permission guards |

### Business Authorization — Remaining (priority order)

| File | Pattern | Target permission/policy |
|------|---------|---------------------------|
| `sessionService.ts` | Parallel permission map | Deprecate; use RBAC keys |
| `middleware/auth.ts` | Deprecated `requirePermission` stub | Remove |

### Keep (non-business)

| File | Reason |
|------|--------|
| `authController.ts`, `quickLoginService.ts` | JWT payload includes role for display/sync |
| `twoFactorService.ts` | `ROLES_REQUIRING_2FA` — infrastructure policy |
| `userService.ts` | `mapRbacRoleToLegacy()` — admin bridge to `users.role` column |
| `auditContext.ts` + audit payloads | Auditing only |

---

## Client Audit Summary

| Pattern | Count | Status |
|---------|-------|--------|
| `ProtectedRoute` usages | ~100 | ✅ `requiredRoles` removed from routes |
| `user.role ===` business checks | ~3 | ✅ Migrated (display/cashier lockdown only) |
| `useCanAccess` | 18 | ✅ Permission-only (roles arg ignored) |
| `legacyRoleGrantsPermission` duplicate | 3 | ✅ Consolidated to shared module |

### Business Authorization — Migrated (Phase 3 + earlier)

| File | Was | Now |
|------|-----|-----|
| `App.tsx` (~100 routes) | `requiredRoles` on many routes | `requiredPermissions` only |
| `Layout.tsx` | ADMIN/MANAGER nav bypass | Permission + legacy fallback when RBAC empty |
| `ProductsPage.tsx`, `StockLevelsPage.tsx` | ADMIN/MANAGER warehouse bypass | `hasWarehouseNetworkAccess(permissions)` only |
| `POSPage.tsx`, `DiscountDialog.tsx` | `ROLE_LIMITS` by role | `useDiscountLimitPercent()` |
| `SalesPage.tsx`, `Dashboard.tsx` | `CASHIER` role scoping | `shouldRestrictSalesToOwnUser()` |
| `useFinancialControlAccess.ts` | `isAdmin` role check | `accounting.manage` permission |
| `QuickLoginScreen.tsx`, `QuickLoginSettings.tsx` | ADMIN/MANAGER | `system.update` |
| `SettingsPage.tsx`, `AccountingLayout.tsx` | ADMIN/MANAGER | `accounting.read` / `accounting.reconcile` |
| `AdminDataManagementPage.tsx` | Redundant ADMIN guard | Route `admin.delete` only |
| `DeliveryPage.tsx` | Role-filtered driver list | All users (server enforces `delivery.create`) |
| `authStore.ts` | Deprecated dual-state | Deleted |
| `ProtectedRoute.tsx` | Role OR permission OR legacy | Permission-first; roles only if no permissions |
| `InventoryAdjustmentsPage.tsx` | `ADMIN/MANAGER` | `useHasPermission('inventory.adjust')` |
| `OpenRegisterDialog.tsx` | `ADMIN/MANAGER` force-close | `useHasPermission('pos.approve')` |
| `QuotationsPage.tsx` | `ADMIN` re-open cancelled | `useHasPermission('quotations.update')` |
| `inventoryNavConfig.ts` | Local legacy map | `@shared/authorization/legacyRoleFallback` |
| `sessionService.ts` | Hardcoded role→permission map | `RbacService.buildAuthorizationContext()` |
| `middleware/auth.ts` | Legacy `requirePermission` stub | Removed |

### Keep (non-business)

| File | Reason |
|------|--------|
| `UserManagementTab.tsx` | Role badges, filters, display |
| `cashierLockdown.ts` | Cashier route allowlist (infrastructure) |
| `LoginPage.tsx` | Post-login path resolution |

---

## Acceptance Criteria

- [x] Zero business authorization decisions based on literal role names (client + server services)
- [x] Single centralized authorization engine (server + client)
- [x] Roles function only as permission bundles (RBAC admin UI unchanged)
- [x] Policy evaluators for store/transfer scope (`shared/authorization`)
- [ ] Comprehensive regression tests: permission change in admin UI → immediate access change
- [ ] Remove all duplicate legacy permission maps
- [ ] Close unprotected route gaps (documents, GR/IR clearing)

---

## Regression Test Plan

1. **Unit:** `SamplePOS.Server/src/authorization/authorizationService.test.ts` — legacy fallback, policies
2. **Integration:** Assign custom role with single permission; verify API + UI without role name match
3. **Admin UI:** Change role permissions → `refreshPermissions()` → route/button visibility updates
4. **Negative:** User with role renamed to "Front Desk" but same permissions — no breakage

Run server tests:
```bash
cd SamplePOS.Server && npm test -- authorizationService
```

---

## Migration Workflow (per decision)

1. Classify match in this document
2. Identify permission key in `rbac/permissions.ts` (add if missing)
3. Replace role check with `requirePermission` (route) or `AuthorizationService` (service)
4. Add policy evaluator if contextual (store, ownership, workflow)
5. Update client with `<Can permission="...">` or `useHasPermission`
6. Add proof test
7. Remove dead legacy helper

---

## Infrastructure Exception (allowed role checks)

These are **not** business permissions:

- System Owner / bootstrap account before RBAC init
- Super Administrator provisioning (`tenantService.ts`)
- 2FA requirement by legacy role during transition (`twoFactorService.ts`)
- Cashier path lockdown (`CashierPathGuard`, `cashierLockdown.ts`)

Once RBAC is initialized, even administrators are evaluated through permissions for business operations.
