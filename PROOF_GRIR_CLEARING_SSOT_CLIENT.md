# PROOF — GR/IR Clearing SSOT (client)

**Generated:** 2026-08-29T04:44:35.935Z  
**Verdict:** **PASS** (29/29 gates)  
**Scope:** Client SSOT + UI/API wiring (no tenant DB writes)

## Gates

| Gate | Result | Detail |
|------|--------|--------|
| `STATUS_RESOLVE` | PASS | CASE mirror |
| `FILTER_WL` | PASS | whitelist |
| `F13_DEFAULT` | PASS | tol 2% |
| `MANUAL_CLEAR` | PASS | MR11N gate |
| `LABELS` | PASS | labels + filter opts |
| `ROUTE` | PASS | route |
| `HELP_SSOT` | PASS | help copy SSOT + short subtitle |
| `RESIDUAL_METHOD_GUARD` | PASS | reclass credit-only SSOT |
| `UNWRAP_OPEN` | PASS | paginated open list |
| `UNWRAP_FAIL` | PASS | throws on success:false |
| `UNWRAP_AUTO` | PASS | auto-match payload |
| `USES_SSOT` | PASS | imports domain SSOT |
| `USES_STATUS_LABEL` | PASS | badge labels |
| `USES_FILTER_OPTS` | PASS | filter dropdown SSOT |
| `USES_F13_DEFAULT` | PASS | default tolerance |
| `USES_PARSE_TOL` | PASS | parse tolerance |
| `USES_CLEAR_GATE` | PASS | manual clear gate |
| `USES_QUERY_ERROR` | PASS | surfaces load errors |
| `AUTO_MATCH_FAILURES` | PASS | shows auto-match pair failures |
| `HOOKS_UNWRAP` | PASS | hooks use SSOT unwrap |
| `USES_HELP_TRIGGER` | PASS | help icon SSOT |
| `RESIDUAL_METHOD_SSOT` | PASS | client validates method before clear |
| `RESIDUAL_ONE_CLEAR` | PASS | single Clear + per-row method (no Suggested button) |
| `NO_INLINE_RESIDUAL_ESSAY` | PASS | residual help in popover only |
| `NO_INLINE_FILTER_OPTS` | PASS | no hard-coded filter options |
| `NO_INLINE_TOL_FALLBACK` | PASS | no inline 2% fallback |
| `NAV_ROUTE` | PASS | accounting nav |
| `APP_ROUTE` | PASS | lazy route |
| `API_PREFIX` | PASS | open API |

## Re-run

```bash
npm run proof:grir-clearing-ssot --prefix samplepos.client
npm run proof:grir-clearing
```
