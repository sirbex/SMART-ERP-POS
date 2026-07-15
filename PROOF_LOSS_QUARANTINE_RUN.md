# Loss & Quarantine — Phase 2 Certification Proof Run

Run: 2026-07-12T12:43:22.931Z

Mode: foundation

Charter: [PROOF_LOSS_QUARANTINE_CHARTER.md](./PROOF_LOSS_QUARANTINE_CHARTER.md)

ADR: [docs/architecture/LOSS_QUARANTINE_ADR.md](./docs/architecture/LOSS_QUARANTINE_ADR.md)


## Gate A — Architecture

- **PASS** ci:loss-quarantine-fitness
- **PASS** Jest Gate A/E architecture + governance proof
- **PASS** Jest Gate A/B governance (2D LQ-INV-8 + legacy GL)

## Gate C — Operations

- **PASS** Jest ops + disposal + concurrency proofs (C/D)

## Gate D — Performance & Concurrency

- **PASS** D structural: FOR UPDATE + double-dispose residual reject — lossDisposalService balance lock + LQ-INV-8 skip idempotency
- **WAIVER** LQ-D-W01: Staging latency (dispose 100 lines <10s) and live 10-way concurrent dispose race not measured in this CI run — measure on first staging enablement of loss_quarantine_document_enabled (expires 2026-09-30; Engineering (Phase 2E) — accepted pending staging baseline)

## Gate E — Governance & Audit

- **PASS** E-01..E-05 RBAC + immutability + audit schema + period-close hook
- **PASS** E-01 permission mapping — dispose → inventory.adjust; reverse → accounting.manage; aging → inventory.read
- **PASS** E-05 period-close quarantine aging step — financialCloseChecklist step-quarantine-aging (non-blocking)

## Gate B — Financial Integrity (database)

- **PASS** Connected to database
- **PASS** Core inventory tables present — 2
- **PASS** B schema: stock_movements.posts_gl
- **PASS** B schema: stock_movements.economic_event
- **PASS** B-01 LQ-INV-1: quarantine movements have 0 STOCK_MOVEMENT journals — 0 false posts
- **PASS** B-02 LQ-INV-2: POSTED disposals have journal + amount — 0 incomplete
- **PASS** B-04 no orphan disposal journal ids — 0
- **PASS** B/E audit: POSTED disposals have who/when/account — 0
- **PASS** B-05 Inventory 1300 active
- **PASS** B-05 expense account 5110 active
- **PASS** B-05 expense account 5120 active
- **PASS** B-05 expense account 5130 active
- **PASS** B-06 / 547: trg_post_stock_movement_to_ledger dropped — absent
- Quarantine BS exposure (still on 1300): 0.00
- **PASS** B-06 quarantine exposure probe — value=0.00 (informational)

## Gate B — Unit financial map & recon lane

- **PASS** B-05 reason→account + quarantine lane metadata

## Certification verdict

```
Loss & Quarantine Phase 2 Certification
Date: 2026-07-12
Gates: A=PASS B=PASS C=PASS D=PASS E=PASS
Invariants LQ-INV-1..10: covered by Gates A–E (see charter mapping)
Open waivers: LQ-D-W01
Verdict: CERTIFIED
```

### Waivers

| Id | Risk | Expiry | Sign-off |
|----|------|--------|----------|
| LQ-D-W01 | Staging latency (dispose 100 lines <10s) and live 10-way concurrent dispose race not measured in this CI run — measure on first staging enablement of loss_quarantine_document_enabled | 2026-09-30 | Engineering (Phase 2E) — accepted pending staging baseline |


Summary: 23 pass, 0 fail, 0 skip
