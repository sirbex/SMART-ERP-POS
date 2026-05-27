# Deployment and testing policy

**Principle:** Production deploys should only ship behaviour that is covered by automated checks (or explicitly signed-off manual QA with a ticket reference).

## What runs before merge / deploy today

| Gate | What it validates |
|------|-------------------|
| `npm run build` (server) | TypeScript compiles |
| `npm run lint` (server) | ESLint |
| Client `tsc -b && vite build` (pre-commit) | Client compiles |
| `npm run test:accounting` | Double-entry and reconciliation SQL against a DB with schema (skips if empty) |
| `npm test` (Jest) | Unit / integration tests under `SamplePOS.Server/src` (see `jest.config.cjs`) |

Pre-commit runs a subset of the above; CI should run the full matrix.

## Accounting-sensitive changes

For changes touching **AR/AP, GL, opening balance, balance sheet, or integrity**:

1. Add or extend **Jest** tests (schemas, pure logic, or repository mocks).
2. Where behaviour is SQL-heavy, extend **`src/tests/accounting-integrity.test.ts`** or add a focused proof script documented in the PR.
3. Do not rely on “works on my machine” for tenant-specific fixes (e.g. Henber); capture the invariant in automated form where possible.

## Opening balance APIs

Contract tests live in:

- `SamplePOS.Server/src/__tests__/openingBalanceSchemas.test.ts` — request body validation (shared Zod).
- `SamplePOS.Server/src/utils/ledgerNetActive.test.ts` — net-active ledger predicate used for BS / GPB rebuild alignment.

## Gaps (honest)

- **End-to-end** HTTP tests for `POST .../opening-balance/replace` with a real DB are not in CI by default; add when a stable test tenant or docker-compose test DB is available.
- **Manual journal** and **GL reverse** flows remain admin-only; document QA steps if UI changes.

## Recommendation for CI

Require `npm test` (or a named subset e.g. `npm run test:accounting-regression`) to pass on `main` before deploy workflow runs, and fail deploy if tests fail.
