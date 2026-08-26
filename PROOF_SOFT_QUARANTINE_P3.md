# PROOF — Soft quarantine P3 (Expiring Items bridge)

**Verdict:** PASS
**Proven at:** 2026-08-26T17:52:50.291Z

**Contract:** Expiring Items → quarantine bridge (expired only); soft/hard mode; no P&L; deep-link to workqueue; warning SSOT preserved

- PASS `DOC_P3`: P3 documented
- PASS `FN`: quarantineFromExpiringReport exists
- PASS `SOFT_BRANCH`: report bridge soft path
- PASS `HARD_BRANCH`: report bridge hard path
- PASS `NO_PL`: bridge posts no GL
- PASS `EXPIRED_ONLY`: rejects non-expired from report
- PASS `ROUTES`: report quarantine API routes
- PASS `LINK`: deep-link to quarantine workqueue
- PASS `ROW_ACTION`: per-row Quarantine on expired
- PASS `BULK`: bulk quarantine expired in view
- PASS `EXPIRED_GATE`: action only for expired band
- PASS `SSOT_KEPT`: Expiring Items warning SSOT unchanged
- PASS `API_CLIENT`: client API methods

```bash
cd samplepos.client && npx vitest run src/__tests__/soft-quarantine-p3.evidence.test.ts src/__tests__/soft-quarantine-p2.evidence.test.ts src/__tests__/soft-quarantine-p1.evidence.test.ts
```
