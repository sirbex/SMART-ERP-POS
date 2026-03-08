# SMART-ERP-POS

**Enterprise ERP & Point of Sale System** built with React 19, TypeScript, Node.js/Express 5, and PostgreSQL.

A production-ready business management platform combining Point of Sale operations, inventory management (FEFO batch tracking, unit conversions), double-entry accounting, banking & reconciliation, purchase order workflows, quotations, invoicing, customer/supplier management, expense tracking, and comprehensive reporting with PDF export.

**Production Readiness: 96/100** | **281 tests (175 backend + 106 frontend)** | **30 backend modules** | **~48 pages**

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19 + Vite 7 + TypeScript + Tailwind CSS 3.4 + Radix UI (15 primitives) + TanStack React Query 5 + Zustand 5 |
| **Backend** | Node.js + Express 5 + TypeScript 5.9 + raw SQL (no ORM) |
| **Database** | PostgreSQL 15 (production) / SQLite (offline fallback) |
| **Auth** | JWT + Refresh Tokens + 2FA (TOTP via otplib) + RBAC (4 roles) |
| **Validation** | Zod 4 (shared between frontend & backend) |
| **API Docs** | Swagger UI (OpenAPI 3.0) at `/api/docs` |
| **PDF/Reports** | PDFKit + jsPDF + jsPDF-AutoTable |
| **Queue/Cache** | Bull + Redis 7 + NodeCache |
| **Precision** | Decimal.js for all financial calculations |
| **Security** | Helmet + CORS (env-based) + rate limiting + correlation IDs |
| **Process Mgmt** | PM2 (ecosystem.config.cjs) |
| **Testing** | Jest 30 (backend, ESM) + Vitest 3 (frontend) |
| **Containerization** | Docker Compose (dev, production, hybrid variants) |

---

## Modules

### Point of Sale
- Predictive unified search across products, cart items, and customers
- FEFO (First Expiry First Out) batch selection
- Inline quantity/unit editing with multi-UoM support
- Per-item discount support with amount tracking on line items
- Hold/recall carts (Ctrl+H), persistent auto-save to localStorage
- Multi-payment-type checkout (cash, card, mobile money, credit) with split payments and change calculation
- Receipt printing with cashier name attribution, barcode scanning (CODE128)
- Discount engine with customer group pricing tiers
- Cash register management (open/close, cash movements, register CRUD in System Settings)
- Cashier sales scoping — server-enforced data isolation (cashiers see only their own sales across all 5 sales endpoints)
- Role-scoped Dashboard (cashiers: POS/My Sales/Customers only, profit KPIs hidden)
- Offline mode with IndexedDB storage and background sync

### Inventory Management
- Product catalog with batch & expiry tracking
- Unit of Measure (UoM) conversions (e.g., carton → pieces, pack sizes)
- Stock levels with reorder flagging & low stock alerts
- Stock movements audit trail
- Purchase Orders (DRAFT → PENDING → COMPLETED) with auto-generated PO numbers
- Goods Receipts with batch creation on finalization
- Stock count / physical inventory
- Inventory adjustments with GL integration
- Batch management with expiry alerts
- Barcode lookup
- CSV export
- SAP-style vertical partition (`product_inventory`, `product_valuation`, `products_full` view)
- Self-learning demand forecasting with safety stock calculations (see Smart Reorder AI section)
- Inventory ledger with valuation layer tracking

### Accounting
- Chart of Accounts (assets, liabilities, equity, revenue, expenses)
- General Ledger with double-entry posting (single source of truth)
- Trial Balance & Financial Statements (Balance Sheet, P&L)
- Journal Entries (manual & system-generated)
- Accounting Period management (open/close)
- GL validation & integrity checks
- Cost layer valuation (FIFO/AVCO)
- Document immutability triggers (9 triggers protecting finalized records)
- Optimistic Concurrency Control (OCC) on 13 tables with version columns

### Banking & Reconciliation
- Bank account management
- Transaction import & statement processing
- Automated pattern learning for categorization
- Recurring transaction rules
- Bank reconciliation workflow
- Alerts and reporting

### Invoicing & Payments
- Comprehensive invoice creation & management with customizable settings
- Customer payments with ledger posting
- Supplier payments & bill tracking
- Credit sales with customer ledger integration
- Customer deposits
- Invoice-ledger integration dashboard

### Quotations
- Create, edit, and manage quotations
- Convert quotations to sales
- Quote detail view with PDF export

### Customers & Suppliers
- Customer management with group pricing tiers
- Customer detail pages with financial history & statements
- Customer aging reports
- Customer financial pages with store credits and deposits
- Supplier management with performance tracking
- Supplier cost analysis and detail pages

### Expenses
- Expense recording with category management
- Expense approval workflows
- Expense reports with GL integration
- Document upload & gallery attachments

### Reports (15+ types with PDF export)
- Sales reports (daily, period, hourly analysis)
- Inventory reports (stock levels, aging, valuation)
- Profit margin analysis by product
- Supplier cost analysis
- Reorder recommendations
- Customer purchase history
- Deleted items & stock adjustment reports
- Expense reports
- Financial statements (Balance Sheet, P&L, Trial Balance)

### Administration
- Role-based access control (ADMIN, MANAGER, CASHIER, STAFF)
- Custom role management with granular permissions
- Audit trail with full action logging
- Data management (backup, restore, reset)
- System & security settings
- Password policies & expiry enforcement
- User management
- Idle timeout enforcement

### Platform (Multi-Tenant)
- Platform dashboard with tenant management
- Platform health monitoring
- Data synchronization across tenants
- Platform-level admin and login

---

## Production Readiness

### Security Hardening
- **JWT_SECRET**: Hard-fails in production if not set; warns in development with insecure fallback
- **DB_PASSWORD**: Hard-fails in production if not set; dev-only fallback
- **CORS**: Environment-based origins via `CORS_ORIGIN` (comma-separated)
- **Docker secrets**: All compose files enforce `${VAR:?must be set}` for sensitive values in production
- **Helmet**: Security headers enabled by default
- **Rate limiting**: Express rate-limit on all API routes

### Observability
- **Correlation IDs**: Every request gets/generates `x-request-id`, included in all error responses and logs
- **Structured logging**: Winston logger with timestamps
- **Health check**: `/health` endpoint with instant DB connectivity check (no retry delays)
- **Request ID tracing**: Propagated through all 5 error handler branches (AppError, domain, Zod, unhandled, 404)

### Infrastructure
- **PM2**: Production process manager with auto-restart (max 10 retries, 5s delay), 512MB memory limit
- **Connection retry**: Exponential backoff on DB connection (1s→2s→4s→8s→16s, up to 5 retries)
- **Bundle splitting**: Frontend split into 10 optimized chunks (vendor, ui, router, charts, forms, pdf, query, utils)

### Data Integrity
- **9 immutability triggers**: Protect finalized documents from modification
- **OCC (Optimistic Concurrency Control)**: Version columns on 13 critical tables
- **SAP-style partition**: Products split into `product_inventory` + `product_valuation` with unified `products_full` view
- **Zod validation**: ~80+ API handlers validated with shared schemas

---

## Project Structure

```
SMART-ERP-POS/
├── samplepos.client/             # React 19 + Vite 7 frontend
│   ├── src/
│   │   ├── components/           # 87 UI components
│   │   │   ├── auth/             # Login, 2FA, password, protected routes (6)
│   │   │   ├── banking/          # Bank accounts, reconciliation, statements (10)
│   │   │   ├── barcode/          # Barcode scanner indicator
│   │   │   ├── cash-register/    # Register open/close, cash movements (4)
│   │   │   ├── customers/        # Customer detail, credits, deposits (4)
│   │   │   ├── documents/        # Upload & gallery (2)
│   │   │   ├── expenses/         # Expense forms & approval (3)
│   │   │   ├── inventory/        # Stock, batches, GR modals, UoM (10)
│   │   │   ├── offline/          # Offline sync status panel
│   │   │   ├── platform/         # Platform layout
│   │   │   ├── pos/              # Split payment, hold cart, discounts (13)
│   │   │   ├── products/         # Product forms, UoM, pack sizes (3)
│   │   │   ├── reports/          # Customer aging reports
│   │   │   └── ui/               # Radix-based design system (19)
│   │   ├── contexts/             # Auth context provider
│   │   ├── hooks/                # 25 custom hooks (React Query, auth, RBAC, etc.)
│   │   ├── pages/                # ~48 route pages
│   │   │   ├── accounting/       # 13 accounting pages
│   │   │   ├── admin/            # Role management
│   │   │   ├── customers/        # Customer detail
│   │   │   ├── delivery/         # Delivery tracking
│   │   │   ├── inventory/        # 9 inventory pages
│   │   │   ├── platform/         # 5 multi-tenant pages
│   │   │   ├── pos/              # POS terminal + product search
│   │   │   ├── quotations/       # 5 quotation pages (CRUD + conversion)
│   │   │   ├── reports/          # Expense reports
│   │   │   ├── settings/         # 3 settings pages + 4 tab panels
│   │   │   └── suppliers/        # Supplier detail
│   │   ├── services/             # API clients
│   │   ├── stores/               # Zustand stores (auth, cart, inventory)
│   │   ├── types/                # TypeScript interfaces
│   │   ├── utils/                # Currency, formatting, validation, UoM
│   │   └── validation/           # Zod schemas
│   └── package.json
├── SamplePOS.Server/             # Node.js + Express 5 backend
│   ├── src/
│   │   ├── config/               # Swagger OpenAPI spec
│   │   ├── modules/              # 30 feature modules
│   │   │   ├── accounting/       # GL, chart of accounts, integrity
│   │   │   ├── admin/            # Admin operations
│   │   │   ├── audit/            # Audit trail
│   │   │   ├── auth/             # JWT, 2FA, refresh tokens, password policy
│   │   │   ├── bank-cash/        # Bank & cash operations
│   │   │   ├── cash-register/    # Register management
│   │   │   ├── customers/        # Customer CRUD & statements
│   │   │   ├── delivery/         # Delivery tracking
│   │   │   ├── deposits/         # Customer deposits
│   │   │   ├── discounts/        # Discount engine
│   │   │   ├── documents/        # File upload & management
│   │   │   ├── financial-reports/ # Financial reporting
│   │   │   ├── goods-receipts/   # GR workflow
│   │   │   ├── inventory/        # Stock management & counts
│   │   │   ├── invoices/         # Invoice CRUD
│   │   │   ├── payments/         # Payment processing
│   │   │   ├── platform/         # Multi-tenant platform
│   │   │   ├── pos/              # Cart hold/recall, offline sync
│   │   │   ├── products/         # Product catalog & UoM
│   │   │   ├── purchase-orders/  # PO lifecycle
│   │   │   ├── quotations/       # Quotation management
│   │   │   ├── reports/          # 15+ report types + PDF export
│   │   │   ├── sales/            # Sales processing
│   │   │   ├── settings/         # Invoice settings
│   │   │   ├── stock-movements/  # Stock movement tracking
│   │   │   ├── supplier-payments/# Supplier bill payments
│   │   │   ├── suppliers/        # Supplier management
│   │   │   ├── system-management/# Backup, restore, reset
│   │   │   ├── system-settings/  # System configuration
│   │   │   └── users/            # User CRUD
│   │   ├── rbac/                 # Role-based access control engine
│   │   ├── repositories/         # Shared SQL repositories
│   │   ├── routes/               # 35 route files
│   │   ├── services/             # 21+ business services
│   │   ├── middleware/           # Auth, validation, security, audit, correlation IDs
│   │   ├── types/                # TypeScript definitions
│   │   └── utils/                # Logger, PDF generator, money, pagination, batchFetch
│   └── package.json
├── database/
│   ├── migrations/               # SQL migration scripts
│   ├── seeds/                    # Seed data
│   └── setup.sh                  # DB setup script
├── docker-compose.yml            # Development (6 services)
├── docker-compose.production.yml # Production (multi-instance backend)
├── docker-compose.hybrid.yml     # Hybrid (Node.js + C# accounting)
├── ecosystem.config.cjs          # PM2 process manager config
└── shared/                       # Shared types, Zod schemas, SQL
```

Each backend module follows strict layering:
```
controller.ts → service.ts → repository.ts → PostgreSQL
   (HTTP)        (logic)        (raw SQL)
```

---

## API Endpoints (35 route groups)

| Endpoint | Description |
|----------|-------------|
| `/api/auth` | Authentication, 2FA, tokens, password management |
| `/api/products` | Product catalog CRUD |
| `/api/customers` | Customer management |
| `/api/suppliers` | Supplier management |
| `/api/sales` | Sales processing |
| `/api/pos/hold` | Cart hold & recall |
| `/api/pos/sync-offline-sales` | Offline sales synchronization |
| `/api/inventory` | Stock levels & management |
| `/api/inventory/stock-counts` | Physical stock counts |
| `/api/purchase-orders` | Purchase order lifecycle |
| `/api/goods-receipts` | Goods receipt workflow |
| `/api/stock-movements` | Stock movement tracking |
| `/api/invoices` | Invoice management |
| `/api/payments` | Payment processing |
| `/api/deposits` | Customer deposits |
| `/api/quotations` | Quotation CRUD & conversion |
| `/api/discounts` | Discount rules & engine |
| `/api/accounting` | Core accounting operations |
| `/api/accounting/comprehensive` | Full accounting suite |
| `/api/accounting/integrity` | GL integrity checks |
| `/api/erp-accounting` | ERP financial reporting |
| `/api/banking` | Banking & reconciliation |
| `/api/expenses` | Expense management |
| `/api/reports` | Report generation & PDF export |
| `/api/users` | User management |
| `/api/admin` | Admin operations |
| `/api/rbac` | Role & permission management |
| `/api/audit` | Audit trail |
| `/api/cash-registers` | Cash register management |
| `/api/supplier-payments` | Supplier payment tracking |
| `/api/documents` | Document upload |
| `/api/delivery` | Delivery tracking |
| `/api/settings/invoice` | Invoice settings |
| `/api/system-settings` | System configuration |
| `/api/system` | Backup, restore, reset |
| `/api/docs` | **Swagger UI** (interactive API documentation) |
| `/api/docs.json` | OpenAPI 3.0 JSON spec |
| `/health` | Health check |

All responses follow:
```json
{ "success": true, "data": { }, "message": "..." }
{ "success": false, "error": "Descriptive error message", "requestId": "uuid" }
```

---

## Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Redis (optional, for queues/caching)

### Installation

```powershell
# Clone
git clone https://github.com/sirbex/SMART-ERP-POS.git
cd SMART-ERP-POS

# Backend
cd SamplePOS.Server
npm install
cp .env.example .env   # Configure DATABASE_URL, JWT_SECRET, etc.

# Frontend
cd ../samplepos.client
npm install
```

### Environment Variables

Copy `.env.example` and configure:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `DB_PASSWORD` | **Production** | Database password (hard-fails if missing in production) |
| `JWT_SECRET` | **Production** | 64-char random string (hard-fails if missing in production) |
| `JWT_EXPIRES_IN` | No | Token expiry, default `7d` |
| `PORT` | No | Backend port, default `3001` |
| `NODE_ENV` | No | `development` or `production` |
| `CORS_ORIGIN` | No | Comma-separated allowed origins |
| `COMPANY_NAME` | No | Company display name |
| `COMPANY_ADDRESS` | No | Company address for receipts |
| `COMPANY_TAX_ID` | No | Tax identification number |
| `CURRENCY` | No | Default `USD` |
| `DEFAULT_TAX_RATE` | No | Default `0.15` (15%) |
| `ACCOUNTING_API_URL` | No | C# accounting API URL |
| `ACCOUNTING_API_KEY` | **Production** | Accounting API authentication key |

### Database Setup

```powershell
# Create database
psql -U postgres -c "CREATE DATABASE pos_system;"

# Run migrations
psql -U postgres -d pos_system -f database/migrations/001_create_core_tables.sql
psql -U postgres -d pos_system -f database/migrations/002_security_enhancements.sql
```

### Development

```powershell
# Quick start (launches both servers)
.\start-dev.ps1

# Or manually:
# Terminal 1 - Backend (port 3001)
cd SamplePOS.Server
npm run dev

# Terminal 2 - Frontend (port 5173)
cd samplepos.client
npm run dev
```

| Service | URL |
|---------|-----|
| Frontend | http://127.0.0.1:5173 |
| Backend API | http://localhost:3001 |
| Swagger UI | http://localhost:3001/api/docs |
| Health Check | http://localhost:3001/health |

### Build

```powershell
# Backend
cd SamplePOS.Server
npm run build       # TypeScript → dist/

# Frontend
cd samplepos.client
npm run build       # TypeScript + Vite → dist/ (10 optimized chunks)
```

### Testing

```powershell
# Backend unit tests (175 tests, 8 suites)
cd SamplePOS.Server
npm test

# Frontend unit tests (106 tests, 7 suites)
cd samplepos.client
npx vitest run

# Accounting integrity tests
cd SamplePOS.Server
npm run test:accounting

# API integration tests (PowerShell)
.\test-api.ps1
```

### Production Deployment

```powershell
# Using PM2
cd SamplePOS.Server
npm run build
pm2 start ecosystem.config.cjs

# Using Docker
docker-compose -f docker-compose.production.yml up -d
```

---

## Docker Deployment

Three Docker Compose configurations are available:

| Config | Use Case | Services |
|--------|----------|----------|
| `docker-compose.yml` | Development | postgres, redis, backend, accounting-api, frontend, nginx |
| `docker-compose.production.yml` | Production | Multi-instance backend (3), workers (2), postgres, redis, nginx |
| `docker-compose.hybrid.yml` | Hybrid | Node.js API + C# accounting API, postgres, redis, nginx |

All production/hybrid compose files enforce environment secrets:
```yaml
JWT_SECRET: ${JWT_SECRET:?JWT_SECRET must be set}
DB_PASSWORD: ${DB_PASSWORD:?DB_PASSWORD must be set}
ACCOUNTING_API_KEY: ${ACCOUNTING_API_KEY:?must be set}
```

---

## Keyboard Shortcuts (POS)

| Shortcut | Action |
|----------|--------|
| `Ctrl+F` | Focus product search |
| `Ctrl+H` | Hold cart / Retrieve holds |
| `Ctrl+Enter` | Open payment modal |
| `Ctrl+D` | Apply discount |
| `Ctrl+S` | Save cart manually |
| `Ctrl+R` | Recall saved cart |
| `Esc` | Close current modal |
| `Tab` / `Shift+Tab` | Navigate within modals |

---

## Architecture Principles

- **No ORM** — All database access uses parameterized raw SQL via `pg` (no Prisma/Sequelize/TypeORM)
- **Strict layering** — Controller → Service → Repository (never skip layers)
- **Financial precision** — `Money` utility wrapping Decimal.js for all currency/quantity arithmetic
- **Dual ID system** — UUIDs for database keys, human-readable business IDs for display (e.g., `SALE-2025-0001`, `PO-2025-0042`)
- **Shared validation** — Zod schemas shared between frontend and backend
- **Timezone strategy** — DATE columns stored as `YYYY-MM-DD` strings, timestamps as TIMESTAMPTZ (UTC)
- **RBAC** — Four roles (ADMIN, MANAGER, CASHIER, STAFF) with granular permissions
- **Transactions** — `withTransaction` utility for all multi-table operations
- **Error handling** — `asyncHandler` wrapping all routes, typed error classes (NotFoundError, ValidationError, ConflictError, etc.)
- **Pagination** — `PaginationHelper` for all list endpoints with `batchFetch` to prevent N+1
- **Correlation IDs** — `x-request-id` on every request for cross-service tracing
- **Immutability** — Database triggers prevent modification of finalized financial documents
- **OCC** — Version columns prevent concurrent update conflicts on critical tables

---

## System Metrics

| Metric | Count |
|--------|-------|
| Backend Modules | 30 |
| Backend Route Files | 35 |
| Backend Services | 21+ |
| Frontend Components | 87 |
| Frontend Hooks | 25 |
| Frontend Pages | ~48 |
| API Tags (Swagger) | 14 |
| Backend Tests | 175 (8 suites) |
| Frontend Tests | 106 (7 suites) |
| **Total Tests** | **281** |
| Docker Services | 6 (dev) |

---

## Smart Reorder AI

An AI-powered inventory assistant that goes beyond simple velocity calculations. It analyzes sales history, detects seasonal demand trends, factors in supplier lead times, and computes statistical safety stock to recommend precisely what to order, how much, and when — so small businesses never run out of stock or over-order.

### How It Works

```
Sales History → Velocity + Trend Detection → Lead Time Aware → Safety Stock (σ × √L) → Smart Order Qty
```

**Algorithm pipeline:**

1. **Sales velocity** — Computes average daily units sold from `sale_items` over a configurable period (default 30 days)
2. **Trend detection** — Calculates a separate 7-day recent velocity and compares to the full-period average:
   - `trendRatio > 1.15` → **INCREASING** (demand growing)
   - `trendRatio < 0.85` → **DECREASING** (demand slowing)
   - Otherwise → **STABLE**
3. **Seasonal weighting** — Blends velocities: `effectiveVelocity = 0.70 × fullPeriodAvg + 0.30 × recent7dayAvg`, giving more weight to recent demand patterns
4. **Supplier lead time** — Pulls `lead_time_days` from the supplier table (via PO→GR chain), and cross-references with actual measured PO-to-GR delivery history
5. **Safety stock** — Uses demand variability (standard deviation of daily sales via `STDDEV_POP`) and lead time:
   - `safetyStock = ⌈1.65 × σ × √leadTime⌉` (targets 95% service level)
6. **Reorder point** — `reorderPoint = ⌈effectiveVelocity × leadTime + safetyStock⌉`
7. **Order quantity** — `orderQty = max(⌈effectiveVelocity × (leadTime + reviewPeriod) + safetyStock − currentStock⌉, 0)`
8. **Lead-time-aware priority** — Triggers relative to supplier delivery time:
   - **URGENT**: Days until stockout ≤ lead time (will run out before resupply arrives)
   - **HIGH**: Days until stockout ≤ 2× lead time (tight window)
   - **MEDIUM**: At or below reorder level
9. **Estimated cost** — Multiplies suggested quantity by cost price from `product_valuation`
10. **Preferred supplier** — Auto-detected from the most recent purchase order → goods receipt chain

### Example Output

```
Product: Cooking Oil 5L
  Average daily sales:    12 units
  Recent 7-day trend:     14.3 units/day (INCREASING ↑)
  Supplier lead time:     5 days
  Safety stock:           18 units (σ=4.2, 95% service level)
  Reorder point:          82 units
  Current stock:          25 units
  → Recommended order:    80 units    Priority: URGENT
```

### Trigger Conditions

A product appears in recommendations when **either**:
- Current stock ≤ product's `reorder_level`, **OR**
- Predicted days until stockout ≤ 14 (based on effective sales velocity)

### API Endpoints

```
GET  /api/reports/reorder-recommendations?days_to_consider=30&category_id=UUID&format=json|pdf|csv
POST /api/reports/generate  { reportType: "REORDER_RECOMMENDATIONS", daysToConsider: 30 }
```

### Response Shape

```json
{
  "success": true,
  "data": {
    "reportType": "REORDER_RECOMMENDATIONS",
    "summary": {
      "totalProductsNeedingReorder": 12,
      "urgentCount": 3,
      "highCount": 5,
      "mediumCount": 4,
      "totalEstimatedCost": 4500.00,
      "trendingUp": 4,
      "trendingDown": 2,
      "avgLeadTimeDays": 6
    },
    "data": [
      {
        "productName": "Cooking Oil 5L",
        "sku": "OIL-005",
        "currentStock": 25,
        "reorderLevel": 50,
        "dailySalesVelocity": 12.0,
        "daysUntilStockout": 2,
        "suggestedOrderQuantity": 80,
        "estimatedOrderCost": 2400.00,
        "preferredSupplier": "Acme Supplies",
        "priority": "URGENT",
        "leadTimeDays": 5,
        "safetyStock": 18,
        "reorderPoint": 82,
        "demandTrend": "INCREASING",
        "trendRatio": 1.19
      }
    ]
  }
}
```

### Frontend Access

Available in **Reports → Inventory → Smart Reorder AI** (🤖) with:
- Configurable analysis period (7–365 days slider)
- Category filter
- PDF export with summary cards (urgent/high/medium/trending counts)
- Color-coded priorities (URGENT=red, HIGH=orange, MEDIUM=yellow)
- Demand trend indicators (INCREASING=green, DECREASING=red, STABLE=gray)

### Data Dependencies

| Requirement | Where to Set | Why |
|-------------|-------------|-----|
| **Reorder levels** | Product Inventory settings (`product_inventory.reorder_level`) | Defines minimum stock threshold |
| **Active sales history** | Happens automatically from POS sales | Drives velocity + trend calculation |
| **Cost prices** | Product Valuation (`product_valuation.cost_price`) | Calculates estimated order cost |
| **Supplier links** | Create Purchase Orders → Goods Receipts for products | Auto-detects supplier + measures lead time |
| **Supplier lead times** | Suppliers → Edit → Lead Time Days (default: 7) | Safety stock and priority calculations |
| **Batch inventory** | Receive goods via Goods Receipts (creates `inventory_batches`) | Tracks actual remaining stock |

### Getting It Working

1. **Set reorder levels** on products — Inventory → Products → Edit → "Reorder Level"
2. **Set supplier lead times** — Suppliers → Edit → "Lead Time Days" (defaults to 7 if not set)
3. **Process sales** through POS — needs 7–30+ days of history for meaningful trend detection
4. **Receive inventory** via Purchase Orders → Goods Receipts — creates trackable batches
5. **Run the report** — Reports → "Smart Reorder AI" → set analysis period → Generate
6. **Export to PDF** — "Smart Reorder AI Report" with lead-time-aware summary cards and 10-column detail table

### Future Enhancements (Roadmap)

| Enhancement | Description | Status |
|-------------|-------------|--------|
| **Seasonal demand weighting** | Blend 70% full-period + 30% recent-7-day velocity | ✅ Implemented |
| **Lead time integration** | Factor `suppliers.lead_time_days` into priority + order qty | ✅ Implemented |
| **Safety stock calculation** | Buffer via `1.65 × σ × √leadTime` (95% service level) | ✅ Implemented |
| **Trend detection** | INCREASING / DECREASING / STABLE from 7-day vs full-period ratio | ✅ Implemented |
| **Actual lead time measurement** | Average PO→GR delivery days from historical data | ✅ Implemented |
| **Auto-PO generation** | One-click "Create Purchase Orders" grouped by supplier | Planned |
| **Dashboard widget** | Real-time urgent reorder alerts on main Dashboard | Planned |

---

## License

MIT

---

## AI Coding Agent Instructions

If you're using an AI assistant (like Copilot) with this repo:

- Global contract for schema/validation/UI synchronization: `./copilot.md`
- Full project rules and architecture guidance: `./COPILOT_INSTRUCTIONS.md`
- GitHub-scoped agent guide (for PRs/CI context): `./.github/copilot-instructions.md`
- Implementation rules (mandatory): `./COPILOT_IMPLEMENTATION_RULES.md`

These documents define strict layering, no-ORM policy, shared Zod validation, timezone strategy, and the mandatory API response format.
