# PROOF: Supplier return worklist (client)

**Result:** PASS

- ✅ `UI_SSOT_NEED_SCN` — open return → create SCN
- ✅ `UI_SSOT_NEED_BILL` — uninvoiced return is Done — no bill-first drama
- ✅ `UI_SSOT_FULL_REVERSE_NO_SCN` — full/uninvoiced reverse never offers Create Credit Note (even if sibling bill linked)
- ✅ `LABELS` — labels locked
- ✅ `DEFAULTS` — nested under GR + default filter
- ✅ `UNWRAP_STANDARD` — rows=1 total=8
- ✅ `UNWRAP_NESTED` — double-wrap
- ✅ `UNWRAP_ARRAY_BODY` — array body
- ✅ `UNWRAP_EMPTY_EXPLICIT` — empty is explicit not invent
- ✅ `USES_SSOT_IMPORT` — imports domain SSOT
- ✅ `USES_CAN_CREATE` — gates Create credit note via SSOT
- ✅ `USES_MUST_BILL` — never renders Bill-on-GR-first CTA (mustBillBefore is always false)
- ✅ `USES_RESOLVE_STATUS` — badge uses domain labels/status
- ✅ `DEFAULT_ATTENTION` — default attn filter
- ✅ `LIST_HOOK` — list hook
- ✅ `POST_HOOK` — post draft
- ✅ `CN_HOOK` — create SCN
- ✅ `UNWRAP_LIST` — no ad-hoc silent list parse
- ✅ `CREDIT_NOTES_LINK` — apply SCN path
- ✅ `GR_LINK` — source GR path
- ✅ `NO_PER_GR_ONLY` — all-supplier worklist
- ✅ `EMBEDDED_WORKBENCH` — nested under Receiving workbench
- ✅ `SSOT_GATES_ONLY` — create SCN / attention use domain SSOT; no bill-first fork
- ✅ `NAV_NO_TOP_TAB` — returns not a primary inventory tab
- ✅ `NAV_GR_DESK` — Goods Receipts is receiving desk
- ✅ `WORKBENCH_TABS` — Receipts | Returns sub-tabs + attention unwrap
- ✅ `APP_NESTED` — nested GR/returns routes
- ✅ `APP_REDIRECT` — legacy redirect
- ✅ `APP_PERM` — purchasing.read on receiving desk
- ✅ `API_PARAMS` — API params
- ✅ `DOC_FLOW` — document flow
- ✅ `GR_EMBEDDED` — receipts page embeds under workbench + same list unwrap
- ✅ `GR_NO_TOP_CTA` — no orphan returns CTA on GR
