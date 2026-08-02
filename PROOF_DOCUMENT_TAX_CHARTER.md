# DocumentTax — Production Certification Charter

**Status:** Active  
**Latest run:** [PROOF_DOCUMENT_TAX_RUN.md](./PROOF_DOCUMENT_TAX_RUN.md)  
**Evidence suite:** `SamplePOS.Server/src/services/documentTaxPhases.e2e.evidence.test.ts`  
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
| **A** | Architecture | DocumentTax SSOT wiring + phases 1–8c evidence Jest green |
| **B** | Live determination + persist + GL | Exclusive-tax lane: BRIDGE stamp, header=Σ lines, CR 2300 |
| **C** | Invoice / remittance / CN / partial return | Invoice line tax copy; no double-count; return nets tax; CN line tax |
| **D** | Deferred lanes | Restaurant HTTP, quote→invoice live, offline replay, multi-rate GL, p95 — SKIP until dedicated proofs |
| **E** | Governance | Schema 584 columns; override RBAC evidence (Gate A); fixtures restored |

## Pass / fail

- **Foundation:** Gate A must PASS; Gates B–C PASS or SKIP if `DATABASE_URL` unreachable.
- **Certification (`--strict`):** Gates A–C must PASS (no SKIP on B/C). Gate D may SKIP with waiver.

## Explicitly deferred (not blockers for “mature foundation”)

1. **Phase 8b** multi-rate GL (`VAT18→2300`, levy→2310, …) — still single CR 2300.
2. **Offline replay** same-totals proof.
3. **p50/p95/p99** DocumentTax determination benchmark.
4. **Full HTTP React POS** browser E2E (service-layer live cert covers server authority).
