# 🧠 Copilot Master Rule — Systemwide Schema & Consistency Discipline

## Copilot Global Architecture Contract

Enterprise ERP — Schema, Validation, and UI Synchronization

---

### 🎯 Purpose
Maintain bank-grade consistency across the entire stack:
- Database schema and migrations (PostgreSQL/SQLite via raw SQL)
- Backend models/DTOs and API endpoints (Node.js + Express)
- Shared validation (Zod)
- Frontend forms, popups, selectors, and tables (React)

Scope applies to all entities: Products, Customers, Suppliers, Sales, Invoices, GoodsReceipts, PurchaseOrders, Accounts, etc.

Copilot must apply this contract automatically across the system — never limit logic to a single module.

---

### 1️⃣ Global Schema Synchronization

Whenever a new field or entity is introduced or modified, Copilot MUST propagate the change to ALL layers:

- Database schema (RAW SQL ONLY)
  - Location: `shared/sql/` (manual SQL migration scripts)
  - Policy: No ORM. Prisma may exist in package.json but MUST NOT be used.
- Shared Types
  - Location: `shared/types/*.ts`
- Validation Schemas (Zod)
  - Location: `shared/zod/{entity}.ts`
- Backend DTOs and Controllers
  - Location: `SamplePOS.Server/src/modules/**` (controller → service → repository)
  - Repositories use parameterized SQL only
- Frontend UI
  - Update models, forms, popups/modals, selectors, list/table columns wherever the entity appears

Naming convention:
- Database: snake_case
- API/TypeScript: camelCase
- Display labels: Title Case

Propagation Rule:
> One schema change = automatic ripple update across backend + validation + frontend.

Never ship a change that exists in only one layer.

---

### 2️⃣ Validation Discipline (Zod‑First)

Each entity has a single shared Zod schema used systemwide:

```
/shared/zod/{entity}.ts
```

Rules:
- Use the SAME schema for both backend and frontend validation
- Never redefine the same validation rule twice in different places
- Infer TypeScript types from Zod to ensure type safety

Example:

```ts
import { z } from 'zod';

export const ProductSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  sku: z.string().min(1).max(100),
  costPrice: z.number().nonnegative(),
  sellingPrice: z.number().nonnegative(),
  trackExpiry: z.boolean().default(false),
  // ...other fields...
}).strict();

export type Product = z.infer<typeof ProductSchema>;
```

Backend usage (controller example):

```ts
// Controller: validate request with shared Zod schema
try {
  const input = CreateProductSchema.parse(req.body);
  const data = await productService.create(input);
  res.json({ success: true, data });
} catch (err: any) {
  res.status(400).json({ success: false, error: err.message });
}
```

Frontend usage (form example):

```ts
// Import shared schema and infer types for form
import { CreateProductSchema } from '@/shared/zod/product';
type CreateProduct = z.infer<typeof CreateProductSchema>;
```

---

### 3️⃣ API Response Contract (Non‑Negotiable)

All endpoints must return the exact shape below. Frontend depends on it.

```json
// Success
{ "success": true, "data": { /* result */ }, "message": "Operation successful" }

// Error
{ "success": false, "error": "Descriptive error message" }
```

---

### 4️⃣ Architectural Guardrails (Enforced)

- No ORM (Prisma/Sequelize/TypeORM) — repositories use parameterized SQL
- Strict layering: Controller → Service → Repository (SQL only)
- No business logic in repositories; no DB access outside repositories
- Decimal.js for currency/quantity arithmetic (never native floats for money)

---

### 5️⃣ Product Field Consistency — Example (Track Expiry)

When a product field (e.g., `trackExpiry`) is added/changed:
- DB: add column via `shared/sql` migration
- Backend repositories: select/insert/update field with proper aliases (`track_expiry AS "trackExpiry"`)
- Shared Zod schema/types: add `trackExpiry` with default
- UI: include in all product forms, lists, selectors, and any relevant workflows (e.g., Goods Receipt)
- Validation: enforce once in shared Zod; UIs consume the same rule

This pattern applies to all entities.

---

### ✅ Pre‑Commit Self‑Check

- [ ] Field changes propagated across DB (SQL), shared types, Zod, backend, and UI
- [ ] Repositories use parameterized SQL only; no ORM
- [ ] Controller → Service → Repository layering respected
- [ ] API responses follow `{ success, data?, error? }`
- [ ] Decimal.js used for any monetary/quantity arithmetic

---

Maintainer note: This document complements `COPILOT_INSTRUCTIONS.md` and `.github/copilot-instructions.md` and adapts the global contract to this repository’s structure (raw SQL in `shared/sql`, shared Zod in `shared/zod`, strict layering in `SamplePOS.Server`).
---

## 🏛️ ENGINEERING DISCIPLINE — MANDATORY RULES

**This is not optional guidance. Copilot must treat this as architecture law.**

### 🎯 PRIMARY RULE — DO NOT REWRITE WORKING CODE

Before writing any new code, Copilot must:

1. Read existing implementation fully
2. Determine if the function already exists
3. If it exists and is correct → **REUSE IT**
4. If it exists but UI/flow is poor → **Change UI only**
5. Only write new backend logic if:
   - Functionality is wrong, or
   - Functionality does not exist at all

❗ **Never duplicate logic that already exists somewhere else in the system.**

### 🧱 ENFORCE SHARED RESOURCES

Copilot must:

- Reuse shared components
- Reuse shared services
- Reuse shared posting engine
- Reuse shared journal engine
- Reuse shared form styles
- Reuse shared validation framework

No screen should look like it was built by a different developer.
The ERP must feel like one system, not many small apps.

### 🎨 UI RULE — CHANGE DESIGN, NOT ARCHITECTURE (WHEN POSSIBLE)

| Problem | What Copilot must do |
|---|---|
| Bad layout | Fix layout only |
| Confusing form | Improve form only |
| Poor UX flow | Improve UX only |
| Wrong accounting logic | Fix backend logic |
| Missing feature | Implement properly |

### 🧠 ALWAYS READ COPILOT INSTRUCTIONS WHILE WORKING

Copilot must continuously re-read:
- The Cutover Accounting Prompt
- These Engineering Discipline Rules

Before writing each file or function.

### 🛑 AVOID DUPLICATION AT ALL COSTS

Copilot must check:
- Does a posting service already exist?
- Does a journal creator already exist?
- Does validation framework already exist?
- Does a form component already exist?

If yes → **reuse**.

### 🏗️ TARGET: ENTERPRISE-GRADE ERP APPLICATION

The final system must feel like:
- One consistent design language
- One posting engine
- One validation logic
- One UI component library
- Centralized accounting behavior

Not scattered custom code per screen.

### 🔐 FINAL DIRECTIVE

> Before implementing anything, search the codebase for existing services, components, posting logic, and UI patterns. Reuse them. Only create new code when the required capability truly does not exist or is fundamentally incorrect. The ERP must remain visually and architecturally consistent across all modules.
