# Treasury Settings UI — Enablement Proof

Run: 2026-07-14T22:37:02.444Z

API: http://localhost:3001


## Static / unit proofs

- **PASS** ci:treasury-fitness (includes A-07 Settings→Tax UI)
- **PASS** Jest treasurySettingsAdminUiProof — Tests:       6 passed, 6 total
- **PASS** Vitest treasury-settings-enable-proof — Tests  3 passed (3)

## Live API evidence (Settings field = Tax UI save path)

- **PASS** API health — 200
- **PASS** Admin login — admin@samplepos.com
- **PASS** GET /api/treasury/enabled — enabled=false
- **PASS** GET /api/system-settings exposes treasuryDocumentEnabled — value=false
- **PASS** PATCH /api/system-settings treasuryDocumentEnabled (Tax UI save contract) — set=true got=true
- **PASS** GET /api/treasury/enabled reflects PATCH — enabled=true
- **PASS** Restore original treasuryDocumentEnabled — restored=false

## Verdict

- PASS: 10
- FAIL: 0
- SKIP: 0

**Overall: PASS**

