# Customer Credit & Debit Notes — LIVE E2E Proof

Run: 2026-08-09T10:06:14.584Z
Database: postgresql://postgres:***@209.38.203.138:5432/pos_tenant_henber_pharmacy

## Gate 0 — Schema SSOT (amount charge + zod)

- **PASS** ssot-line-name — Additional charge
- **PASS** ssot-line-shape — {"productName":"Additional charge","description":"freight","quantity":1,"unitPrice":100,"taxRate":0}
- **PASS** zod-dn-amount-ok
- **PASS** zod-dn-amount-required
- **PASS** zod-cn-requires-lines
- **PASS** db-connect
- **PASS** fixture-user — 61bd9504-c86a-499d-9efd-db219dbdb51f
- **PASS** fixture-product — Zyncet tabs
- **PASS** fixture-customer — PROOF_CN_DN_AR Customer

## Gate A — Customer credit note (price correction on AR invoice)

- **PASS** A-credit-sale — SALE-2026-10913 total=1000
- **PASS** A-invoice-from-credit-sale — INV-2026-0182
- **PASS** A-invoice-due-open — due=1000
- **PASS** A-cn-create-post — CN-2026-0003 amount=125
- **PASS** A-cn-gl-cr-1200 — cr=125
- **PASS** A-cn-gl-dr-returns — dr4010=125
- **PASS** A-cn-gl-lines — 2 lines
- **PASS** A-cn-not-on-2210 — CN settles AR not store credit
- **PASS** A-invoice-due-reduced — before=1000 after=875

## Gate B — Customer debit note (amount-only, no product lines)

- **PASS** B-dn-synth-line-name — Additional charge
- **PASS** B-dn-create-post — dn=DN-2026-0003 amount=50
- **PASS** B-dn-gl-dr-1200 — dr=50
- **PASS** B-dn-gl-amount-match — dr=50 expected~50
- **PASS** B-dn-gl-cr-revenue — cr=50
- **PASS** B-dn-not-on-2210 — DN hits AR
- **PASS** B-invoice-due-increased — mid=875 after=925

## Gate C — Document model separation

- **PASS** C-cn-document-type — CREDIT_NOTE
- **PASS** C-dn-document-type — DEBIT_NOTE
- **PASS** C-cn-posted — POSTED
- **PASS** C-dn-posted — POSTED

## Coordination (evidenced)

| Path | Document | GL | Invoice due |
|------|----------|-----|-------------|
| Credit note | CREDIT_NOTE | CR 1200 · DR 4010 | decreases |
| Debit note (amount) | DEBIT_NOTE | DR 1200 · CR 4000 | increases |
| DN synthetic line | — | Additional charge | server-synthesized |

## Summary

- Pass: **29**
- Fail: **0**
- Result: **PASS**
