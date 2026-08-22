# PROOF: restaurant split/move paint (deterministic)

- Date: 2026-08-22T20:14:20.697Z
- Runner: `npx vitest run src/lib/restaurantSplitMovePaint.proof.test.ts`

## Policy
Move must always show moved lines on the new ticket. Party pin + paint gen prevent day-to-day strip/refetch races.

## Results
- PASS unit guards prevent whole-ticket Move
- PASS activeOrderId switches to split (moved lines visible)
- PASS party strip carries both tickets after Move
- PASS pin prevents strip scrub of new ticket during refetch race
- PASS FOH + replayer SSOT wiring sealed

## Verdict
**PASS** — deterministic Move paint SSOT.
