# PROOF: Supplier return worklist (client)

**Result:** PASS

- ✅ `UI_SSOT_NEED_SCN` — open return → create SCN
- ✅ `UI_SSOT_NEED_BILL` — no SCN without bill
- ✅ `LABELS` — labels locked
- ✅ `DEFAULTS` — nested under GR + default filter
- ✅ `USES_SSOT_IMPORT` — imports domain SSOT
- ✅ `USES_CAN_CREATE` — gates Create credit note via SSOT
- ✅ `USES_MUST_BILL` — gates Bill CTA via SSOT
- ✅ `USES_RESOLVE_STATUS` — badge uses domain labels/status
- ✅ `DEFAULT_ATTENTION` — default attn filter
- ✅ `LIST_HOOK` — list hook
- ✅ `POST_HOOK` — post draft
- ✅ `CN_HOOK` — create SCN
- ✅ `CREDIT_NOTES_LINK` — apply SCN path
- ✅ `GR_LINK` — source GR path
- ✅ `NO_PER_GR_ONLY` — all-supplier worklist
- ✅ `EMBEDDED_WORKBENCH` — nested under Receiving workbench
- ✅ `SSOT_GATES_ONLY` — create SCN / bill / open count use domain SSOT only
- ✅ `NAV_NO_TOP_TAB` — returns not a primary inventory tab
- ✅ `NAV_GR_DESK` — Goods Receipts is receiving desk
- ✅ `WORKBENCH_TABS` — Receipts | Returns sub-tabs
- ✅ `APP_NESTED` — nested GR/returns routes
- ✅ `APP_REDIRECT` — legacy redirect
- ✅ `APP_PERM` — purchasing.read on receiving desk
- ✅ `API_PARAMS` — API params
- ✅ `DOC_FLOW` — document flow
- ✅ `GR_EMBEDDED` — receipts page embeds under workbench
- ✅ `GR_NO_TOP_CTA` — no orphan returns CTA on GR
