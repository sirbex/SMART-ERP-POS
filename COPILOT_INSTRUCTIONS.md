# SMART-ERP-POS - Copilot Instructions for All Modules

**Date**: February 2026  
**Architecture**: Modular Hybrid Monolith (No ORM)  
**Project Type**: ERP System with POS  
**Database**: `pos_system` (PostgreSQL) - ALWAYS use this database consistently

> See also
- **Copilot Implementation Rules (MANDATORY)**: `./COPILOT_IMPLEMENTATION_RULES.md`
- Global Copilot contract (schema/validation/UI sync): `./copilot.md`
- GitHub-scoped agent guide for workflows/PRs: `./.github/copilot-instructions.md`

## 🧠 STRICT RULES (MUST FOLLOW)

### Database Configuration (CRITICAL)
**ALWAYS use `pos_system` database:**
- Production Database: `pos_system` (PostgreSQL)
- Connection String: `postgresql://postgres:password@localhost:5432/pos_system`
- Never switch to other databases (samplepos, hotel_management, etc.)
- All development, testing, and production must use `pos_system` consistently
- All SQL queries, migrations, and tests must target `pos_system`

### Project Structure
```
├── client/     → React + Vite + React Query (frontend)
├── server/     → Node.js + Express + Zod + pg (backend)
└── shared/     → Zod schemas and TypeScript types only
```

### Core Modules
- `pos/`
- `accounting/`
- `inventory/`
- `customers/`
- `suppliers/`

### Absolute Requirements

✅ **Never duplicate** existing functions, validations, or API routes  
✅ **Never mix** backend and frontend logic — keep each in its folder  
✅ **Never introduce** Prisma, Sequelize, or any ORM  
✅ **Database access** must use parameterized SQL via `pg` or `better-sqlite3`  
✅ **All SQL** goes through a `Repository` layer only — not directly in controllers  
✅ **Always use** async/await and handle errors with try/catch and Zod  
✅ **Always validate** incoming data with Zod schemas from `/shared/zod`  
✅ **Use shared types** — do not redefine interfaces manually  
✅ **Each module** must include: controller → service → repository layers  
✅ **Frontend** must call backend using Axios only, no direct DB logic  
✅ **Never mix** React hooks with backend code  
✅ **All responses** follow this structure:
```typescript
{ 
  success: boolean; 
  message?: string; 
  data?: any; 
  error?: string 
}
```

### Timezone Strategy (MANDATORY)
**Single Strategy: UTC Everywhere + Frontend Display Conversion**

✅ **Database**: Store all timestamps in UTC (TIMESTAMPTZ), use DATE for transaction dates  
✅ **Backend**: Return dates as YYYY-MM-DD strings, timestamps as ISO 8601 UTC  
✅ **Frontend**: Convert to user timezone ONLY for display  
✅ **Never** convert DATE to Date object in backend (causes timezone shift)  
✅ **Custom type parser** configured in `src/db/pool.ts` for DATE columns  
✅ **Date filters** send plain strings (YYYY-MM-DD) from frontend to backend  

**See**: `SamplePOS.Server/TIMEZONE_STRATEGY.md` for full implementation details

### Layered Architecture (Mandatory)
```
Controller → Service → Repository → Database
```
- **Controller**: Request/response handling, validation
- **Service**: Business logic, orchestration
- **Repository**: SQL queries only (parameterized)
- Never skip layers or access database directly from controller

---

## Frontend Module – Copilot Instructions

1. Only generate React + TypeScript code using modern hooks and functional components.
2. Use Vite for build tooling and hot module replacement.
3. Use Tailwind CSS for all styling; no custom CSS unless absolutely necessary.
4. Validate all forms using Zod schemas imported from `shared/zod/`.
5. Use React Query for all API calls and server state management.
6. **Never access database directly** — always call backend via Axios.
7. **Never mix backend logic** in frontend components or hooks.
8. Handle loading, error, and empty states for all data fetching.
9. Implement optimistic UI updates for better perceived performance.
10. Add accessibility attributes (ARIA) to all interactive elements.
11. All API responses must follow: `{ success, message?, data?, error? }` structure.
12. Store Zod schemas in `shared/zod/` — never redefine validation in frontend.
13. Use TypeScript types from `shared/types/` — never duplicate type definitions.

---

## Backend (Server) Module – Copilot Instructions

1. Only generate Node.js/TypeScript code with Express framework.
2. **Never use ORM** — use raw SQL with `pg` (Postgres) or `better-sqlite3` (SQLite).
3. **All SQL must be parameterized** to prevent SQL injection.
4. Follow strict layering: **Controller → Service → Repository → Database**.
5. **Never access database directly** from controllers or services.
6. Validate all incoming requests using Zod schemas from `shared/zod/`.
7. Use Zod `.parse()` or `.safeParse()` — handle validation errors properly.
8. **All responses must follow**: `{ success: boolean, message?: string, data?: any, error?: string }`.
9. Use async/await for all database operations with try/catch error handling.
10. **Never duplicate** existing routes, functions, or validations.
11. Organize by module: `pos/`, `accounting/`, `inventory/`, `customers/`, `suppliers/`.
12. Each module must have: `controller.ts`, `service.ts`, `repository.ts`.
13. Repository layer contains **only SQL queries** — no business logic.
14. Service layer contains **business logic** — orchestrates repositories.
15. Controller layer handles **HTTP requests/responses** — calls services.
16. Import types from `shared/types/` — never redefine types in backend.
17. Log all errors with context but never log sensitive data (passwords, tokens).

---

## Repository Layer – Copilot Instructions

1. **Only SQL queries** — no business logic, no validation, no HTTP handling.
2. Always use parameterized queries to prevent SQL injection.
3. Use `pg` for Postgres: `client.query('SELECT * FROM users WHERE id = $1', [id])`.
4. Use `better-sqlite3` for SQLite: `db.prepare('SELECT * FROM users WHERE id = ?').get(id)`.
5. Export pure functions that accept parameters and return query results.
6. Handle database errors and throw descriptive error messages.
7. Use database transactions for multi-step operations.
8. **Never call other repositories** — keep queries isolated.
9. **Never import from controllers or services** — repository is lowest layer.
10. Return raw database results; let service layer transform data.

Example structure:
```typescript
// server/modules/customers/customerRepository.ts
export async function findCustomerById(id: number) {
  const result = await pool.query(
    'SELECT * FROM customers WHERE id = $1',
    [id]
  );
  return result.rows[0];
}
```

---

## Accounting Module (C# .NET) – Copilot Instructions

1. Only generate C#/.NET code for ledger, journal entries, and payroll logic.
2. Use Entity Framework Core for all database operations with Postgres.
3. **Never touch Node.js modules' databases directly** — maintain clear boundaries.
4. Validate all DTOs with FluentValidation before processing.
5. Never bypass ledger posting; all transactions must be atomic.
6. Emit domain events back to event bus for other modules to consume.
7. Include comprehensive error handling and logging for every business action.
8. Implement double-entry bookkeeping for all financial transactions.
9. Never expose database entities directly; always use DTOs.
10. Use async/await for all I/O operations to prevent blocking.
11. Include comprehensive XML documentation comments for all public APIs.
12. Return standardized responses compatible with: `{ success, message?, data?, error? }`.
13. Expose health check endpoints and metrics for monitoring.
14. Use strongly-typed configurations from appsettings.json.
15. Implement repository pattern with EF Core for data access.
16. Keep module boundaries clear; no direct dependencies on Node.js modules.

Example structure:
```csharp
// Accounting/Controllers/LedgerController.cs
[ApiController]
[Route("api/accounting/[controller]")]
public class LedgerController : ControllerBase
{
    private readonly ILedgerService _ledgerService;
    
    [HttpPost("post-entry")]
    public async Task<IActionResult> PostEntry([FromBody] JournalEntryDto dto)
    {
        var validator = new JournalEntryValidator();
        var validationResult = await validator.ValidateAsync(dto);
        
        if (!validationResult.IsValid)
        {
            return BadRequest(new { 
                success = false, 
                error = string.Join(", ", validationResult.Errors) 
            });
        }
        
        var result = await _ledgerService.PostJournalEntryAsync(dto);
        return Ok(new { success = true, data = result });
    }
}
```

---

## Shared Folder – Copilot Instructions

1. Contains **only** Zod schemas and TypeScript types.
2. **Never include** business logic, database queries, or HTTP handlers.
3. Export Zod schemas for validation across frontend and backend.
4. Export TypeScript types using `z.infer<typeof Schema>`.
5. Keep schemas DRY — create reusable primitives (email, phone, currency).
6. Version schemas if breaking changes needed (v1, v2).
7. Use `.strict()` on object schemas to prevent unknown properties.
8. Include JSDoc comments explaining each field.

Example structure:
```typescript
// shared/zod/customer.ts
import { z } from 'zod';

export const CustomerSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(255),
  email: z.string().email(),
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/),
  balance: z.number().nonnegative()
}).strict();

export type Customer = z.infer<typeof CustomerSchema>;
```

---

## 🧠 Copilot Development Rule: Product Schema Consistency

Whenever a new field is added or modified in the Product entity/model (for example: expiryDate, barcode, unitOfMeasure, reorderLevel, trackExpiry), you must ensure the following:

1) Surface the field consistently across the UI
- The new field appears and is usable across all Product-related views and components, including:
  - Product creation and edit modals/forms
  - Product list/grid/table views
  - Product details popup/side panel
  - Product selectors (search dropdowns, GR/PO screens, stock adjustments, etc.)

2) Centralize validation and computed logic
- Any validation or computed logic related to this field (e.g., expiry checks, stock warnings) must be:
  - Implemented once in a shared utility or Zod schema in `shared/zod`
  - Imported and reused everywhere the field appears (frontend and backend)
- Do not duplicate page-specific validation. Prefer a shared hook like `useProductValidation()` or shared helpers that wrap Zod schemas.

3) Auto-update missing components
- If any Product popup, modal, or component does not yet include this field, update it to include it (with correct labels, help text, and accessibility attributes).

4) Avoid page-specific expiry logic
- Never create separate expiry-check logic for a single page (e.g., GR only). Move expiry validation into shared schemas/utilities so all UIs share identical rules.

5) Keep types and DTOs in sync
- Ensure type definitions (`Product`, `ProductDTO`, etc.) are updated in `shared/types`, and all API DTOs are synchronized with backend schemas and database fields.

6) Verify end-to-end wiring
- After adding a field, ensure:
  - Frontend Zod schema includes it
  - Backend validation and DB migration support it (add a SQL migration in `shared/sql` when needed)
  - The UI binds it correctly in all relevant forms, tables, and selectors

Reminder: Product fields must propagate globally across all product views automatically. Never hardcode field subsets.

---

## Module Organization (Mandatory Structure)

Each module must follow this structure:

```
server/modules/customers/
├── customerController.ts    → HTTP request/response handling
├── customerService.ts        → Business logic
├── customerRepository.ts     → SQL queries only
└── customerRoutes.ts         → Express route definitions
```

**Modules Required**:
- `pos/` - Point of sale operations
- `accounting/` - Ledger, journal entries, payroll
- `inventory/` - Stock management, products
- `customers/` - Customer management
- `suppliers/` - Supplier management

---

## General Cross-Module Guidelines

### Module Boundaries
- Modules communicate through well-defined public interfaces
- Use internal event bus for asynchronous communication between modules
- Never directly access another module's database or internal state
- Each module should be independently testable and deployable

### Error Handling
- Always return structured error responses with error codes
- Include request IDs for tracing across services
- Log errors with full context but sanitize sensitive data

### Security
- Never log passwords, tokens, or credit card numbers
- Validate and sanitize all user input
- Use environment variables for all secrets and API keys
- Implement rate limiting on public endpoints

### Testing
- Write unit tests for all business logic
- Write integration tests for API endpoints
- Use test fixtures and factories for test data
- Mock external dependencies in tests

### Documentation
- Every service must have a README.md with setup instructions
- Document all environment variables required
- Include example requests/responses for APIs
- Keep architecture diagrams up to date

### Performance
- Cache expensive operations where appropriate
- Use database indexes for frequently queried fields
- Implement pagination for list endpoints
- Use connection pooling for database connections

### Monitoring
- Expose `/health` and `/ready` endpoints for each module
- Log structured JSON for easy parsing
- Track key metrics (latency, error rate, throughput) per module
- Use correlation IDs to trace requests across module boundaries
- Monitor internal event bus for message backlog and latency

---

## Technology Stack Summary

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | React + Vite + TypeScript | UI/UX |
| State Management | React Query | Server state caching |
| Styling | Tailwind CSS | Utility-first CSS |
| HTTP Client | Axios | API calls |
| Backend (Node.js) | Node.js + Express + TypeScript | REST API for POS, Inventory, Customers, Suppliers |
| Backend (C# .NET) | .NET Core + EF Core | Accounting, Ledger, Payroll |
| Validation (Node.js) | Zod | Runtime type validation |
| Validation (C#) | FluentValidation | DTO validation |
| Database (Node.js) | PostgreSQL (pg) / SQLite (better-sqlite3) | POS, Inventory data |
| Database (C#) | PostgreSQL (EF Core) | Accounting, Financial data |
| SQL (Node.js) | Raw parameterized queries | No ORM |
| ORM (C#) | Entity Framework Core | For accounting module only |

**Architecture**: Modular Hybrid Monolith  
**Node.js Modules**: POS, Inventory, Customers, Suppliers (No ORM)  
**C# Module**: Accounting (Uses EF Core)  
**Communication**: REST API between Node.js and C# services

---

## API Response Format (Mandatory)

All backend endpoints must return this structure:

```typescript
// Success response
{
  "success": true,
  "data": { /* actual data */ },
  "message": "Operation successful" // optional
}

// Error response
{
  "success": false,
  "error": "Error message describing what went wrong"
}
```

**Never deviate from this format** — frontend expects consistent structure.

---

## Database Rules (Critical)

### ❌ NEVER DO THIS:
```typescript
// Don't use ORM
const user = await User.findOne({ where: { id: 1 } }); // ❌

// Don't query in controller
app.get('/users', async (req, res) => {
  const users = await pool.query('SELECT * FROM users'); // ❌
  res.json(users);
});

// Don't use string interpolation
const query = `SELECT * FROM users WHERE id = ${id}`; // ❌ SQL injection!
```

### ✅ ALWAYS DO THIS:
```typescript
// Use parameterized queries in repository
export async function findUserById(id: number) {
  const result = await pool.query(
    'SELECT * FROM users WHERE id = $1',
    [id]
  );
  return result.rows[0];
}

// Call repository from service
export async function getUser(id: number) {
  const user = await findUserById(id);
  if (!user) throw new Error('User not found');
  return user;
}

// Call service from controller
export async function getUserHandler(req: Request, res: Response) {
  try {
    const user = await getUser(parseInt(req.params.id));
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(404).json({ success: false, error: error.message });
  }
}
```

---

1. **POS Module** stores all transactions locally in SQLite
2. **Event Queue** buffers operations when network is unavailable
3. **Sync Module** replays events to main database when online
4. **Conflict Resolution** uses timestamp + manual review for conflicts
5. **Local-First UI** shows immediate feedback using optimistic updates

---

## Event-Driven Architecture (Internal)

```
POS Module → Event Queue → Sync Module → Internal Event Bus → Accounting Module
                                                             ↓
                                                       Analytics Module
```

**Key Principles**:
1. All state changes emit domain events
2. Events are immutable and ordered by timestamp
3. Modules subscribe to relevant event topics via internal bus
4. Event replay enables eventual consistency
5. Dead letter queue captures failed events
6. In-memory event bus for fast inter-module communication
7. Persistent event log for audit and replay

---

## Modular Monolith Benefits

✅ **Simplified Deployment**: Single application, easier to deploy and manage  
✅ **Reduced Latency**: In-process communication is faster than network calls  
✅ **Easier Development**: Run entire application locally without complex infrastructure  
✅ **Strong Consistency**: ACID transactions across modules when needed  
✅ **Lower Operational Cost**: One database, one server, simpler monitoring  
✅ **Future Flexibility**: Modules can be extracted to microservices if needed

---

## Module Independence Rules

1. **No Direct Dependencies**: Modules cannot directly reference each other's internals
2. **Public Contracts**: Expose DTOs/interfaces in shared contracts folder
3. **Event-Based Communication**: Use internal event bus for async operations
4. **Database Per Module**: Each module owns its schema/tables
5. **Separate Deployment Units (Future)**: Modules should be extractable to separate services

---

## Common Pitfalls to Avoid

1. ❌ Mixing frontend and backend logic
2. ❌ Accessing database from controller or service directly
3. ❌ Using ORM (Prisma, Sequelize, TypeORM, etc.)
4. ❌ String interpolation in SQL queries
5. ❌ Duplicating validation logic (use shared Zod schemas)
6. ❌ Redefining types (use shared types)
7. ❌ Skipping error handling (always use try/catch)
8. ❌ Inconsistent API response format
9. ❌ Business logic in controllers
10. ❌ HTTP handling in services

---

## Checklist Before Committing Code

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
- [ ] Used types from `shared/types/`
- [ ] All SQL queries are parameterized
- [ ] No ORM code present
- [ ] API responses follow `{ success, data?, error? }` format
- [ ] Error handling with try/catch
- [ ] No duplicate functions or routes
- [ ] No business logic in controllers
- [ ] No database access outside repositories
- [ ] No frontend logic in backend
- [ ] No backend logic in frontend
- [ ] Product field changes propagated across all Product views (UI forms, lists, selectors) and synchronized in schemas/types/migrations

---

*These rules are mandatory. Code that violates these rules should not be committed.*
