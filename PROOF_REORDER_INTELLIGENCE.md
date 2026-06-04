# Reorder Intelligence — tested proof

Run:

```bash
npm run proof:reorder-intelligence
```

Optional:

```bash
BASE_URL=http://localhost:3001 TEST_EMAIL=... TEST_PASSWORD=... npm run proof:reorder-intelligence
```

## PASS criteria

| Layer | Check |
|-------|--------|
| Jest | `reorderDashboardLogic.test.ts` — 7/7 (priority rules, summary = array lengths, effective qty) |
| API | `GET /api/reports/reorder-dashboard` — `summary.*Count` equals each tab array length |
| API | `summary.itemsToReorderCount` present |
| API | No inactive OOS (zero sales, zero velocity, no min, no PO) in **urgent** bucket |
| API | `POST /api/reports/reorder-dashboard/pdf` — `application/pdf`, body > 500 bytes |
| API | Empty `productIds` → HTTP 400 |

## Last run (local dev)

**Date:** 2026-06-04  
**Command:** `npm run proof:reorder-intelligence`  
**Result:** **ALL PROOF PASSED**

### Jest

```
7 passed — classifyReorderPriority, buildReorderDashboardSummary, effectiveReorderQty
```

### Live API (localhost)

| Check | Result |
|-------|--------|
| urgent summary = array | 1 = 1 |
| high | 0 = 0 |
| medium | 0 = 0 |
| deadStock | 2631 = 2631 |
| itemsToReorderCount | 1 |
| inactive OOS in urgent | 0 |
| PDF export (1 line) | 2290 bytes |
| PDF empty rejection | PASS |

Sample summary from tenant DB at run time:

```json
{
  "urgent": 1,
  "high": 0,
  "medium": 0,
  "dead": 2631,
  "itemsToReorder": 1,
  "totalReorderCost": 11200000,
  "deadStockValue": 587487
}
```

Counts vary per tenant; structural checks must pass on every run.

## Production

After deploy, re-run with Henber credentials:

```powershell
$env:BASE_URL='https://henber.wizarddigital-inv.com'
$env:TEST_EMAIL='...'
$env:TEST_PASSWORD='...'
npm run proof:reorder-intelligence
```

UI: Reorder Intelligence → select rows → **Export PDF** (no PO required) → **Create Purchase Order**.
