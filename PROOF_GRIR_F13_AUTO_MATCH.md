# PROOF — GR/IR Automatic Clearing (F.13)

**Generated:** 2026-08-29T04:44:02.159Z  
**Verdict:** **PASS** (21/21 gates)  
**Scope:** Structural + algorithm only

## Root cause fixed

Multi-path SSOT + shared `selectF13Pairs` (default 2%). See also PROOF_GRIR_CLEARING_INTEGRITY.

## Gates

| Gate | Result | Detail |
|------|--------|--------|
| `REPO_SSOT` | PASS | uses grirIntegrity SSOT |
| `REPO_EMPTY_GR` | PASS | empty GR excluded |
| `REPO_NO_RECLEAR` | PASS | skip cleared pairs |
| `SVC_SELECT` | PASS | selectF13Pairs SSOT |
| `SVC_DEFAULT_2` | PASS | default tol from SSOT |
| `SVC_ALREADY_POSTED` | PASS | posted bills bookkeeping only |
| `SVC_AUTO_CLEAR` | PASS | autoMatch → clearItem |
| `ROUTE_CANDIDATES` | PASS | GET candidates |
| `ROUTE_AUTO` | PASS | POST auto-match |
| `ROUTE_WRITE` | PASS | reconcile write |
| `CLIENT_API` | PASS | client API tolerance |
| `UI_F13` | PASS | F.13 modal |
| `DEFAULT_TOL` | PASS | default 2 |
| `ALGO_ONE_TO_ONE` | PASS | selected=2 |
| `ALGO_FIRST` | PASS | g1-i1 first |
| `ALGO_G3` | PASS | g3 in at 5% |
| `ALGO_G4` | PASS | g4 out at 5% |
| `ALGO_TOL2` | PASS | 3% out at default 2% |
| `FILTER_SEARCH` | PASS | ONCO search |
| `FILTER_UUID` | PASS | UUID id |
| `FILTER_NONE` | PASS | empty none |

## Re-run

```bash
cd SamplePOS.Server
npm test -- --runInBand src/modules/grir-clearing/grirClearingF13.evidence.test.ts
```
