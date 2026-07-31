# Checkout Profile — P4 Measure Run

Run: 2026-07-31T05:37:04.260Z

BASE_URL=http://localhost:3001 CONCURRENCY=1 ITERATIONS=12 QTY=1

Rule: Measure → Prove → Refactor. No TX scope change in this run.

- **PASS** API health — http://localhost:3001
- **PASS** Login
- cashRegisterSessionId=a54f0ce3-a36d-449a-9ae1-1b647d5acfec
- sellingStoreId=9a0fb60c-f1e3-47c9-896f-f93fb7b3f276
- **FIXTURE** moved 14 OH MAIN→SELLING for Abchlor eye droped (coupling-preserving)
- **PASS** Product selected — Abchlor eye droped price=4200 avail≈27 iters=12
- **PASS** DB connected for integrity — qty_on_hand_before=197
- **PASS** Pending orders created — 12

## HTTP complete load

- completes_ok=12/12 errors=0
- HTTP latency ms: p50=109.0 p95=223.8 p99=223.8 max=223.8 mean=120.9 n=12
- **PASS** All completes succeeded
- **PASS** HTTP p95 under prior 30s timeout — 223.8ms

## In-TX phase ranking (X-Checkout-Profile)

- **PASS** Phase profiles collected — 12 samples
| Phase | p50 | p95 | p99 | max | mean |
|-------|-----|-----|-----|-----|------|
| fefo_stock | 18.6 | 44.7 | 44.7 | 44.7 | 21.6 |
| gl_posting | 32.5 | 43.1 | 43.1 | 43.1 | 33.7 |
| line_prep | 6.6 | 22.3 | 22.3 | 22.3 | 8.6 |
| cost_layers_summaries | 5.1 | 12.4 | 12.4 | 12.4 | 5.8 |
| persist_sale_header | 4.0 | 9.7 | 9.7 | 9.7 | 4.7 |
| persist_sale_items | 2.5 | 9.2 | 9.2 | 9.2 | 3.4 |
| pricing_engine | 2.5 | 8.1 | 8.1 | 8.1 | 3.2 |
| recipe_explode | 0.8 | 6.5 | 6.5 | 6.5 | 1.5 |
| uom_resolve | 4.0 | 6.3 | 6.3 | 6.3 | 4.3 |
| order_complete_coupling | 4.1 | 5.1 | 5.1 | 5.1 | 4.1 |
| commit | 0.6 | 5.1 | 5.1 | 5.1 | 1.6 |
| post_commit | 2.6 | 4.6 | 4.6 | 4.6 | 3.1 |
| session_policy | 0.9 | 4.1 | 4.1 | 4.1 | 1.4 |
| product_prefetch | 0.8 | 2.8 | 2.8 | 2.8 | 1.0 |
| payments_ar | 0.9 | 2.0 | 2.0 | 2.0 | 1.1 |
| order_lock | 0.7 | 1.9 | 1.9 | 1.9 | 0.9 |
| begin | 0.2 | 0.8 | 0.8 | 0.8 | 0.3 |

- **Hottest phases:** fefo_stock(p95=44.7ms), gl_posting(p95=43.1ms), line_prep(p95=22.3ms), cost_layers_summaries(p95=12.4ms), persist_sale_header(p95=9.7ms)
- **PASS** Hotspot ranking produced — fefo_stock(p95=44.7ms)

## Database locks, pool, integrity

- pg_stat_activity waits:
  - Client/ClientRead: 3
  - none/none: 1
- connections: total=4 active=1 idle=3 lock_waiters=0
- **PASS** Collected connection/wait snapshot
- inventory: before=197 after=185 expected_drop=12 actual_drop=12
- **PASS** Inventory drop matches completes
- GL for profile sales: journals=24 debit=74400 credit=74400 |debit-credit|=0.0000
- **PASS** GL balanced for profiled sales
- **PASS** No duplicate sales per order

## Verdict

- PASS=13 FAIL=0
- **VERDICT: PROFILE PASS** — use hottest phases to guide P5 only if SLO still missed.
- **Deploy gate:** still WAIT — this is measurement evidence; HTTP FEFO+GL load baseline captured.
