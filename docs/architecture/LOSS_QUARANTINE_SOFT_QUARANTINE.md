# Soft Quarantine (Single-Store Mode Adapter)

**Status:** Accepted — Phase P0–P4 of expiry→quarantine→dispose program  
**Parent:** [LOSS_QUARANTINE_ADR.md](./LOSS_QUARANTINE_ADR.md), [LOSS_QUARANTINE_INVARIANTS.md](./LOSS_QUARANTINE_INVARIANTS.md)  
**Touchpoint:** LQ13

## Objective

Give **single-store** tenants the same two-event integrity as multistore:

1. **Quarantine** — non-sellable control; **no** batch qty change; **no** GL  
2. **Dispose / write-off** — batch consume + DR 5110|5120|5130 / CR 1300  

Without requiring a second warehouse/store location.

## Mode adapter (no domain duplication)

| Mode | Quarantine mechanism | Workqueue | Dispose |
|------|----------------------|-----------|---------|
| Multistore | Hard: MAIN/SELLING → `EXPIRED`/`DAMAGE` store (LQ01/LQ02) | Existing aging by store type | `disposeFromQuarantine` (store required) |
| Single-store | Soft: lot status `EXPIRED` / `QUARANTINED` + audit `QUARANTINE_TRANSFER` | Same API/UI; `quarantineMode=SOFT` | Same gateway; store optional; reason→account identical |
| DAMAGE entry | Adjustments → DAMAGE (multistore: DAMAGE store; single-store: soft `QUARANTINED`) | Workqueue **DAMAGE** band | Dispose → 5120 |

**Forbidden:** second loss journal path; auto-P&L on soft quarantine; parallel “expired only” workqueue.

## Soft quarantine contract (LQ-INV-1 / 5 / 6)

| Must | Must not |
|------|----------|
| Set master + projection status `EXPIRED` (expiry) or `QUARANTINED` (damage) | Change `inventory_batches.remaining_quantity` **on the quarantined lot** |
| Tag movement `economic_event=QUARANTINE_TRANSFER`, `posts_gl=false`, `reference_type=SOFT_QUARANTINE` | Post 5110/5120/5130 |
| Appear on quarantine aging | Bypass FEFO / sale eligibility (status already non-selectable) |
| Dispose via existing LOSS_DISPOSAL gateway | Invent new expense accounts |
| **Partial qty** → `LotService.splitLot` then soft-quarantine **child only**; parent stays ACTIVE | Flip whole-batch status when only part is damaged/expired |

## P1 scope (delivered)

- Soft quarantine apply (full remaining **or** partial via lot split; single-store only)  
- Aging includes soft lines when multistore off  
- Dispose soft lines (parity expense map)  
- Workqueue UI available without MultistoreGate  
- Evidence gates for wiring + invariants  

## P2 scope (delivered)

- **Unified expiry automation** (`expiryAutomationService`):  
  - Multistore → HARD EXPIRED-store transfer (unchanged economics)  
  - Single-store → SOFT status quarantine via `applySoftQuarantine`  
- Same tenant flag `expiry_automation_enabled` (default **false**)  
- Nightly job runs either mode when flag on; preview/process APIs mode-aware  
- Automation movements use `EXPIRY_AUTOMATION` + `QUARANTINE_TRANSFER` / `posts_gl=false`  
- `SOFT_QUARANTINE` included in GL-repair skip heuristics (LQ-INV-8)  
- UI: ExpiryAutomationPanel (no MultistoreGate); Quarantine workqueue + Settings inventory  

## Partial damage / expiry (SAP/Odoo parity)

| Qty vs remaining | Behavior |
|------------------|----------|
| Equal | Soft-quarantine parent batch (status only; remaining unchanged) |
| Less | `splitLot` → child gets damaged/expired qty → soft-quarantine child; parent remaining stays sellable |
| Greater | Reject |

Split audit: `reference_type=LOT_SPLIT`, `posts_gl=false`, Σ parent+child remaining = original. No cost-layer insert (avoids double GL). Migration `609_lot_split_parent.sql` adds `parent_lot_id` genealogy.

## Out of scope (later)

- Lot merge (`mergeLot`)

## P3 scope (delivered)

- Expiring Items register remains **warning SSOT** (ACTIVE + horizon)  
- Per-row **Quarantine** on **expired** bands only → `POST …/from-expiring-report`  
- Bulk quarantine for expired rows in the current filter  
- Deep-link to `/inventory/quarantine` (dispose / aging follow-up)  
- Mode adapter: soft status vs hard EXPIRED-store move; **no P&L** on this action  

## P4 scope (delivered)

- **Separate** tenant flags: `quarantine_auto_dispose_enabled` (default **false**) + `quarantine_auto_dispose_min_age_days` (default **30**)  
- Nightly 04:30 job (after expiry quarantine at 04:00) — no-op when flag off  
- Candidates = quarantine aging **EXPIRED** bucket only at/above min age (DAMAGE/RETURN stay manual)  
- Dispose via existing `disposeFromQuarantine` (soft/hard) — **posts P&L** (5130 path for expiry)  
- Cap 100 lines/run; preview + force process APIs; workqueue + Settings UI  
- Does **not** replace manual dispose; expiry automation remains quarantine-only  

## Proof

`PROOF_SOFT_QUARANTINE_P1` · `PROOF_SOFT_QUARANTINE_P2` · `PROOF_SOFT_QUARANTINE_P3` · `PROOF_SOFT_QUARANTINE_P4` · LQ fitness must stay green.
