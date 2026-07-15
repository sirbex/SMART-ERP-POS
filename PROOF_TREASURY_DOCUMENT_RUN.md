# Treasury Document — Phase 1 Certification Proof Run

Run: 2026-07-12T11:28:03.912Z

Mode: foundation

Charter: [PROOF_TREASURY_DOCUMENT_CHARTER.md](./PROOF_TREASURY_DOCUMENT_CHARTER.md)

ADR: [docs/architecture/TREASURY_DOCUMENT_ADR.md](./docs/architecture/TREASURY_DOCUMENT_ADR.md)


## Gate A — Architecture

- **PASS** ci:treasury-fitness
- **PASS** Jest Gate A architecture proof

## Gate C — Operations

- **PASS** Jest ops + concurrency proofs (C/D)

## Gate D — Performance & Concurrency

- **PASS** D structural: FOR UPDATE + double-settle reject — receiptSettlementRepository + TD-INV-4 simulation
- **WAIVER** D-W01: Staging latency thresholds (100-line <5s / 500-line <20s deposit posts; 20 concurrent transfers) not measured in this CI run — measure on first staging enablement of treasury_document_enabled (expires 2026-09-30; Engineering (Phase 1E) — accepted pending staging baseline)

## Gate E — Governance & Audit

- **PASS** E-01..E-04 RBAC mapping + immutability + audit fields
- **PASS** E-01 permission mapping documented — treasury.* → accounting.read / accounting.manage (Phase 1)

## Gate B — Financial Integrity (database)

- **PASS** Connected to database
- **PASS** Treasury tables present — 4/4
- **PASS** B-01 TD-INV-1: POSTED docs have journal_entry_id — 0 orphans
- **PASS** B-05 TD-INV-7: POSTED audit fields populated — 0
- **PASS** B-04 TD-INV-8: POSTED TDs linked on ledger_transactions — 0 orphans
- 1015 GL=30000.00 unsettled_residual=1245600.00 drift=1215600.00
- **WAIVER** B-W02: 1015 GL vs unsettled residual drift 1215600.00 (GL=30000.00, residual=1245600.00). Clear via deposit worksheets + petty-cash-reclass before production flag-on. (expires 2026-09-30; Engineering (Phase 1E) — accepted pending operational catch-up)
- **SKIP** B-03 1015 vs unsettled residual — drift 1215600.00 — waived B-W02
- **PASS** B account 1012 Petty Cash active

## Posting governance (Rule D/E treasury sources)

- **PASS** postingGovernanceService Rule D/E suite

## Certification verdict

```
Treasury Phase 1 Certification
Date: 2026-07-12
Gates: A=PASS B=PASS C=PASS D=PASS E=PASS
Open waivers: D-W01, B-W02
Verdict: CERTIFIED
```

### Waivers

| D-W01 | Staging latency thresholds (100-line <5s / 500-line <20s deposit posts; 20 concurrent transfers) not measured in this CI run — measure on first staging enablement of treasury_document_enabled | 2026-09-30 | Engineering (Phase 1E) — accepted pending staging baseline |
| B-W02 | 1015 GL vs unsettled residual drift 1215600.00 (GL=30000.00, residual=1245600.00). Clear via deposit worksheets + petty-cash-reclass before production flag-on. | 2026-09-30 | Engineering (Phase 1E) — accepted pending operational catch-up |


Summary: 13 pass, 0 fail, 1 skip
