# Bad Debt — Phase 4 Certification Proof Run

Run: 2026-07-14T20:09:15.751Z

Mode: STRICT (certification)

Charter: [PROOF_BAD_DEBT_CHARTER.md](./PROOF_BAD_DEBT_CHARTER.md)

ADR: [docs/architecture/BAD_DEBT_ADR.md](./docs/architecture/BAD_DEBT_ADR.md)


## Gate A — Architecture

- **PASS** A-fitness — ci:bad-debt-fitness
- **PASS** A-fitness-strict — strict
- **PASS** A-architecture-jest — bad-debt proof tests
- **PASS** A-03 — no NOT_STARTED touchpoints
- **PASS** A-02 — registry BD10–BD16 present

## Gate B — Financial Integrity

- **PASS** B-01 BD-INV-1/9 — posting proof: DR 5210 / CR 1200 shape + expense account asserts
- **PASS** B-03 BD-INV-3 — same-TX settlement + syncCustomerBalanceFromInvoices (service + fitness)
- **PASS** B-04 — 4010/6900/5110–5130 rejected (posting proof)
- **PASS** B-02 BD-INV-6 — orphan scan module + allow-list; heal never invents AR_WRITEOFF
- **PASS** B-05 BD-INV-10 — AR integrity remains open-item vs GL framework lane (write-offs in settlement SSOT)

## Gate C — Operations

- **PASS** C-01/C-05 — post + reverse gateway
- **PASS** C-02/C-03 — ceiling / partial residual gated
- **PASS** C-04 — multi-invoice allocation lines supported
- **PASS** C-06 — advisory lock + FOR UPDATE on invoices
- **PASS** C-07 — CN rejects uncollectible reasons; commercial CN path intact
- **PASS** C-UI — ops UI post/reverse wired

## Gate D — Performance & Concurrency

- **PASS** D-concurrency-structural — pg_advisory_xact_lock + invoice FOR UPDATE + residual ceiling
- **WAIVER** BD-D-W01: Staging latency for single write-off post (<2s) and 1k workqueue list (<3s) not measured in this CI run — measure on first staging enablement of bad_debt_writeoff_enabled (expires 2026-09-30; Engineering (Phase 4E) — accepted pending staging baseline)
- **WAIVER** BD-D-W02: 10-way concurrent double-write-off race not load-tested in CI; structural lock + ceiling proven in service path (expires 2026-09-30; Engineering (Phase 4E) — accepted; staging soak when flag enabled)

## Gate E — Governance & Audit

- **PASS** E-01/E-04 — mutations accounting.manage; reads accounting.read (reverse same elevated manage)
- **PASS** E-02 — correction via AR_WRITEOFF_REVERSAL document
- **PASS** E-03 — ar_writeoff_audit table seeded
- **PASS** E-05 — period-close overdue/write-off step (non-blocking)

## Optional DB probes

- **PASS** DB-writeoff-sum — posted write-offs n=0 total=0
- **PASS** DB-BD-INV-6-orphan — orphan expense+AR journals=0

## Certification verdict

```
Bad Debt Phase 4 Certification
Date: 2026-07-14
Gates: A=PASS B=PASS C=PASS D=PASS E=PASS
Invariants BD-INV-1..10: structural PASS (runtime AR fixture integrity deferred to staging soak)
Open waivers: BD-D-W01, BD-D-W02
Verdict: CERTIFIED
```


## Open waivers

| ID | Risk | Expiry | Sign-off |
|----|------|--------|----------|
| BD-D-W01 | Staging latency for single write-off post (<2s) and 1k workqueue list (<3s) not measured in this CI run — measure on first staging enablement of bad_debt_writeoff_enabled | 2026-09-30 | Engineering (Phase 4E) — accepted pending staging baseline |
| BD-D-W02 | 10-way concurrent double-write-off race not load-tested in CI; structural lock + ceiling proven in service path | 2026-09-30 | Engineering (Phase 4E) — accepted; staging soak when flag enabled |


Summary: PASS=23 FAIL=0 SKIP=0
