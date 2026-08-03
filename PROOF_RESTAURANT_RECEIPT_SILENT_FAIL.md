# Investigation: restaurant receipt silent (no paper, no error)

Date: 2026-08-03

## Symptom

- Guest **bill** prints.
- Paid sale **receipt** after restaurant pay does not.
- **No error toast** / no operator signal.

## Call path map

```
Restaurant Pay (online) → OrderPaymentPage.completeMutation.onSuccess
  → printRestaurantSettlementReceipt  (NEW; was printReceipt + silent gates)
  → printReceipt → printGuestThermalDocument
       1. ESC/POS agent :1811 (per printer name)
       2. HTML agent :1811
       3. In-app preview modal (NEW) or window.open
       4. throw only if all fail
```

Offline cash: `RestaurantPosPage` same helper.

Guest bill: `printRestaurantBill` → same ESC/POS bridge, **guest-bill printer only**, never gated by receipt enable.

## Silent exit causes found (why no error)

| # | Cause | Effect |
|---|--------|--------|
| **S1** | `shouldPrintReceiptOnSettlement` false when **Settings → Enable Receipt Printing** is off | **Empty early `return`** — sale toast only, zero print feedback |
| **S2** | Agent returns **200/202** on first `X-Printer-Name` (receipt settings name) even when that Windows queue is broken/offline | Treated as **success** — guest-bill printer never tried; no error |
| **S3** | Hidden iframe / popup `window.print` after **async** pay loses user-gesture | Browser blocks print; path still **resolves** as OK |
| **S4** | `window.open` **popup blocked** after navigation | Preview null; only then error — often too late / easy to miss |
| **S5** | `void (async () => print…)` on offline cash with bare `if (!enabled) return` | Failure invisible on floor return |

Bill keeps working because it uses a **working** guest-bill name and never hits **S1**.

## Fixes shipped

1. **`printRestaurantSettlementReceipt`** — always toast: disabled / sent / preview / error.
2. **Guest-bill printer first** for restaurant (settings printer second) so dead receipt name cannot swallow the job with a false 202.
3. **In-app preview modal** (not popup) with Print button when agent does not accept — cannot be silent.
4. Console: `[printReceipt] { method, printerName, tried }`.

## Operator verification after deploy

1. Hard-refresh.
2. Pay a table.  
3. Expect **one of**:
   - Toast **“Receipt sent to \<printer\>”** + paper on bill printer, or  
   - Toast **“Receipt printing is off…”** if master disabled, or  
   - **In-app overlay** “Receipt ready” + Print, or  
   - Toast **“Receipt not printed: …”** with reason.
4. Settings → Printing: confirm **Enable Receipt Printing** is on; set thermal name to the **same** name as guest bill if possible.

## Evidence

- Integrity suites: `receipt-print-integrity`, branding, sunmi (see CI / local vitest).
