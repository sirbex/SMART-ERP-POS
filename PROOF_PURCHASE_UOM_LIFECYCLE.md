# PROOF — Purchase UoM Lifecycle (Closing Case)

**Generated:** 2026-07-03T08:39:50.742Z
**Branch:** 
**Commit:** 

## Summary

| Result | **FAIL** |
| Sections | 5 |
| Failed | 1 |

## Scope

Closes the Purchase UoM / Product UoM SSOT gap:

- `updateProductUom()` wrapped in `UnitOfWork.runOrJoin()` (atomic)
- `products.purchase_uom_id` repointed when the edited Product UoM row is the active Purchase UoM
- Product Form Purchase UoM restricted to configured Product UoMs
- Orphan audit + repair scripts for deployment
- Regression tests for rename, non-purchase edit, removal block, orphan repair

## Verification matrix

| Check | Design | Proof |
|-------|--------|-------|
| Historical PO/GR lines immutable | Line-level `uom_id` snapshot | No writes to `purchase_order_items` / `goods_receipt_items` in this change |
| Stock / valuation unaffected | MUoM metadata only | E2E creates/deletes proof product only; no batch writes |
| Atomic PATCH | `UnitOfWork.runOrJoin` | Jest + DB E2E |
| Purchase UoM sync on rename | `setProductPurchaseUomId` | DB E2E step `purchase_uom_id_repointed` |
| Legacy orphans | repair script | Tenant audit sections below |

## Section results

### PASS — Jest regression suite (5 files)

27 passed, 0 failed

<details>
<summary>Raw output</summary>

```
      at _log (node_modules/dotenv/lib/main.js:142:11)

    console.log
      [dotenv@17.2.3] injecting env (9) from .env -- tip: ✅ audit secrets and track compliance: https://dotenvx.com/ops

      at _log (node_modules/dotenv/lib/main.js:142:11)

A worker process has failed to exit gracefully and has been force exited. This is likely caused by tests leaking due to improper teardown. Try running with --detectOpenHandles to find leaks. Active timers can also cause this, ensure that .unref() was called on them.

Test Suites: 5 passed, 5 total
Tests:       27 passed, 27 total
Snapshots:   0 total
Time:        3.064 s
Ran all test suites matching src/modules/products/uomService.purchaseUomLifecycle.test.ts|src/modules/products/productPurchaseUomIntegrity.test.ts|src/modules/products/productService.muomIntegrity.test.ts|src/modules/products/productService.procurement.test.ts|src/modules/products/uomService.test.ts.
Force exiting Jest: Have you considered using `--detectOpenHandles` to detect async operations that kept running after all tests finished?
```

</details>

### FAIL — Server TypeScript check (products MUoM)

node_modules/vm2/index.d.ts(2,8): error TS1192: Module '"fs"' has no default export.
node_modules/vm2/index.d.ts(3,8): error TS1259: Module '"path"' can only be default-imported using the 'esModuleIn

<details>
<summary>Raw output</summary>

```
s(4,8): error TS1259: Module '"C:/Users/Chase/source/repos/SamplePOS/SamplePOS.Server/node_modules/winston/index"' can only be default-imported using the 'esModuleInterop' flag
src/utils/logger.ts(5,8): error TS1259: Module '"path"' can only be default-imported using the 'esModuleInterop' flag
src/utils/logger.ts(8,34): error TS1343: The 'import.meta' meta-property is only allowed when the '--module' option is 'es2020', 'es2022', 'esnext', 'system', 'node16', 'node18', 'node20', or 'nodenext'.
```

</details>

### PASS — Tenant audit — purchase UoM orphans

0 orphan(s) — PASS (0 expected post-repair)

<details>
<summary>Raw output</summary>

```
> samplepos@1.0.0 audit:muom-purchase-uom-orphans
> node scripts/repair-muom-purchase-uom-orphans.mjs --dry-run

=== repair-muom-purchase-uom-orphans [AUDIT] ===

Orphaned purchase UoMs: 0

Nothing to repair.
```

</details>

### PASS — Tenant audit — purchase UoM integrity gap

0 gap(s) — PASS

<details>
<summary>Raw output</summary>

```
> samplepos@1.0.0 audit:muom-purchase-uom-gap
> node scripts/audit-muom-purchase-uom-gap.mjs

=== MUoM audit: purchase UoM integrity gaps ===

Found 0 product(s)

PASS — expected 0 rows
```

</details>

### PASS — DB E2E — PATCH rename repoints purchase_uom_id

PASS — 9 steps, sku=PROOF-PUM-1783068005651

<details>
<summary>Raw output</summary>

```
[dotenv@17.2.3] injecting env (13) from .env -- tip: ⚙️  write to custom object with { processEnv: myObject }
2026-07-03 11:40:05 [[32minfo[39m]: [32mBR-PRC-001: Cost price validation passed[39m
2026-07-03 11:40:05 [[32minfo[39m]: [32mBR-PRC-002: Selling price validation passed[39m
2026-07-03 11:40:05 [[32minfo[39m]: [32mProduct created successfully (transaction committed)[39m
{"ok":true,"steps":[{"step":"master_uoms_exist","ok":true,"detail":"count=14"},{"step":"create_product_with_purchase_uom","ok":true,"detail":"733ac0c1-8162-4e60-8854-da4185634d30"},{"step":"purchase_uom_row_exists","ok":true,"detail":"3da821f4-aea9-4150-b884-619ca2b98167"},{"step":"purchase_uom_id_before","ok":true,"detail":"expected=2a5e14b0 got=2a5e14b0"},{"step":"patch_product_uom_rename","ok":true,"detail":"BOTTLE → Box"},{"step":"purchase_uom_id_repointed","ok":true,"detail":"expected=78bf1928 got=78bf1928"},{"step":"integrity_valid_after_rename","ok":true,"detail":"{\"effectivePoUomId\":\"78bf1928-1113-4208-a688-059ca75a9b7c\",\"purchaseUomLabel\":\"BOX\"}"},{"step":"product_uoms_has_target","ok":true,"detail":"target=true stale=false"},{"step":"cleanup_delete_product","ok":true,"detail":"PROOF-PUM-1783068005651"}],"sku":"PROOF-PUM-1783068005651","productId":"733ac0c1-8162-4e60-8854-da4185634d30"}
```

</details>

## Pre-deploy checklist (operator)

```bash
npm run audit:muom-purchase-uom-orphans
npm run repair:muom-purchase-uom-orphans -- --sku=<SKU> --factor=<N> --execute
npm run audit:muom-purchase-uom-gap
npm run proof:purchase-uom-lifecycle
```

## Sign-off

1 section(s) failed — resolve before production sign-off.