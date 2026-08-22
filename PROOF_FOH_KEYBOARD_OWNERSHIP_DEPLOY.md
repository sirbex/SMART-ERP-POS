# PROOF: FOH keyboard + ownership deploy gate

- Date: 2026-08-22T11:59:15.528Z
- Commit: `bd176deb5de0aaa8f742b2f426e074319196624f` (bd176deb5de0)
- Runner: `node scripts/proof-foh-keyboard-ownership-deploy.mjs`

## Policy
Behavioral vitest proofs only — grep evidence not accepted.

## Gates
- PASS **PROOF_SOFT_KEYBOARD** — Behavioral: soft keyboard proofs (login + search + numeric) (3s)
- PASS **PROOF_TOUCH_KEYBOARD_POS** — Behavioral: touch POS keyboard integration (search + numeric + cart + layout) (2s)
- PASS **PROOF_POS_ADAPTIVE_LAYOUT** — Behavioral: retail POS adaptive layout SSOT (1600px wide tier) (2s)
- PASS **PROOF_POS_CART_COMPACT** — Behavioral: retail POS compact cart line alerts (3s)
- PASS **PROOF_CHECK_OWNERSHIP** — Behavioral: restaurant check ownership (5 tests) (2s)
- PASS **PROOF_BARCODE_PHYSICAL_KEYBOARD** — Behavioral: barcode scanner does not block physical typing (4 tests) (3s)
- PASS **CLIENT_VITE_BUILD** — Client production bundle (vite build — matches Dockerfile.deploy) (25s)
- PASS **SERVER_TSC** — Server TypeScript compile (39s)

## Child proof artifacts
- PROOF_SEARCH_SOFT_KEYBOARD.md
- PROOF_NUMERIC_SOFT_KEYBOARD.md
- PROOF_LOGIN_SOFT_KEYBOARD.md
- PROOF_TOUCH_KEYBOARD_POS.md
- PROOF_POS_ADAPTIVE_LAYOUT.md
- PROOF_RESTAURANT_CHECK_OWNERSHIP.md
- PROOF_BARCODE_SCANNER_INPUT.md

## Verdict
**PASS** — all behavioral proofs and builds green; safe to deploy.
