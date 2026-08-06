# DocumentTax Price-Mode Integrity — Enterprise Contract

**Status:** Active  
**Evidence suite:** `SamplePOS.Server/src/services/documentTaxPriceModeIntegrity.evidence.test.ts`  
**Charter:** [PROOF_DOCUMENT_TAX_CHARTER.md](./PROOF_DOCUMENT_TAX_CHARTER.md)  
**Live inclusive gate:** `proof-document-tax-live.ts` Gate **B-I**

## Why this exists

SALE-2026-0179 proved tax was **configuration-correct** (product taxable + Tax Engine mapping VAT18) but **engine-broken**:

| Fact | Value |
|------|--------|
| Product bridge | taxable @ 18% |
| Mapping | VAT18 active |
| Tenant | `tax_inclusive=true` |
| Sale line stamp | `tax_determination=DISABLED`, `tax_amount=0` |

Two defects are sealed:

1. **Inclusive mode mis-modeled as “no tax”** → determination DISABLED / tax 0  
2. **Money.toNumber re-rounded UGX to 0dp**, destroying explicit 2-decimal VAT extract (640.68 → 641)

## Contract (must hold on every release)

| # | Rule | Proof |
|---|------|--------|
| 1 | Exclusive: %VAT **added**; charge = net + tax | pure matrix + server mock |
| 2 | Inclusive: %VAT **extracted**; charge = shelf | pure + mock + live B-I |
| 3 | Inclusive **never** stamps DISABLED solely due to `tax_inclusive` | source scan + matrix |
| 4 | DISABLED only when restaurant master off (`applyTenantDefault && !taxEnabled`) | pure matrix |
| 5 | Mapping ≻ product bridge | pure matrix |
| 6 | createSale: inclusive does not double-add tax to total | structural salesService |
| 7 | Money.toNumber does **not** re-apply currency round | money unit + structural |
| 8 | SALE-2026-0179 fixture (4,200 @ 18% incl. mapping) → tax **640.68**, total **4200** | pure + mock |

## How to run evidence

```bash
# Focused enterprise seal
cd SamplePOS.Server
npx jest src/services/documentTaxPriceModeIntegrity.evidence.test.ts --no-coverage

# Full certification (Gate A + live PG if DATABASE_URL reachable)
npm run proof:document-tax-foundation
# Strict (fails if live lanes skip):
npm run proof:document-tax-certification
```

## Operator expectation after deploy

Re-sell Abchlor (or any mapped taxable) with current settings:

- Total stays **UGX 4,200.00** (inclusive shelf)
- Tax line shows **UGX 640.68** (VAT included)
- Line determination is **MAPPING** (or **BRIDGE**), never **DISABLED**

Historical SALE-2026-0179 remains tax=0 (immutable stamp) — integrity is proven on **new** transactions + automated evidence, not by rewriting history.

## Abchlor / 4840.68 trap (proof)

With **tax_inclusive=true** and shelf **UGX 4,200**, VAT 18%:

| Figure | Value | Role |
|--------|--------|------|
| Shelf / line subtotal | **4,200.00** | Price charged to customer |
| VAT (extracted) | **640.68** | 4200 − 4200/1.18 |
| Correct grand total | **4,200.00** | Inclusive charge |
| Bug total (wrong) | **4,840.68** | Exclusive-add of extracted VAT |

Evidence suite: `documentTaxInclusiveCharge.evidence.test.ts` (6 tests, all green).


```
npm run proof:document-tax-foundation
# Gates: A=PASS B=PASS C=PASS D=SKIP E=PASS
# PASS=7 FAIL=0
# A-PM-price-mode-integrity PASS (exclusive/inclusive + SALE-2026-0179 seal)
# B-I inclusive live: determination ≠ DISABLED, tax extracted, total=shelf, CR 2300
```
