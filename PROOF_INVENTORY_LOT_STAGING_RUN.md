# Inventory Lot — Staging Proof (Gates C + D)

Run: 2026-07-07T07:03:02.865Z

Charter: [PROOF_INVENTORY_LOT_CERTIFICATION.md](./PROOF_INVENTORY_LOT_CERTIFICATION.md)


## Gate C — Performance (staging)

- **PASS** In-memory FEFO 5k benchmark
- **PASS** Connected for staging benchmarks — batches=10005 balances=4
- FEFO-style load query (500 rows): **8 ms**
- **PASS** FEFO load query p95 target (< 500 ms)
- **PASS** Production-scale row count threshold — 10005 active batches

## Gate D — Concurrency (staging)

- **PASS** Structural lock-order proofs
- **PASS** Live race suite (LOT_PROOF_CONCURRENCY=1)
- **PASS** Live scenario — Two cashiers, last batch — exactly one sale succeeds
- **PASS** Live scenario — Transfer + sale on same lot — no double-spend
- **PASS** Live scenario — Receipt + expiry correction — no lost update
- **PASS** Live scenario — Deadlock monitor — pg_locks / deadlock_detected

## Summary

Pass: 10 | Fail: 0 | Pending: 0
