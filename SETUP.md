# SamplePOS - Setup & Installation Guide

## 🎯 Overview

SamplePOS is a modular ERP system with:
- **Backend**: Node.js + TypeScript + PostgreSQL (NO ORM - raw SQL only)
- **Frontend**: React 19 + Vite + Tailwind + Radix UI
- **Validation**: Zod schemas shared between frontend/backend
- **Architecture**: Controller → Service → Repository pattern

---

## 📋 Prerequisites

- **Node.js**: v20+ 
- **PostgreSQL**: v14+
- **Redis**: v7+ (optional, for queue management)
- **PowerShell**: For running scripts

---

## 🚀 Quick Start

### 1. Clone Repository
```powershell
git clone https://github.com/beccapowerz/sample-pos.git
cd sample-pos
```

### 2. Setup Database

**Option A: Using pgAdmin or psql**
```sql
CREATE DATABASE pos_system;
```

Then run the schema:
```powershell
psql -U postgres -d pos_system -f shared/sql/001_initial_schema.sql
```

**Option B: Using Docker**
```powershell
docker run --name samplepos-db `
  -e POSTGRES_PASSWORD=password `
  -e POSTGRES_DB=pos_system `
  -p 5432:5432 `
  -d postgres:14
```

### 3. Install Dependencies

```powershell
# Backend
cd SamplePOS.Server
npm install

# Shared schemas
cd ../shared
npm install

# Frontend
cd ../samplepos.client
npm install
```

### 4. Configure Environment

Create `.env` in `SamplePOS.Server/`:
```bash
# Database
DATABASE_URL="postgresql://postgres:password@localhost:5432/pos_system"

# JWT Authentication
JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"
JWT_EXPIRES_IN="7d"

# Server
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:5173

# Company
COMPANY_NAME="Your Company Name"
COMPANY_ADDRESS="123 Business Street"
CURRENCY="USD"
DEFAULT_TAX_RATE="0.15"
```

### 5. Start Development Servers

**Option A: PowerShell launcher (recommended)**
```powershell
.\start-dev.ps1
```

**Option B: Manual**
```powershell
# Terminal 1 - Backend
cd SamplePOS.Server
npm run dev

# Terminal 2 - Frontend
cd samplepos.client
npm run dev
```

---

## 📚 Project Structure

```
SamplePOS/
├── .github/
│   └── copilot-instructions.md    # AI agent instructions
├── shared/                         # Shared between frontend/backend
│   ├── zod/                       # Zod validation schemas
│   │   ├── product.ts
│   │   ├── customer.ts
│   │   ├── user.ts
│   │   └── sale.ts
│   ├── types/                     # TypeScript types
│   └── sql/                       # SQL migration scripts
│       └── 001_initial_schema.sql
├── SamplePOS.Server/              # Node.js backend
│   ├── src/
│   │   ├── db/
│   │   │   └── pool.ts           # PostgreSQL connection
│   │   ├── modules/
│   │   │   └── products/
│   │   │       ├── productRepository.ts   # SQL queries only
│   │   │       ├── productService.ts       # Business logic
│   │   │       ├── productController.ts    # HTTP handlers
│   │   │       └── productRoutes.ts        # Express routes
│   │   └── server.ts             # Main Express app
│   ├── package.json
│   └── .env
└── samplepos.client/              # React frontend
    ├── src/
    ├── package.json
    └── vite.config.ts
```

---

## 🏗️ Architecture Patterns

### Strict 3-Layer Architecture

```
HTTP Request → Controller → Service → Repository → Database
```

**Controller** (`productController.ts`)
- HTTP request/response handling
- Zod validation
- Error handling

**Service** (`productService.ts`)
- Business logic
- Orchestrates repository calls
- Business rule validation

**Repository** (`productRepository.ts`)
- **ONLY** SQL queries
- Parameterized queries (no SQL injection)
- No business logic

### Example: Adding a New Module

1. **Create Zod schema** in `shared/zod/customer.ts`
2. **Create repository** in `src/modules/customers/customerRepository.ts`
3. **Create service** in `src/modules/customers/customerService.ts`
4. **Create controller** in `src/modules/customers/customerController.ts`
5. **Create routes** in `src/modules/customers/customerRoutes.ts`
6. **Wire routes** in `src/server.ts`:
   ```typescript
   import customerRoutes from './modules/customers/customerRoutes.js';
   app.use('/api/customers', customerRoutes);
   ```

---

## 🛠️ Development Workflow

### Backend Development

```powershell
cd SamplePOS.Server
npm run dev          # Start with hot reload
npm run build        # Compile TypeScript
npm run lint         # Run ESLint
npm run test         # Run tests
```

### Frontend Development

```powershell
cd samplepos.client
npm run dev          # Start Vite dev server
npm run build        # Build for production
npm run preview      # Preview production build
```

### Database Migrations

Add new migration file in `shared/sql/`:
```sql
-- 002_add_new_table.sql
CREATE TABLE new_table (...);
```

Run migration:
```powershell
psql -U postgres -d pos_system -f shared/sql/002_add_new_table.sql
```

---

## 🔒 Critical Rules

### ❌ NEVER DO:
1. Use ORM (Prisma, Sequelize, TypeORM, etc.)
2. Query database from controller or service
3. Put business logic in repository
4. Use string interpolation in SQL
5. Skip Zod validation

### ✅ ALWAYS DO:
1. Use parameterized SQL queries
2. Follow Controller → Service → Repository pattern
3. Validate with Zod schemas from `shared/zod/`
4. Use `Decimal.js` for currency/quantities
5. Return `{ success, data?, error? }` format

---

## 📡 API Examples

### Health Check
```bash
GET http://localhost:3001/health
```

### Get Products
```bash
GET http://localhost:3001/api/products?page=1&limit=50
```

### Create Product
```bash
POST http://localhost:3001/api/products
Content-Type: application/json

{
  "sku": "PROD-001",
  "name": "Sample Product",
  "costPrice": 10.50,
  "sellingPrice": 15.99,
  "reorderLevel": 10
}
```

### Update Product
```bash
PUT http://localhost:3001/api/products/{id}
Content-Type: application/json

{
  "sellingPrice": 17.99
}
```

---

## 🧪 Testing

### Manual API Testing
Use the comprehensive PowerShell test script:
```powershell
cd SamplePOS.Server
.\test-api.ps1
```

### Unit Tests (when implemented)
```powershell
npm test
```

---

## 🐛 Troubleshooting

### Database Connection Failed
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```
**Solution**: 
- Check PostgreSQL is running: `pg_isready`
- Verify DATABASE_URL in `.env`
- Test connection: `psql -U postgres -d pos_system`

### Module Not Found Errors
```
Error: Cannot find module 'zod'
```
**Solution**:
```powershell
cd shared && npm install
cd ../SamplePOS.Server && npm install
```

### Port Already in Use
```
Error: listen EADDRINUSE: address already in use :::3001
```
**Solution**:
```powershell
# Find and kill process on port 3001
Get-Process -Id (Get-NetTCPConnection -LocalPort 3001).OwningProcess | Stop-Process
```

---

## 📖 Further Reading

- **Architecture**: See `ARCHITECTURE.md`
- **AI Agent Guide**: See `.github/copilot-instructions.md`
- **Pricing System**: See `SamplePOS.Server/PRICING_COSTING_SYSTEM.md`

---

## 🤝 Contributing

1. Follow the 3-layer architecture pattern
2. Use Zod schemas from `shared/zod/`
3. Write parameterized SQL queries
4. Test before committing
5. No ORM code

---

## 📄 License

MIT
