# SMART cutover (opening balance) — proof & evidence

Per project rule: **passing proof scripts/evidence gate acceptance**.

## Problem sealed

Users confused **today’s outstanding** (calculated) with **cutover document total** (what replace overwrote). Mercy-class failure: replace with a screen figure instead of legacy debt math.

## Smart product contracts

| Mode | User types | Server does |
|------|------------|-------------|
| Post go-live cutover | Full cutover total | Create first OB |
| **Increase cutover** | **Delta only** (e.g. 50,000) | `documentTotal = prior + delta` |
| Rewrite full total | Full cutover total | Cancel + repost (migration) |

Summary API always returns both **currentOutstanding** and **cutover.documentTotal**.

## Evidence (no API required)

```bash
npm run proof:smart-cutover:evidence
```

Includes:

1. Vitest static evidence — UI modes, labels, API client, routes, service formulas  
2. Jest — `customerObReplaceImpact` (projected outstanding, confirm gate, no-cutover increase)  
3. Jest — Zod schemas including `CustomerOpeningBalanceIncreaseSchema`

## Local live proof (API required)

```bash
# Terminal 1
npm run dev:server

# Terminal 2
npm run proof:smart-cutover:local
# optional: still valid legacy first-post proof
npm run proof:customer-ob:local
```

Pass criteria for `proof:smart-cutover:local`:

1. Summary before cutover → `hasActiveCutover=false`  
2. POST cutover → `OB-*`  
3. Summary `documentTotal` = posted amount  
4. Second POST rejected  
5. POST `/increase` by `INCREASE_BY`  
6. New document total = first + increase  
7. Outstanding rises by increase (clean customer, no free cash)

Env: `BASE_URL`, `TEST_EMAIL`, `TEST_PASSWORD`, `OB_AMOUNT` (default 200000), `INCREASE_BY` (default 50000)

## Pass log (local reverify)

| Gate | Result |
|------|--------|
| `vitest` smart-cutover evidence | **7/7 PASS** |
| `jest` customerObReplaceImpact + schemas | **20/20 PASS** |
| `proof:customer-ob:local` | **13/13 PASS** |
| `proof:smart-cutover:local` | **22/22 PASS** (200k +50k → 250k) |
| `proof:smart-cutover:aggressive` | **105/105 PASS** |

Artifacts: `PROOF_SMART_CUTOVER.json`, `PROOF_SMART_CUTOVER_AGGRESSIVE.json`

Aggressive coverage: stacked increases, rewrite up/down, invalid inputs, independent customers, 10× rapid increase, Mercy 50k rewrite + restore, summary SSOT vs `customers.balance` after every mutation, `OB_INCREASE_NO_ACTIVE_CUTOVER`.

During first reverify: cutover **increase** failed once because `audit_log.action` CHECK rejects `INCREASE`. Fixed by storing `UPDATE` with `CUTOVER_INCREASE` tag / actionDetails `INCREASE cutover by …`.

## Source map

| Area | Path |
|------|------|
| Panel | `samplepos.client/src/components/accounting/OpeningBalancePanel.tsx` |
| Routes | `SamplePOS.Server/src/modules/customers/customerRoutes.ts` |
| Increase / summary | `customerService.increaseCustomerOpeningBalance`, `getCustomerCutoverSummary` |
| Zod | `shared/zod/customerOpeningBalance.ts` |
| Local proof | `scripts/proof-smart-cutover-local.mjs` |
| UI evidence | `samplepos.client/src/__tests__/smart-cutover-opening-balance.evidence.test.ts` |
