# POS Test Print Sumatra failure + Setup FileVersion — proof

## Verdict
**FIXED + REBUILT + PROVEN**

---

## Issue A — File version `0.0.0.0`

### Cause (proven)
Inno Setup `AppVersion` alone does **not** set Windows **File version**. Without `VersionInfoVersion`, Explorer shows `0.0.0.0`.

Also: Chocolatey shim `ISCC.exe` itself reports FileVersion `0.0.0.0` — do not use that as the product version. Compile with:
`C:\Program Files (x86)\Inno Setup 6\ISCC.exe`

### Fix
`installer/SMART-ERP-POS-PrintService.iss` → `VersionInfoVersion=1.4.0.0`

### Proof (executed 2026-08-15)
```
Successful compile → installer\dist\SMART-ERP-POS-PrintService-Setup.exe
FileVersion=1.4.0.0
ProductVersion=1.4.0
Parts=1.4.0.0
LastWrite=08/15/2026 12:09:52
```

---

## Issue B — Wizard Test Print: SumatraPDF command failed

### Error on POS
```
Command failed: ...\pdf-to-printer\dist\SumatraPDF-3.4.6-32.exe
  -print-to Baristar -silent
  ...\temp\...\ticket.pdf
```

### Cause (proven in code — prior tests missed this)
Wizard **Test Print** called `printTestPage` → HTML/PDF → **`pdf-to-printer` → SumatraPDF-32**.

That path is wrong for **thermal** printers (e.g. Baristar):
- KOT production uses **ESC/POS RAW** (`WritePrinter`)
- Test Print used **PDF/GDI via Sumatra** → fails under LocalSystem / thermal drivers

Prior automated tests **mocked** `printTestPage` / `printHtmlDocument`, so they never executed Sumatra and could not catch this POS failure. That gap is acknowledged and closed.

### Fix
1. `printTestPage` → **ESC/POS RAW first** (`buildEscPosTestTicket` + `writeRawToPrinter`) — same path as KOT  
2. HTML/PDF only as fallback  
3. PDF spool prefers Windows **PrintTo** shell before Sumatra; clearer error if Sumatra still fails  

### Proof (agent vitest)
```
npx vitest run → 21/21 PASS
  printTestPage.runtime.test.ts (4) — RAW called for "Baristar", unnamed rejected, ticket bytes
  printSpoolIntegrity.runtime.test.ts (17)
```

Bundle contains:
```
app/dist/printHtml.js → buildEscPosTestTicket + `ok test (escpos-raw)`
app/dist/config.js → AGENT_VERSION = '1.4.0'
```

---

## What to do on the POS PC
1. Uninstall old Print Service (or install over with new Setup)  
2. Install **new** `installer\dist\SMART-ERP-POS-PrintService-Setup.exe` (File version **1.4.0.0**)  
3. Confirm Properties → File version **1.4.0.0**  
4. Open wizard → Test kitchen/bar (**Baristar**) — should spool RAW, not Sumatra  
5. `http://127.0.0.1:1811/health` → `"version":"1.4.0"`  
6. Agent log should show: `ok test (escpos-raw) printer=Baristar`
