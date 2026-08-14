# PROOF — GR/IR Clearing integrity

**Generated:** 2026-08-14T07:38:21.732Z  
**Verdict:** **PASS** (35/35 gates)  
**Scope:** Structural SSOT + algorithm (no tenant DB writes)

## Fixes proved

1. Multi-path GR↔bill (grn links / PO / internal ref) on **open, search, balance, F.13**
2. Soft cancel/void statuses everywhere
3. Empty-shell GRs excluded
4. Preview/Run Auto-Match share `selectF13Pairs` + default **2%**
5. Status filter whitelist (no SQL interpolation of free text)
6. Worklist prefers `grir_clearing` when already cleared

## Gates

| Gate | Result | Detail |
|------|--------|--------|
| `SSOT_LINKS_GRN` | PASS | path 1 grn_links |
| `SSOT_LINKS_PO` | PASS | path 2 PO |
| `SSOT_LINKS_REF` | PASS | path 3 internal ref |
| `SSOT_ACTIVE_CANCELLED` | PASS | soft cancel variants |
| `SSOT_ACTIVE_VOIDED` | PASS | void status excluded |
| `SSOT_HAS_LINES` | PASS | empty GR shells excluded |
| `SSOT_DEFAULT_TOL_2` | PASS | default tol=2 |
| `REPO_IMPORTS_SSOT` | PASS | imports integrity SSOT |
| `REPO_OPEN_MULTI` | PASS | open list multi-path |
| `REPO_OPEN_GC` | PASS | open prefers grir_clearing status |
| `REPO_OPEN_STATUS_WL` | PASS | status whitelist |
| `REPO_SEARCH_MULTI` | PASS | search multi-path |
| `REPO_CAND_MULTI` | PASS | candidates multi-path |
| `REPO_BAL_MULTI` | PASS | balance multi-path |
| `REPO_NO_CANCELLED_ONLY` | PASS | no hard-coded CANCELLED-only filter left |
| `REPO_PO_STATUS_TEXT` | PASS | po.status cast to text before em-dash (enum-safe) |
| `SVC_SELECT_IMPORT` | PASS | imports selectF13Pairs |
| `SVC_DEFAULT_TOL` | PASS | uses default tolerance SSOT |
| `SVC_AUTO_SELECT` | PASS | autoMatch uses selectF13Pairs |
| `SVC_PREVIEW_SELECT` | PASS | preview uses selectF13Pairs |
| `SVC_POSTED_BOOKKEEP` | PASS | posted bill bookkeeping only |
| `ALGO_AT2_COUNT` | PASS | at2=1 first=g1-i1 |
| `ALGO_AT5_HAS_G3` | PASS | 5% includes 3% variance g3 |
| `ALGO_AT5_NO_G4` | PASS | 5% excludes 10% g4 |
| `ALGO_NO_DOUBLE_INV` | PASS | invoice i1 not reused |
| `STATUS_UNMATCHED` | PASS | UNMATCHED ok |
| `STATUS_INJECT` | PASS | injection rejected |
| `STATUS_PARTIAL` | PASS | partial→VARIANCE |
| `FILTER_TEXT` | PASS | text is search |
| `FILTER_UUID` | PASS | uuid is id |
| `ROUTE_AUTO_PARSE` | PASS | auto-match tol parse |
| `ROUTE_RES_BEFORE_PO` | PASS | residuals before :poId |
| `CRUD_NO_CASE_$9` | PASS | createClearingRecord no $9 CASE reuse |
| `UI_UNMATCHED` | PASS | UI badge supports UNMATCHED |
| `UI_TOL_DEFAULT` | PASS | UI default tolerance 2% |

## Re-run

```bash
cd SamplePOS.Server
npm test -- --runInBand src/modules/grir-clearing/grirClearingIntegrity.evidence.test.ts
npm test -- --runInBand src/modules/grir-clearing/grirClearingF13.evidence.test.ts
npm test -- --runInBand src/modules/grir-clearing/grirClearingRepository.test.ts
```
