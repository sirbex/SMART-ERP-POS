# SMART-ERP-POS

**Enterprise ERP & Point of Sale System** built with React 19, TypeScript, Node.js/Express, and PostgreSQL.

A full-featured business management platform combining Point of Sale operations, inventory management (FEFO batch tracking, unit conversions), double-entry accounting, banking & reconciliation, purchase order workflows, quotations, invoicing, customer/supplier management, expense tracking, and comprehensive reporting with PDF export.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19 + Vite 7 + TypeScript + Tailwind CSS + Radix UI + TanStack React Query + Zustand |
| **Backend** | Node.js + Express 5 + TypeScript + raw SQL (no ORM) |
| **Database** | PostgreSQL (production) / SQLite (offline fallback) |
| **Auth** | JWT + Refresh Tokens + 2FA (TOTP) + RBAC |
| **Validation** | Zod (shared between frontend & backend) |
| **PDF/Reports** | PDFKit + jsPDF |
| **Queue/Cache** | Bull + Redis + NodeCache |
| **Precision** | Decimal.js for all financial calculations |

---

## Modules

### Point of Sale
- Predictive unified search across products, cart items, and customers
- FEFO (First Expiry First Out) batch selection
- Inline quantity/unit editing with multi-UoM support
- Hold/recall carts (Ctrl+H), persistent auto-save
- Multi-payment-type checkout with change calculation
- Receipt printing, barcode scanning (CODE128)
- Discount engine with customer group pricing
- Offline mode with background sync

### Inventory Management
- Product catalog with batch & expiry tracking
- Unit of Measure (UoM) conversions (e.g., carton → pieces)
- Stock levels with reorder flagging & low stock alerts
- Stock movements audit trail
- Purchase Orders (DRAFT → PENDING → COMPLETED)
- Goods Receipts with batch creation on finalization
- Stock count / physical inventory
- CSV export

### Accounting
- Chart of Accounts (assets, liabilities, equity, revenue, expenses)
- General Ledger with double-entry posting
- Trial Balance & Financial Statements (Balance Sheet, P&L)
- Journal Entries (manual & system-generated)
- Accounting Period management (open/close)
- GL validation & integrity checks
- Cost layer valuation (FIFO/AVCO)

### Banking & Reconciliation
- Bank account management
- Transaction import & statement processing
- Automated pattern learning for categorization
- Recurring transaction rules
- Bank reconciliation workflow
- Alerts and reporting

### Invoicing & Payments
- Comprehensive invoice creation & management
- Customer payments with ledger posting
- Supplier payments & bill tracking
- Credit sales with customer ledger integration
- Customer deposits

### Quotations
- Create, edit, and manage quotations
- Convert quotations to sales
- Quote detail view with PDF export

### Customers & Suppliers
- Customer management with group pricing tiers
- Customer detail pages with financial history & statements
- Customer aging reports
- Supplier management with performance tracking
- Supplier cost analysis

### Expenses
- Expense recording with category management
- Expense approval workflows
- Expense reports with GL integration

### Reports (15+ types with PDF export)
- Sales reports (daily, period, hourly analysis)
- Inventory reports (stock levels, aging, valuation)
- Profit margin analysis by product
- Supplier cost analysis
- Reorder recommendations
- Customer purchase history
- Deleted items & stock adjustment reports
- Expense reports

### Administration
- Role-based access control (ADMIN, MANAGER, CASHIER, STAFF)
- Custom role management with granular permissions
- Audit trail with full action logging
- Data management (backup, restore, reset)
- System & security settings
- Password policies & expiry enforcement
- User management

---

## Project Structure

```
SMART-ERP-POS/
├── samplepos.client/             # React 19 + Vite frontend
│   ├── src/
│   │   ├── components/           # UI components (80+ files)
│   │   │   ├── auth/             # Login, 2FA, password, protected routes
│   │   │   ├── banking/          # Bank accounts, reconciliation, statements
│   │   │   ├── expenses/         # Expense forms & management
│   │   │   ├── inventory/        # Stock, batches, GR modals, UoM
│   │   │   ├── products/         # Product forms & UoM sections
│   │   │   ├── reports/          # Customer aging & report components
│   │   │   └── ui/               # Radix-based design system
│   │   ├── contexts/             # Auth context provider
│   │   ├── hooks/                # 20+ custom hooks (React Query, auth, etc.)
│   │   ├── pages/                # Route pages
│   │   │   ├── accounting/       # 12 accounting pages
│   │   │   ├── admin/            # Role management
│   │   │   ├── customers/        # Customer detail
│   │   │   ├── inventory/        # 7 inventory pages
│   │   │   ├── pos/              # POS terminal
│   │   │   ├── quotations/       # Quotation CRUD + conversion
│   │   │   ├── reports/          # Expense reports
│   │   │   └── settings/         # System & security settings
│   │   ├── services/             # API clients
│   │   ├── stores/               # Zustand stores (auth, cart, inventory)
│   │   ├── types/                # TypeScript interfaces
│   │   ├── utils/                # Currency, formatting, validation, UoM
│   │   └── validation/           # Zod schemas
│   └── package.json
├── SamplePOS.Server/             # Node.js + Express backend
│   ├── src/
│   │   ├── modules/              # 29 feature modules
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
│   │   ├── rbac/                 # Role-based access control
│   │   ├── repositories/         # Shared SQL repositories
│   │   ├── routes/               # Shared route files
│   │   ├── services/             # 21 business services
│   │   ├── middleware/           # Auth, validation, security, audit
│   │   ├── types/                # TypeScript definitions
│   │   └── utils/                # Logger, PDF generator, money, constants
│   └── package.json
├── database/
│   ├── migrations/               # SQL migration scripts
│   ├── seeds/                    # Seed data
│   └── setup.sh                  # DB setup script
└── shared/                       # Shared types, Zod schemas, SQL
```

Each backend module follows strict layering:
```
controller.ts → service.ts → repository.ts → PostgreSQL
   (HTTP)        (logic)        (raw SQL)
```

---

## API Endpoints (31 routes)

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
| `/api/settings/invoice` | Invoice settings |
| `/api/system-settings` | System configuration |
| `/api/system` | Backup, restore, reset |
| `/health` | Health check |

All responses follow:
```json
{ "success": true, "data": { }, "message": "..." }
{ "success": false, "error": "Descriptive error message" }
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
| Health Check | http://localhost:3001/health |

### Build

```powershell
# Backend
cd SamplePOS.Server
npm run build       # TypeScript → dist/

# Frontend
cd samplepos.client
npm run build       # TypeScript + Vite → dist/
```

### Testing

```powershell
# Backend unit tests
cd SamplePOS.Server
npm test

# Accounting integrity tests
npm run test:accounting

# API integration tests
.\test-api.ps1
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

- **No ORM** — All database access uses parameterized raw SQL via `pg`
- **Strict layering** — Controller → Service → Repository (never skip layers)
- **Decimal.js** — All financial calculations use arbitrary-precision arithmetic
- **Dual ID system** — UUIDs for database keys, human-readable business IDs for display (e.g., `SALE-2025-0001`)
- **Shared validation** — Zod schemas in `shared/zod/` used by both frontend and backend
- **Timezone strategy** — DATE columns stored as `YYYY-MM-DD` strings, timestamps as UTC
- **RBAC** — Four roles (ADMIN, MANAGER, CASHIER, STAFF) with granular permissions

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
