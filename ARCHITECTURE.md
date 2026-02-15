# SMART-ERP-POS Architecture

**Last Updated**: February 2026  
**Status**: Production-ready

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     FRONTEND (React 19 + Vite)                  │
│  Port 5173                                                      │
│  ┌───────┐ ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│  │  POS  │ │Inventory│ │Accounting│ │ Reports  │ │  Admin   │ │
│  │Terminal│ │& Stock  │ │& Banking │ │ & PDF    │ │& Settings│ │
│  └───────┘ └─────────┘ └──────────┘ └──────────┘ └──────────┘ │
│  React Query · Zustand · Radix UI · Tailwind CSS               │
└─────────────────────────┬───────────────────────────────────────┘
                          │ HTTP/REST (Vite proxy /api → :3001)
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                  BACKEND (Node.js + Express 5)                  │
│  Port 3001 · 29 modules · 31 API routes                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Middleware: Helmet · CORS · Rate Limit · JWT Auth       │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Controller → Service → Repository (strict layering)     │   │
│  │  (HTTP/Zod)   (logic)   (raw SQL only)                   │   │
│  └──────────────────────────────────────────────────────────┘   │
│  21 business services · RBAC · Audit trail · PDF generation    │
└─────────────────────────┬───────────────────────────────────────┘
                          │ Parameterized SQL (pg library)
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    DATABASE (PostgreSQL 14+)                     │
│  Database: pos_system                                           │
│  DATE columns (no timezone) · TIMESTAMPTZ for audit (UTC)       │
│  UUID primary keys · Business ID indexes                        │
└─────────────────────────────────────────────────────────────────┘
```

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite 7 + TypeScript + Tailwind CSS + Radix UI |
| State | TanStack React Query + Zustand |
| Backend | Node.js + Express 5 + TypeScript (ES modules) |
| Database | PostgreSQL (production) / SQLite (offline fallback) |
| Auth | JWT + Refresh Tokens + 2FA (TOTP) + RBAC |
| Validation | Zod (shared frontend/backend) |
| Financial | Decimal.js (arbitrary precision) |
| PDF | PDFKit + jsPDF |
| Queue/Cache | Bull + Redis + NodeCache |

## Backend Modules (29)

Each module follows: `controller.ts → service.ts → repository.ts → routes.ts`

| Domain | Modules |
|--------|---------|
| **Core POS** | pos, sales, products, inventory, customers |
| **Procurement** | purchase-orders, goods-receipts, suppliers, supplier-payments |
| **Finance** | accounting, invoices, payments, deposits, expenses, bank-cash |
| **Reporting** | reports, financial-reports |
| **Commerce** | quotations, discounts, delivery, cash-register |
| **System** | auth, users, admin, audit, rbac, documents, settings, system-management, system-settings, stock-movements |

## Key Architectural Principles

1. **No ORM** — Raw parameterized SQL via `pg` for transparency and control
2. **Strict 3-layer** — Controller (HTTP) → Service (logic) → Repository (SQL)
3. **Decimal.js everywhere** — No native JS numbers for money/quantities
4. **Dual ID system** — UUIDs for DB keys, business IDs for display (`SALE-2025-0001`)
5. **Shared Zod schemas** — Single source of truth for validation
6. **Timezone strategy** — DATE as `YYYY-MM-DD` strings, timestamps as UTC
7. **Standard API format** — `{ success, data?, error?, message? }`
8. **RBAC** — ADMIN, MANAGER, CASHIER, STAFF with granular permissions
9. **Audit trail** — All state-changing operations logged
10. **FEFO inventory** — First Expiry First Out batch selection

## Project Structure

```
SMART-ERP-POS/
├── samplepos.client/             # React 19 + Vite frontend
│   └── src/
│       ├── components/           # 80+ UI components
│       ├── hooks/                # 20+ React Query hooks
│       ├── pages/                # Route pages (POS, inventory, accounting, etc.)
│       ├── stores/               # Zustand (auth, cart, inventory)
│       ├── services/             # API clients
│       ├── types/                # TypeScript interfaces
│       └── utils/                # Currency, formatting, validation
├── SamplePOS.Server/             # Node.js + Express backend
│   └── src/
│       ├── modules/              # 29 feature modules
│       ├── services/             # 21 business services
│       ├── middleware/           # Auth, validation, security, audit
│       ├── rbac/                 # Role-based access control
│       └── utils/                # Logger, PDF, money, constants
├── database/                     # Migrations & seeds
└── shared/                       # Shared types, Zod schemas
```

**What Was Removed**:
- All frontend source code (React components, services, hooks)
- All backend source code
- All documentation files
- All backup directories
- UI component libraries (Shadcn)

**Preserved for New Implementation**:
- Build tool configurations
- Tailwind CSS setup
- Redis configuration
- Package dependencies
- Git history

## Next Steps

To implement this architecture:

1. Create the new folder structure as outlined above
2. Set up the POS service with SQLite and event queue
3. Implement Zod schemas in shared contracts
4. Build the accounting API in C#
5. Add Python ML service for analytics
6. Configure Docker Compose for orchestration
7. Implement frontend with React + Vite

## Implementation Guidelines

- Use Copilot instructions in README files for each service
- Maintain type safety with Zod schemas
- Ensure responsive UI with localStorage persistence
- Follow microservices patterns for service separation
- Use event-driven architecture for service communication
