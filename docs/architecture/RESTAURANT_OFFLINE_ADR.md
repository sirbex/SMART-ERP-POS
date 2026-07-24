# ADR-0xx: Restaurant POS Offline — Local First on Existing Journal

**Status:** Accepted — Phases **5.1–5.5** implemented (restaurant offline complete)  
**Date:** 2026-07-24  
**Context:** Restaurant Phases 1–4 are online-API complete. Offline is mandatory for FOH. SamplePOS already has an offline POS stack.

---

## Decision

Restaurant POS must be **Local First, Cloud Sync Second** by **extending the existing immutable event journal** — not by introducing SQLite, a second IndexedDB schema-as-truth, or a parallel `restaurant_offline_*` queue.

| Layer | Technology (existing) | Restaurant use |
|-------|----------------------|----------------|
| Master-data cache | IndexedDB `pos_offline` + `pos_product_catalog` | Products, categories, prices, taxes, customers |
| Restaurant cache (new, **projection only**) | IndexedDB stores or localStorage mirrors | Tables, stations/printers, waiters, recipes (read), settings, RBAC (already cached) |
| Transaction truth | `pos_offline_events` + `pos_sync_state` | Open checks, KOT fires, bill, pay, cancel, split/merge/transfer |
| Sync | `offlineSyncEngine` → `POST /api/pos/sync-events` → `posEventReplayer` | Same worker as retail |
| Print | `printRestaurant.ts` / `print.ts` (localhost bridge) | KOT / bill / receipt — **never waits on sync** |

**Correction to the prompt’s “SQLite” wording:** client offline truth is the **event journal** (localStorage) plus **IndexedDB/catalog caches**. Server remains PostgreSQL. Do not add sql.js / client SQLite for Restaurant.

Canonical rules remain: `docs/OFFLINE_ARCHITECTURE_RULES.md`.

---

## Hard rules (protect retail + ERP SSOT)

1. **No parallel offline engine.** Same journal keys, same sync endpoint, same replayer module.
2. **No `POST /api/restaurant/*` as the offline write path.** Offline writes = `appendEvent(...)`.
3. **Stable client UUID.** `orderId` created locally (`ofl_ord_…`) never changes; server accepts via idempotency; never generates a replacement identity for that check.
4. **Printing is local.** KOT/bill/receipt use existing print bridges immediately after local append.
5. **Pay SSOT unchanged.** Offline cash → `SALE_COMPLETED` (or restaurant-enriched equivalent) → sync → `createSale` / order complete on server. Recipe FEFO still runs **on server replay**, not a second local inventory ledger.
6. **Local stock for menu parents** may optimistic-decrement like retail; **ingredient BOM consumption** is authoritative on sync (avoid double-deduct). Optional local “reserve” is display-only if added later.
7. **Server never overwrites a completed offline sale.** Duplicate sync → `409` / already applied → mark `SYNCED`.
8. **KDS:** Prefer **LAN to a kitchen device that shares the same local journal projection or a local sync peer** — not cloud. Phase design below; do not require internet for cook flow.

---

## Offline workflow → event mapping

| FOH action | Immediate local effect | Journal event(s) | Sync effect |
|------------|------------------------|------------------|-------------|
| Open table / first item | Table OCCUPIED projection; check open | `RESTAURANT_CHECK_OPENED` or enriched `ORDER_CREATED` | Create `pos_orders` + occupy table |
| Add / remove lines | Update check projection | `ORDER_UPDATED` (+ restaurant fields) | Patch items / totals |
| Assign waiter | Projection | `RESTAURANT_WAITER_ASSIGNED` or fields on update | `waiter_id` |
| Print KOT | **Print now**; mark lines sent locally | `RESTAURANT_KOT_FIRED` | Insert `restaurant_kot*` |
| Print bill | **Print now**; local status BILL | Soft: note on check / no server req | Optional `BILLING` |
| Pay cash | Complete locally; print receipt | `SALE_COMPLETED` (link `orderId`) | `createSale` + release table |
| Cancel check | Free table locally | `ORDER_CANCELLED` | Cancel + release |
| Split / merge / transfer | Update projections | `RESTAURANT_CHECK_SPLIT` / `_MERGED` / `_TRANSFERRED` | Existing Phase 4 service ops via replayer |
| Card / MoMo | Prefer online authorize; else queue as recorded method (manual) like retail | Same payment lines on `SALE_COMPLETED` | Same as retail |

### Local status (UI projection from journal + sync state)

```
LOCAL → KOT_PRINTED → BILL_PRINTED → PAID → WAITING_SYNC → SYNCED
         (and REVIEW/FAILED from pos_sync_state)
```

Derive from events + `pos_sync_state[key]` — do not invent a second status table as truth.

---

## Cache pack (prewarm when online)

| Data | Source today | Offline store |
|------|--------------|---------------|
| Products / prices / tax | Catalog + IDB | Reuse |
| Categories | On products / menu API | Extend catalog or thin category list |
| Tables | `/restaurant/tables` | New cache `restaurant_tables` |
| Stations / printers | `/restaurant/stations` | New cache |
| Waiters | `/restaurant/waiters` | New cache |
| Recipes | `/restaurant/recipes` | Optional read-cache (consume on server) |
| Settings / restaurant flag | system settings | Last-known mirror |
| RBAC | `rbac_permissions` | Already offline-login |
| Open checks | — | **Derived from journal**, not a separate mutable DB |

---

## Printing & kitchen

```
Restaurant POS → appendEvent → printKitchenTicket / printRestaurantBill / printReceipt
                      ↓
              localhost:1811 or Sunmi / window.print
```

KDS options (pick in implementation phase):

1. **Paper KOT only** (already works offline) — MVP  
2. **Kitchen tablet on LAN** reading a shared local projection (BroadcastChannel / local HTTP from waiter device) — Phase B  
3. Cloud KDS — **online-only**, not for outage cooking  

**Phase 5.5 shipped:** same-origin multi-tab KDS via journal selectors (`deriveRestaurantKitchenBoard`) + `BroadcastChannel` (`restaurantLanKds`). Kitchen Display works offline from the shared journal; cross-device LAN without cloud still relies on paper KOT (or online API when available).

Kitchen must not depend on internet for MVP paper path.

---

## Conflict & recovery

- Crash: restore floor from journal replay (open checks still PENDING locally).  
- Sync fail: event stays `PENDING` / `FAILED`; retry via existing `OfflineAutoSync` + SW.  
- Stock conflict on replay: `REVIEW` (same as retail) — do not silently clobber completed paid checks.  
- Split/merge offline: only if event types + replayer land; until then **require online** for Phase 4 ops (explicit).

---

## Explicit non-goals

- Client SQLite / sql.js restaurant database  
- Mutable `restaurant_offline_queue`  
- Posting restaurant REST while offline as primary model  
- Local FEFO lot consumption racing server recipe explosion  
- Cloud-dependent KOT print  

---

## Implementation phases (Restaurant Offline)

| Phase | Deliverable |
|-------|-------------|
| **5.1** | ✅ Cache tables/stations/waiters/menu; offline open check + add items; local KOT/bill print; journal events + selectors |
| **5.2** | ✅ Offline cash pay → `SALE_COMPLETED`; replayer creates sale + releases table; sync status UI on Restaurant POS |
| **5.3** | ✅ Offline cancel; waiter assign; crash restore of open checks |
| **5.4** | ✅ Offline split/merge/transfer events (journal + Phase 4 service replay) |
| **5.5** | ✅ LAN KDS projection (journal board + BroadcastChannel same-origin tabs) |

Restaurant offline phases **5.1–5.5** are complete.
---

## Consequences

- Restaurant and Retail share one sync pipeline and one failure story.  
- Replayer grows restaurant handlers; route stays thin.  
- Some Phase 4 ops may stay online-only until 5.4.  
- Managers see local open tables / pending sync; cloud reports lag until flush.
