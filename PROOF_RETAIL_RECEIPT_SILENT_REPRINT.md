# Retail POS silent receipt + reprint (same printer)

Run: 2026-08-04T05:51:24.939Z  
Overall: **PASS**  
Mode: `live-print`

## Claim

Retail sale **first print** and **reprint** both deliver **silently** through SMART Print Agent to the **same** Windows receipt printer (`X-Printer-Name`), without browser dialog.

App SSOT:

| Step | Path |
|------|------|
| After payment | `POSPage` → `PrintReceiptDialog` → `printReceipt(data, { printerName })` |
| Reprint | `SalesPage` → `printReceipt(data, { printerName: printCfg.printerName })` + `isReprint: true` |
| Bridge | `printGuestThermalDocument` → ESC/POS then HTML → `POST :1811/print` + `X-Printer-Name` |
| Guard | `allowUnnamedAgentDefault: false` (no silent OS-default / PDF false success) |

## Live agent

- Origin: `http://127.0.0.1:1811`
- Version: `1.3.1` channel=`commercial`
- Formats: `html, escpos`

## Printer

- Preferred: `EPSON TM-T88III Receipt`
- Selected: `EPSON TM-T88III Receipt`
- Matched preferred: `true`
- Windows status detail: `{"name":"EPSON TM-T88III Receipt","isDefault":false,"status":"4096"}`

## Jobs

- **original_sale** format=`escpos` HTTP=`202` ok=`true` printer=`EPSON TM-T88III Receipt` reprint=`false`
- **reprint** format=`escpos` HTTP=`202` ok=`true` printer=`EPSON TM-T88III Receipt` reprint=`true`
- **unnamed_control** format=`html` HTTP=`202` ok=`true` printer=`(none)` reprint=``

## Checks

- PASS Print Agent online — v1.3.1 channel=commercial formats=html,escpos
- PASS Agent supports escpos — silent path prefers X-Print-Format: escpos
- PASS Windows printers discovered — 12 printers
- PASS Receipt printer selected — EPSON TM-T88III Receipt
- PASS Silent ORIGINAL sale receipt accepted by agent — HTTP 202 X-Printer-Name="EPSON TM-T88III Receipt"
- PASS Silent REPRINT receipt accepted by agent — HTTP 202 X-Printer-Name="EPSON TM-T88III Receipt" same as original
- PASS Same receipt printer for original + reprint — single X-Printer-Name="EPSON TM-T88III Receipt"
- PASS Control: agent response without X-Printer-Name recorded — HTTP 202 (app must still require named printer for retail success)
- PASS Agent still healthy after dual silent jobs — queueDepth=1 printing=false

## Operator confirmation (physical paper)

If agent accepted both jobs, confirm on the **selected** printer:

1. One slip marked `ORIGINAL SALE` (or without REPRINTED banner).
2. One slip marked `*** REPRINTED COPY ***`.
3. Both on **the same** device — no Chrome print dialog on either job.

If paper does not appear: check Windows printer online (status), USB/network, and Settings → Printing → Thermal Printer Name exact match.

## Structural evidence (vitest)

```text
cd samplepos.client && npx vitest run src/__tests__/receipt-retail-silent-reprint.evidence.test.ts src/__tests__/receipt-auto-print-reprint.evidence.test.ts src/__tests__/receipt-print-integrity.evidence.test.ts
```

## Artifacts

- JSON: `PROOF_RETAIL_RECEIPT_SILENT_REPRINT.json`
- This file: `PROOF_RETAIL_RECEIPT_SILENT_REPRINT.md`
