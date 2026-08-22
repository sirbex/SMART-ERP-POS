# PROOF: FOH keyboard + ownership LIVE

- Date: 2026-08-22T12:26:04.439Z
- Commit: `91aacf6b63becb5cad4a4de8731e0853f94bd328` (91aacf6b63be)
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
