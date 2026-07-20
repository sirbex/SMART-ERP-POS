════════════════════════════════════════════════════════════════════════════
 BANK ACCOUNT UPDATE / ACTIONS / OPENING BALANCE PROOF
 Generated: 2026-07-20T07:22:23.621Z
 BASE_URL: http://localhost:3001
════════════════════════════════════════════════════════════════════════════

── Claims under test ──
 1. Opening Balance input: empty default, inputMode decimal, no scroll bump, focus-select
 2. Actions Edit/Activate call PATCH /api/banking/accounts/:id (route+service exist)
 3. Wrong opening amount: edit posts BANK_OPENING_ADJ delta JE (immutability-safe)
 4. Non-ASSET GL (e.g. Sales Revenue) rejected on create/update

── 1) Static wiring ──
✓ UI openingBalance default empty string (not 0)
✓ UI inputMode=decimal (not sticky number-0)
✓ UI preventNumberScroll onWheel
✓ UI onFocus select for replace-typing
✓ UI Edit + Toggle Active handlers
✓ UI useUpdateBankAccount
✓ UI OB correction helper copy
✓ Hook PATCH updateAccount
✓ Route UpdateBankAccountSchema
✓ Route PATCH → updateAccount
✓ Route banking.update permission
✓ DTO UpdateBankAccountDto
✓ Service updateAccount method
✓ Service BANK_OPENING_ADJ correction
✓ Service ASSET GL guard

── 2) Jest suite (mocked, no DB mutation) ──
PASS src/services/bankingUpdateAccountProof.test.ts
PASS src/services/bankingCreateAccountProof.test.ts
Test Suites: 2 passed, 2 total
Tests:       14 passed, 14 total
✓ Jest PASS (create + update proof suites) — exit=0

── 3) Live API E2E (optional if server up) ──
✓ Live login OK — admin@samplepos.com
✓ Provision unique ASSET GL — via=sql-insert id=e9ecb2ec-cfe3-433b-8651-b61946707e4b
✓ POST create with opening balance — status=201 err=
✓ Created balance reflects opening — balance=120020
✓ PATCH metadata (Actions Edit) — status=200 err= name=Proof BA swd6lv EDITED
✓ PATCH opening balance correction — status=200 err=""
✓ Stored openingBalance corrected — openingBalance=100000
✓ GL currentBalance reduced by delta (−20020) — currentBalance=100000
✓ Bank register shows opening balance correction line — ref=OPEN-CORR-B3E59A0D amt=20020
✓ PATCH rejects REVENUE GL — status=500 err=GL Account "4000 - Sales Revenue" is REVENUE, not ASSET. Bank accounts must link to an Asset posting account.
✓ PATCH deactivate (Actions toggle) — status=200

 Live evidence IDs: bankId=d498155d-3f6b-4bb3-bba6-18b7b4effb04 glId=e9ecb2ec-cfe3-433b-8651-b61946707e4b glCode=1099swd6lv

── Scope honesty ──
 ✓ Proven (always): UI UX guards, PATCH route/service wiring, mocked update/OB/ASSET tests.
 ✓ Proven (live): create → edit → OB correction → deactivate against running API.
 ✗ Not claimed: moving historical JE off a wrongly linked Sales Revenue GL (reclass is separate).

════════════════════════════════════════════════════════════════════════════
 RESULT: PROOF OK — static + Jest + live API evidence
════════════════════════════════════════════════════════════════════════════
