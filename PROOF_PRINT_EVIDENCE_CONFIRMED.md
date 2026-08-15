# Print integrity — tested & confirmed evidence

**Confirmed at:** 2026-08-15 (fresh re-run)  
**Total automated tests:** **60 / 60 PASS** (agent 21 + client 39)

Machine-readable runs:
- `PROOF_PRINT_AGENT_VITEST_LAST.json`
- `PROOF_PRINT_CLIENT_VITEST_LAST.json`

---

## A. Setup.exe — File version (disk proof)

| Check | Confirmed value |
|--------|-----------------|
| Path | `installer\dist\SMART-ERP-POS-PrintService-Setup.exe` |
| **FileVersion** | **`1.4.0.0`** (not 0.0.0.0) |
| ProductVersion | `1.4.0` |
| LastWrite | 2026-08-15 12:09:52 +03:00 |
| Size | 30,909,275 bytes |

---

## B. Bundle shipped inside that Setup (disk proof)

| Check | Confirmed |
|--------|-----------|
| Agent version in bundle | `AGENT_VERSION = '1.4.0'` (`app\dist\config.js`) |
| Test Print primary path | `buildEscPosTestTicket` + log `ok test (escpos-raw)` |
| Sumatra | Only fallback after ESC/POS; comment: never first for thermal |

---

## C. Agent tests confirmed PASS (21)

**File:** `smart-print-agent/src/printSpoolIntegrity.runtime.test.ts` (17)

| # | Test confirmed |
|---|----------------|
| 1 | config / package.json / ISS share **1.4.0** |
| 2 | WritePrinter **byte-count assert** present |
| 3 | `/health` online + version **1.4.0** + escpos |
| 4 | Unnamed ESC/POS → **400** |
| 5 | Unnamed HTML → **400** |
| 6 | Empty ESC/POS → **400** |
| 7 | Empty HTML → **400** |
| 8 | Wizard kitchen role supplies printer name |
| 9 | `X-Print-Wait: spool` → **200** + `SPOOL_OK` |
| 10 | HTML wait → **200** spooled |
| 11 | Spool fail → **502** (not success) |
| 12 | Legacy **202** then poll → `SPOOL_OK` |
| 13 | Unknown job → **404** |
| 14 | Concurrent spool waits — no cross-talk |
| 15 | CORS allows `X-Print-Wait` |
| 16 | `/setup/` responds |
| 17 | `/printers` responds |

**File:** `smart-print-agent/src/printTestPage.runtime.test.ts` (4) — **Sumatra gap closed**

| # | Test confirmed |
|---|----------------|
| 18 | Test print calls `writeRawToPrinter` with named printer (**Baristar-style**) |
| 19 | Unnamed test print **fails closed** |
| 20 | ESC/POS test ticket emits non-empty RAW (`TEST PRINT`) |
| 21 | `printTestPage` prefers **escpos-raw** before pdf-to-printer |

---

## D. Client tests confirmed PASS (39)

| Suite | Count | What confirmed |
|--------|------:|----------------|
| `print-spool-integrity.runtime.test.ts` | 12 | Version gate, named-only, HTTP classify, poll, flush 20m, PRINTED only after deliver, no PRINTED on fail, stale flush skip, bill unnamed=false |
| `print-jobs-ssot.evidence.test.ts` | 8 | Multi-printer KOT, empty fail-closed, spool wait / named required in agent |
| `printJobDispatcher.evidence.test.ts` | 4 | Delivered cache, FOH await spool, no re-paper |
| `receipt-print-integrity.evidence.test.ts` | 13 | Receipt vs bill/KOT independence, no unnamed default on sale receipts |
| `smart-print-agent.evidence.test.ts` | 2 | Agent routes + installer presence; version lock **1.4.0** |

---

## E. Defects that were wrong → confirmed fixed

| Defect | Evidence of fix |
|--------|-----------------|
| Ghost print via Windows default / PDF | Named printer **400**; bill `allowUnnamedAgentDefault: false` |
| Success on HTTP 202 alone | Wait → **200 + spooled**; PRINTED after deliver resolves |
| Setup FileVersion 0.0.0.0 | Disk proof **1.4.0.0** |
| Wizard Test Print SumatraPDF fail on thermal | Test print → **ESC/POS RAW first** (tests 18–21 + bundle lines) |

---

## F. Not claimed (honest boundary)

These automated proofs do **not** replace a live POS smoke on the physical **Baristar** after installing this Setup. After install, confirm:

1. Setup Properties → File version **1.4.0.0**  
2. `http://127.0.0.1:1811/health` → `"version":"1.4.0"`  
3. Wizard Test Print → agent log `ok test (escpos-raw) printer=Baristar` (no Sumatra command)
