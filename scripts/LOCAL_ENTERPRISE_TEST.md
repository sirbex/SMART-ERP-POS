# Local enterprise testing (Phase B + C)

## 1. Database

```bash
cd SamplePOS.Server
npm run migrate
```

- Applies numbered migrations only (`419_sale_line_price_events.sql`, etc.).
- **Skipped automatically:** `rebuild_gl_period_balances.sql`, `repair_rgrn_uom_mismatch.sql` (manual `psql` scripts).

## 2. Proofs (no server required)

```bash
npm run proof:enterprise
```

## 3. Start stack

Terminal 1 — API:

```bash
cd SamplePOS.Server
npm run dev
```

Terminal 2 — client:

```bash
cd samplepos.client
npm run dev
```

Default API: `http://localhost:3001`  
Default client: `http://localhost:5173`

## 4. Manual checks

| Feature | How to test |
|---------|-------------|
| Customer GL statement | Customers → open customer → **Transactions** → **GL statement** tab |
| Invoice OVERDUE filter | `GET /api/invoices?status=OVERDUE` or invoices UI with filter |
| Hide cancelled POs | Purchase orders list (cancelled hidden unless `?status=CANCELLED`) |
| RGRN cost layers | Post a Return GRN on FIFO product; confirm `cost_layers` rows decrease |
| Sale price audit | Migration `419` → `sale_line_price_events` table exists |

### Smart statement API

```http
GET /api/customers/{id}/smart-statement?startDate=2026-01-01&endDate=2026-05-31
Authorization: Bearer {token}
```

Response includes `entries` (GL), `openItemEntries` (reversed allocations), `unallocatedReceipts`.
