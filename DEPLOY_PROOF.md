# Deploy proof — customer invoice adjustment & AR sync

**Run:** `npm run proof:deploy` (API must be running on `BASE_URL`, default `http://localhost:3001`)

**Last run:** 2026-05-21 (local `pos_system`)

---

## Automated results (copy from proof output)

| Check | Result |
|-------|--------|
| Jest server suite | **940 / 941 passed** (1 fail: AR 1200 vs customers on dirty DB) |
| `proof-invoice-cn-split.mjs` | **PASS** |
| beccapowers AR consistency | **PASS** (balance = invoice due = 0; sale synced) |
| Statement closing = customer balance | **PASS** (closing 0) |
| Settled invoice blocks Adjust API | **PASS** (`ADJUST_ALREADY_CREDITED` on INV-2026-0002) |
| `repair-customer-invoice-balances.mjs` | **PASS** |
| AR 1200 drift | **FAIL — drift UGX 30,000** (invalid overpayment RCPT-2026-0002) |

---

## Deploy verdict

### Code: **OK to deploy** (after review)

- Invoice `recalc` includes credit notes + cash payments
- Linked sale `amount_paid` syncs from invoice
- Overpayment blocked on new payments (uses true `amount_due`)
- Adjust blocked when settled / already credited
- Customer statement closing uses `customers.balance`

### Data / production: **NOT OK until**

1. **Reverse or delete** invalid receipt **RCPT-2026-0002** (UGX 30,000 on beccapowers) — causes AR GL drift 30k
2. Run on prod after deploy:
   ```bash
   cd SamplePOS.Server
   node scripts/repair-customer-invoice-balances.mjs
   node scripts/proof-ar-drift.mjs   # must exit 0
   ```
3. SQL migrations on prod (if missing): `008_sale_refund_gl.sql`, `071_*`, `072_credit_note_amount_due_zero.sql`
4. Restart API so statement + adjust routes load new code

---

## Manual UI checklist (5 min)

- [ ] Customers → beccapowers → **Invoices**: INV-2026-0002 Paid 40k / Due **0** — **no Adjust** button
- [ ] Same customer → **Transactions**: Closing balance **UGX 0.00** (not 30k CR after data fix)
- [ ] Sales → SALE-2026-0008: Amount paid **40,000**, Outstanding **0**
- [ ] Administrator has **customers.adjust** (RBAC)

---

## Re-run proof

```bash
# Terminal 1
cd SamplePOS.Server && npm run dev

# Terminal 2
npm run proof:deploy
```

Optional live post (staging only):

```bash
node scripts/test-customer-invoice-adjustment-live.mjs --invoice INV-XXXX --post
```
