# PROOF_DIST_QUOTE_CONVERT_STATUS_SSOT

Verdict: **PASS** (5/5)

- PASS `POS_SET`: DRAFT,SENT,ACCEPTED
- PASS `UI_DRAFT_CONVERTIBLE`: UI shows Convert for DRAFT
- PASS `USES_POS_SET`: convertFromQuotation shares POS convertible statuses
- PASS `NO_DRAFT_BLOCK`: no longer blocks DRAFT-only path
- PASS `ALLOWS_DRAFT_MSG`: error message lists DRAFT

## Incident

- Q-2026-0299 (DRAFT) → ERR_DIST_QUOTE_STATUS
- Fix: convertFromQuotation uses POS_CONVERTIBLE_QUOTE_STATUSES (DRAFT|SENT|ACCEPTED)
