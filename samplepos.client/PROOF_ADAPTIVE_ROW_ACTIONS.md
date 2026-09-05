# PROOF — Adaptive row actions SSOT

**Verdict:** PASS
**Generated:** 2026-09-05T11:49:51.816Z
**Gates:** 11/11

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
- PASS `FOOTER_NO_COLLAPSE` — page sticky AdaptiveActionBar keeps CTAs visible

## Integrity
List/card row actions: sheet/dense chrome → Actions menu; ResponsiveActionBar delegates to AdaptiveRowActions; no full-width stacked CTA towers on phone cards.
