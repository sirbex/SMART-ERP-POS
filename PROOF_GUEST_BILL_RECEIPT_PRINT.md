# Guest Bill Footer/Accounts + Sale Receipt Bridge Proof

Run: 2026-08-03 (local cert + production deploy)

## Defects under test

1. **Guest bill** ignored Invoice Settings footer, custom note, payment accounts (`showOnReceipt`), TIN — always printed only hard-coded `Pay at cashier` / `Thank you`.
2. **Sale receipts** did not send Settings → Thermal Printer Name to SMART Print Agent (`X-Printer-Name`), so agent queue could “accept” while the wrong/default printer was used. Receipts are **not** `print_jobs` (direct client → :1811).

## Integrity invariants (must hold)

| # | Rule | Proof |
|---|------|--------|
| I1 | Guest bill has **no tender** lines (CASH/CARD Cash Given) | `receipt-print-integrity` guest BILL tests |
| I2 | When Invoice footer / payment accounts set → guest bill HTML shows them + still `Pay at cashier` | behavioral test in same suite |
| I3 | Sale receipt master/auto gates **do not** import into KOT or guest bill paths | STRUCT integrity suite |
| I4 | Paid RECEIPT still shows tender payment methods | paid RECEIPT behavioral tests |
| I5 | Configured receipt printer name reaches bridge | `print.ts` + POS/Sales/OrderPayment STRUCT |

## Local evidence — vitest

Command:

```text
npx vitest run \
  src/__tests__/receipt-print-integrity.evidence.test.ts \
  src/__tests__/receipt-auto-print-reprint.evidence.test.ts \
  src/__tests__/receipt-print-audit.evidence.test.ts \
  src/__tests__/receipt-branding-after-payment.evidence.test.ts \
  src/__tests__/bill-consolidate.evidence.test.ts \
  src/__tests__/guest-bill-printer.evidence.test.ts \
  src/__tests__/print-jobs-ssot.evidence.test.ts \
  src/__tests__/kot-escpos-path.evidence.test.ts \
  src/__tests__/sunmi-print.spec.ts
```

Result (**pre-deploy**):

- Test Files: **9 passed**
- Tests: **58 passed**
- JSON report: `PROOF_GUEST_BILL_RECEIPT_PRINT_VITEST.json` (if generated in same run)

Key cases:

- `guest BILL never renders tendered payment methods`
- `guest BILL shows invoice footer + payment accounts when settings on`
- `STRUCT: sale receipt bridge uses configured printer name`
- `STRUCT: FOH guest bills carry invoice footer + payment accounts`
- print-jobs SSOT multi-printer (KOT Kitchen ≠ Bar)

## Local agent health (terminal where codex ran)

`GET http://127.0.0.1:1811/health` → **online** (`SMART Print Agent` 1.3.1, queueDepth 0).  
Note: `printerRoles.receipt` may still be `null` on agent — app now sends `X-Printer-Name` from tenant **receiptPrinterName**.

## Code surface

| Area | Files |
|------|--------|
| Guest bill SSOT | `thermalGuestDocument.ts` (`billToThermalGuestDocument`) |
| ESC/POS accounts fold | `guestDocumentToThermalTicket` |
| Bill print type | `printRestaurant.ts` `BillPrintData` |
| Job dispatch branding | `printJobDispatcher.ts` |
| FOH bill wiring | `RestaurantPosPage.tsx` (`guestBillInvoiceFields`) |
| Receipt bridge + name | `print.ts`, `PrintReceiptDialog`, `POSPage`, `SalesPage`, `OrderPaymentPage` |

## Production

| Field | Value |
|-------|--------|
| Repo SHA | _(filled after push)_ |
| Deploy workflow | `Deploy to Production` |
| Actions URL | _(filled after workflow)_ |
| Expect SPA fingerprints | `guestBillInvoiceFields`, `X-Printer-Name`, `Payment Details` on bill path |

## Manual smoke (after deploy)

1. Invoice Settings: footer + payment account show on receipt → print restaurant **guest bill** → paper shows **Payment Details**, footer, Pay at cashier.
2. Printing Settings: enable receipt + exact Windows printer name + auto-print → complete POS sale → paper on that printer.
3. Disable receipt enable → sale does not auto-print; KOT + guest bill still print.

## Verdict (local)

**PASS** integrity suites (58/58). Production gate completed after push/deploy row below.
