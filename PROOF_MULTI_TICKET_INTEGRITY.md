# Proof — Multi-ticket consistency, integrity & accuracy

**Result: PASS** · runAt `2026-08-08T06:40:05.521Z`

| Suite | Pass | Fail |
| --- | ---: | ---: |
| Client (vitest integrity + offline + selectors + adaptive) | 58 | 0 |
| Server (jest multi-ticket evidence + Phase 4 seals) | 7 | 0 |
| **Combined** | **65** | **0** |

## Gates

| ID | Layer | Claim |
| --- | --- | --- |
| `C01-forceNew-distinct-orderIds-money` | behavioral | Party-list forceNew yields distinct orderIds with exact 2dp money |
| `C02-forceNew-ignores-orderId` | behavioral | forceNewTicket never appends to caller-supplied sibling orderId |
| `C03-detail-append-sticky` | behavioral | orderId append stays on selected ticket after newer sibling updates |
| `C04-preferred-missing-null` | behavioral | Unknown preferred orderId returns null (no silent sibling substitute) |
| `I01-bill-isolation` | behavioral | Bill flags only selected order number |
| `I02-pay-isolation` | behavioral | Pay settles one ticket; remaining sibling open; paid preferred → null |
| `I03-kot-isolation` | behavioral | KOT sets kitchenSentAt only on fired ticket |
| `I04-split-money-accuracy` | behavioral | Partial qty move: remainder + destination totals exact |
| `I05-floor-open-count` | behavioral | Open floor lists exactly N distinct open tickets |
| `S01-foh-forceNew-wiring` | structural | FOH forceNewTicket = showSambaTicketList; no samba-open-ticket-first toast |
| `S04-server-forceNew-short-circuit-order` | structural | Server forceNew nulls target before orderId/currentOrderId resolve |
| `S03-adaptive-sheet-column` | structural | fohTicketPane sheet on dense/ultra; column on comfortable |

## Re-run

```bash
node scripts/proof-multi-ticket-integrity.mjs
```

## Precision notes

- Money seals use `Math.round(n * 100) / 100` (2 decimal half-up).
- Party total for sample Soup 2×5.50 + Steak 19.99 + Wine 3×12.25 = **67.74**.
- `forceNewTicket` **ignores** a supplied sibling `orderId` (C02) — required for list-mode menu safety.
- Preferred unknown order id → **null** (C04); never paints another ticket's lines.
- Server `forceNewCheck` short-circuits **before** `orderId` / `current_order_id` append resolve (S04).
