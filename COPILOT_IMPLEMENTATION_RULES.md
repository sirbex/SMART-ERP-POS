# Copilot Implementation Instructions — Inventory & ERP Core

**Purpose**: These are mandatory rules for Copilot when implementing or modifying any feature related to Inventory, Accounting, or POS within the SMART-ERP-POS system.

**Last Updated**: February 2026  
**Status**: Active Development — Enforce Strictly

---

## 🕐 0️⃣ TIMEZONE STRATEGY (CRITICAL - MUST FOLLOW)

### **MANDATORY: ONE TIMEZONE STRATEGY FOR ENTIRE SYSTEM**

**RULE: UTC Everywhere + Frontend Display Conversion Only**

This is **NON-NEGOTIABLE** and must be followed in ALL code:

#### Database Layer
```sql
-- ✅ CORRECT: Use DATE for transaction dates (no time, no timezone)
sale_date DATE                      -- 2025-11-15
expiry_date DATE                    -- 2025-12-31
order_date DATE                     -- 2025-11-01

-- ✅ CORRECT: Use TIMESTAMPTZ for audit timestamps (stored in UTC)
created_at TIMESTAMP WITH TIME ZONE -- 2025-11-16 13:20:56+00
updated_at TIMESTAMP WITH TIME ZONE -- 2025-11-16 13:20:56+00

-- ❌ FORBIDDEN: Never use TIMESTAMP WITHOUT TIME ZONE
created_at TIMESTAMP  -- WRONG! Ambiguous timezone
```

#### Backend Layer (Node.js + TypeScript)
```typescript
// ✅ CORRECT: Custom type parser configured in src/db/pool.ts
types.setTypeParser(1082, (val: string) => val); // DATE returns string

// ✅ CORRECT: Set UTC timezone for all connections
pool.on('connect', (client) => {
  client.query('SET timezone = "UTC"');
});

// ✅ CORRECT: Return dates as plain strings
const result = await pool.query('SELECT sale_date FROM sales WHERE id = $1', [id]);
// result.rows[0].sale_date = '2025-11-15' (string)

// ❌ FORBIDDEN: Never convert DATE to Date object
const saleDate = new Date(row.sale_date); // WRONG! Causes timezone shift

// ❌ FORBIDDEN: Never use toISOString() on dates
expiryDate: new Date(data.expiry).toISOString(); // WRONG! Adds timezone
```

#### API Response Format
```json
{
  "success": true,
  "data": {
    "saleDate": "2025-11-15",                    // ✅ Plain string YYYY-MM-DD
    "createdAt": "2025-11-16T13:20:56.222Z",    // ✅ ISO 8601 UTC timestamp
    "totalAmount": 96500
  }
}
```

#### Frontend Layer (React + TypeScript)
```typescript
// ✅ CORRECT: Send plain date strings to API
const saleData = {
  saleDate: '2025-11-15',  // From <input type="date">
  items: [...]
};
await api.post('/sales', saleData);

// ✅ CORRECT: Display dates in user timezone (for viewing only)
const displayDate = (dateString: string) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return dateString; // DATE field - display as-is
  }
  return new Date(dateString).toLocaleString(); // TIMESTAMP - convert to local
};

// ❌ FORBIDDEN: Never send Date objects to API
saleDate: new Date() // WRONG! Send string instead
```

#### Date Filters
```typescript
// ✅ CORRECT: Send plain date strings for filtering
const filters = {
  startDate: '2025-11-01',  // Start of day
  endDate: '2025-11-15'     // End of day
};

// Backend interprets as full UTC days:
// 2025-11-01 00:00:00 UTC to 2025-11-01 23:59:59 UTC
```

### **ZERO TOLERANCE VIOLATIONS**
If you encounter or create code that violates this timezone strategy:
1. ❌ Converting DATE columns to Date objects in backend
2. ❌ Using `new Date().toISOString()` on date fields
3. ❌ Storing dates in TIMESTAMP WITHOUT TIME ZONE
4. ❌ Sending Date objects from frontend to API
5. ❌ Using timezone-aware operations on DATE fields

**→ STOP and fix immediately. This causes production bugs.**

**See**: `SamplePOS.Server/TIMEZONE_STRATEGY.md` for detailed implementation guide.

---

## ⚙️ 1️⃣ Core Development Principles

### Three-Layer Architecture (Mandatory)
```
Controller → Service → Repository → Database
```

**Controller**:
- Handles request/response validation and routing
- Uses Zod schemas for validation
- Maps requests to service calls
- Never contains business logic
- Never accesses database directly

**Service**:
- Contains ALL business logic
- Orchestrates repository calls
- Handles transaction management
- Performs calculations using Decimal.js
- Emits audit/event logs

**Repository**:
- Interacts directly with database using raw SQL only
- Accepts parameters, returns results
- No business logic whatsoever
- Uses parameterized queries exclusively

### Database is PASSIVE STORAGE ONLY (Zero Tolerance)

**ABSOLUTE PROHIBITION — applies to ALL changes, NO EXCEPTIONS:**

❌ **NO database triggers** — no ON INSERT/UPDATE/DELETE side effects  
❌ **NO generated columns** — no DB-computed business values  
❌ **NO DB-side functions that mutate data** — all writes originate from services  
❌ **NO trigger-based number generation** — service generates all business IDs  
❌ **NO trigger-based GL posting** — `glEntryService` handles all ledger writes  
❌ **NO trigger-based balance/stock sync** — service layer writes explicitly  
❌ **NO automatic cascading writes** from INSERT/UPDATE  

**Database is allowed ONLY:**
- Primary keys, Foreign keys, Unique constraints
- NOT NULL, CHECK constraints (simple invariants only)
- Indexes

**ALL business logic MUST exist in the Service layer**, including:
- Generating business numbers (SALE-YYYY-####, PO-YYYY-####, etc.)
- Updating stock quantities (both `product_inventory` and `products`)
- Creating GL entries (`glEntryService.recordSaleToGL()`, etc.)
- Computing balances (customer, supplier, account)
- Deriving totals (sale totals, invoice totals)
- Enforcing workflows (period open, immutability, status transitions)
- Audit logging and session tracking
- Validations beyond basic FK/NOT NULL/UNIQUE

**Patterns to follow:**
```typescript
// ✅ CORRECT: Service layer generates sale number
const saleNumber = await saleService.generateSaleNumber(client);

// ✅ CORRECT: Service layer posts GL entries
await glEntryService.recordSaleToGL(client, saleData);

// ✅ CORRECT: Service layer syncs stock
await client.query(
  `WITH new_qty AS (
     SELECT COALESCE(SUM(remaining_quantity), 0) AS qty
     FROM inventory_batches WHERE product_id = $1 AND status = 'ACTIVE'
   ), upd_pi AS (
     UPDATE product_inventory SET quantity_on_hand = (SELECT qty FROM new_qty) WHERE product_id = $1
   )
   UPDATE products SET quantity_on_hand = (SELECT qty FROM new_qty) WHERE id = $1`,
  [productId]
);

// ❌ WRONG: Trigger-based side effects
CREATE TRIGGER trg_post_sale_to_ledger AFTER INSERT ON sales ...
CREATE TRIGGER trg_sync_stock AFTER UPDATE ON inventory_batches ...
CREATE TRIGGER trg_generate_sale_number BEFORE INSERT ON sales ...
```

**If you think a trigger is needed, YOU ARE WRONG. Implement it in the Service layer.**

### Async/Await Only
- ✅ Always use `async/await` pattern
- ❌ Never use `.then()` chains
- Always handle errors with try/catch blocks

---

## 🧠 2️⃣ Validation & Data Contracts

### Zod Validation (Mandatory)
Use Zod for all validation (both input and output schemas).

Every API endpoint **must**:

1. **Validate `req.body` or `req.query` with a Zod schema**
   ```typescript
   const validatedData = MySchema.parse(req.body);
   ```

2. **Return a consistent response format**:
   ```typescript
   // Success
   {
     success: true,
     data: any,
     message?: string  // Optional
   }

   // Error
   {
     success: false,
     error: string
   }
   ```

3. **Never return raw DB rows directly**
   - Always map to schema-defined objects
   - Use Zod `.parse()` or `.safeParse()` for type safety

### Schema Location
- All shared schemas: `shared/zod/`
- Import and reuse across frontend and backend
- Never duplicate validation logic

---

## 💾 3️⃣ Database & Data Access

### Strict Rule: ❌ No ORM

**Never use**:
- Prisma
- TypeORM
- Sequelize
- Any other ORM

**Always use**:
- ✅ Raw SQL only, executed through `pg` (PostgreSQL) or `better-sqlite3` (SQLite)

### Repository Requirements

Repository files **must**:

1. **Use parameterized SQL queries** (`$1`, `$2`, …) to prevent injection
   ```typescript
   const result = await pool.query(
     'SELECT * FROM products WHERE id = $1',
     [productId]
   );
   ```

2. **Handle transactions atomically**
   ```typescript
   const client = await pool.connect();
   try {
     await client.query('BEGIN');
     // ... operations
     await client.query('COMMIT');
   } catch (error) {
     await client.query('ROLLBACK');
     throw error;
   } finally {
     client.release();
   }
   ```

3. **Never silently fail**
   - Always propagate or log errors
   - Use structured logging with context

4. **Define numeric fields correctly**
   - Use `DECIMAL` or `NUMERIC` in SQL for currency/quantities
   - Never use `FLOAT` or `DOUBLE` for financial data

---

## 🧮 4️⃣ Numeric Precision & Financial Math (CRITICAL)

### Principle: Decimal-Safe from Parse to Storage (Tally/SAP Pattern)

All financial values must remain in `Decimal` (via `Money` utility) from the moment they
enter the system until they leave. **Never convert to JS `number` in the middle of a
calculation chain.** Convert to `number` only at the final output boundary (API response,
DB parameter, UI display).

### Money Utility — SINGLE AUTHORITY for All Financial Math

```typescript
import { Money } from '../utils/money.js';

// ✅ CORRECT: Use Money for ALL financial operations
const subtotal = Money.lineTotal(quantity, unitPrice);
const discount = Money.applyDiscount(subtotal, discountPercent);
const tax      = Money.calculateTax(discount, taxRate);
const total    = Money.add(discount, tax);
const margin   = Money.grossMargin(sellingPrice, costPrice);

// ✅ CORRECT: Parse DB NUMERIC values with Money.parseDb()
const amount = Money.toNumber(Money.parseDb(row.total_amount));

// ✅ CORRECT: Keep Decimal through entire calculation, convert at boundary
const totalCash = payments.reduce((sum, p) => sum.plus(p.amount), new Decimal(0));
const remaining = new Decimal(totalDue).minus(totalNonCash);
if (totalCash.greaterThan(remaining)) {
  return totalCash.minus(remaining).toDecimalPlaces(2).toNumber(); // boundary
}
```

### ZERO TOLERANCE Violations

| Violation | Why It's Wrong | Correct Pattern |
|-----------|----------------|------------------|
| `parseFloat(row.amount)` | Truncates to 64-bit float, loses precision on large NUMERIC | `Money.toNumber(Money.parseDb(row.amount))` |
| `unitCost / baseCost` (raw JS `/`) | IEEE 754 floating-point division | `new Decimal(unitCost).dividedBy(baseCost)` |
| `Math.round(ratio)` on money | Floating-point rounding | `ratio.toDecimalPlaces(0, Decimal.ROUND_HALF_UP)` |
| `Math.abs(value)` on Decimal | Converts to number first | `value.abs()` or `Money.abs(value)` |
| `Math.max(0, decimal.toNumber())` | Loses precision before comparison | `Money.max(0, decimal)` or `Decimal.max(0, decimal)` |
| `.toNumber()` mid-calculation | Breaks Decimal chain | Keep as `Decimal`, call `.toNumber()` only at return |
| `quantity * price` (native `*`) | Floating-point multiplication | `Money.multiply(quantity, price)` |
| `.toFixed(2)` for comparison | Returns string, not number | Use `Money.round(value, 2)` |

### PostgreSQL NUMERIC Handling

PostgreSQL returns `NUMERIC`/`DECIMAL` columns as **strings** to preserve precision.
Never use `parseFloat()` — it silently truncates.

```typescript
// ✅ CORRECT: Money.parseDb handles string → Decimal safely
const cost = Money.toNumber(Money.parseDb(row.cost_price));     // For API response
const costDec = Money.parseDb(row.cost_price);                  // For further math

// ✅ CORRECT: In mapper functions
function mapRow(r: Record<string, unknown>) {
  return {
    unitCost: Money.toNumber(Money.parseDb(r.unit_cost)),
    totalValue: Money.toNumber(Money.parseDb(r.total_value)),
    quantity: Money.toNumber(Money.parseDb(r.quantity)),
  };
}

// ❌ FORBIDDEN
parseFloat(row.cost_price)           // Precision loss
Number(row.total_amount)             // Same problem
+row.quantity                        // Coercion, loses precision
```

### Decimal.js Configuration (Already Set in money.ts)
```typescript
Decimal.set({
  precision: 20,                    // High precision for intermediates
  rounding: Decimal.ROUND_HALF_UP,  // Standard currency rounding
  toExpNeg: -9,                     // Avoid scientific notation
  toExpPos: 21,
});
```

### Unit Cost Normalization Pattern (GR / Sales)
When detecting if a cost is a UoM multiple, use Decimal throughout:

```typescript
// ✅ CORRECT: All-Decimal normalization
const baseCostDec = Money.parseDb(productData.cost_price);
const unitCostDec = new Decimal(unitCost);
if (baseCostDec.greaterThan(0) && unitCostDec.greaterThan(0)) {
  const ratio = unitCostDec.dividedBy(baseCostDec);
  const rounded = ratio.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const isIntegerish = ratio.minus(rounded).abs().lessThan('1e-6');
  if (isIntegerish && rounded.gte(2) && rounded.lte(200)) {
    unitCost = Money.toNumber(unitCostDec.dividedBy(rounded));
  }
}

// ❌ FORBIDDEN: Raw JS division
const ratio = unitCost / baseCost;
const rounded = Math.round(ratio);
```

### Financial Comparison Pattern
```typescript
// ✅ CORRECT: Decimal comparisons
if (balance.lessThan(0) && balance.abs().greaterThan('0.01')) { ... }
const safeBalance = Money.max(0, balance);

// ❌ FORBIDDEN
if (Math.abs(balance.toNumber()) > 0.01) { ... }
const safeBalance = Math.max(0, balance.toNumber());
```

---

## 🧱 5️⃣ Frontend Rules (React + TypeScript)

### Component Architecture
- Use functional components with hooks
- No class components
- Follow React 19 best practices

### Input Validation
- All UI inputs must be controlled
- Validate with Zod schemas before submission
- Show validation errors inline

### API Integration
- Use React Query (TanStack Query) for all API calls
- No manual `fetch` unless absolutely necessary
- Centralize API endpoints in `src/api/` or `src/utils/api.ts`

### Styling
- Use TailwindCSS + ShadCN/UI components
- Follow existing design system
- No inline styles unless necessary

### Accessibility (a11y)
- Maintain ARIA labels on all interactive elements
- No unlabelled inputs or buttons
- Ensure keyboard navigation works
- Use semantic HTML

### Example Component Pattern
```typescript
import { z } from 'zod';
import { useForm } from '@tanstack/react-form';

const ProductSchema = z.object({
  name: z.string().min(1),
  price: z.number().positive(),
});

export function ProductForm() {
  const form = useForm({
    defaultValues: { name: '', price: 0 },
    onSubmit: async (values) => {
      const validated = ProductSchema.parse(values);
      await api.products.create(validated);
    },
  });

  return (
    <form onSubmit={form.handleSubmit}>
      {/* Form fields */}
    </form>
  );
}
```

---

## 🔒 6️⃣ Security & Permissions

### Authentication
- Every backend route must validate JWT tokens
- Use `authenticate` middleware
- Token in header: `Authorization: Bearer <token>`

### Authorization
- Check role-based access with `authorize` middleware
- Admin-only actions must verify `user.role === 'ADMIN'`
- Roles: ADMIN, MANAGER, CASHIER, STAFF

### Audit Logging
Log all critical operations:
- Stock adjustments
- Batch deletions/merges
- Price changes
- Cost changes
- User access changes

**Required audit fields**:
```typescript
{
  user_id: string,
  timestamp: Date,
  action: string,
  old_value: any,
  new_value: any,
  reference_type: string,
  reference_id: string
}
```

### Security Rules
- Never log passwords, tokens, or credit card numbers
- Validate and sanitize all user input
- Use environment variables for all secrets
- Implement rate limiting on public endpoints

---

## 🧩 7️⃣ Schema Consistency

### Product Schema (Mandatory Fields)

Product and Batch schemas must share consistent field names across:
- Inventory module
- POS module
- Reporting module
- Ledger module

**Mandatory Product Field Set**:
```typescript
{
  id: string;              // UUID
  productCode: string;     // SKU/Code
  name: string;            // Product name
  uom: string;             // Unit of measure
  costPrice: Decimal;      // Purchase cost
  sellingPrice: Decimal;   // Sale price
  quantity: Decimal;       // Stock quantity
  batchNumber?: string;    // Optional batch tracking
  expiryDate?: Date;       // Optional expiry tracking
  reorderLevel: Decimal;   // Reorder threshold
  isActive: boolean;       // Active status
  createdAt: Date;
  updatedAt: Date;
}
```

### Batch Schema (Mandatory Fields)
```typescript
{
  id: string;
  productId: string;
  batchNumber: string;
  quantity: Decimal;
  remainingQuantity: Decimal;
  expiryDate?: Date;
  receivedDate: Date;
  costPrice: Decimal;
  goodsReceiptId?: string;
  status: 'ACTIVE' | 'DEPLETED' | 'EXPIRED';
  createdAt: Date;
  updatedAt: Date;
}
```

### Field Naming Convention
- Use camelCase in TypeScript/JavaScript
- Use snake_case in SQL
- Map between conventions in repository layer

---

## 🔁 8️⃣ Transaction & Audit Compliance

### Stock Movement Rules

Every stock movement, adjustment, or reorder **must**:

1. **Create a StockMovement record**
   ```typescript
   await stockMovementRepo.create({
     productId,
     batchId,
     movementType: 'ADJUSTMENT',
     quantity: adjustment,
     quantityBefore,
     quantityAfter,
     userId,
     referenceType: 'MANUAL_ADJUSTMENT',
     referenceId: adjustmentId,
     reason,
   });
   ```

2. **Create a LedgerEntry record** (for accounting integration)
   - Debit/credit inventory account
   - Link to originating transaction ID
   - Never mutate ledger data after posting

3. **Log audit trail**
   - `created_by`, `created_at`, `updated_at`
   - Change history in audit tables where applicable

### Transaction Atomicity
- All multi-step operations must be wrapped in database transactions
- On error: rollback everything
- On success: commit all changes together

---

## ⚡ 9️⃣ Performance & Caching

### In-Memory Caching
Use in-memory caching (NodeCache or Redis) for frequently accessed lookups:
- Product lists
- Batch summaries
- UOM conversions
- Price calculations

### Cache Invalidation
**Always invalidate cache on writes**:
- Insert/update/delete operations
- Clear specific keys or entire cache groups
- Use React Query's `invalidateQueries` on frontend

### Database Indexes
Ensure proper indexes exist:
```sql
-- FEFO batch selection
CREATE INDEX idx_batches_fefo 
  ON inventory_batches(product_id, expiry_date, remaining_quantity);

-- Stock level queries
CREATE INDEX idx_products_reorder 
  ON products(reorder_level, is_active);

-- Movement history
CREATE INDEX idx_movements_product 
  ON stock_movements(product_id, created_at DESC);
```

---

## 🧰 🔟 Coding Quality Standards

### Linting & Formatting
- ESLint + Prettier must pass with zero warnings
- Run `npm run lint:fix` before committing
- Follow existing `.eslintrc` and `.prettierrc` configurations

### TypeScript Strict Mode
- Follow strict TypeScript mode (`"strict": true` in `tsconfig.json`)
- **ZERO `any` types** — no exceptions. Use explicit interfaces, union types, or `unknown`
- Use proper type inference
- Define interfaces for all data structures in `shared/types/`
- Frontend `tsconfig.app.json` enforces `noUnusedLocals` and `noUnusedParameters`

### Code Quality Rules
1. **Descriptive variable names**
   - ❌ No `data1`, `res2`, `temp`, `x`
   - ✅ Use `validatedProduct`, `stockLevel`, `adjustmentAmount`

2. **No code duplication**
   - Extract reusable utilities to `shared/utils/`
   - Create helper functions for common patterns

3. **Comment complex logic**
   - All complex SQL queries must have explanatory comments
   - Business rule implementations need BR-XXX references

4. **JSDoc headers**
   - All new files must include JSDoc-style headers:
   ```typescript
   /**
    * @module inventoryAdjustmentService
    * @description Handles all stock adjustment logic with ledger posting.
    * @requires Decimal.js for precision arithmetic
    */
   ```

---

## 🛠️ ESTABLISHED PATTERNS (MANDATORY)

> These patterns are already implemented across the codebase (490+ usages of asyncHandler, 118 UnitOfWork, etc.).
> ALL new code MUST use these patterns. Never introduce alternatives.

### asyncHandler Wrapper (All Routes)
Every route handler MUST be wrapped in `asyncHandler`. Never write manual try/catch in route definitions.

```typescript
import { asyncHandler } from '../middleware/errorHandler.js';

// ✅ CORRECT: asyncHandler wraps the handler
router.get('/products', asyncHandler(async (req, res) => {
  const products = await productService.list(req.query);
  res.json({ success: true, data: products });
}));

// ❌ WRONG: Manual try/catch in route
router.get('/products', async (req, res) => {
  try {
    const products = await productService.list(req.query);
    res.json({ success: true, data: products });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
```

### Typed Error Classes (Not Raw Error)
Throw typed errors from the AppError hierarchy. The global error handler maps them to HTTP status codes.

```typescript
import { NotFoundError, ValidationError, ConflictError, ForbiddenError, UnauthorizedError } from '../middleware/errorHandler.js';

// ✅ CORRECT: Typed errors with descriptive messages
throw new NotFoundError('Product not found');         // 404
throw new ValidationError('Invalid quantity');          // 400
throw new ConflictError('Batch already exists');       // 409
throw new ForbiddenError('Insufficient permissions');  // 403
throw new UnauthorizedError('Token expired');          // 401

// ❌ WRONG: Raw Error objects
throw new Error('Product not found'); // Always returns 500
```

### UnitOfWork / withTransaction (Multi-Step DB Operations)
All operations that touch multiple tables MUST use `withTransaction` for atomicity.

```typescript
import { withTransaction } from '../utils/unitOfWork.js';

// ✅ CORRECT: Atomic multi-table operation
async function completeSale(saleData: SaleInput) {
  return withTransaction(async (client) => {
    const sale = await saleRepo.create(client, saleData);
    await inventoryRepo.deductStock(client, sale.items);
    await ledgerRepo.postEntry(client, sale.journalEntry);
    return sale;
  });
}

// ❌ WRONG: Multiple independent pool.query calls without transaction
async function completeSale(saleData: SaleInput) {
  const sale = await pool.query('INSERT INTO sales...');
  await pool.query('UPDATE inventory...');  // Orphaned if this fails!
  await pool.query('INSERT INTO gl_entries...');
}
```

### batchFetch (Prevent N+1 Queries)
When loading related data for a list, use `batchFetch` instead of querying in a loop.

```typescript
import { batchFetch } from '../utils/batchFetch.js';

// ✅ CORRECT: Single query for all related data
const orders = await orderRepo.list();
const orderItems = await batchFetch(
  orders.map(o => o.id),
  (ids) => orderItemRepo.findByOrderIds(ids)
);

// ❌ WRONG: N+1 query pattern
const orders = await orderRepo.list();
for (const order of orders) {
  order.items = await orderItemRepo.findByOrderId(order.id); // N queries!
}
```

### PaginationHelper (List Endpoints)
All list/search endpoints MUST use `PaginationHelper` for consistent pagination.

```typescript
import { PaginationHelper } from '../utils/pagination.js';

// ✅ CORRECT: Centralized pagination
const { page, limit, offset } = PaginationHelper.fromQuery(req.query);
const { rows, count } = await productRepo.list({ offset, limit });
res.json({ success: true, data: PaginationHelper.envelope(rows, count, page, limit) });

// ❌ WRONG: Manual pagination parsing
const page = parseInt(req.query.page as string) || 1;
const limit = Math.min(parseInt(req.query.limit as string) || 50, 500);
```

### Money Utility (Financial Calculations)
Use the `Money` class for ALL financial operations. Never use raw `Decimal` or native numbers.

```typescript
import { Money } from '../utils/money.js';

// ✅ CORRECT: Money utility
const subtotal = Money.lineTotal(quantity, unitPrice);
const discount = Money.applyDiscount(subtotal, discountPercent);
const tax = Money.calculateTax(discount, taxRate);
const total = Money.add(discount, tax);
const margin = Money.grossMargin(sellingPrice, costPrice);

// ❌ WRONG: Raw arithmetic
const total = quantity * price * (1 - discount / 100);

// ❌ WRONG: Direct Decimal.js usage instead of Money
const total = new Decimal(quantity).times(price);
```

### No SQL in Route Files
Route files define URL patterns and middleware chains ONLY. SQL queries belong in repositories.

```typescript
// ✅ CORRECT: Route → Controller/Service → Repository
router.get('/products/:id', requireAuth, asyncHandler(productController.getById));

// ❌ WRONG: pool.query in a route file
router.get('/products/:id', asyncHandler(async (req, res) => {
  const result = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
  res.json({ success: true, data: result.rows[0] });
}));
```

### No Dynamic SQL (Template Literal Queries)
Never use template literals with `${}` interpolation in SQL strings. Always use parameterized `$1, $2` placeholders.

```typescript
// ✅ CORRECT: Parameterized placeholders
const result = await pool.query(
  'SELECT * FROM products WHERE category_id = $1 AND status = $2',
  [categoryId, status]
);

// ✅ CORRECT: Dynamic WHERE clauses with safe column whitelist
const allowedColumns = ['name', 'category_id', 'status'] as const;
const conditions: string[] = [];
const values: unknown[] = [];
if (filters.name) {
  conditions.push(`name ILIKE $${values.length + 1}`);
  values.push(`%${filters.name}%`);
}

// ❌ WRONG: Template literal SQL — SQL injection risk
const result = await pool.query(`SELECT * FROM products WHERE ${column} = ${value}`);
```

### Frontend ErrorBoundary (Required)
ErrorBoundary components MUST exist at two levels minimum:
1. **Root level** (in `main.tsx`) — catches crashes in providers
2. **Application level** (in `App.tsx`) — catches crashes in routes/pages

```tsx
// main.tsx — Root level
<ErrorBoundary section="Root">
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>
</ErrorBoundary>

// App.tsx — Application level
<ErrorBoundary section="Application">
  <Routes>
    {/* all routes */}
  </Routes>
</ErrorBoundary>
```

When adding major new pages/features, consider adding a page-level `<ErrorBoundary section="PageName">` to isolate crashes.

---

## 🧪 TESTING REQUIREMENTS (MANDATORY)

### Test Infrastructure
- **Backend**: Jest 30 with `ts-jest` ESM preset. Requires `--experimental-vm-modules` flag.
- **Frontend**: Vitest (uses `vite.config.ts`, no separate config needed)
- **Shared schemas**: `@shared` path alias mapped in `jest.config.cjs`

### When to Write Tests
Every new feature MUST include tests for:
1. **New utility functions** — unit tests covering edge cases (null, NaN, boundary values)
2. **New Zod schemas** — validation tests (valid, invalid, boundary, strict mode)
3. **New business logic in services** — unit tests with mocked repositories
4. **Error class usage** — verify correct HTTP status codes
5. **New React components** — render tests for key states (loading, error, empty, data)

### Test File Conventions
```
# Backend: Co-locate with source
SamplePOS.Server/src/utils/money.test.ts        # Tests money.ts
SamplePOS.Server/src/middleware/errorHandler.test.ts

# Frontend: Centralized test directory
samplepos.client/src/__tests__/currency.spec.ts
samplepos.client/src/__tests__/validation.spec.ts
```

### Running Tests
```powershell
# Backend (excludes DB-dependent integration tests)
cd SamplePOS.Server
npm test -- --testPathIgnorePatterns="accounting-integrity|rbac/test|customerStatement|stockCount"

# Frontend
cd samplepos.client
npx vitest run
```

### Test Quality Rules
- Test edge cases: null, undefined, NaN, Infinity, empty strings, zero, negative numbers
- Test boundary values: max page size, credit limits, decimal precision
- Use `import { jest } from '@jest/globals'` for ESM-compatible mocks (backend)
- Never mock what you don't own — prefer testing through public interfaces
- DB-dependent tests go in separate files that can be excluded in CI

---

## 🧭 11️⃣ Feature-Specific Rules

### Inventory Adjustments
- **Must post journal entries automatically**
- Requires reason code (minimum 5 characters)
- ADMIN or MANAGER role only
- Creates audit trail in `stock_movements`

### Batch Management
- All stock moves tied to `batch_id`
- FEFO ordering: earliest expiry first
- Never allow negative `remaining_quantity`
- Status must transition: ACTIVE → DEPLETED → EXPIRED

### Expiry Alerts
- Runs daily background job (scheduled task)
- Real-time dashboard widget
- Warning thresholds: 7 days (CRITICAL), 30 days (WARNING)
- Email notifications for CRITICAL expirations

### FEFO Selection (First Expiry First Out)
- POS must auto-select earliest expiry batch
- Algorithm in `inventoryService.selectBatchesForAllocation()`
- Visual display showing which batches will be consumed

### Cycle Counting
- Requires dual approval before posting correction
- Variance threshold: >5% triggers manager approval
- Auto-generates adjustment transactions
- Full audit trail of count vs system

### Auto-Reorder
- Must consider lead time + min/max levels
- Formula: `reorder_quantity = max_stock - current_stock`
- Trigger when: `current_stock <= reorder_level`
- Auto-creates PO in DRAFT status for review

---

## ✅ Copilot Golden Rules

### Do Not Auto-Guess Logic
- Follow schema & service patterns strictly
- Reference existing implementations
- Ask for clarification if requirements unclear

### Never Bypass Validation
- All inputs must pass Zod validation
- Never skip authentication/authorization checks
- Validate at controller layer, enforce at service layer

### Never Return Raw Database Results
- Always map to typed interfaces
- Use Zod schemas for output validation
- Transform snake_case to camelCase for frontend

### Always Handle Errors Gracefully
```typescript
try {
  const result = await service.operation(params);
  res.json({ success: true, data: result });
} catch (error) {
  logger.error('Operation failed', { error, params });
  res.status(500).json({ 
    success: false, 
    error: error.message || 'Operation failed' 
  });
}
```

### File Headers
All new files must include JSDoc-style headers:
```typescript
/**
 * @module inventoryAdjustmentService
 * @description Handles all stock adjustment logic with ledger posting.
 * @requires Decimal.js for precision arithmetic
 * @author Copilot
 * @created 2025-11-04
 */
```

---

## 🏁 Mission for Copilot

**Build a high-precision, fully auditable inventory and accounting core that's faster, cleaner, and more accurate than Odoo, Tally, and QuickBooks combined.**

### Core Tenets
1. **Precision First**: Bank-grade arithmetic using Decimal.js
2. **Audit Everything**: Full trail of who, what, when, why
3. **Validate Always**: Never trust input, always verify
4. **Layered Architecture**: Clear separation of concerns
5. **Type Safety**: Leverage TypeScript and Zod to the fullest
6. **Performance**: Cache aggressively, query efficiently
7. **Security**: Authentication, authorization, encryption
8. **Maintainability**: Clean code, no duplication, well-documented

---

## 📋 Pre-Commit Checklist

Before committing any code, verify:

### Build Verification (Mandatory)
```powershell
cd SamplePOS.Server && npm run build   # Must pass with zero TS errors
cd ../samplepos.client && npm run build # Must pass with zero TS errors
```
- [ ] **Backend `npm run build` passes** (zero TypeScript errors)
- [ ] **Frontend `npm run build` passes** (zero TypeScript errors, Vite bundle succeeds)

### Code Standards
- [ ] Followed Controller → Service → Repository layering
- [ ] Used Zod schemas from `shared/zod/`
- [ ] All SQL queries are parameterized (no template literal `${}` in SQL)
- [ ] No ORM code present
- [ ] Used `Money` utility (not raw Decimal.js) for all financial calculations
- [ ] API responses follow `{ success, data?, error? }` format
- [ ] All routes wrapped in `asyncHandler` (no manual try/catch in routes)
- [ ] Typed error classes used (NotFoundError, ValidationError, etc. — not raw Error)
- [ ] Multi-table operations wrapped in `withTransaction`
- [ ] List endpoints use `PaginationHelper`
- [ ] No `pool.query` in route or controller files
- [ ] No `any` types — zero tolerance
- [ ] No business logic in controllers or repositories
- [ ] No database access outside repositories
- [ ] `batchFetch` used for related-data loading (no N+1 loops)
- [ ] Tests written for new utilities, schemas, and business logic
- [ ] Backend tests pass: `npm test`
- [ ] Frontend tests pass: `npx vitest run`
- [ ] Audit logging for critical operations
- [ ] ErrorBoundary wrapping for new major pages (if frontend)
- [ ] Product field changes propagated globally (if applicable)

---

## 🔗 Related Documentation

- **Architecture Overview**: `ARCHITECTURE.md`
- **General Copilot Rules**: `COPILOT_INSTRUCTIONS.md`
- **GitHub-Scoped Instructions**: `.github/copilot-instructions.md`
- **Pricing & Costing System**: `SamplePOS.Server/PRICING_COSTING_SYSTEM.md`
- **Development Rules**: `DEVELOPMENT_RULES.md`

---

**Last Updated**: March 2026  
**Maintainer**: Architecture Team  
**Status**: Mandatory — All implementations must comply
