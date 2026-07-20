# Proof: BANK_MANUAL production deploy

Run: 2026-07-20T12:08:52.921Z

Prod: https://henber.wizarddigital-inv.com

Expect commit: `39db894`


## Deploy gate

- **PASS** Deploy succeeded for expect SHA — https://github.com/wizard-digital/SMART-ERP-POS/actions/runs/29739852292

## Health

- **PASS** Prod health — 200

## Deployed artifact (SSH / container)

- **PASS** Prod server git HEAD matches expect — 39db894
- **PASS** Container dist contains BANK_MANUAL — gov=3 banking=1
- **PASS** Container dist contains deposit GL guard — hits=1

## Authenticated BANK_MANUAL + deposit GL

- **PASS** Prod login — 200
- **SKIP** BANK_MANUAL Sales Deposit — sales=false bank=false
- **SKIP** Deposit rejects bad GL — no bank account linked to 1015/1200/3050 on this tenant

## Verdict

- PASS: 6
- FAIL: 0
- SKIP: 2

**Overall: PASS** — production serves BANK_MANUAL / deposit GL guard for `39db894`.
