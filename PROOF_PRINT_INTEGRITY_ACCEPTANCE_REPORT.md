# Enterprise Print Integrity — Acceptance Report

**Date:** 2026-08-15  
**Product:** SMART-ERP-POS / SamplePOS  
**Scope:** KOT / guest bill / receipt silent printing via local Print Agent  
**Gate:** Source + runtime integrity **PASS** · Installer binary must be **rebuilt** before tenant install  

---

## 1. What was wrong (proven defects)

These were **code-backed failures**, not field guesses.

| # | Defect | Effect on tenants |
|---|--------|-------------------|
| D1 | Agent returned **HTTP 202** as soon as a job was queued | UI/server could show success **before** Windows spooler wrote anything |
| D2 | Client treated **`ok \|\| status === 202`** as print success | “Printed” / “Sent KOT” with **no paper** (ghost print) |
| D3 | Dispatcher marked `print_jobs` **PRINTED** when the print call returned (i.e. after 202) | Durable SSOT lied about paper |
| D4 | Guest **bill** used `allowUnnamedAgentDefault: true` | Unmapped printer → Windows **default** (often **PDF**) → false success |
| D5 | **KOT** could POST with **null** printer → agent `(windows-default)` | Same ghost path for kitchen tickets |
| D6 | Default FOH path returned **`printFailures: 0`** without awaiting print | Waiter toast “Sent N KOT” while paper still pending / failing |
| D7 | `WritePrinter` did not assert **full byte count** | Partial spool could still look OK |
| D8 | Session **flush** could reprint old PENDING jobs | Tickets appearing long after guests left |
| D9 | Version **drift**: agent code `1.4.0` vs installer/ISS/helper/verify still `1.3.0`/`1.3.1` | Tenants could install the wrong integrity level |

Architecture truth before fix:

`FOH → print_jobs PENDING → agent enqueue → 202 “success” → (maybe) spooler`  
Success was defined at **accept**, not at **spool**.

---

## 2. What changed (resolution)

### A. Print Agent → **1.4.0** (`smart-print-agent`)
- **Named printer required** on `POST /print` (header or wizard role) — no Windows default
- **`X-Print-Wait: spool`** awaits RAW/HTML spool, then **`200 { spooled: true, status: SPOOL_OK }`**
- Spool failure → **502** (`success: false`) — never a green false positive
- **`GET /print/jobs/:id`** → `SPOOL_OK` / `FAILED` / `DROPPED`
- Queue: `enqueueAndWait` + fail-fast for wait path
- RAW: assert `$written -eq $bytes.Length`
- Package / config / ISS / product build / helper / verify / soak checklist aligned to **1.4.0**

### B. Client thermal bridge (`printRestaurant.ts` + `printSpoolIntegritySsot.ts`)
- Named-only preflight (unnamed → reject)
- Sends **`X-Print-Wait: spool`** when agent ≥ 1.4 (or online unknown)
- Classifies responses: **200+spooled** = success; waited+false = reject; **202** = poll or legacy named-only
- Bill: **`allowUnnamedAgentDefault: false`**
- KOT: no printer mapped → **throw** (or emergency browser only if policy on)

### C. Job dispatcher (`printJobDispatcher.ts`)
- **PRINTED** only after delivery function resolves (now spool-backed on 1.4+)
- Flush skips jobs older than **20 minutes** (`PRINT_JOB_FLUSH_MAX_AGE_MS`)
- Offline jobs carry `createdAt`

### D. Restaurant FOH (`RestaurantPosPage.tsx`)
- KOT **awaits** spool path by default (`awaitPrint: true`)
- Failure toast is **error**, not success-with-partial wording as success
- Bill awaits dispatch; success/fail toasts match delivery

---

## 3. Proof resolved + tested (aggressive gate — re-run)

### Fresh execution (this report)

| Suite | Command | Result |
|-------|---------|--------|
| Agent pre-install (Express + fetch) | `cd smart-print-agent && npx vitest run` | **17/17 PASS** |
| Client runtime + evidence | `npx vitest run` (5 print integrity files) | **39/39 PASS** |
| Agent TypeScript | `npx tsc -p tsconfig.json --noEmit` | **PASS** (`agent_tsc=0`) |
| Built dist version | `dist/config.js` | **`AGENT_VERSION = '1.4.0'`** |

**Total executed tests this gate: 56/56 PASS**

### Agent runtime steps proven (not regex-only)
1. `/health` online + **1.4.0** + escpos  
2. Unnamed ESC/POS → **400**  
3. Unnamed HTML → **400**  
4. Empty body → **400**  
5. Wizard kitchen role supplies printer name  
6. Wait spool → **200** + job `SPOOL_OK`  
7. HTML wait → **200** spooled  
8. Spool throw → **502** (not success)  
9. Legacy **202** + poll → `SPOOL_OK`  
10. Unknown job → **404**  
11. Concurrent waits — distinct ids, both spooled  
12. CORS allows `X-Print-Wait`  
13. `/setup/` + `/printers` OK  
14. Version lock: config = package.json = ISS **1.4.0**  
15. WritePrinter partial-write assert present  

### Client runtime steps proven
1. Version gate ≥1.4 for spool wait  
2. Unnamed printer rejected (SSOT)  
3. HTTP classify: spooled / reject / legacy 202 / 4xx / 5xx  
4. Poll outcomes  
5. Flush age 20m fresh vs stale  
6. **PRINTED only after** `printKitchenTicket` resolves  
7. Throw → failure, **not** PRINTED  
8. Hang-until-resolve does not mark delivered early  
9. Stale offline jobs skipped on flush  
10. Delivered-id cache blocks re-paper  
11. Bill path locked `allowUnnamedAgentDefault: false`  

Artifacts:  
- `PROOF_PRINT_SPOOL_INTEGRITY.md` / `.json`  
- `PROOF_PRINT_AGENT_PREINSTALL.md` / `.json`  

---

## 4. Integrity contract (what “printed” means now)

| Signal | Meaning |
|--------|---------|
| Kitchen commit | Food/SSOT order event (unchanged) |
| Agent **200 + spooled** | WritePrinter / HTML spool **accepted by OS spooler** |
| `print_jobs` **PRINTED** | Client delivery finished (spool-confirmed on agent 1.4+) |
| Agent **400** unnamed | Fail closed — no ghost PDF path |
| Agent **502** | Spool failed — UI must show print failure |

OS still owns physical exit from the tray (no tray sensor). Enterprise bar here is: **never claim success on accept-only / unnamed default**.

---

## 5. Acceptance decision

| Item | Decision |
|------|----------|
| Source code integrity | **ACCEPT** |
| Automated aggressive tests | **ACCEPT (56/56)** |
| Existing `installer/dist/SMART-ERP-POS-PrintService-Setup.exe` | **REJECT until rebuild** (may still be 1.3.x) |
| Tenant roll-out | Rebuild print-service bundle + Inno ISS → soak checklist health **≥ 1.4.0** → map **named** Windows printers on Stations |

### Rebuild (required before user install)
```powershell
powershell -File installer/print-service/build-bundle.ps1
# Compile installer/SMART-ERP-POS-PrintService.iss (Inno Setup 6)
```
Post-install: `GET http://127.0.0.1:1811/health` → `version: "1.4.0"`.

---

## 6. Residual risk (honest, bounded)

| Risk | Mitigation |
|------|------------|
| Tenant still on agent &lt; 1.4 | Named-printer-only still blocks PDF default; full spool confirm needs 1.4+ |
| Spooler accepts then printer offline/jam | Status is spool-OK not tray-OK — ops must monitor Windows queue |
| Unmapped station printers | Fail loud — managers must map exact Windows names |

No open known defect in the 1.4 integrity path covered by the 56 automated proofs above.
