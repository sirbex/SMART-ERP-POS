# Print Agent 1.4.0 — pre-install acceptance gate

## Verdict: **ACCEPT for rebuild + install** (source + runtime PASS)

Do **not** ship the existing `installer/dist/SMART-ERP-POS-PrintService-Setup.exe` until it is **rebuilt** from this tree (that binary may still be 1.3.x).

## Bugs / inconsistencies found and fixed

| Issue | Fix |
|--------|-----|
| Agent code `1.4.0` vs installer ISS `1.3.0` | ISS → `1.4.0` |
| `build-product.ps1` / helper fallback / verify script still `1.3.1` | Aligned → `1.4.0` |
| Client evidence expected `1.3.1` in config | Updated → `1.4.0` + package/ISS lock |

## Executed gates

| Gate | Result |
|------|--------|
| `tsc --noEmit` | PASS |
| `tsc` build → `dist/config.js` = `1.4.0` | PASS |
| Agent pre-install vitest | **17/17 PASS** |
| Client `smart-print-agent.evidence.test.ts` | **2/2 PASS** |

### Runtime steps proven (real Express + fetch)
1. `/health` online + version **1.4.0** + escpos
2. Unnamed ESC/POS → **400**
3. Unnamed HTML → **400**
4. Empty body → **400**
5. Wizard kitchen role supplies name
6. `X-Print-Wait: spool` → **200** + `SPOOL_OK`
7. HTML wait → **200** spooled
8. Spool fail → **502** (not success)
9. Legacy **202** then poll → `SPOOL_OK`
10. Unknown job → **404**
11. Concurrent waits — no id cross-talk
12. CORS allows `X-Print-Wait`
13. `/setup/` + `/printers` respond
14. WritePrinter partial-write assert present in RAW helper

## Install procedure (after ACCEPT)
```powershell
# from repo root
powershell -File installer/print-service/build-bundle.ps1
# then compile installer/SMART-ERP-POS-PrintService.iss (Inno Setup 6)
```
Post-install soak: `installer/SOAK-CHECKLIST.md` (health ≥ **1.4.0**).
