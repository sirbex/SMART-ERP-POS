# PROOF: Supplier return worklist

**Result:** PASS
**As of:** 2026-08-11T11:59:41.463Z

## Claims
- All-supplier RGRN list API with needsAttention + search
- actionStatus SSOT shared with UI (DRAFT|NEED_BILL|NEED_SCN|HAS_SCN|COMPLETE)
- UI nested under Goods Receipts → Returns (/inventory/goods-receipts/returns); legacy /supplier-returns redirects
- Create SCN gated by supplier bill (product + UI)

## Gates
- ✅ `SSOT_DRAFT` — draft
- ✅ `SSOT_NEED_BILL` — no bill no scn
- ✅ `SSOT_NEED_SCN` — bill yes scn no
- ✅ `SSOT_HAS_SCN` — open SCN
- ✅ `SSOT_COMPLETE` — applied SCN
- ✅ `ATTN_POSTED_NO_SCN` — needs attention
- ✅ `ATTN_NOT_WITH_SCN` — has scn not attention
- ✅ `CAN_SCN` — create SCN allowed
- ✅ `CANNOT_SCN_NO_BILL` — must bill first
- ✅ `LIST_TOTAL` — total=2
- ✅ `LIST_ROWS` — rows=2
- ✅ `LIST_TWO_QUERIES` — q=2
- ✅ `SQL_RETURN_GRN` — from return_grn
- ✅ `SQL_SUPPLIER_JOIN` — join all suppliers
- ✅ `SQL_NEEDS_POSTED` — attention status POSTED
- ✅ `SQL_NEEDS_NO_SCN` — attention excludes active SCN
- ✅ `SQL_SEARCH` — search bind
- ✅ `SQL_TOTAL_AMOUNT` — amount column
- ✅ `SQL_HAS_BILL` — bill flag
- ✅ `SQL_HAS_SCN` — scn flag
- ✅ `SQL_ACTION_STATUS` — actionStatus projection
- ✅ `SQL_ACTION_CASE` — CASE matches domain SSOT labels
- ✅ `SQL_ORDER_ATTN_FIRST` — open returns sorted first
- ✅ `ROW_RGRN-2026-0001_SSOT` — actionStatus=NEED_SCN derived=NEED_SCN
- ✅ `ROW_RGRN-2026-0002_SSOT` — actionStatus=NEED_BILL derived=NEED_BILL
- ✅ `ROW1_CAN_SCN` — NEED_SCN can create
- ✅ `ROW2_MUST_BILL` — NEED_BILL gates SCN
- ✅ `FILTER_DRAFT_BIND` — status param
- ✅ `FILTER_DRAFT_NO_FORCE_ATTN` — draft filter uses bind not attention force only
- ✅ `DOMAIN_ROUTE` — constants nested under GR
- ✅ `CTRL_NEEDS_ATTENTION` — query needsAttention
- ✅ `CTRL_SEARCH` — query search
- ✅ `CTRL_LIMIT_CAP` — limit cap
- ✅ `ROUTE_LIST` — GET list
- ✅ `ROUTE_CN` — POST credit-note
- ✅ `ROUTE_CN_PERM` — SCN permission
- ✅ `CLIENT_LIST_PARAMS` — client list
- ✅ `CLIENT_CN` — client createCreditNote
- ✅ `HOOK_NEEDS` — hook params
- ✅ `HOOK_CN` — hook mutation
- ✅ `PAGE_ROUTE_HINT` — page knows nested route
- ✅ `PAGE_DEFAULT_ATTN` — default attention
- ✅ `PAGE_NEEDS_PARAM` — sends needsAttention
- ✅ `PAGE_CREATE_CN` — create SCN CTA
- ✅ `PAGE_BILL_FIRST` — bill CTA
- ✅ `PAGE_SSOT` — uses domain SSOT
- ✅ `PAGE_ALL_SUPPLIERS` — worklist copy
- ✅ `PAGE_EMBEDDED` — embeds under Receiving
- ✅ `NAV_NO_TOP_TAB` — not a primary inventory tab
- ✅ `NAV_GR_DESK` — Goods Receipts receiving desk
- ✅ `WORKBENCH` — Receiving tabs shell
- ✅ `APP_NESTED` — nested routes under GR
- ✅ `APP_REDIRECT` — legacy supplier-returns redirect
- ✅ `APP_PERM` — purchasing.read gate
- ✅ `GR_EMBEDDED` — GR embeds under workbench
- ✅ `GR_NO_ORPHAN_CTA` — no top-tab path on GR
- ✅ `DOC_FLOW_RGRN` — doc flow to worklist
- ✅ `LIST_GETBYGRN_SCN_SAME_FILTER` — list + lateral + getByGrnId cancel filters aligned
- ✅ `BILL_STATUS_UPPER_COALESCE` — bill status filter no mixed-case drift
- ✅ `SVC_BILL_GATE` — SCN requires bill
- ✅ `SVC_BILL_STATUS_ALIGN` — service bill filter matches list
- ✅ `SVC_CLEARING` — SCN clears 2150/2160
