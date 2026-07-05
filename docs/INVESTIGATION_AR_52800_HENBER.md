# AR −52,800 Investigation Plan — Henber Pharmacy

**Tenant:** `pos_tenant_henber_pharmacy` / https://henber.wizarddigital-inv.com  
**Status:** OPEN — period-close blocked on AR  
**Baseline:** `proof-ar-drift-decompose.mjs` @ 2026-07-05 (integrityGlDrift **−52,800**)  
**Framework phase:** F0 — **no auto-heal**; authorized GL/open-item alignment only

---

## 1. Problem statement

| Metric | UGX |
|--------|-----|
| GL 1200 (net-active) | 22,428,814 |
| Open-item subledger | 22,481,614 |
| **integrityGlDrift** | **−52,800** |
| Customer cache vs open-item | **0** (cache is healthy — not a cache-heal issue) |

**Pass criterion:** `integrityGlDrift` within AR materiality (~2,243 UGX at current GL) → target **0.00**.

---

## 2. Algebraic bridge (why −52,800 is small but entity gaps are large)

```
integrityGlDrift = (GL_customer − open_item) + NON_CUSTOMER_AR_on_1200
     −52,800     =    −2,505,119        +      2,452,319
```

| Component | UGX | Meaning |
|-----------|-----|---------|
| Customer-scoped drift | **−2,505,119** | Per-customer GL ≠ open-item (sum of entity exceptions) |
| NON_CUSTOMER_AR | **+2,452,319** | GL on 1200 **without** `EntityType=CUSTOMER` — partially **masks** customer gaps |
| **Net integrity drift** | **−52,800** | What period-close sees |

**Implication:** Fixing only “big customer names” without addressing **untagged GL** will not reconcile. Both sides of the bridge must be investigated in parallel.

---

## 3. Investigation lanes

### Lane A — NON_CUSTOMER_AR on 1200 (+2,452,319)

**Hypothesis:** Credit-sale / payment GL posted on 1200 without `EntityType=CUSTOMER` + `EntityId`.

**Phase 1 evidence (read-only):**

| ReferenceType | Entries | Net UGX |
|-------------|---------|---------|
| SALE | 11 | +3,122,998 |
| SALE_REFUND | 4 | −356,480 |
| INVOICE_PAYMENT | 4 | −171,299 |
| SALE_REFUND_CORRECTION | 1 | −118,900 |
| MANUAL_ADJUSTMENT | 1 | −24,000 |

**Tasks:**

1. List all 21 transactions — `TransactionNumber`, date, amount, `ReferenceId` (sale/invoice id).
2. For each SALE: confirm customer on `sales` / `invoices` vs ledger `EntityId`/`EntityType`.
3. Classify each as:
   - **Retag candidate** — customer known; GL missing entity metadata
   - **Repost candidate** — duplicate or wrong account posting
   - **Legitimate non-customer** — rare; must document (e.g. true intercompany)
4. Simulate: if all SALE entries were customer-tagged, recalc `integrityGlDrift` (dry-run only).

**Script:** extend `SamplePOS.Server/scripts/henber-ar-forensic-phase1.mjs` → Phase 2 transaction listing.

---

### Lane B — “Ghost” customers (open-item > 0, customer GL = 0)

**Hypothesis:** Subledger has invoices/OB; no customer-scoped net-active GL on 1200.

| Customer | Open-item UGX |
|----------|---------------|
| **case hospital** | **2,623,899** |
| Musa Semanda | 94,500 |
| PHARMACURE LTD | 57,600 |
| HENBER RUBAGA | 30,000 |

**Phase 1 evidence — case hospital:**

- Invoices with amount_due: INV-2026-0001 (1,181,999), INV-2026-0009 (708,000), INV-2026-0003 (492,000), INV-2026-0021 (241,900) ≈ **2.62M**
- **Zero** GL 1200 rows with `EntityType=CUSTOMER` for this customer

**Tasks:**

1. Per ghost customer: list all invoices, credit notes, payments, opening balances.
2. Trace sale completion / invoice posting — was AR GL created? On 1200 without entity tag (Lane A overlap)?
3. Check `sales` linked to invoices — `payment_method`, `is_credit_sale`, ledger link.
4. Determine remediation per document:
   - **Missing GL** → post customer-tagged AR journal (authorized)
   - **Untagged GL exists** → retag to customer (Lane A)
   - **Invalid invoice** → void/cancel with finance approval (last resort)

**Priority:** **case hospital** first (largest single driver).

---

### Lane C — Over-GL customers (GL > open-item)

| Customer | GL | Open-item | Δ |
|----------|-----|-----------|---|
| African Humanitarian Action -Mulago | 2,859,100 | 2,693,100 | **+166,000** |
| BOU | 16,783,795 | 16,646,115 | **+137,680** |

**Hypothesis:** Over-debit in GL vs subledger — unallocated payments, duplicate posting, or invoice credited in GL but not in open-item.

**Tasks:**

1. Aging + payment allocation report per customer.
2. Match GL debits to invoice `amount_due` reductions.
3. Identify orphan GL credits or payments not reflected in `ar_customer_payments` / invoice status.

---

### Lane D — Negative GL, zero open-item

| Customer | GL | Open-item | Δ |
|----------|-----|-----------|---|
| Douglas | −2,800 | 0 | −2,800 |

**Tasks:** Small balance — single transaction audit; likely over-credit or misallocated payment.

---

## 4. Execution phases

| Phase | Activity | Mutates DB? | Exit criteria |
|-------|----------|-------------|---------------|
| **P0** | Baseline proof archived | No | `proof-ar-drift-decompose` exit 0, drift −52,800 documented |
| **P1** | Forensic data collection (Lanes A–D) | No | Transaction-level workbook per lane |
| **P2** | Finance classification sign-off | No | Each item: retag / post / void / accept |
| **P3** | Remediation (document-level) | **Yes** | Dry-run script shows drift → 0 |
| **P4** | Production apply + re-proof | Yes | `integrityGlDrift` = 0; API `RECONCILED` |
| **P5** | Governance snapshot + period-close test | No | AR not in `blockedDomains` |

---

## 5. Tools (read-only first)

```powershell
. .\scripts\load-proof-production-env.ps1

# Baseline headline
npm run proof:henber:ar-decompose

# Phase 1 forensic (algebra + lanes A/B snapshot)
node SamplePOS.Server/scripts/henber-ar-forensic-phase1.mjs

# Live API lane (same SSOT as UI)
# GET /api/erp-accounting/reconciliation/lanes/ar/integrity
```

**Do not use:** cache heal, global `heal-*` without document-level proof (framework blocks this for integrity lane).

---

## 6. Remediation principles (from AP precedent)

Mirror `henber-ap-phase-b-remediate.mjs` pattern:

1. **Document-level** fixes only — no global offset journals
2. **Entity-tagged** ledger entries (`EntityType=CUSTOMER`, `EntityId=<uuid>`)
3. **Dry-run default** — `DRY_RUN=0` only after finance sign-off
4. **Re-proof after each batch** — `proof-ar-drift-decompose.mjs` must reconcile arithmetic
5. Archive: before/after snapshot IDs from governance panel

---

## 7. Suggested work order

1. **Lane A** — enumerate 11 untagged SALE GL rows; map to customers (likely explains case hospital missing GL)
2. **Lane B** — case hospital invoice ↔ sale ↔ ledger trace
3. **Lane C** — BOU + African Humanitarian payment/invoice mismatch
4. **Lane D** — Douglas cleanup
5. **Simulate** combined fix → expect drift near 0
6. **Apply** in maintenance window with `DRY_RUN=0`
7. **Re-run** Steps 3–4 proofs; update release exception register

---

## 8. Risks and constraints

| Risk | Mitigation |
|------|------------|
| Retagging breaks audit trail | Use reversal + repost with reference, not silent UPDATE |
| Fixing Lane B without Lane A | Drift may move, not resolve — always run full bridge |
| Materiality override | Governance can waive for period-close — **not recommended** without entity-level understanding |
| Warehouse release regression | AR fix is data-only; no app deploy required for P1–P2 |

---

## 9. Next immediate action

**Run Phase 2 forensic** — transaction-level export for Lane A (untagged SALE on 1200) and Lane B (case hospital sale/invoice/ledger join).

Say **“run Phase 2 forensic”** to execute read-only transaction listing and produce `PROOF_AR_FORENSIC_PHASE2.md`.
