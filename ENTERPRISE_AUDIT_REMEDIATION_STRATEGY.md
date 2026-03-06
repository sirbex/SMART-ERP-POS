# SMART-ERP-POS — Enterprise Audit & Remediation Strategy

**Classification**: Board-Level Technical Risk Assessment  
**Date**: 2026-03-05  
**Author**: Principal ERP Architect / Financial Systems Auditor  
**System**: SMART-ERP-POS Multi-Tenant SaaS  
**Codebase Snapshot**: 192 TypeScript source files | 69,120 LOC | 113+ DB tables | ~300 API endpoints

---

## 1. Executive Summary

### Production Readiness Score: 38/100 — NOT READY FOR ENTERPRISE DEPLOYMENT

| Domain | Score | Status |
|--------|-------|--------|
| Type Safety | 95/100 | PASS — Zero `any`, zero build errors |
| Layer Architecture | 25/100 | FAIL — Systemic boundary violations |
| Transaction Safety | 20/100 | FAIL — Critical financial atomicity gaps |
| Query Performance | 30/100 | FAIL — N+1 in every hot path |
| Code Reuse (DRY) | 25/100 | FAIL — 748 inline error patterns, 5 formatCurrency copies |
| Error Handling | 15/100 | FAIL — AppError exists, zero adoption |
| Production Hardening | 30/100 | CONDITIONAL — Auth, RBAC present but untested under concurrency |

**Bottom Line**: The system will produce **incorrect financial records** under concurrent load. Invoice creation, expense payment, and banking statement processing can silently corrupt data because multi-table mutations execute without transaction boundaries. A 10-item sale generates 80+ individual SQL queries. The codebase has a well-designed error handling framework that is used in exactly zero production endpoints.

### What Works

- TypeScript compilation: clean, zero `any` types
- Authentication / RBAC / multi-tenancy plumbing is in place
- Zod validation schemas exist and are connected
- PostgreSQL parameterized queries everywhere (no SQL injection risk)
- Decimal.js used for financial arithmetic (no floating-point currency bugs)
- Accounting double-entry model is structurally sound

### What Blocks Production Launch

1. **Financial data corruption risk** — 4 CRITICAL transaction safety gaps
2. **Performance collapse at scale** — N+1 queries multiply per-transaction cost by 10-80x
3. **20 services with zero repository layer** — impossible to unit test, swap DB, or audit queries
4. **748 inline error responses** — zero use of the existing centralized error framework
5. **No CI enforcement** — nothing prevents regression of any fixed issue

---

## 2. Severity Matrix

### CRITICAL — Data Corruption / Financial Loss Risk

| ID | Location | Issue | Impact |
|----|----------|-------|--------|
| C-1 | `invoiceService.createInvoice()` | Multi-table writes (invoice + N payments + recalc) via `pool` without transaction. Advisory xact locks are non-functional outside transactions. | Partial invoice records. Duplicate invoice numbers under concurrency. Payment records orphaned from invoices. |
| C-2 | `expenseService.markExpensePaid()` | Expense status UPDATE commits before bank transaction creation. If bank call fails, expense is permanently marked PAID with no bank record. | Ghost PAID expenses with no corresponding bank entry. GL out of balance. |
| C-3 | `bankingService.processStatementLine()` | Transaction committed early (line ~2339), then continues mutations via `pool.query()` — bank transaction created, statement line status update, pattern learning all execute outside atomicity. | Orphaned bank transactions. Statement lines stuck in wrong state. Unrecoverable reconciliation mismatches. |
| C-4 | `bankingService.completeStatement()` | Count check and status UPDATE on separate connections. Race: another process can modify line matches between check and update. | Statements marked complete with unmatched lines. |
| C-5 | `salesService` N+1 (3 patterns) | 80+ queries per 10-item sale. Product, UOM, batch lookups individually per item. Under 50 concurrent cashiers, the database will saturate. | System unusable at scale. Sale timeouts. Lost transactions. |

### HIGH — Operational Risk / Data Inconsistency

| ID | Location | Issue |
|----|----------|-------|
| H-1 | `bankingService.ts` (2,299 lines) | Entire banking module is monolithic — 100+ inline SQL queries, zero repository layer. Untestable and un-auditable. |
| H-2 | `depositsService.reverseDepositsForSale()` | Each deposit reversed in its own transaction. Partial reversal on failure. |
| H-3 | `expenseService.approveExpense()` / `rejectExpense()` | Status update and approval record are separate pool.query calls. |
| H-4 | `cashRegisterService.recordMovement()` | Cash movement and GL entry in separate transactions. Movement exists without GL posting on failure. |
| H-5 | `cashRegisterRepository.openSession()` | Session INSERT and opening float movement INSERT via separate connections. |
| H-6 | `pricingService.onCostChange()` | Tiers update in transaction, product price update outside it. Price/tier desync. |
| H-7 | `goodsReceiptService` finalization | ~140 queries for 20-item GR. 7 queries per line item in a loop. |
| H-8 | 20 services missing repositories | `bankingService`, `costLayerService`, `pricingService`, `journalEntryService`, `glValidationService`, `reconciliationService`, `profitLossReportService`, `sessionService`, `accountingPeriodService`, `billingService`, `syncService`, `refreshTokenService`, `twoFactorService`, `passwordPolicyService`, `pricingCacheService`, `settingsCacheService`, `reportCacheService`, `serviceItemHandler`, `glEntryService`, `accountingIntegrationService` |
| H-9 | `supplierPaymentRepository` | Contains business logic: invoice status determination via Decimal.js comparison, allocation validation with business error throws. |
| H-10 | `customerRepository.updateCustomerBalance()` | Balance mutation via `pool.query` — disconnected from the caller's transaction context. Concurrent calls interleave. |

### MEDIUM — Maintainability / Technical Debt

| ID | Location | Issue |
|----|----------|-------|
| M-1 | 748 inline `{ success: false }` | `errorHandler.ts` defines `AppError`, `NotFoundError`, `ValidationError`, `ConflictError`, `ForbiddenError`. None are used anywhere. |
| M-2 | 5 `formatCurrency` implementations | `customerController`, `invoiceController`, `reportsService`, `supplierPaymentRoutes`, `pdfGenerator` — while `Money.formatCurrency()` exists in `utils/money.ts`. |
| M-3 | 5 movement number generators | `salesService` (2x), `goodsReceiptService`, `stockMovementHandler`, `stockMovementRepository` — identical advisory lock + MAX pattern copy-pasted. |
| M-4 | 4 account code resolution patterns | `accountingRepository` (2x), `accountingCore` (2x) — per-line `SELECT "Id" FROM accounts WHERE "AccountCode" = $1` inside loops. |
| M-5 | 32 pagination reimplementations | Each endpoint builds its own `{ page, limit, total, totalPages }` with manual `Math.ceil`. |
| M-6 | 2 sale number generators | `salesRepository.generateSaleNumber()` (canonical) and `quotationService` inline duplicate. |
| M-7 | 8 duplicate customer lookups | `SELECT ... FROM customers WHERE id = $1` in 8 files instead of using `customerRepository.findById()`. |
| M-8 | 17 duplicate product lookups | `SELECT ... FROM products WHERE id = $1` in 9 files instead of a centralized repository. |
| M-9 | God-files | `reportsController.ts` (2,959 lines), `reportsRepository.ts` (2,780 lines), `bankingService.ts` (2,299 lines), `salesService.ts` (1,590 lines). |

### LOW — Code Hygiene

| ID | Location | Issue |
|----|----------|-------|
| L-1 | `erpAccountingRoutes.ts` (811 lines) | Route file with 5+ direct SQL queries and business logic for P&L reports. |
| L-2 | `accountingRoutes.ts` (803 lines) | 9 direct `pool.query` calls in route handlers including cash flow categorization logic. |
| L-3 | `rbac/seed.ts`, `rbac/repository.ts` | Per-row INSERT loops for permissions. Only runs at setup — low priority. |
| L-4 | `supplierController.ts` | 7 direct SQL queries duplicating logic from `supplierModule.ts`. |

---

## 3. Immediate Blockers for Production Deployment

These must be resolved before any tenant processes real financial data:

### Blocker 1: Invoice Creation Atomicity (C-1)

**Current**: `invoiceService.createInvoice()` calls THREE repository methods on a `pool` reference. Each call gets a random connection. Advisory xact locks release immediately because there is no surrounding transaction.

**Risk**: Under concurrent invoice creation (2+ cashiers), duplicate invoice numbers AND partial payment records.

**Fix**: Acquire `pool.connect()` → `BEGIN` → create invoice → loop payments → recalc → `COMMIT`. Pass `client` to all repository calls. Estimated effort: 2 hours.

### Blocker 2: Expense-to-Bank Atomicity (C-2)

**Current**: `markExpensePaid()` updates expense status to 'PAID' via pool.query (commits immediately), THEN calls `BankingService.createFromExpense()`. If the bank call fails, the expense is already committed as PAID.

**Risk**: Expense records show PAID with no bank transaction. GL permanently out of balance.

**Fix**: Single transaction: BEGIN → update expense → create bank entry → GL entries → COMMIT. Estimated effort: 3 hours (requires banking service to accept a transaction client).

### Blocker 3: Banking Statement Processing (C-3, C-4)

**Current**: `processStatementLine()` commits midway through the workflow. `completeStatement()` checks then updates on separate connections.

**Risk**: Orphaned bank transactions. Statements marked complete with unmatched lines. Manual reconciliation required.

**Fix**: Refactor to single-transaction-per-statement-line processing. Add `SELECT ... FOR UPDATE` on statement status checks. Estimated effort: 4 hours.

### Blocker 4: Sale Performance at Scale (C-5)

**Current**: A 10-item sale generates ~80 individual SQL round-trips. Product lookups, UOM conversions, batch queries, advisory locks, movement number generation — all per-item in a loop.

**Risk**: At 50 concurrent POS terminals, ~4,000 queries/second just for sales. PostgreSQL connection pool exhaustion, timeouts, abandoned carts.

**Fix**: Batch pre-fetch all product/UOM/batch data with `WHERE id = ANY($1)`. Pre-generate movement number sequences. Estimated effort: 6 hours.

---

## 4. Root Cause Analysis

### Why Layer Violations Are Systemic

The codebase grew module-by-module with each feature developer writing self-contained vertical slices. There was no enforced contract between layers. Result:

- **20 of 53 services (38%)** have zero corresponding repository and contain inline SQL
- **149 non-transactional `pool.query()` calls** exist in service files
- **37 direct SQL calls** exist in controllers and routes

The pattern is consistent: when a service needed data, the developer wrote a SQL query inline rather than adding a repository method. This was expedient but destroyed testability, auditability, and transaction composability.

### Why Transaction Gaps Exist

The `pool.query()` pattern is the root cause. In PostgreSQL's `pg` library:
- `pool.query(sql)` — checks out a connection, runs the query, returns the connection. **No transaction context.**
- `const client = await pool.connect(); client.query('BEGIN'); ...` — holds a connection for transactional work.

When services call repository methods passing `pool`, each repository call gets a **different connection**. There is no way to wrap them in a single transaction. The architecture needed a "unit of work" pattern from the start — it was never implemented.

### Why N+1 Queries Proliferate

The item-processing loops in `salesService`, `goodsReceiptService`, and `quotationService` were written imperatively: "for each item, look up the product, check the UOM, find the batch." This is logical from a business-flow perspective but catastrophic for database performance. No batch-fetch utilities exist.

### Why DRY Violations Accumulate

No shared utility layer was established. Each module reimplemented:
- Currency formatting (5 times)
- Movement number generation (5 times)
- Account code resolution (4 times)
- Customer/product lookups (8/17 times)
- Pagination (32 times)
- Error response construction (748 times)

Utilities exist (`Money.formatCurrency()`, `errorHandler.ts` with `AppError`) but were never adopted.

---

## 5. Architectural Target State

### Current State (Broken)
```
HTTP Request
  → Route/Controller (SOMETIMES has SQL, business logic)
    → Service (USUALLY has SQL directly)
      → Repository (SOMETIMES exists, SOMETIMES has business logic)
        → PostgreSQL
```

### Target State (Clean)
```
HTTP Request
  → Route (express wiring only)
    → Controller (req/res, validation, call service, format response)
      → Service (business logic, transaction orchestration via UnitOfWork)
        → Repository (parameterized SQL only, receives PoolClient)
          → PostgreSQL

Cross-cutting:
  → ErrorHandler middleware catches AppError subclasses → { success, data?, error? }
  → UnitOfWork provides transactional PoolClient to service methods
  → Shared utilities: Money, Pagination, SequenceGenerator, AccountResolver
```

### Unit of Work Pattern (New)

```typescript
// src/db/unitOfWork.ts
export class UnitOfWork {
  private client: PoolClient;

  static async run<T>(pool: Pool, work: (uow: UnitOfWork) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const uow = new UnitOfWork(client);
      const result = await work(uow);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  get db(): PoolClient { return this.client; }
}

// Usage in service:
async createInvoice(pool: Pool, data: CreateInvoiceInput) {
  return UnitOfWork.run(pool, async (uow) => {
    const invoice = await invoiceRepo.create(uow.db, data);
    for (const payment of data.payments) {
      await invoiceRepo.addPayment(uow.db, invoice.id, payment);
    }
    await invoiceRepo.recalculate(uow.db, invoice.id);
    return invoice;
  });
}
```

Every financial mutation service method takes `pool` and creates a UnitOfWork internally. All repository calls receive `uow.db` (the transactional `PoolClient`).

---

## 6. 30-Day Refactor Roadmap

### Phase 1: Financial Safety (Days 1-5) — BLOCK PRODUCTION WITHOUT THIS

**Goal**: Eliminate all CRITICAL data corruption risks.

| Day | Task | Files | Outcome |
|-----|------|-------|---------|
| 1 | Implement `UnitOfWork` utility | `src/db/unitOfWork.ts` (new) | Reusable transaction wrapper |
| 1 | Wrap `invoiceService.createInvoice()` in UnitOfWork | `invoiceService.ts` | C-1 resolved |
| 2 | Wrap `expenseService.markExpensePaid()` in UnitOfWork | `expenseService.ts` | C-2 resolved |
| 2 | Wrap `expenseService.approveExpense()` + `rejectExpense()` | `expenseService.ts` | H-3 resolved |
| 3 | Fix `bankingService.processStatementLine()` — single txn | `bankingService.ts` | C-3 resolved |
| 3 | Fix `bankingService.completeStatement()` — SELECT FOR UPDATE | `bankingService.ts` | C-4 resolved |
| 4 | Wrap `depositsService.reverseDepositsForSale()` in single txn | `depositsService.ts` | H-2 resolved |
| 4 | Wrap `cashRegisterService.recordMovement()` in single txn | `cashRegisterService.ts`, `cashRegisterRepository.ts` | H-4, H-5 resolved |
| 5 | Fix `pricingService.onCostChange()` — single txn | `pricingService.ts` | H-6 resolved |
| 5 | Fix `customerRepository.updateCustomerBalance()` — accept PoolClient | `customerRepository.ts` | H-10 resolved |
| 5 | Integration tests for all wrapped functions | Test files | Verify atomicity |

**Deliverable**: All financial mutations are transactionally safe. Zero risk of partial writes.

### Phase 2: Performance (Days 6-12)

**Goal**: Eliminate CRITICAL and HIGH N+1 query patterns.

| Day | Task | Files | Outcome |
|-----|------|-------|---------|
| 6-7 | Extract batch-fetch utilities | `productRepository.ts`, `uomRepository.ts` | `findByIds(pool, ids[])` for products, UOMs, batches |
| 7-8 | Refactor `salesService` item processing | `salesService.ts` L165-250 | Pre-fetch all products + UOMs in 2 queries instead of 30 |
| 8-9 | Refactor `salesService` inventory deduction | `salesService.ts` L648-800 | Pre-fetch batches + pre-generate movement numbers |
| 9-10 | Refactor `salesService` void restoration | `salesService.ts` L1564-1700 | Same batch pattern |
| 10-11 | Refactor `goodsReceiptService` finalization | `goodsReceiptService.ts` L397-570 | Pre-fetch products, batch sequence generation |
| 11-12 | Extract `generateMovementNumber()` shared utility | `src/utils/sequenceGenerator.ts` (new) | M-3 resolved — 5 copies → 1 |
| 12 | Extract `resolveAccountCodes()` batch utility | `src/utils/accountResolver.ts` (new) | M-4 resolved — 4 copies → 1 |

**Deliverable**: Sale creation goes from ~80 queries to ~12. GR finalization from ~140 to ~15. Movement and account code resolution centralized.

### Phase 3: Layer Architecture (Days 13-22)

**Goal**: Extract repository layer for the 20 services that bypass it.

| Day | Task | Files | Outcome |
|-----|------|-------|---------|
| 13-15 | Extract `bankingRepository.ts` from `bankingService.ts` | New `bankingRepository.ts` (~600 lines of SQL) | H-1 resolved. Banking testable. |
| 15-16 | Extract repo for `costLayerService`, `pricingService` | 2 new repository files | Layer compliance for pricing |
| 16-17 | Extract repo for `journalEntryService`, `glEntryService` | 2 new repository files | GL layer compliance |
| 17-18 | Extract repo for `glValidationService`, `reconciliationService` | 2 new repository files | Validation/reconciliation |
| 18-19 | Extract repo for `accountingPeriodService`, `profitLossReportService` | 2 new repository files | Accounting reports |
| 19-20 | Extract repo for `sessionService`, `refreshTokenService`, `twoFactorService` | 3 new repository files | Auth layer compliance |
| 20-21 | Move SQL out of `erpAccountingRoutes.ts` + `accountingRoutes.ts` | Existing services | L-1, L-2 resolved |
| 21-22 | Move SQL out of controllers: `supplierController`, `invoiceController`, `stockCountController`, `platformController`, `reportsController` | Move to existing services/repos | All controller SQL eliminated |

**Deliverable**: Every service delegates SQL to a repository. Repositories accept `PoolClient | Pool`. Zero `pool.query()` in controllers/routes.

### Phase 4: DRY & Error Handling (Days 23-30)

**Goal**: Consolidate duplicated logic and adopt centralized error handling.

| Day | Task | Files | Outcome |
|-----|------|-------|---------|
| 23 | Delete 4 local `formatCurrency` functions, import `Money.formatCurrency()` | 4 files | M-2 resolved |
| 23 | Delete inline sale number gen in `quotationService`, call `salesRepository.generateSaleNumber()` | `quotationService.ts` | M-6 resolved |
| 24 | Create `PaginationHelper.paginate()` utility | New `src/utils/pagination.ts` | M-5 resolved (32 → 1) |
| 25 | Adopt `PaginationHelper` in top-10 highest-traffic endpoints | 10 files | Immediate impact |
| 25-26 | Refactor customer lookups to `customerRepository.findById()` | 8 files | M-7 resolved |
| 26-27 | Refactor product lookups to `productRepository.findById()` / `findByIds()` | 9 files | M-8 resolved |
| 27-28 | Move business logic out of `supplierPaymentRepository` → `supplierPaymentService` | 2 files | H-9 resolved |
| 28-29 | Adopt `throw new AppError()` pattern in top-20 route files | 20 files | First wave: 748 → ~400 inline errors |
| 29-30 | Adopt `throw new AppError()` in remaining files | Remaining files | M-1 fully resolved |

**Deliverable**: Single implementations for every cross-cutting concern. Error handling fully centralized.

---

## 7. Transaction Architecture Standard

### Rule: Every Multi-Statement Mutation Uses UnitOfWork

```
ALLOWED:
  Single SELECT via pool.query()        ← OK, read-only
  Single INSERT/UPDATE via pool.query() ← OK ONLY for non-financial metadata

REQUIRED:
  Multi-table mutations                 → UnitOfWork.run()
  Financial mutations (any)             → UnitOfWork.run()
  Inventory mutations                   → UnitOfWork.run()
  Status + ledger combinations          → UnitOfWork.run()
  Advisory locks                        → MUST be inside UnitOfWork (xact locks)
```

### Transaction Boundary Ownership

| Layer | Transaction Responsibility |
|-------|--------------------------|
| Controller | NEVER starts transactions |
| Service | OWNS transaction lifecycle via UnitOfWork |
| Repository | RECEIVES `PoolClient` — never calls `pool.connect()` |

### Financial Mutation Checklist (Required for Every PR)

- [ ] Does this mutation create/modify financial records (invoices, payments, GL entries, bank transactions)?
- [ ] Is it wrapped in `UnitOfWork.run()`?
- [ ] Do ALL repository calls within it receive the UnitOfWork's `PoolClient`?
- [ ] Is there no `pool.query()` call between BEGIN and COMMIT?
- [ ] On failure, does every mutation roll back atomically?

---

## 8. Query Optimization Standard

### Rule: No Database Calls Inside Loops

```typescript
// FORBIDDEN PATTERN
for (const item of items) {
  const product = await productRepo.findById(client, item.productId);  // N+1
}

// REQUIRED PATTERN
const productIds = items.map(i => i.productId);
const products = await productRepo.findByIds(client, productIds);      // 1 query
const productMap = new Map(products.map(p => [p.id, p]));

for (const item of items) {
  const product = productMap.get(item.productId);                      // O(1) lookup
}
```

### Required Repository Methods (Every Entity)

Every repository that supports list operations must implement:

```typescript
findById(client: PoolClient, id: string): Promise<T | null>
findByIds(client: PoolClient, ids: string[]): Promise<T[]>  // WHERE id = ANY($1)
```

### Sequence Generation Standard

Movement numbers, batch numbers, invoice numbers, sale numbers — all must use a centralized utility:

```typescript
// src/utils/sequenceGenerator.ts
export async function generateSequenceNumber(
  client: PoolClient,
  lockKey: string,
  prefix: string,
  tableName: string,
  columnName: string
): Promise<string>
```

This replaces the 5 copy-pasted advisory lock + MAX patterns.

### Multi-Row Insert Standard

```typescript
// FORBIDDEN: Per-row INSERT in a loop
for (const item of items) {
  await client.query('INSERT INTO sale_items ...', [item.id, ...]);
}

// REQUIRED: Batched multi-row INSERT
const { placeholders, values } = buildMultiRowInsert(items, 6); // 6 columns
await client.query(`INSERT INTO sale_items (...) VALUES ${placeholders}`, values);
```

---

## 9. Repository Pattern Enforcement Standard

### Every Module Requires

```
src/modules/{module}/
  ├── controller.ts      # HTTP only: parse req, call service, build response
  ├── service.ts         # Business logic, UnitOfWork orchestration
  ├── repository.ts      # SQL only, receives PoolClient
  ├── routes.ts          # Express route wiring
  └── types.ts           # Module-specific interfaces
```

### Repository Rules

| Rule | Rationale |
|------|-----------|
| Accept `PoolClient \| Pool` as first argument | Supports both transactional and standalone usage |
| Return typed interfaces, not `Record<string, unknown>` | Type safety at boundary |
| No `new Decimal()`, no business conditionals | Financial logic belongs in services |
| No `throw new Error('not found')` | Return `null`, let service decide |
| No `pool.connect()` | Services manage connections |

### Service Rules

| Rule | Rationale |
|------|-----------|
| No `pool.query()` or `client.query()` for data operations | Use repository methods |
| `client.query('BEGIN/COMMIT/ROLLBACK')` allowed only inside UnitOfWork | Transaction orchestration is a service responsibility |
| All financial mutations wrapped in UnitOfWork | Atomicity guarantee |
| Business errors thrown as `AppError` subclasses | Centralized handling |

### Controller Rules

| Rule | Rationale |
|------|-----------|
| No `pool.query()` calls ever | Controllers don't touch the database |
| No `client.query()` calls ever | No transaction management |
| No `new Decimal()` calculations | No business logic |
| Call exactly one service method | Single responsibility |
| Error responses via `throw new AppError()` | Centralized error handler formats response |

---

## 10. Regression Prevention Strategy

### ESLint Rules (New)

```javascript
// .eslintrc additions
{
  "rules": {
    // Custom rule: no pool.query in *Controller.ts or *Route*.ts files
    "no-restricted-syntax": [
      "error",
      {
        "selector": "CallExpression[callee.property.name='query']",
        "message": "Direct SQL queries are forbidden in controllers and routes. Use service/repository methods."
      }
    ]
  },
  "overrides": [
    {
      "files": ["**/modules/**/controller.ts", "**/routes/**/*.ts"],
      "rules": {
        "no-restricted-imports": ["error", {
          "patterns": ["pg", "*/db/pool*"]
        }]
      }
    }
  ]
}
```

### PR Checklist (Required for Every PR)

```markdown
## Architecture Compliance

- [ ] No `pool.query()` in controllers or routes
- [ ] No `pool.query()` for data operations in services (use repository)
- [ ] Multi-table mutations wrapped in `UnitOfWork.run()`
- [ ] No database calls inside loops (batch-fetch with `findByIds`)
- [ ] No new `formatCurrency` — use `Money.formatCurrency()`
- [ ] No new movement/sequence generators — use `generateSequenceNumber()`
- [ ] No inline `{ success: false }` — throw `AppError` subclass
- [ ] No `new Decimal()` in repository files
- [ ] All new repository methods accept `PoolClient | Pool` as first param
- [ ] File under 500 lines (or justification provided)

## Financial Safety (if applicable)

- [ ] All financial mutations are transactional (UnitOfWork)
- [ ] Customer balance updates receive the caller's PoolClient
- [ ] GL entries created in the same transaction as the business event
- [ ] Advisory locks are inside a transaction (xact locks)
- [ ] No early COMMIT before workflow completion
```

### CI Pipeline Gates

| Gate | Tool | Failure Condition |
|------|------|-------------------|
| Build | `tsc --noEmit` | Any TypeScript error |
| Lint | ESLint custom rules | `pool.query` in controllers/routes |
| File Size | Custom script | Any `.ts` file > 800 lines (warning at 500) |
| `any` Check | `grep -r '\bany\b'` | Any TypeScript `any` type in `src/` |
| Layer Check | Custom script | `pool.query` in files matching `*Controller*` or `*Route*` |
| Transaction Check | Custom script | `INSERT\|UPDATE\|DELETE` in service files without `BEGIN` in same function |

### Architecture Decision Records (ADRs)

After completing each phase, record:

| ADR | Topic |
|-----|-------|
| ADR-001 | UnitOfWork as the transaction boundary standard |
| ADR-002 | Repository-first data access policy |
| ADR-003 | Batch-fetch requirement for loop operations |
| ADR-004 | AppError hierarchy as the sole error response mechanism |
| ADR-005 | Shared utility mandate (Money, Pagination, SequenceGenerator) |

---

## Appendix A: File-Level Remediation Map

### Files Requiring Immediate Transaction Fixes (Phase 1)

| File | Current Lines | Action |
|------|--------------|--------|
| [invoiceService.ts](SamplePOS.Server/src/modules/invoices/invoiceService.ts) | ~600 | Wrap `createInvoice()` in UnitOfWork |
| [expenseService.ts](SamplePOS.Server/src/services/expenseService.ts) | ~290 | Wrap `markExpensePaid()`, `approveExpense()`, `rejectExpense()` in UnitOfWork |
| [bankingService.ts](SamplePOS.Server/src/services/bankingService.ts) | 2,299 | Fix `processStatementLine()` + `completeStatement()` transaction boundaries |
| [depositsService.ts](SamplePOS.Server/src/modules/deposits/depositsService.ts) | ~370 | Wrap `reverseDepositsForSale()` in single outer transaction |
| [cashRegisterService.ts](SamplePOS.Server/src/modules/cash-register/cashRegisterService.ts) | 905 | Wrap `recordMovement()`, fix `forceCloseSession()` |
| [cashRegisterRepository.ts](SamplePOS.Server/src/modules/cash-register/cashRegisterRepository.ts) | 797 | Fix `openSession()` to accept PoolClient |
| [pricingService.ts](SamplePOS.Server/src/services/pricingService.ts) | ~460 | Wrap `onCostChange()` in UnitOfWork |
| [customerRepository.ts](SamplePOS.Server/src/modules/customers/customerRepository.ts) | ~580 | `updateCustomerBalance()` accepts PoolClient |

### Files Requiring N+1 Fixes (Phase 2)

| File | Current Lines | Current Queries/Op | Target |
|------|--------------|-------------------|--------|
| [salesService.ts](SamplePOS.Server/src/modules/sales/salesService.ts) | 1,590 | ~80/sale | ~12/sale |
| [goodsReceiptService.ts](SamplePOS.Server/src/modules/goods-receipts/goodsReceiptService.ts) | 819 | ~140/GR | ~15/GR |
| [quotationService.ts](SamplePOS.Server/src/modules/quotations/quotationService.ts) | 775 | ~15/quote | ~5/quote |
| [accountingCore.ts](SamplePOS.Server/src/services/accountingCore.ts) | ~700 | 2/line | 1 batch |
| [accountingRepository.ts](SamplePOS.Server/src/repositories/accountingRepository.ts) | 1,096 | 2/line | 1 batch |
| [purchaseOrderService.ts](SamplePOS.Server/src/modules/purchase-orders/purchaseOrderService.ts) | ~530 | 1/item | 1 batch |

### Files Requiring Repository Extraction (Phase 3)

| Service File | Lines of SQL to Extract | New Repository |
|-------------|------------------------|----------------|
| [bankingService.ts](SamplePOS.Server/src/services/bankingService.ts) | ~600 | `bankingRepository.ts` |
| [costLayerService.ts](SamplePOS.Server/src/services/costLayerService.ts) | ~150 | `costLayerRepository.ts` |
| [pricingService.ts](SamplePOS.Server/src/services/pricingService.ts) | ~80 | `pricingRepository.ts` |
| [journalEntryService.ts](SamplePOS.Server/src/services/journalEntryService.ts) | ~100 | `journalEntryRepository.ts` |
| [glEntryService.ts](SamplePOS.Server/src/services/glEntryService.ts) | ~200 | `glEntryRepository.ts` |
| [glValidationService.ts](SamplePOS.Server/src/services/glValidationService.ts) | ~100 | `glValidationRepository.ts` |
| [reconciliationService.ts](SamplePOS.Server/src/services/reconciliationService.ts) | ~80 | `reconciliationRepository.ts` |
| [sessionService.ts](SamplePOS.Server/src/services/sessionService.ts) | ~100 | `sessionRepository.ts` |
| [accountingPeriodService.ts](SamplePOS.Server/src/services/accountingPeriodService.ts) | ~80 | `accountingPeriodRepository.ts` |

---

## Appendix B: Quantified Risk Under Concurrent Load

**Scenario**: 50 POS terminals, 3 accountants, 2 procurement officers, mid-day peak.

| Operation | Concurrent Users | Current Queries | Per-Second DB Load | Risk |
|-----------|-----------------|-----------------|-------------------|------|
| Sale (10 items) | 50 | 80 each | 4,000 q/s | Connection pool exhaustion |
| GR (20 items) | 2 | 140 each | 280 q/s | Slow but functional |
| Invoice creation | 3 | 8 each (non-atomic) | 24 q/s | Duplicate numbers, partial records |
| Bank statement import (100 lines) | 1 | 300+ (non-atomic) | 300 q/s | Orphaned transactions |
| **Total** | — | — | **~4,600 q/s** | **Pool limit: typically 20-50 connections** |

**After Phase 1+2 remediation**:

| Operation | Queries | Per-Second DB Load |
|-----------|---------|-------------------|
| Sale (10 items) | 12 | 600 q/s |
| GR (20 items) | 15 | 30 q/s |
| Invoice creation | 4 (atomic) | 12 q/s |
| Bank import (100 lines) | 200 (atomic per line) | 200 q/s |
| **Total** | — | **~842 q/s** (82% reduction) |

---

## Appendix C: Effort Estimation

| Phase | Calendar Days | Engineer-Days | Risk Reduction |
|-------|--------------|---------------|----------------|
| Phase 1: Financial Safety | 5 | 5 | Eliminates all CRITICAL data corruption |
| Phase 2: Performance | 7 | 7 | 82% query reduction on hot paths |
| Phase 3: Layer Architecture | 10 | 10 | Full testability, audit compliance |
| Phase 4: DRY & Error Handling | 8 | 8 | Maintenance cost reduction |
| **Total** | **30** | **30** | Production-ready ERP |

---

**END OF REPORT**

*This document should be reviewed with the engineering team before starting Phase 1. Any work on new features should be frozen until Phase 1 is complete.*
