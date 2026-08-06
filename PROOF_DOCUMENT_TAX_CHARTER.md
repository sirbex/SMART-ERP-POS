# DocumentTax — Production Certification Charter

**Status:** Active  
**Latest run:** [PROOF_DOCUMENT_TAX_RUN.md](./PROOF_DOCUMENT_TAX_RUN.md)  
**Evidence suite:** `SamplePOS.Server/src/services/documentTaxPhases.e2e.evidence.test.ts`  
**Price-mode suite:** `SamplePOS.Server/src/services/documentTaxPriceModeIntegrity.evidence.test.ts`  
**Price-mode charter:** [PROOF_DOCUMENT_TAX_PRICE_MODE.md](./PROOF_DOCUMENT_TAX_PRICE_MODE.md)  
**Live mutation:** `SamplePOS.Server/scripts/proof-document-tax-live.ts`

## Purpose

Certify that DocumentTax is production-ready as a **stable foundation** before adding
customer VAT registration UX, fiscal positions, or multi-rate GL (Phase 8b).

Mocked Jest evidence proves architecture. This charter requires **live PostgreSQL**
mutations for financial integrity.

## Release pipeline

```
Compile → DocumentTax Jest evidence (Gate A)
        → Live PG mutation cert (Gates B–C)
        → (Deferred) Offline replay / perf / Phase 8b
        → Deploy
```

```bash
npm run proof:document-tax-foundation
npm run proof:document-tax-certification   # --strict
npm run proof:document-tax-live            # mutation lane only
```

## Gates

| Gate | Name | Criterion |
|------|------|-----------|
| **A** | Architecture | DocumentTax SSOT wiring + phases 1–8c + **price-mode integrity** evidence Jest green |
| **A-PM** | Price mode contract | Exclusive adds VAT; inclusive **extracts** VAT; inclusive never stamps **DISABLED**; mapping ≻ bridge; createSale total integrity (see `documentTaxPriceModeIntegrity.evidence.test.ts`) |
| **B** | Live determination + persist + GL | Exclusive-tax lane: BRIDGE stamp, header=Σ lines, CR 2300 |
| **B-I** | Live inclusive lane | tax_inclusive=true: determination ≠ DISABLED; tax_amount extracted; total = shelf; CR 2300 |
| **C** | Invoice / remittance / CN / partial return | Invoice line tax copy; no double-count; return nets tax; CN line tax |
| **D** | Deferred lanes | Restaurant HTTP, quote→invoice live, offline replay, multi-rate GL, p95 — SKIP until dedicated proofs |
| **E** | Governance | Schema 584 columns; override RBAC evidence (Gate A); fixtures restored |

### Price-mode integrity (enterprise)

| Mode | Product tax setup | Walk-in | Expected |
|------|-------------------|---------|----------|
| Exclusive (`tax_inclusive=false`) | Mapping or bridge taxable | OK if policy allows | Tax **added**; total = net + tax; determination MAPPING/BRIDGE |
| Inclusive (`tax_inclusive=true`) | Mapping or bridge taxable | OK if policy allows | Tax **extracted**; total = shelf; determination MAPPING/BRIDGE (**not** DISABLED) |
| Inclusive | Restaurant `tax_enabled=false` + tenant-default path | — | DISABLED / tax 0 |
| Either | Mapped/taxable | Policy requires VAT customer + non-registered | determination NONE / tax 0 |

**Regression seal:** SALE-2026-0179 (product mapped + bridge, inclusive pricing, tax_amount=0, line DISABLED) must fail this suite if the bug reappears.

## Pass / fail

- **Foundation:** Gate A must PASS; Gates B–C PASS or SKIP if `DATABASE_URL` unreachable.
- **Certification (`--strict`):** Gates A–C must PASS (no SKIP on B/C). Gate D may SKIP with waiver.

## Explicitly deferred (not blockers for “mature foundation”)

1. **Phase 8b** multi-rate GL (`VAT18→2300`, levy→2310, …) — still single CR 2300.
2. **Offline replay** same-totals proof.
3. **p50/p95/p99** DocumentTax determination benchmark.
4. **Full HTTP React POS** browser E2E (service-layer live cert covers server authority).
