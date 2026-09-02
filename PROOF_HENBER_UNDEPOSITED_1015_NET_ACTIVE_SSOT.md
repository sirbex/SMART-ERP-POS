# Expert integrity: Undeposited / liquidity inconsistency closed

## Problem
Henber 1015 showed **UGX −5,030,642** after AR receipt reverses because balances used **bare `Status=POSTED`**, which keeps reverse-journal credits and drops original debits.

## Code SSOT (all spendable paths)
`LEDGER_NET_ACTIVE_SQL` — exclude both reverse-pair legs:

- Banking / funds guard / Move Money (`postedLedgerBalance`)
- Deposit Worksheet clearing GL
- Petty Cash tiles
- Expense pay-from balances + funds check
- Cash flow statement cash balances / movements
- `rebaseAccountBalances` heal

## Henber data heal (live)
| Code | Before (cache) | After (= net-active) |
|------|----------------|----------------------|
| 1015 | −5,030,642 | **−2** |
| 1010 | 1,591,094.99 | 1,627,594.99 |
| 1040 | 481,383 | −518,617 |

1015 false overdraft cleared. 1040’s posted-only figure was inflated by reverse legs; net-active is the consistent truth.

## Gates
- Integrity script: exit 0 (`CurrentBalance` ≡ net-active for 1010/1015/1031/1032)
- Treasury Jest: 82 passed
