# Phase 2.5 — Pre-Deploy Gate Results

**Date:** 2026-07-05  
**Branch:** uncommitted local (Phase 2 + 2.5 artifacts)

---

## Unit / integration tests (no DB required)

| Command | Result |
|---------|--------|
| `npm run test:accounting-governance` | ✅ PASS (17 tests) |
| `npm run test:posting-integrity` | ✅ PASS (51 tests) |
| `npm run ci:posting-guardrails` | ✅ PASS (3 warnings — heal scripts frozen, expected) |

---

## Accounting regression (`test:accounting`)

**Local dev DB:** ❌ 6/10 passed (60%)

Failures are **pre-existing local data issues**, not Phase 2 regressions:

| Test | Issue | Notes |
|------|-------|-------|
| AR GL vs subledger | 197,700 drift | Historical untagged GL — Phase 4 scope |
| Credit sales missing GL | 42 WH14/WHP test sales | Warehouse network proof data |
| AP drift | -11,530 | Pre-existing |
| Inventory GL vs physical | 54,000 | Pre-existing |

**Enforce gate:** Re-run `npm run test:accounting` on **clean migrated DB** or **post-deploy Henber** before switching to `enforce`. Not required to start `warn` observation.

---

## Ready to deploy

1. Merge Phase 2 code to `main`
2. Deploy to Henber
3. Set `AR_GOVERNANCE_MODE=warn` in production env
4. Confirm startup log: `AR governance mode active { arGovernanceMode: 'warn' }`
5. Begin 14-day observation — use [DEPLOY_CHECKLIST.md](./DEPLOY_CHECKLIST.md)

---

## Daily ops command

```bash
npm run summarize:ar-governance-warns -- SamplePOS.Server/logs/combined.log
```

On production: point at `/app/logs/combined.log` or aggregated log sink.
