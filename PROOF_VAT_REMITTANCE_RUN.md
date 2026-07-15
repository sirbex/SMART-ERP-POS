# VAT Remittance — Phase 3 Certification Proof Run

Run: 2026-07-14T19:33:04.291Z

Mode: foundation

Charter: [PROOF_VAT_REMITTANCE_CHARTER.md](./PROOF_VAT_REMITTANCE_CHARTER.md)

ADR: [docs/architecture/VAT_REMITTANCE_ADR.md](./docs/architecture/VAT_REMITTANCE_ADR.md)


## Gate A — Architecture

- **PASS** A-fitness — ci:vat-remittance-fitness
- **PASS** A-architecture-jest — vat proof tests

## Gate B — Financial Integrity

- **PASS** B-05 VR-INV-10 — liability settled SSOT wired to sumPostedVatRemittances
- **PASS** B-01 VR-INV-1/5 — posting proof + shape asserts (Jest)
- **WAIVER** VR-INV-3-B: Decision B: document boxes vs GL 2300 informational drift allowed (purchase input inventory-embedded) (expires 2026-12-31; Engineering (Phase 3B Decision B) — accepted)

## Gate C — Operations

- **PASS** C-02/C-ceiling — VR-INV-2 over-remit rejected in posting proof
- **PASS** C-05 settled report — VR-INV-10 structural + fitness
- **PASS** C-06 WHT boundary — VR-INV-9 fitness cross-call scan; sources distinct

## Gate D — Performance & Concurrency

- **PASS** D-concurrency-structural — advisory lock + ceiling residual simulation in posting proof
- **WAIVER** VR-D-W01: Staging latency for remittance post (<3s) not measured in this CI run — measure on first staging enablement of vat_remittance_document_enabled (expires 2026-09-30; Engineering (Phase 3E) — accepted pending staging baseline)

## Gate E — Governance & Audit

- **PASS** E-05 period-close — step-vat-remittance on financialCloseChecklist (non-blocking)
- **PASS** E-02 immutability — reverse via TREASURY_REVERSAL (Phase 3C)
- **WAIVER** T12-W01: Treasury touchpoint T12 WHT remittance remains DEFERRED (governed WHT_REMITTANCE source, not yet TD). Keeps VR-INV-9 boundary intact; TD shim deferred. (expires 2026-09-30; Engineering (Phase 3D) — accepted; optional shim post-3E)

## Optional DB probes

- **PASS** DB-VR-INV-10-sum — posted VAT_REMITTANCE total=0

## Certification verdict

```
VAT Remittance Phase 3 Certification
Date: 2026-07-14
Gates: A=PASS B=PASS C=PASS D=PASS E=PASS
Open waivers: VR-INV-3-B, VR-D-W01, T12-W01
Verdict: CERTIFIED
```


## Open waivers

| ID | Risk | Expiry | Sign-off |
|----|------|--------|----------|
| VR-INV-3-B | Decision B: document boxes vs GL 2300 informational drift allowed (purchase input inventory-embedded) | 2026-12-31 | Engineering (Phase 3B Decision B) — accepted |
| VR-D-W01 | Staging latency for remittance post (<3s) not measured in this CI run — measure on first staging enablement of vat_remittance_document_enabled | 2026-09-30 | Engineering (Phase 3E) — accepted pending staging baseline |
| T12-W01 | Treasury touchpoint T12 WHT remittance remains DEFERRED (governed WHT_REMITTANCE source, not yet TD). Keeps VR-INV-9 boundary intact; TD shim deferred. | 2026-09-30 | Engineering (Phase 3D) — accepted; optional shim post-3E |


Summary: PASS=11 FAIL=0 SKIP=0
