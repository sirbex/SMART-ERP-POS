# Guest Bill + Receipt Print — Production Deploy Proof

Run: 2026-08-03T12:56:00.000Z (post-deploy scan)

Prod: https://wizarddigital-inv.com

Expect commit: `90bf135ddc5a`

## Pipeline

| Gate | Result | Evidence |
|------|--------|----------|
| Local integrity vitest | **PASS 58/58** | `PROOF_GUEST_BILL_RECEIPT_PRINT_VITEST.json` · suites: receipt-print-integrity (11), receipt-auto-print-reprint (6), receipt-print-audit (2), receipt-branding (6), bill-consolidate (4), guest-bill-printer (5), print-jobs-ssot (8), kot-escpos (6), sunmi-print (10) |
| Git commit | **PASS** | `90bf135ddc5ae53b22ef8b20f33b3f85e775f4c6` — `fix(print): wire guest-bill invoice branding and receipt printer name` |
| CI/CD Pipeline | **PASS** | https://github.com/wizard-digital/SMART-ERP-POS/actions/runs/30814913946 |
| Deploy to Production | **PASS** (9m36s) | https://github.com/wizard-digital/SMART-ERP-POS/actions/runs/30814913847 |
| Prod `/api/health` | **PASS** | healthy · post-restart uptime ~72–180s at sample windows |
| SPA entry | **PASS** | `/assets/index-Bx5HWgYB.js` |

## Integrity invariants (certified)

| ID | Rule | Local | Prod SPA fingerprint |
|----|------|-------|----------------------|
| I1 | Guest bill never tender methods (no Cash Given/CARD as payment rows) | behavioral test | Pre-pay footer still `Pay at cashier` in `print-BXF5b9lC.js` |
| I2 | Invoice footer + payment accounts on guest bill | behavioral + STRUCT FOH | `Payment Details`, `customReceiptNote`, `footerText`, `paymentAccounts` in `print-*.js` + `RestaurantPosPage-DQhRVuUO.js` |
| I3 | KOT/bill independent of receipt enable gate | STRUCT | no receipt gate in print restaurant path (suite) |
| I4 | Paid RECEIPT keeps tender lines | behavioral | suite |
| I5 | Receipt bridge sends configured printer name | STRUCT | `X-Printer-Name` + `printerName` in `print-BXF5b9lC.js`, `POSPage-CiIhYAUG.js`, `SalesPage-CqFuf_st.js`, `OrderPaymentPage-DrsZJJ-V.js` |

## Production chunk scan (246 assets)

| Chunk | Keys found |
|-------|------------|
| `assets/print-BXF5b9lC.js` | GUEST BILL, Pay at cashier, Payment Details, X-Printer-Name, printerName, customReceiptNote, footerText, paymentAccounts |
| `assets/RestaurantPosPage-DQhRVuUO.js` | X-Printer-Name, printerName, customReceiptNote, footerText, paymentAccounts |
| `assets/POSPage-CiIhYAUG.js` | printerName, customReceiptNote, footerText, paymentAccounts |
| `assets/SalesPage-CqFuf_st.js` | printerName |
| `assets/OrderPaymentPage-DrsZJJ-V.js` | printerName |

Command used for scan: `node scripts/_scan-prod-print.mjs` (crawl from SPA entry graph).

## Local print agent (dev terminal; not production server)

- `GET http://127.0.0.1:1811/health` → **online**, SMART Print Agent **1.3.1**, queueDepth **0**
- Note: agent `printerRoles.receipt` may be null — client now sends **X-Printer-Name** from Settings.

## Verdict

- PASS gates: CI, Deploy, Health, core SPA fingerprints, integrity suite **58/58**
- FAIL: 0 on certified product strings above

**Overall: PASS** — guest-bill invoice branding + sale receipt printer-name bridge is live on production for `90bf135ddc5a`.

## Manual smoke (operator)

1. Invoice Settings: set footer + payment account (show on receipt) → print guest bill → paper shows Payment Details + footer + Pay at cashier.
2. Printing: Enable receipt + **exact** Windows printer name + auto-print → POS sale → paper on that device.
3. Disable receipt enable → sale does not auto-print; KOT + guest bill still print.

## Related commits in history

- `fde2f307` — receipt master enable without KOT/bill
- `251501a1` — hold-order UUID no longer hits sale reprint audit
