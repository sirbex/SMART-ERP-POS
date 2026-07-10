# Inventory Lot — Enterprise Gates (E–I)

Run: 2026-07-07T08:13:56.404Z

Charter: [PROOF_INVENTORY_LOT_CERTIFICATION.md](./PROOF_INVENTORY_LOT_CERTIFICATION.md)


Gate E live rollback: `LOT_PROOF_RECOVERY=1 npm run proof:inventory-lot-enterprise-gates`


## Gate E — Recovery

**Status:** PASS (structural + live rollback)

- [x] Crash mid-receipt — TX rollback, no partial lot
- [x] Crash mid-FEFO allocation — no phantom decrement
- [x] Retry idempotency on receive/consume

## Gate F — Upgrade

**Status:** PASS

- [x] Schema migration vN→vN+1 preserves expiry on all lots
- [x] Projection drift = 0 after upgrade
- [x] Balances unchanged after upgrade replay

## Gate G — Disaster recovery

**Status:** PASS

- [x] Backup artifact created via pg_dump
- [x] Dump manifest contains inventory lot tables and audit
- [x] pg_restore available for controlled restore rehearsal

## Gate H — Audit

**Status:** PASS

- [x] Lot origin traceable (GR / opening / return)
- [x] Expiry change audit trail
- [x] Sale / transfer / adjust / dispose lineage

## Gate I — Scale

**Status:** PASS

- [x] 100k lots — FEFO allocation < 2s in-memory
- [x] 250k lots — benchmark recorded
- [x] 1M lots — benchmark recorded or synthetic fixture

## Artifacts

- Upgrade proof: `src/modules/inventory-lot/inventoryLotUpgradeProof.test.ts`
- Audit proof: `src/modules/inventory-lot/inventoryLotAuditProof.test.ts`
- DR proof: `PROOF_INVENTORY_LOT_DR_RUN.md`
- Scale proof: `PROOF_INVENTORY_LOT_SCALE_RUN.md`