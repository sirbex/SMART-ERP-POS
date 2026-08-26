# PROOF — Soft quarantine P2 (expiry automation)

**Verdict:** PASS
**Proven at:** 2026-08-26T18:02:56.300Z

**Contract:** Unified expiry automation: HARD store transfer or SOFT status quarantine; shared flag default off; quarantine-only (no P&L); LQ-INV-8 skips SOFT_QUARANTINE + EXPIRY_AUTOMATION

- PASS `SKIP_SOFT_REF`: SOFT_QUARANTINE skips GL repair
- PASS `SKIP_AUTO_REF`: EXPIRY_AUTOMATION skips GL repair
- PASS `DOC_P2`: P2 documented in soft quarantine ADR addendum
- PASS `NO_MS_ONLY_THROW`: preview/process no longer multistore-only
- PASS `SOFT_BRANCH`: soft path uses applySoftQuarantine
- PASS `HARD_BRANCH`: hard path still store-transfers
- PASS `FLAG_GATED`: process requires flag unless force
- PASS `SCHEDULE_BOTH`: unified calculations dispatcher for nightly jobs
- PASS `AUTO_REF_SOFT`: automation soft path tags EXPIRY_AUTOMATION
- PASS `REPAIR_SOFT`: glRepair SQL skips SOFT_QUARANTINE
- PASS `PANEL_NO_GATE`: ExpiryAutomationPanel mode-aware without MultistoreGate
- PASS `WQ_PANEL`: quarantine workqueue hosts automation panel
- PASS `SETTINGS_FLAG`: system inventory settings expose nightly flag
- PASS `NO_PL_COPY`: UI states quarantine is not P&L

```bash
cd samplepos.client && npx vitest run src/__tests__/soft-quarantine-p2.evidence.test.ts src/__tests__/soft-quarantine-p1.evidence.test.ts
```
