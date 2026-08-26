# PROOF — Soft quarantine P4 (auto-dispose after aging)

**Verdict:** PASS
**Proven at:** 2026-08-26T17:52:50.468Z

**Contract:** Policy-gated auto-dispose after aging: separate flag default off; EXPIRED only; disposeFromQuarantine (P&L); soft/hard; nightly 04:30; no second loss engine

- PASS `DOC_P4`: P4 documented
- PASS `SSOT_BUCKET`: auto-dispose EXPIRED bucket only
- PASS `SSOT_DEFAULTS`: default min age 30 / max 100 lines
- PASS `SQL_DEFAULT_OFF`: migration columns default off / 30 days
- PASS `ANCHOR`: migration anchor registered
- PASS `USES_DISPOSE`: reuses disposeFromQuarantine gateway
- PASS `FLAG_GATED`: process requires flag unless force
- PASS `EXPIRED_FILTER`: candidates filtered to EXPIRED aging
- PASS `SCHEDULE`: nightly 04:30 + unified calculations dispatcher
- PASS `ROUTES`: preview + process API routes
- PASS `SETTINGS`: settings DTO + repository persist flag
- PASS `PANEL`: auto-dispose panel exists
- PASS `WORKQUEUE`: workqueue hosts auto-dispose panel
- PASS `SETTINGS_UI`: Settings → Inventory auto-dispose controls
- PASS `API_CLIENT`: client API methods

```bash
cd samplepos.client && npx vitest run src/__tests__/soft-quarantine-p4.evidence.test.ts src/__tests__/soft-quarantine-p3.evidence.test.ts src/__tests__/soft-quarantine-p2.evidence.test.ts src/__tests__/soft-quarantine-p1.evidence.test.ts
npm run ci:loss-quarantine-fitness
```
