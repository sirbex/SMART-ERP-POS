# SMART-ERP-POS - System Overview

**Version**: 2.0 | **Last Updated**: February 2026

---

## 1. System Architecture

### Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | React 19 + TypeScript + Vite | Single Page Application |
| **UI Framework** | Tailwind CSS + Radix UI | Styling & Components |
| **State Management** | React Query (TanStack) | Server state & caching |
| **Backend (Primary)** | Node.js + Express + TypeScript | REST API Server |
| **Backend (Accounting)** | C# .NET (optional) | Accounting Service |
| **Database** | PostgreSQL | Primary data store |
| **Cache/Queue** | Redis + Bull | Background jobs |

### Architecture Pattern

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                         │
│  Port 5173 - Vite Dev Server                                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │   POS    │ │Inventory │ │Customers │ │Accounting│           │
│  │  Screen  │ │Management│ │ & Sales  │ │ Reports  │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
└─────────────────────────┬───────────────────────────────────────┘
                          │ HTTP/REST API
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                     BACKEND (Node.js/Express)                    │
│  Port 3001                                                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    API Routes (/api/*)                    │   │
│  │  auth | products | customers | sales | inventory | etc.  │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Controller → Service → Repository            │   │
│  │         (Validation)   (Business)   (SQL Only)           │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────┬───────────────────────────────────────┘
                          │ SQL Queries (pg library)
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                     DATABASE (PostgreSQL)                        │
│  Database: pos_system                                            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Tables: products, customers, sales, invoices, accounts  │   │
│  │  Triggers: Auto-sync balances, GL posting, audit logs    │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Modules

### 2.1 Point of Sale (POS)

**Location**: `samplepos.client/src/pages/POS.tsx`

**Features**:
- Product search with barcode scanning
- Cart management with quantity adjustments
- Multiple payment methods (Cash, Card, Mobile Money, Credit)
- Receipt generation and printing
- Customer selection and credit sales
- Automatic inventory deduction

**Data Flow**:
```
Customer selects products → Add to cart → Select payment method → 
Complete sale → Create sale record → Deduct inventory → 
Generate invoice (if credit) → Post to GL → Print receipt
```

### 2.2 Inventory Management

**Location**: `samplepos.client/src/pages/inventory/`

**Features**:
- Product catalog with categories
- Batch/lot tracking with expiry dates
- FEFO (First Expiry First Out) allocation
- Stock movements and adjustments
- Reorder level alerts
- Unit of measure conversions

**Key Tables**:
- `products` - Product master data
- `inventory_batches` - Batch/lot tracking
- `stock_movements` - All stock transactions
- `unit_conversions` - UOM conversions

### 2.3 Purchase Orders & Goods Receipts

**Location**: `samplepos.client/src/pages/purchasing/`

**Workflow**:
```
Create PO (DRAFT) → Submit PO (PENDING) → 
Receive Goods (GR) → Finalize GR → 
Update inventory batches → Post to GL
```

**Key Features**:
- Multi-line purchase orders
- Supplier management
- Partial goods receipts
- Cost tracking (FIFO/AVCO)
- Automatic inventory updates

### 2.4 Customer Management

**Location**: `samplepos.client/src/pages/customers/`

**Features**:
- Customer profiles and contact info
- Customer groups with pricing tiers
- Credit limits and balance tracking
- Transaction history
- Customer deposits (advance payments)

**Customer Balance Sources**:
- Outstanding invoices (AR)
- Customer deposits (prepayments)
- Payment allocations

### 2.5 Accounting Module

**Location**: `samplepos.client/src/pages/accounting/`

**Components**:

| Report | Description |
|--------|-------------|
| Chart of Accounts | Account structure (Assets, Liabilities, Equity, Revenue, Expenses) |
| Trial Balance | Debit/Credit balance verification |
| Income Statement | Revenue - Expenses = Net Income |
| Balance Sheet | Assets = Liabilities + Equity |
| Cash Flow Statement | Operating, Investing, Financing activities |
| Journal Entries | Manual accounting adjustments |

**GL Posting (Automatic via Triggers)**:
- Sales → DR Cash/AR, CR Revenue, CR Inventory, DR COGS
- Purchases → DR Inventory, CR AP
- Payments → DR Cash, CR AR
- Expenses → DR Expense, CR Cash/AP

---

## 3. Data Flow & Automation

### 3.1 Database Triggers (Automatic)

The system uses PostgreSQL triggers for data consistency:

| Trigger | Table | Action |
|---------|-------|--------|
| `trg_post_sale_to_ledger` | `sales` | Posts sales to GL automatically |
| `trg_post_customer_deposit_to_ledger` | `pos_customer_deposits` | Posts deposits to GL |
| `trg_sync_invoice_ar_balance` | `invoices` | Syncs AR and customer balance |
| `trg_sync_invoice_payment` | `invoice_payments` | Updates invoice paid amounts |
| `trg_update_account_balances` | `ledger_entries` | Updates account balances |
| `trg_update_product_stock` | `inventory_batches` | Updates product stock levels |

### 3.2 Business Transaction Examples

**Credit Sale Flow**:
```sql
1. INSERT INTO sales (payment_method='CREDIT')
   → Trigger creates invoice
   → Trigger updates customer balance
   → Trigger posts to GL: DR AR, CR Revenue

2. INSERT INTO invoice_payments
   → Trigger reduces invoice outstanding
   → Trigger reduces customer balance
   → Trigger posts to GL: DR Cash, CR AR
```

**Customer Deposit Flow**:
```sql
1. INSERT INTO pos_customer_deposits
   → Trigger posts to GL: DR Cash, CR Customer Deposits (2200)
   
2. Apply deposit to sale
   → Trigger posts to GL: DR Customer Deposits, CR Revenue
```

---

## 4. API Structure

### Base URLs

| Environment | URL |
|-------------|-----|
| Development | `http://localhost:3001/api` |
| Accounting | `http://localhost:3001/api/accounting` |

### Main Endpoints

```
/api/auth          - Authentication (login, logout, user management)
/api/products      - Product CRUD, categories, pricing
/api/customers     - Customer management, groups, balances
/api/suppliers     - Supplier management
/api/sales         - POS transactions
/api/invoices      - Invoice management, payments
/api/inventory     - Stock management, adjustments
/api/purchase-orders - PO management
/api/goods-receipts  - GR processing
/api/reports       - Business reports
/api/accounting    - Financial statements, GL, journal entries
```

### Standard Response Format

```json
// Success
{
  "success": true,
  "data": { /* result */ },
  "message": "Operation successful"
}

// Error
{
  "success": false,
  "error": "Error description"
}
```

---

## 5. Key Business Rules

### 5.1 Inventory Rules

- **FEFO**: First Expiry First Out for batch selection
- **Negative Stock**: Not allowed (validation enforced)
- **Expiry Tracking**: Products with `track_expiry=true` require expiry dates
- **Reorder Alerts**: Triggered when stock falls below `reorder_level`

### 5.2 Pricing Rules

- **Base Price**: Product's standard selling price
- **Customer Groups**: Tier-based pricing discounts
- **Quantity Breaks**: Volume-based discounts
- **Formula Pricing**: `cost * markup` calculations

### 5.3 Credit Sales Rules

- **Credit Limit**: Customer cannot exceed credit limit
- **Invoice Generation**: Automatic on credit sales
- **Payment Terms**: Configurable (NET30, NET60, etc.)
- **Overdue Tracking**: Based on due date

### 5.4 Financial Rules

- **Double Entry**: All transactions balance (Debits = Credits)
- **Decimal Precision**: Use `Decimal.js` for money calculations
- **Currency**: UGX (Ugandan Shilling)
- **Date Handling**: UTC storage, local display

---

## 6. User Roles & Permissions

| Role | Permissions |
|------|-------------|
| **ADMIN** | Full system access, user management, settings |
| **MANAGER** | Reports, approvals, inventory adjustments, customer management |
| **CASHIER** | POS operations, receipts, basic customer lookup |
| **STAFF** | Limited access based on assigned modules |

---

## 7. Key Accounts (Chart of Accounts)

| Code | Name | Type | Description |
|------|------|------|-------------|
| 1010 | Cash | ASSET | Cash on hand and in bank |
| 1200 | Accounts Receivable | ASSET | Customer outstanding balances |
| 1300 | Inventory | ASSET | Stock value |
| 2100 | Accounts Payable | LIABILITY | Supplier balances |
| 2200 | Customer Deposits | LIABILITY | Advance payments from customers |
| 3000 | Owner's Equity | EQUITY | Business capital |
| 4000 | Sales Revenue | REVENUE | Product sales |
| 5000 | Cost of Goods Sold | EXPENSE | Product costs |
| 6000 | Operating Expenses | EXPENSE | Business expenses |

---

## 8. Data Relationships

```
customers (1) ──────── (N) sales
    │                      │
    │                      └── (N) sale_items ── (1) products
    │                                                  │
    └── (N) invoices                                   │
            │                                          │
            └── (N) invoice_payments            (N) inventory_batches
                                                       │
suppliers (1) ─── (N) purchase_orders                  │
                      │                                │
                      └── (N) goods_receipts ──────────┘

accounts (1) ──── (N) ledger_entries ── (N) ledger_transactions
```

---

## 9. Keyboard Shortcuts (POS)

| Shortcut | Action |
|----------|--------|
| `Ctrl+F` | Focus search bar |
| `Ctrl+Enter` | Open payment modal |
| `Ctrl+S` | Save cart |
| `Ctrl+R` | Recall saved cart |
| `Esc` | Close modal |

---

## 10. Deployment

### Development

```powershell
# Start backend
cd SamplePOS.Server
npm run dev  # Port 3001

# Start frontend
cd samplepos.client
npm run dev  # Port 5173
```

### Production

```powershell
# Build backend
cd SamplePOS.Server
npm run build
npm start

# Build frontend
cd samplepos.client
npm run build
# Serve dist/ folder
```

### Database

```powershell
# PostgreSQL connection
psql -U postgres -d pos_system

# Run migrations
psql -U postgres -d pos_system -f shared/sql/migrations.sql
```

---

## 11. File Structure

```
SamplePOS/
├── samplepos.client/           # React Frontend
│   ├── src/
│   │   ├── components/         # Reusable UI components
│   │   ├── pages/              # Page components by module
│   │   ├── services/           # API client services
│   │   ├── hooks/              # Custom React hooks
│   │   └── utils/              # Utilities (currency, dates)
│   └── package.json
│
├── SamplePOS.Server/           # Node.js Backend
│   ├── src/
│   │   ├── modules/            # Feature modules
│   │   │   ├── auth/           # Authentication
│   │   │   ├── products/       # Product management
│   │   │   ├── sales/          # POS & sales
│   │   │   ├── invoices/       # Invoice management
│   │   │   ├── accounting/     # Financial module
│   │   │   └── reports/        # Business reports
│   │   ├── db/                 # Database connection
│   │   ├── middleware/         # Express middleware
│   │   └── server.ts           # Entry point
│   └── package.json
│
├── shared/
│   ├── sql/                    # SQL migrations & triggers
│   ├── types/                  # Shared TypeScript types
│   └── zod/                    # Validation schemas
│
└── server-dotnet/              # C# Accounting API (optional)
```

---

## 12. Support & Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| Port 3001 in use | `Stop-Process -Name node -Force` |
| Database connection failed | Check PostgreSQL service and `.env` |
| Frontend can't reach API | Verify Vite proxy configuration |
| GL balances don't match | Run consistency triggers in `shared/sql/` |

### Log Locations

- Backend logs: Console output (winston logger)
- Database logs: PostgreSQL log files
- Frontend: Browser console

---

**Document Maintainer**: Development Team  
**Last Review**: December 2025
