# PROOF — Soft quarantine P1 (LQ13)

**Verdict:** PASS
**Proven at:** 2026-08-26T18:02:56.286Z

**Contract:** LQ13 soft quarantine single-store: status+audit only (LQ-INV-1/6); aging+dispose parity (5120/5130); no MultistoreGate; no duplicate loss gateway

- PASS `STATUS_EXPIRED`: EXPIRED reason → EXPIRED status
- PASS `STATUS_DAMAGE`: DAMAGE reason → QUARANTINED status
- PASS `BUCKET_EXPIRED`: EXPIRED status → EXPIRED bucket
- PASS `BUCKET_DAMAGE`: QUARANTINED status → DAMAGE bucket
- PASS `EXPENSE_EXPIRED`: soft expired dispose → 5130
- PASS `EXPENSE_DAMAGE`: soft damage dispose → 5120
- PASS `REF_TYPE`: soft quarantine reference type constant
- PASS `DOC`: soft quarantine doc exists
- PASS `LQ13`: touchpoint LQ13 registered
- PASS `SOFT_NO_GL`: soft quarantine tags QUARANTINE_TRANSFER posts_gl=false
- PASS `SOFT_PARTIAL`: partial soft quarantine via lot split documented + wired
- PASS `SOFT_INV1`: soft path asserts remaining unchanged
- PASS `SOFT_BLOCKS_MS`: soft quarantine blocked when multistore
- PASS `AGING_SOFT`: aging supports soft mode
- PASS `AGING_NO_MS_THROW`: aging no longer requires multistore-only
- PASS `DISPOSE_SOFT`: dispose supports soft mode
- PASS `ROUTES`: API routes for soft quarantine
- PASS `UI_NO_GATE`: workqueue available without MultistoreGate
- PASS `UI_CANDIDATES`: UI shows soft expiry candidates

```bash
cd samplepos.client && npx vitest run src/__tests__/soft-quarantine-p1.evidence.test.ts
```
