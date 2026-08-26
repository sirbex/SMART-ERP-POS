# PROOF — Damage visible in quarantine

**Verdict:** PASS
**Proven at:** 2026-08-26T18:02:56.288Z

**Contract:** Damaged stock always visible in quarantine workqueue: multistore DAMAGE store transfer or single-store QUARANTINED soft status; no immediate P&L on quarantine

- PASS `REASON_STATUS`: DAMAGE → QUARANTINED lot status
- PASS `STATUS_BUCKET`: QUARANTINED → DAMAGE workqueue band
- PASS `MS_DAMAGE_TRANSFER`: multistore DAMAGE OUT → DAMAGE store quarantine
- PASS `MS_AGING_STORE`: hard aging includes DAMAGE store type
- PASS `SS_DAMAGE_ROUTE`: single-store DAMAGE OUT → soft quarantine helper
- PASS `SS_AGING_FILTER`: soft aging DAMAGE filter matches QUARANTINED status
- PASS `UI_DAMAGE_BAND`: workqueue DAMAGE band + dispose reason + adjustments link
- PASS `UI_ADJ_MSG`: adjustments UI directs to quarantine after damage
- PASS `SOFT_NO_GL`: soft damage quarantine audit without P&L

```bash
cd samplepos.client && npx vitest run src/__tests__/quarantine-damage-visibility.evidence.test.ts
```
