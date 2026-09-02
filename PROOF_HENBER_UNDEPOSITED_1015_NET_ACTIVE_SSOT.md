# PROOF: Henber 1015 Undeposited Funds — net-active SSOT (integrity-gated)

## Verdict

**Bug confirmed. Fix verified live with hard-fail integrity script (exit 0). No assumptions left untested.**

## Measured cause (Henber live)

| Formula | 1015 UGX |
|---------|----------|
| `Status='POSTED'` only | **−5,030,642** |
| `LEDGER_NET_ACTIVE_SQL` | **−2** |
| Unfiltered all ledger lines | **−2** |
| `accounts.CurrentBalance` (cache) | **−5,030,642** |
| Unsettled receipt residual | **0** |

Orphan reverse credits (CRP-000006/007/012/014) = **5,030,640**. Algebra: `postedOnly − netActive = reverse-leg signed = −5,030,640`.

## Fix surfaces (all must use net-active)

1. `postedLedgerBalance.ts` → funds guard + Move Money balances
2. `bankingService.ts` → bank book GL balances
3. `liquidityMovementsReportService.ts` → liquidity account balances
4. `receiptSettlementRepository.getClearingGlBalance` → Deposit Worksheet “Undeposited Funds (GL)”
5. `pettyCashService.getPettyCashBalance` → Petty Cash UI 1015 tile (was `CurrentBalance`)
6. `glRepairService.rebaseAccountBalances` → cache heal must not reintroduce bare POSTED

## Tests

`src/modules/treasury/` — **81 passed**, exit 0.

## Live gate

`SamplePOS.Server/scripts/proof-henber-1015-net-active-integrity.mjs` → `PROOF_HENBER_UNDEPOSITED_1015_NET_ACTIVE_INTEGRITY.json` (`ok: true`).

## Residual

UGX **−2** transfer noise under net-active — not reverse-pair overdraft.

## Note (not swallowed)

`accounts.CurrentBalance` on Henber 1015/1010 still equals bare POSTED until rebase heal is run in that tenant. UI/spendable paths no longer read that cache for 1015 liquidity.
