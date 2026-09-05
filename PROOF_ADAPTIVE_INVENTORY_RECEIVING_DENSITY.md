# PROOF — Adaptive inventory receiving density

**Verdict:** PASS
**Generated:** 2026-09-05T11:49:51.599Z
**Gates:** 18/18

- PASS `HIDE_TITLE_PROP` — AdaptivePage exposes hideTitle for embedded workbenches
- PASS `DENSE_HEADER_COLUMN` — dense header stacks title then actions (no empty column beside tall CTAs)
- PASS `HUB_COMPACT_PAD` — Inventory hub uses tighter phone padding
- PASS `HUB_SUBTITLE_SM_ONLY` — hub subtitle hidden on phone
- PASS `WB_CHROME` — Receiving header compact on phone
- PASS `WB_TITLE_TABS_ROW` — Receipts/Returns tabs sit beside Receiving title — no empty header band
- PASS `EMBED_HIDE_TITLE` — embedded GR hides AdaptivePage title + uses pad-only SSOT
- PASS `NO_ALWAYS_ON_DATE_CARD` — no permanent on-canvas date filter card
- PASS `FILTERS_CLOSE_API` — date/status/billing in AdaptiveToolbar secondary with close()/Done; dense create-first
- PASS `BILLING_FACETS_ON_FILTERS_ROW` — billing chips live on AdaptiveToolbar facets row beside Filters (no 2×2 tower)
- PASS `CARD_ACTIONS_INLINE` — GR card taps to open detail — Finalize only as text link when needed
- PASS `DETAIL_META_DENSE` — GR detail meta uses AdaptiveMetaGrid (label|value same line on phone)
- PASS `COST_BASELINE_MORE` — cost baseline under AdaptiveToolbar More; Create CTAs on Filters row
- PASS `PRIMARY_CTAS_COMPACT` — primary actions densified: Manual GR + From PO (same toolbar row as facets)
- PASS `TOOLBAR_FACETS_SLOT` — create-first: facets share primary row with CTAs/Search — never a second tower
- PASS `FACET_CHIPS_HORIZONTAL` — AdaptiveFacetChips is content-sized horizontal scroll — never steals Search flex
- PASS `RETURNS_EMBED_HIDE_TITLE` — Returns embed uses hideTitle like Goods Receipts
- PASS `RETURNS_TOOLBAR_FACETS` — Returns uses AdaptiveToolbar + facets + More

## Integrity
Inventory Receiving phone density: densified hub + workbench, embedded hideTitle, AdaptiveToolbar Filters+billing facets, inline card actions, AdaptiveMetaGrid detail, AdaptivePage pad-only SSOT.
