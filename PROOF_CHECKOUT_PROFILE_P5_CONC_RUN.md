# Checkout Profile — P4 Measure Run

Run: 2026-07-31T05:37:23.463Z

BASE_URL=http://localhost:3001 CONCURRENCY=4 ITERATIONS=12 QTY=1

Rule: Measure → Prove → Refactor. No TX scope change in this run.

- **PASS** API health — http://localhost:3001
- **PASS** Login
- cashRegisterSessionId=a54f0ce3-a36d-449a-9ae1-1b647d5acfec
- sellingStoreId=9a0fb60c-f1e3-47c9-896f-f93fb7b3f276
- using existing coupled SELLING stock for Abchlor eye droped
- **PASS** Product selected — Abchlor eye droped price=4200 avail≈15 iters=12
- **PASS** DB connected for integrity — qty_on_hand_before=185
- **PASS** Pending orders created — 12

## HTTP complete load

- completes_ok=4/12 errors=8
- HTTP latency ms: p50=199.4 p95=458.8 p99=458.8 max=458.8 mean=242.0 n=12
- sample errors: `{"success":false,"error":"Inventory accounting mismatch (sale SALE-2026-0151). Transaction rolled back.","error_code":"ERR_INVENTORY_GL_COUPLING","details":{"context":"sale SALE-2026-0151","gapBefore":-1701920,"gapAfter":-1703920,"deltaGap"`
- **FAIL** All completes succeeded — 4/12
- **PASS** HTTP p95 under prior 30s timeout — 458.8ms

## In-TX phase ranking (X-Checkout-Profile)

- **PASS** Phase profiles collected — 4 samples
| Phase | p50 | p95 | p99 | max | mean |
|-------|-----|-----|-----|-----|------|
| fefo_stock | 23.1 | 198.4 | 198.4 | 198.4 | 91.1 |
| gl_posting | 25.0 | 38.7 | 38.7 | 38.7 | 28.3 |
| line_prep | 6.3 | 8.9 | 8.9 | 8.9 | 6.9 |
| post_commit | 2.0 | 7.9 | 7.9 | 7.9 | 3.5 |
| uom_resolve | 2.9 | 5.6 | 5.6 | 5.6 | 4.0 |
| cost_layers_summaries | 3.5 | 5.3 | 5.3 | 5.3 | 3.9 |
| persist_sale_header | 3.2 | 4.7 | 4.7 | 4.7 | 3.6 |
| order_complete_coupling | 2.7 | 3.9 | 3.9 | 3.9 | 2.9 |
| persist_sale_items | 1.9 | 3.8 | 3.8 | 3.8 | 2.7 |
| commit | 0.5 | 3.5 | 3.5 | 3.5 | 1.3 |
| pricing_engine | 1.7 | 2.9 | 2.9 | 2.9 | 2.2 |
| session_policy | 1.0 | 1.6 | 1.6 | 1.6 | 1.1 |
| payments_ar | 0.7 | 1.2 | 1.2 | 1.2 | 0.9 |
| product_prefetch | 0.7 | 1.1 | 1.1 | 1.1 | 0.8 |
| recipe_explode | 0.9 | 1.0 | 1.0 | 1.0 | 0.8 |
| begin | 0.2 | 1.0 | 1.0 | 1.0 | 0.4 |
| order_lock | 0.5 | 0.9 | 0.9 | 0.9 | 0.6 |

- **Hottest phases:** fefo_stock(p95=198.4ms), gl_posting(p95=38.7ms), line_prep(p95=8.9ms), post_commit(p95=7.9ms), uom_resolve(p95=5.6ms)
- **PASS** Hotspot ranking produced — fefo_stock(p95=198.4ms)

## Database locks, pool, integrity

- pg_stat_activity waits:
  - Client/ClientRead: 6
  - none/none: 1
- connections: total=7 active=1 idle=6 lock_waiters=0
- **PASS** Collected connection/wait snapshot
- inventory: before=185 after=181 expected_drop=4 actual_drop=4
- **PASS** Inventory drop matches completes
- GL for profile sales: journals=8 debit=24800 credit=24800 |debit-credit|=0.0000
- **PASS** GL balanced for profiled sales
- **PASS** No duplicate sales per order

## Verdict

- PASS=12 FAIL=1
- **VERDICT: FAIL** — fix before considering deploy.
- **Deploy gate:** still WAIT — this is measurement evidence; HTTP FEFO+GL load baseline captured.
