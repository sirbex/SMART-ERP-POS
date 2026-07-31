# Order Complete Idempotency — Soak Proof (P1)

Run: 2026-07-31T04:52:03.050Z

Mode: LIVE_DB

Gate: Measure → Prove → Refactor. No production push from this script.


## Gate A — Structural evidence

- **PASS** orderCompleteIdempotency.evidence.test.ts
- **PASS** orderCompleteSoak.live.test.ts (LIVE)

## Gate B — Live DB soak scenarios

- **PASS** Connected — db=pos_system sale_seq=true users=8

### 1. Duplicate submit (same key)

- attempts=8 winners=1 idempotent_replays=7 fails=0 unique_sale_ids=1
- **PASS** Duplicate submit → exactly one sale — sale=SALE-SOAK-D-1785473527640-0-2fi6

### 2. Network retry after commit

- **PASS** Retry same key returns existing sale — lookup=0.6ms
- **PASS** Retry created no second sale

### 3. Crash recovery (ROLLBACK before commit)

- **PASS** Pre-commit crash leaves no sale (replay can create exactly once later)
- **PASS** Post-crash replay produces exactly one sale — SALE-SOAK-C2-1785473527870

### 4. Concurrent cashiers (different orders + FOR UPDATE)

- same-order race winners≈1 orderB_ok=1 salesA=1 salesB=1
- **PASS** Concurrent cashiers → one sale per order — A=1 B=1
- **PASS** Unique document numbers under concurrency

### 5. Metrics baseline

- sequence nextval ms: p50=0.40 p95=0.50 p99=1.00 max=1.00 n=50
- order FOR UPDATE ms: p50=10.16 p95=11.45 n=3
- idempotency hit rate: 88.9% (hits=8/9)
- unique_violations(handled)=7 deadlocks=0 retries=7
- **PASS** Sequence allocation p95 < 50ms — 0.50ms
- **PASS** No deadlocks during soak

## Verdict

- PASS=12 FAIL=0 PENDING=0
- **VERDICT: SOAK PASS (live)** — safe to consider commit after human review; still no auto-deploy.
