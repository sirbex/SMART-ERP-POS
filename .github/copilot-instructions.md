# SMART-ERP-POS - AI Coding Agent Instructions

**Architecture**: Modular Hybrid Monolith | **Status**: Active Development | **Date**: March 2026

> See also
- **Copilot Implementation Rules (MANDATORY)**: `../COPILOT_IMPLEMENTATION_RULES.md`
- Global Copilot contract for schema/validation/UI synchronization: `../copilot.md`
- Root-level comprehensive rules for all modules: `../COPILOT_INSTRUCTIONS.md`
- **Timezone Strategy (CRITICAL)**: `../SamplePOS.Server/TIMEZONE_STRATEGY.md`

## 🛡️ SYSTEM SAFETY RULES (MANDATORY)

**These rules apply to ALL changes - NO EXCEPTIONS:**

| Rule | Description |
|------|-------------|
| ❌ No Schema Changes | Do NOT change existing table schemas unless explicitly required |
| ❌ No Renaming | Do NOT rename columns, routes, or components |
| ❌ No API Breaks | Do NOT break API contracts |
| ✅ Backward Compatible | All changes must be backward compatible |
| ✅ Reports Unchanged | Existing reports must continue to return identical results |

**Before ANY change, verify:**
1. Does this alter an existing table? → STOP unless explicitly required
2. Does this rename anything? → STOP and find alternative
3. Does this change API response shape? → STOP and extend instead
4. Could this break existing functionality? → STOP and add, don't modify

### Reconciliation & Balance Rules
5. **Reconciliation must reference existing data**
   - Match bank transactions to ledger entries
   - Do NOT introduce parallel balance systems
   - All balances derive from GL (single source of truth)

6. **Reports reuse existing infrastructure**
   - Bank statements, cash flow, and reconciliations must reuse existing reporting patterns
   - Do NOT create duplicate reporting logic

---

## ⚠️ CRITICAL: TIMEZONE STRATEGY (MUST FOLLOW)

**ONE TIMEZONE STRATEGY FOR ENTIRE SYSTEM - NON-NEGOTIABLE**

### Rules:
1. **Database**: DATE for transaction dates, TIMESTAMPTZ for audit timestamps (UTC)
2. **Backend**: Custom type parser returns DATE as string ('YYYY-MM-DD'), UTC session timezone
3. **API**: Return dates as YYYY-MM-DD strings, timestamps as ISO 8601 UTC
4. **Frontend**: Display conversion only, send plain date strings to API

### Violations (Zero Tolerance):
❌ Converting DATE to Date object in backend  
❌ Using `new Date().toISOString()` on date fields  
❌ TIMESTAMP WITHOUT TIME ZONE columns  
❌ Sending Date objects from frontend to API  

**→ See `COPILOT_IMPLEMENTATION_RULES.md` Section 0 for full details**

---

## Project Overview

Enterprise POS system with purchase order management, FEFO inventory tracking, and Node.js/TypeScript backend with native accounting module.

**CRITICAL DATABASE CONFIGURATION:**
- **Production Database**: `pos_system` (PostgreSQL)
- **Connection String**: `postgresql://postgres:password@localhost:5432/pos_system`
- **ALWAYS use `pos_system` database** - Never switch to other databases (samplepos, hotel_management, etc.)
- All development, testing, and production must use `pos_system` consistently

## Critical Architecture Rules

### No ORM Policy
```typescript
// ❌ NEVER use ORM
const user = await User.findOne({ where: { id: 1 } });

// ✅ ALWAYS use parameterized SQL
const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
```

**Rationale**: Despite Prisma appearing in `package.json`, the architecture mandates raw SQL through repository layer for transparency and control.

### Strict Layering (Controller → Service → Repository)
```
HTTP Request → Controller (validation) → Service (business logic) → Repository (SQL only) → Database
```

**Never**:
- Query database from controllers/services/routes (`pool.query` only in repositories)
- Put business logic in repositories
- Mix HTTP handling with data access
- Use template literal `${}` interpolation in SQL strings (SQL injection risk)

## Project Structure

```
SamplePOS/
├── samplepos.client/          # React + Vite frontend
│   ├── src/ (currently minimal)
│   └── package.json (React Query, Radix UI, Tailwind)
├── SamplePOS.Server/          # Node.js/TypeScript backend
│   ├── src/services/         # Business logic services
│   │   ├── accountingCore.ts # SINGLE SOURCE OF TRUTH for accounting
│   │   ├── glEntryService.ts # GL entry convenience methods
│   │   └── ...
│   └── package.json (Express, Zod, pg, Bull)
├── server-node/
│   └── src/modules/ (empty)  # Target for modular Node.js services
├── server-py/api/ (empty)     # Future Python analytics service
└── shared/
    ├── zod/ (empty)           # Shared validation schemas
    ├── types/ (empty)         # Shared TypeScript types
    └── sql/ (empty)           # SQL migration scripts
```

## Technology Stack

| Component | Tech Stack | Status |
|-----------|-----------|--------|
| Frontend | React 19 + Vite + React Query + Tailwind + Radix UI | Config ready |
| Backend (Primary) | Node.js + Express + TypeScript + pg/better-sqlite3 + Zod | In Progress |
| Backend (Accounting) | Node.js + AccountingCore (Decimal.js) | ✅ Complete |
| Backend (Analytics) | Python + FastAPI | Planned |
| Validation | Zod for Node.js | Config ready |
| Database | PostgreSQL (production) / SQLite (offline) | Configured |
| Cache/Queue | Redis + Bull | Configured |
| State Management | React Query (TanStack) | Installed |

## Frontend Architecture

### Core Features
- **Predictive Unified Search**: Search across products, cart items, and customers
- **Persistent Cart**: Auto-saved to `localStorage` (key: `pos_persisted_cart_v1`)
- **Inventory Management**: Batch/expiry tracking, unit conversions, FEFO selection
- **Accessibility**: ARIA labels, focus trapping, keyboard-only workflows

### Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| `Ctrl+F` | Focus search bar |
| `Ctrl+Enter` | Open payment modal |
| `Ctrl+S` | Save cart manually |
| `Ctrl+R` | Recall saved cart |
| `Esc` | Close current modal |
| `Tab` / `Shift+Tab` | Navigate within modals |

### LocalStorage Keys
```typescript
// Inventory shared between Inventory and POS screens
'inventory_items'

// Active cart - restored on refresh, cleared after sale
'pos_persisted_cart_v1'
```

**Cart filtering**: On load, cart items are filtered to discard entries whose inventory was removed (matched by name + batch).

### Focus Trapping (`src/hooks/useFocusTrap.ts`)
All modals use custom focus trap hook:
1. Captures previously focused element
2. Moves focus to first interactive element
3. Cycles Tab/Shift+Tab within focusable elements
4. Handles Escape key to close modal
5. Restores original focus on unmount

**Usage**:
```typescript
const modalRef = useFocusTrap(isOpen);
return <div ref={modalRef} role="dialog" aria-modal="true">...</div>
```

### Currency Formatting
```typescript
// Centralized utility: src/utils/currency.ts
formatCurrency(amount: number): string
// Currently configured for UGX display
```

### Modal Patterns
All modals include:
- `role="dialog"` and `aria-modal="true"`
- Descriptive `aria-label` or visible labels
- Focus trapping with Escape key handling
- Restore focus on close

**Modal Types**: Payment, Receipt, Edit Item, Remove Confirmation

## Development Workflows

### Start Development Environment
```powershell
# PowerShell launcher script
.\start-dev.ps1
# Launches backend (port 3001) and frontend (port 5173) in separate terminals
```

### Current Module Structure (Target)
```
server-node/src/modules/
├── pos/              # Point of sale operations
├── inventory/        # Stock management, FEFO batch tracking
├── customers/        # Customer management, groups, pricing
├── suppliers/        # Supplier management, performance tracking
└── accounting/       # To be implemented in C# and .NET
```

Each module follows:
```typescript
module-name/
├── controller.ts     # HTTP handlers, Zod validation
├── service.ts        # Business logic orchestration
├── repository.ts     # Raw SQL queries only
└── routes.ts         # Express route definitions
```

## Key Business Domains

### 1. Purchase Order System
**Documented in**: `SamplePOS.Server/test-api.ps1` (comprehensive integration test suite)

**Workflow**: DRAFT → PENDING → COMPLETED
- Auto-generated PO numbers: `PO-2025-0001`
- Goods Receipt (GR) workflow with batch/expiry tracking
- FEFO (First Expiry First Out) allocation
- Decimal precision using `Decimal.js` for currency/quantities

**Test harness shows**:
- 12 integration tests covering full receiving workflow
- Batch creation on GR finalization
- Stock movement audit trail
- FEFO batch selection algorithm

### 2. Pricing & Costing System
**Documented in**: `SamplePOS.Server/PRICING_COSTING_SYSTEM.md`

**Features**:
- Formula-based pricing: `cost * 1.20` (20% markup)
- Customer group tiers with quantity breaks
- FIFO/AVCO cost layer valuation
- Auto-update prices on cost change
- NodeCache with 1hr TTL (~95% hit rate expected)

**Key Services** (documented but not implemented):
- `CostLayerService` - FIFO/AVCO layer management
- `PricingService` - Formula evaluation, tier calculation
- `PricingCacheService` - In-memory price caching

### 3. Data Persistence
- LocalStorage for cart and inventory data
- PostgreSQL for server-side data storage
- Real-time data synchronization

## API Response Format (Mandatory)

```typescript
// Success
{
  "success": true,
  "data": { /* result */ },
  "message": "Operation successful" // optional
}

// Error
{
  "success": false,
  "error": "Descriptive error message"
}
```

**Never deviate** - frontend expects this exact structure.

## TypeScript Standards (MANDATORY)

### 1. Field Naming Convention
**Database (PostgreSQL)**: `snake_case` (e.g., `customer_id`, `total_amount`, `sale_number`)  
**TypeScript/Frontend**: `camelCase` (e.g., `customerId`, `totalAmount`, `saleNumber`)

**Transformation Required**:
- Backend repositories return raw PostgreSQL rows with `snake_case`
- Frontend must normalize to `camelCase` immediately after API response
- Use explicit mapping functions, NOT inline `as any` casts

```typescript
// ✅ CORRECT: Explicit normalization in frontend
const normalizedSales = useMemo(() => {
  return sales.map((sale) => ({
    ...sale,
    saleNumber: sale.sale_number,
    customerId: sale.customer_id,
    totalAmount: Number(sale.total_amount),
    paymentMethod: sale.payment_method,
  }));
}, [sales]);

// ❌ WRONG: Using any type without normalization
const sales = (data as any)?.data?.data || [];
```

### 2. TypeScript Interfaces (Required for All Data Models)

**Every entity must have a complete TypeScript interface** defined in `shared/types/`:

**CRITICAL: Dual-ID Architecture - UUIDs for Database, Business IDs for Application**
- **Database Primary Keys**: UUIDs for internal relations, foreign keys, and data integrity
- **Business Identifiers**: Human-readable codes for all user-facing operations
- **Frontend Display**: ALWAYS show business IDs (e.g., `SALE-2025-0001`), NEVER show raw UUIDs
- **API Endpoints**: Prefer business IDs in URLs: `/api/sales/SALE-2025-0001`
- **Backend Flexibility**: Repositories can query by either UUID or business ID

```typescript
// shared/types/sale.ts
export interface Sale {
  // Dual ID System
  id: string; // UUID - Primary key for DB relations (keep internal)
  saleNumber: string; // SALE-2025-0001 - Business identifier (display everywhere)
  
  // Relations - UUIDs for foreign keys
  customerId?: string; // UUID for DB relations
  customerName?: string; // Display name for UI
  
  // Financial fields (always numbers, never strings)
  totalAmount: number;
  totalCost: number;
  profit: number;
  profitMargin?: number;
  
  // Metadata
  saleDate: string;
  createdAt: string;
  paymentMethod: 'CASH' | 'CARD' | 'MOBILE_MONEY' | 'CREDIT';
  status: 'COMPLETED' | 'PENDING' | 'CANCELLED';
  
  // Relations
  cashierId: string; // UUID
  cashierName?: string; // Display name
  
  // Optional fields
  notes?: string;
  amountPaid?: number;
  changeAmount?: number;
}

// UI Display Rules:
// ✅ CORRECT: {sale.saleNumber} - Always use business ID
// ✅ CORRECT: href={`/sales/${sale.saleNumber}`} - Readable URLs
// ❌ WRONG: {sale.id} - Never show UUID to users
// ❌ WRONG: {sale.id.slice(0, 8)} - Never show truncated UUID

// Backend Query Pattern: Accept both ID types
async function getSale(identifier: string) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(identifier);
  const column = isUuid ? 'id' : 'sale_number';
  return pool.query(`SELECT * FROM sales WHERE ${column} = $1`, [identifier]);
}

// Database response (snake_case)
export interface SaleDbRow {
  id: string; // UUID primary key
  sale_number: string; // Business identifier: SALE-2025-0001
  customer_id?: string; // UUID foreign key
  customer_name?: string; // Joined from customers table
  total_amount: string; // PostgreSQL numeric returns as string
  total_cost: string;
  profit: string;
  profit_margin?: string;
  sale_date: string;
  created_at: string;
  payment_method: string;
  status: string;
  cashier_id: string; // UUID foreign key
  cashier_name?: string; // Joined from users table
  notes?: string;
  amount_paid?: string;
  change_amount?: string;
}

// Conversion utility
export function normalizeSale(dbRow: SaleDbRow): Sale {
  return {
    id: dbRow.id,
    saleNumber: dbRow.sale_number,
    customerId: dbRow.customer_id,
    customerName: dbRow.customer_name,
    totalAmount: Money.toNumber(Money.parseDb(dbRow.total_amount)),
    totalCost: Money.toNumber(Money.parseDb(dbRow.total_cost)),
    profit: Money.toNumber(Money.parseDb(dbRow.profit)),
    profitMargin: dbRow.profit_margin ? Money.toNumber(Money.parseDb(dbRow.profit_margin)) : undefined,
    saleDate: dbRow.sale_date,
    createdAt: dbRow.created_at,
    paymentMethod: dbRow.payment_method as Sale['paymentMethod'],
    status: dbRow.status as Sale['status'],
    cashierId: dbRow.cashier_id,
    cashierName: dbRow.cashier_name,
    notes: dbRow.notes,
    amountPaid: dbRow.amount_paid ? Money.toNumber(Money.parseDb(dbRow.amount_paid)) : undefined,
    changeAmount: dbRow.change_amount ? Money.toNumber(Money.parseDb(dbRow.change_amount)) : undefined,
  };
}
```

**Human-Readable Business ID Patterns**:
- **Sales**: `SALE-YYYY-####` (e.g., `SALE-2025-0001`)
- **Purchase Orders**: `PO-YYYY-####` (e.g., `PO-2025-0042`)
- **Invoices**: `INV-#####` (e.g., `INV-00123`)
- **Goods Receipts**: `GR-YYYY-####` (e.g., `GR-2025-0015`)
- **Stock Adjustments**: `ADJ-YYYY-####` (e.g., `ADJ-2025-0008`)
- **Customers**: Customer names (not IDs)
- **Products**: Product codes (e.g., `PROD-001`, `SKU-12345`)

**Database Schema Pattern**:
```sql
CREATE TABLE sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_number VARCHAR(50) UNIQUE NOT NULL, -- Indexed for lookup
  customer_id UUID REFERENCES customers(id),
  -- other fields...
);
CREATE INDEX idx_sales_sale_number ON sales(sale_number);
```

**Why This Architecture?**
- **UUIDs**: Excellent for primary/foreign keys, prevent collisions, globally unique
- **Business IDs**: Human-readable, meaningful in logs, shareable URLs, better UX
- **Both Coexist**: Database integrity via UUIDs, user experience via business IDs

### 3. No `any` Types (Zero Tolerance)

```typescript
// ❌ FORBIDDEN: Using any
const data = (response as any).data.items;
const sale: any = { ... };

// ✅ REQUIRED: Explicit typing
interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

interface SalesListResponse {
  data: Sale[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const response = apiResponse as ApiResponse<SalesListResponse>;
const sales: Sale[] = response.data.data;
```

### 4. Consistent Financial Field Names

**Standard field names across all entities**:
- `totalAmount` - Grand total (NOT `total`, `amount`, `totalPrice`)
- `subtotal` - Pre-tax amount
- `totalCost` - Total cost of goods
- `profit` - Gross profit (NOT `totalProfit`, `grossProfit`)
- `profitMargin` - Percentage (0-100)
- `taxAmount` - Tax value
- `discountAmount` - Discount value
- `amountPaid` - Payment received
- `amountDue` - Outstanding balance
- `changeAmount` - Change given

**Use Money utility for all calculations (NEVER raw Decimal.js or parseFloat)**:
```typescript
import { Money } from '../utils/money.js';

// ✅ CORRECT: Money utility for all financial math
const profit = Money.subtract(sale.totalAmount, sale.totalCost);
const margin = Money.percentageRate(profit, sale.totalAmount);

// ✅ CORRECT: Parse DB NUMERIC values
const amount = Money.toNumber(Money.parseDb(row.total_amount));

// ❌ WRONG: parseFloat on DB values (precision loss)
const amount = parseFloat(row.total_amount);

// ❌ WRONG: Raw JS arithmetic
const profit = sale.totalAmount - sale.totalCost;
const margin = (profit / sale.totalAmount) * 100;

// ❌ WRONG: Direct Decimal.js (use Money wrapper)
const profit = new Decimal(sale.totalAmount).minus(sale.totalCost);
```

### 5. Enum Types for Status Fields

```typescript
// ✅ CORRECT: Use union types
export type SaleStatus = 'COMPLETED' | 'PENDING' | 'CANCELLED';
export type PaymentMethod = 'CASH' | 'CARD' | 'MOBILE_MONEY' | 'CREDIT';
export type UserRole = 'ADMIN' | 'MANAGER' | 'CASHIER' | 'STAFF';

// ✅ CORRECT: Use in interfaces
interface Sale {
  status: SaleStatus;
  paymentMethod: PaymentMethod;
}

// ❌ WRONG: Using strings
interface Sale {
  status: string;
  paymentMethod: string;
}
```

## Shared Validation (Zod)

All validation schemas live in `shared/zod/`:
```typescript
// shared/zod/customer.ts
export const CustomerSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  balance: z.number().nonnegative(),
  customerGroupId: z.string().uuid().optional(),
}).strict();

export type Customer = z.infer<typeof CustomerSchema>;
```

**Usage**:
- Backend: `CustomerSchema.parse(req.body)`
- Frontend: `@hookform/resolvers` + `zod` for form validation

### 🧠 Copilot Development Rule: Product Schema Consistency

Whenever a new field is added or modified in the Product entity/model (e.g., `expiryDate`, `barcode`, `unitOfMeasure`, `reorderLevel`, `trackExpiry`), ensure:

1) UI coverage
- The field appears and is usable across ALL Product-related components:
  - Create/Edit product forms
  - Product list/grid/table views
  - Product details popups/drawers
  - Product selectors (search dropdowns, GR/PO screens, stock adjustments, etc.)

2) Centralized validation/logic
- Put validation and computed logic in shared Zod schemas/utilities in `shared/zod` (or a `useProductValidation()` hook). Import and reuse everywhere. Do NOT duplicate per page.

3) Auto-update components
- If a Product component is missing the field, update it to include it (with labels/help/accessibility).

4) No page-specific expiry checks
- Do not implement expiry validation only in GR. Move it to shared so rules are identical across UIs.

5) Types and DTOs in sync
- Update `shared/types` (Product, ProductDTO, etc.) and keep API DTOs aligned with backend schemas and DB fields.

6) E2E completeness
- After adding a field: update frontend schema, backend validation, DB migration (in `shared/sql`) if needed, and bind in all relevant UI.

Reminder: Product fields must propagate globally. Avoid hardcoded field subsets.

## Database Patterns

**CRITICAL: Always use `pos_system` database**
- Never query or reference other databases (samplepos, hotel_management, etc.)
- Connection string in `.env`: `DATABASE_URL="postgresql://postgres:password@localhost:5432/pos_system"`
- All SQL queries, migrations, and tests must target `pos_system`

### Parameterized Queries (PostgreSQL)
```typescript
// repository.ts
export async function findUserById(pool: Pool, id: number) {
  const result = await pool.query(
    'SELECT * FROM users WHERE id = $1',
    [id]
  );
  return result.rows[0];
}
```

### Parameterized Queries (SQLite)
```typescript
// For offline POS
const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
return stmt.get(id);
```

### Decimal Arithmetic
```typescript
import { Money } from '../utils/money.js';

// ✅ Always use Money utility for financial values
const total = Money.lineTotal(item.quantity, item.price);
const cost = Money.toNumber(Money.parseDb(row.cost_price));

// ❌ Never use parseFloat on PostgreSQL NUMERIC columns
const cost = parseFloat(row.cost_price); // WRONG - precision loss

// ❌ Never use native JS numbers for currency
const total = item.quantity * item.price; // WRONG - precision loss
```

## Key Configuration Files

### Frontend (`samplepos.client/`)
- `vite.config.ts` - Proxy API to `localhost:3001`
- `tailwind.config.js` - Custom theme, Radix UI integration
- `tsconfig.json` - Path aliases, React 19 settings

### Backend (`SamplePOS.Server/`)
- `.env` - Database URL, JWT secret, Redis URL
- `package.json` - Note: Prisma installed but **not to be used**
- `tsconfig.json` - ES modules, path aliases

## Common Patterns

### Route Handlers (asyncHandler + Typed Errors)
```typescript
import { asyncHandler, NotFoundError, ValidationError } from '../middleware/errorHandler.js';

// ✅ CORRECT: asyncHandler wraps every route, typed errors thrown
router.get('/products/:id', requireAuth, asyncHandler(async (req, res) => {
  const product = await productService.getById(req.params.id);
  if (!product) throw new NotFoundError('Product not found');
  res.json({ success: true, data: product });
}));

// ❌ WRONG: Manual try/catch in route, raw Error
router.get('/products/:id', async (req, res) => {
  try {
    const product = await productService.getById(req.params.id);
    if (!product) throw new Error('Product not found'); // Always 500!
    res.json({ success: true, data: product });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});
```

**Error class hierarchy** (all extend AppError):
- `NotFoundError` → 404 | `ValidationError` → 400 | `ConflictError` → 409
- `ForbiddenError` → 403 | `UnauthorizedError` → 401

### Multi-Table Operations (withTransaction)
```typescript
import { withTransaction } from '../utils/unitOfWork.js';

// ✅ CORRECT: Atomic multi-table operation
return withTransaction(async (client) => {
  const sale = await saleRepo.create(client, data);
  await inventoryRepo.deductStock(client, sale.items);
  await ledgerRepo.postEntry(client, sale.journalEntry);
  return sale;
});
```

### Financial Calculations (Money Utility)
```typescript
import { Money } from '../utils/money.js';

// ✅ CORRECT: Money utility for all financial math
const subtotal = Money.lineTotal(quantity, unitPrice);
const discount = Money.applyDiscount(subtotal, discountPercent);
const tax = Money.calculateTax(discount, taxRate);
const margin = Money.grossMargin(sellingPrice, costPrice);

// ❌ WRONG: Raw arithmetic or direct Decimal.js
const total = quantity * price;
const total = new Decimal(quantity).times(price);
```

### List Endpoints (PaginationHelper + batchFetch)
```typescript
import { PaginationHelper } from '../utils/pagination.js';
import { batchFetch } from '../utils/batchFetch.js';

// ✅ Pagination
const { page, limit, offset } = PaginationHelper.fromQuery(req.query);
const { rows, count } = await repo.list({ offset, limit });
res.json({ success: true, data: PaginationHelper.envelope(rows, count, page, limit) });

// ✅ Prevent N+1 with batchFetch
const items = await batchFetch(orders.map(o => o.id), orderItemRepo.findByOrderIds);
```

### Authentication (JWT)
```typescript
// Middleware checks Authorization: Bearer <token>
// Decoded payload available at req.user
// Roles: ADMIN, MANAGER, CASHIER, STAFF
```

### Currency Formatting
```typescript
// Frontend utility (from README.md reference)
formatCurrency(amount: number): string
// Configured for UGX display, centralizes formatting
```

## Testing Strategy

### Backend Tests (Jest 30 + ESM)
```powershell
# Unit tests (excludes DB-dependent suites)
cd SamplePOS.Server
npm test -- --testPathIgnorePatterns="accounting-integrity|rbac/test|customerStatement|stockCount"

# Integration tests (PowerShell, requires running server)
.\SamplePOS.Server\test-api.ps1
```

**Covers**: Money utility, pagination, error classes, RBAC permissions, Zod schemas, PO→GR→batch→FEFO

**Test conventions**:
- Co-locate with source: `money.test.ts` next to `money.ts`
- Use `import { jest } from '@jest/globals'` for ESM-compatible mocks
- DB-dependent tests in separate files (excluded from CI via `--testPathIgnorePatterns`)

### Frontend Tests (Vitest)
```powershell
cd samplepos.client
npx vitest run
```

**Covers**: Currency formatting, business rule validation, RBAC permissions, Zod schemas, ErrorBoundary

**Test conventions**:
- Tests in `src/__tests__/` directory
- Test edge cases: null, undefined, NaN, zero, negative, boundary values
- Test error states and empty states for components

### When to Write Tests (Mandatory)
- Every new utility function → unit tests
- Every new Zod schema → validation tests (valid, invalid, boundary)
- Every new business logic service → unit tests with mocked repos
- Every new React component → render tests for key states

### Frontend ErrorBoundary (Required)
- Root level in `main.tsx`: `<ErrorBoundary section="Root">`
- Application level in `App.tsx`: `<ErrorBoundary section="Application">`
- Add page-level `<ErrorBoundary section="PageName">` for major new features

## Important Gotchas

1. **Prisma in package.json but NO ORM usage** - Historical artifact, use raw SQL
2. **Empty `src/` directories** - Architecture planned, implementation pending
3. **Multi-language backend** - Node.js primary, C# and .NET for accounting (future)
4. **Decimal.js everywhere** - Never use native numbers for money/quantities
5. **Strict response format** - `{ success, data?, error? }` is non-negotiable
6. **Shared schemas are empty** - Start by populating `shared/zod/` when building features

## External Dependencies

### Redis/Bull (Queue Management)
```typescript
// Configured in .env: REDIS_URL
// Bull + @bull-board for job queue UI
```

### PDF Generation
```typescript
// PDFKit installed for receipt/report printing
import PDFDocument from 'pdfkit';
```

## Performance Considerations

1. **Pricing cache** - Target 95%+ hit rate with NodeCache
2. **FEFO batch queries** - Index on `(productId, expiryDate, remainingQuantity)`
3. **Stock movements** - Audit trail can grow large, consider partitioning
4. **Offline sync** - Queue size monitoring for event backlog

## Pre-Commit Checklist

### � BUILD VERIFICATION (Mandatory)
Before committing, both projects must build with zero errors:
```powershell
# Backend build
cd SamplePOS.Server
npm run build

# Frontend build
cd ../samplepos.client
npm run build
```
- [ ] **Backend `npm run build` passes** (zero TypeScript errors)
- [ ] **Frontend `npm run build` passes** (zero TypeScript errors, Vite bundle succeeds)

### �🛡️ SAFETY FIRST (Mandatory)
- [ ] **NO existing table schemas changed** (unless explicitly required)
- [ ] **NO columns, routes, or components renamed**
- [ ] **NO API contracts broken** (response shapes unchanged)
- [ ] **Change is backward compatible**
- [ ] **Existing reports return identical results**

### Code Quality
- [ ] **TIMEZONE STRATEGY FOLLOWED** (Section 0 - Zero tolerance)
- [ ] Followed Controller → Service → Repository layering
- [ ] Used Zod schemas from `shared/zod/`
- [ ] All SQL is parameterized (no template literal `${}` interpolation in SQL)
- [ ] No `pool.query` in route or controller files
- [ ] No ORM code (Prisma, Sequelize, TypeORM, etc.)
- [ ] API responses follow `{ success, data?, error? }` format
- [ ] All routes wrapped in `asyncHandler` (no manual try/catch in routes)
- [ ] Typed error classes used (NotFoundError, ValidationError, etc. — not raw Error)
- [ ] Multi-table operations wrapped in `withTransaction`
- [ ] Used `Money` utility for currency/quantity arithmetic (not raw Decimal.js or floats)
- [ ] **No `parseFloat()` on PostgreSQL NUMERIC columns — use `Money.toNumber(Money.parseDb())`**
- [ ] **No raw JS arithmetic (`/`, `*`, `-`) on financial values — use Money/Decimal methods**
- [ ] **No `Math.abs/Math.max/Math.round` on Decimal values — use `.abs()`, `Money.max()`, `.toDecimalPlaces()`**
- [ ] **No intermediate `.toNumber()` mid-calculation — keep Decimal until final output boundary**
- [ ] List endpoints use `PaginationHelper`
- [ ] Related-data loading uses `batchFetch` (no N+1 loops)
- [ ] No business logic in repositories
- [ ] No database access outside repositories
- [ ] Product field changes propagated across all Product views
- [ ] **TypeScript interfaces defined in `shared/types/`**
- [ ] **Zero `any` types - all variables explicitly typed**
- [ ] **Database responses normalized from `snake_case` to `camelCase`**
- [ ] **Consistent field names (totalAmount, profit, amountPaid, etc.)**
- [ ] **Enum/union types for status fields (not plain strings)**
- [ ] **Human-readable IDs used in UI (SALE-2025-0001, not UUID or truncated IDs)**
- [ ] **No Date object conversions on DATE columns (timezone violation)**
- [ ] **No .toISOString() on date fields (timezone violation)**
- [ ] **Dates sent as YYYY-MM-DD strings, not Date objects**
- [ ] **Tests written** for new utilities, schemas, and business logic
- [ ] **Backend tests pass**: `npm test`
- [ ] **Frontend tests pass**: `npx vitest run`
- [ ] **ErrorBoundary wrapping** for new major pages (if frontend)

## When Adding New Features

1. **Define Zod schema** in `shared/zod/`
2. **Define TypeScript interfaces** in `shared/types/`
3. **Create repository** with parameterized SQL (no `pool.query` outside repo)
4. **Build service** with business logic (use `Money` for financials, `withTransaction` for multi-table ops)
5. **Add controller** with Zod validation + HTTP handling
6. **Wire routes** with `asyncHandler` wrapper and `requireAuth` middleware
7. **Use `PaginationHelper`** for list endpoints, `batchFetch` for related data
8. **Write tests** — unit tests for utilities/schemas/services (Jest backend, Vitest frontend)
9. **Build React component** with React Query hooks, `ErrorBoundary` wrapping (if frontend)
10. **Run verification**: `npm test`, `npx vitest run`, `npm run build` (both projects)

## Useful Documentation References

- **Architecture**: `ARCHITECTURE.md` - Overall system design
- **Pricing**: `SamplePOS.Server/PRICING_COSTING_SYSTEM.md` - Pricing/costing deep dive
- **API Tests**: `SamplePOS.Server/test-api.ps1` - Working integration examples
- **Copilot Rules**: `COPILOT_INSTRUCTIONS.md` - Detailed coding standards

## Quick Reference Commands

```powershell
# Start dev environment
.\start-dev.ps1

# Backend development (manual)
cd SamplePOS.Server
npm run dev  # tsx watch src/server.ts

# Frontend development (manual)
cd samplepos.client
npm run dev  # Vite on port 5173

# Run backend unit tests
cd SamplePOS.Server
npm test -- --testPathIgnorePatterns="accounting-integrity|rbac/test|customerStatement|stockCount"

# Run frontend unit tests
cd samplepos.client
npx vitest run

# Build verification (MUST pass before commit)
cd SamplePOS.Server && npm run build
cd ../samplepos.client && npm run build
```

---

**Last Updated**: March 2026  
**Maintainer**: Architecture in transition - favor documented patterns over installed dependencies
