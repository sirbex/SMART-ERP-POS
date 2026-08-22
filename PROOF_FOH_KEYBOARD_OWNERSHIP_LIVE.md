# PROOF: FOH keyboard + ownership LIVE

- Date: 2026-08-22T09:17:42.738Z
- Commit: `c79d383be1a7569164e7ebab6908c1281dc066ef` (c79d383be1a7)
- Runner: `node scripts/proof-foh-keyboard-ownership-live.mjs`

## Hosts
- **https://henber.wizarddigital-inv.com** — health 200, healthy=true, scanned 194 chunks
- **https://wizarddigital-inv.com** — health 200, healthy=true, scanned 194 chunks

## Markers
- PASS `data-numeric-soft-keyboard` on https://henber.wizarddigital-inv.com
- PASS `data-search-soft-keyboard` on https://henber.wizarddigital-inv.com
- PASS `SearchSoftKeyboardInput` on https://henber.wizarddigital-inv.com
- PASS `softKeyboard` on https://henber.wizarddigital-inv.com
- PASS `rbacRoleNames` on https://henber.wizarddigital-inv.com
- PASS `belongs to another waiter` on https://henber.wizarddigital-inv.com
- PASS `restaurant.edit_others` on https://henber.wizarddigital-inv.com
- PASS `data-numeric-soft-keyboard` on https://wizarddigital-inv.com
- PASS `data-search-soft-keyboard` on https://wizarddigital-inv.com
- PASS `SearchSoftKeyboardInput` on https://wizarddigital-inv.com
- PASS `softKeyboard` on https://wizarddigital-inv.com
- PASS `rbacRoleNames` on https://wizarddigital-inv.com
- PASS `belongs to another waiter` on https://wizarddigital-inv.com
- PASS `restaurant.edit_others` on https://wizarddigital-inv.com

## Verdict
**PASS** — live SPA bundles contain keyboard + ownership release markers.
