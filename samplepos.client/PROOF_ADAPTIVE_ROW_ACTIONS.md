# PROOF — Adaptive row actions SSOT

**Verdict:** PASS
**Generated:** 2026-09-05T17:07:47.991Z
**Gates:** 13/13

- PASS `MOBILE_SHEET` — mobile chrome uses sheet secondary actions
- PASS `MOBILE_MENU` — 3 card actions collapse to Actions menu on phone
- PASS `SINGLE_INLINE` — single action stays inline
- PASS `DESKTOP_INLINE` — roomy desktop keeps inline when chrome allows
- PASS `NARROW_PANE_MENU` — narrow content pane forces menu even if shell is desktop
- PASS `ROW_ACTIONS_COMPONENT` — AdaptiveRowActions menu trigger exported
- PASS `MENU_LABEL_DENSITY` — row actions menu label is verbose Actions vs short More
- PASS `LINK_APPEARANCE` — AdaptiveRowActions supports link (no-box) appearance for detail nav
- PASS `BAR_DELEGATES` — ResponsiveActionBar no longer stacks full-width towers
- PASS `ADJ_USES_ROW_ACTIONS` — Adjustments wires structured AdaptiveRowActions
- PASS `INLINE_NOWRAP_ROW` — Inline AdaptiveRowActions stay one horizontal row (match Adjustments)
- PASS `PRODUCTS_BUTTON_ROW_ACTIONS` — Products table ACTIONS match Adjustments: outlined buttons in one horizontal nowrap row
- PASS `FOOTER_NO_COLLAPSE` — page sticky AdaptiveActionBar keeps CTAs visible

## Integrity
List/card row actions: sheet/dense chrome → Actions menu; ResponsiveActionBar delegates to AdaptiveRowActions; no full-width stacked CTA towers on phone cards.
