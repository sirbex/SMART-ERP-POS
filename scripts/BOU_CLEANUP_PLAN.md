# BOU (henber) AR cleanup plan

**Not accepted for production until a dedicated proof script passes** (same rule as reorder PO/GR). This document is investigation/plan only.

**Customer:** BOU (`81c0d6d5-d939-4bad-a17b-86728b4b72e4`)  
**Tenant DB:** `pos_tenant_henber_pharmacy`

## Current state (2026-05-23 investigation)

| Metric | Value |
|--------|-------|
| `customers.balance` | UGX 1,378,140 |
| Sum UNPAID invoice `amount_due` | UGX 1,378,140 (matches) |
| Open credit sales | 14 × UNPAID invoices |
| Draft credit notes | CN-2026-0001 … 0004 (UGX 248,900 total due on drafts) |
| Posted CN | CN-2026-0005 (UGX 82,900, amount_due 0) |

### SALE-2026-3755

- **Status:** `VOID` (admin force-void, not POS Return)
- **Reason:** `ADJUSTMENT: BOU COUNT yesterday`
- **Invoice:** INV-2026-0027 → `CANCELLED`, amount_due 0
- **Refunds:** none (`sale_refunds` empty)
- **Items:** 38 lines, `refunded_qty` = 0 (void path, not return)

### Known inconsistency: SALE-2026-3420

- Sale `VOIDED_BY_RETURN` but refund **UGX 208,000** > sale **UGX 126,300** (reason: "wrong data")
- Invoice INV-2026-0026: `PAID`, amount_paid 82,900, amount_due 0
- AR balance does not include this sale (invoice shows paid) but GL/refund may be wrong

## Recommended cleanup sequence

**Do not run on production without backup and explicit sign-off.**

1. **Cancel draft credit notes** (CN-0001 … 0004) — they are not in `customers.balance` but clutter AR reports.
2. **For each COMPLETED credit sale with UNPAID invoice:**
   - Prefer **Return** (`POST /api/sales/:id/refund`) for correct inventory + GL (DR 4000 / CR AR).
   - Or admin **force void** only if return is impossible (already used for 3755).
3. **Fix SALE-2026-3420** manually: review REF-2026-0018 GL; may need accounting correction entry.
4. **Reconcile:** `syncCustomerBalanceFromInvoices` for BOU — expect balance → 0.
5. **Post new opening balance** via Customer Center → Import Customer Opening Balance (after code deploy + migration 417).

## After cleanup

Use **Import Customer Opening Balance** with the correct legacy AR total and cutover date (one OB invoice per customer).
