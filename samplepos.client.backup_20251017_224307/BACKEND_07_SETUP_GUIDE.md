// ============================================================================
// BACKEND SETUP GUIDE - How to Use These Mega-Files
// ============================================================================

## SETUP INSTRUCTIONS

You now have 6 mega-file templates created. Follow these steps:

### Step 1: Copy Configuration Files

From BACKEND_01_CONFIG.txt, copy the content between /* */ markers to:
- pos-backend/package.json (merge scripts section with existing)
- pos-backend/tsconfig.json
- pos-backend/.env
- pos-backend/.env.example
- pos-backend/.gitignore

### Step 2: Copy Prisma Schema

Copy BACKEND_02_PRISMA_SCHEMA.prisma content to:
- pos-backend/prisma/schema.prisma (replace existing content)

Then run:
```powershell
cd ..\pos-backend
npx prisma generate
npx prisma migrate dev --name initial_migration
```

### Step 3: Create Directory Structure

```powershell
cd ..\pos-backend
mkdir src
mkdir src/config
mkdir src/middleware
mkdir src/modules
mkdir src/utils
mkdir logs
```

### Step 4: Copy Core Server Files

From BACKEND_03_CORE_SERVER.ts, create these files:
- src/server.ts
- src/config/database.ts
- src/middleware/errorHandler.ts
- src/middleware/auth.ts
- src/middleware/validation.ts

### Step 5: Copy Utility Files

From BACKEND_04_UTILITIES.ts, create:
- src/utils/logger.ts
- src/utils/fifoCalculator.ts
- src/utils/uomConverter.ts
- src/utils/helpers.ts

### Step 6: Copy Auth & User Modules

From BACKEND_05_AUTH_USERS.ts, create:
- src/modules/auth.ts
- src/modules/users.ts

### Step 7: Copy Product Module

From BACKEND_06_PRODUCTS.ts, create:
- src/modules/products.ts

### Step 8: Create Remaining Modules

The following modules still need to be created. I'll provide simplified versions:

#### src/modules/customers.ts
#### src/modules/suppliers.ts
#### src/modules/purchases.ts
#### src/modules/sales.ts
#### src/modules/inventory.ts
#### src/modules/documents.ts
#### src/modules/reports.ts
#### src/modules/settings.ts

See BACKEND_08_REMAINING_MODULES.ts for complete implementations.

### Step 9: Create Seed Data (Optional)

Create prisma/seed.ts:

```typescript
import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Create admin user
  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@pos.com',
      passwordHash: adminPassword,
      fullName: 'System Administrator',
      role: UserRole.ADMIN
    }
  });

  // Create cashier user
  const cashierPassword = await bcrypt.hash('cashier123', 10);
  const cashier = await prisma.user.upsert({
    where: { username: 'cashier' },
    update: {},
    create: {
      username: 'cashier',
      email: 'cashier@pos.com',
      passwordHash: cashierPassword,
      fullName: 'Cashier User',
      role: UserRole.CASHIER
    }
  });

  // Create sample products
  const product1 = await prisma.product.create({
    data: {
      name: 'Sample Product 1',
      barcode: '1234567890',
      baseUnit: 'piece',
      sellingPrice: 10.00,
      costPrice: 6.00,
      currentStock: 100,
      reorderLevel: 20,
      category: 'General',
      taxRate: 0.15
    }
  });

  const product2 = await prisma.product.create({
    data: {
      name: 'Multi-UOM Product',
      barcode: '0987654321',
      baseUnit: 'piece',
      hasMultipleUnits: true,
      alternateUnit: 'box',
      conversionFactor: 12,
      sellingPrice: 2.50,
      costPrice: 1.50,
      currentStock: 240,
      reorderLevel: 48,
      category: 'Packaged',
      taxRate: 0.15
    }
  });

  console.log('✅ Seed data created:', { admin, cashier, product1, product2 });
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

Add to package.json:
```json
"prisma": {
  "seed": "tsx prisma/seed.ts"
}
```

Run seed:
```powershell
npm run db:seed
```

### Step 10: Start Backend Server

```powershell
cd ..\pos-backend
npm run dev
```

The server should start on http://localhost:3001

### Step 11: Test API

Test health endpoint:
```powershell
curl http://localhost:3001/health
```

Test login:
```powershell
$body = @{
  username = "admin"
  password = "admin123"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3001/api/auth/login" -Method Post -Body $body -ContentType "application/json"
```

## QUICK REFERENCE

### API Endpoints

**Auth:**
- POST /api/auth/register
- POST /api/auth/login
- GET /api/auth/verify
- POST /api/auth/change-password

**Users:**
- GET /api/users
- GET /api/users/:id
- PUT /api/users/:id
- DELETE /api/users/:id

**Products:**
- GET /api/products
- GET /api/products/:id
- GET /api/products/barcode/:barcode
- POST /api/products
- PUT /api/products/:id
- DELETE /api/products/:id
- GET /api/products/alerts/low-stock
- GET /api/products/meta/categories

**Sales:**
- GET /api/sales
- GET /api/sales/:id
- POST /api/sales
- PUT /api/sales/:id
- DELETE /api/sales/:id

**Purchases:**
- GET /api/purchases
- GET /api/purchases/:id
- POST /api/purchases
- PUT /api/purchases/:id
- POST /api/purchases/:id/receive

**Customers:**
- GET /api/customers
- GET /api/customers/:id
- POST /api/customers
- PUT /api/customers/:id
- GET /api/customers/:id/transactions
- POST /api/customers/:id/payment

**Suppliers:**
- GET /api/suppliers
- GET /api/suppliers/:id
- POST /api/suppliers
- PUT /api/suppliers/:id

**Inventory:**
- GET /api/inventory/batches
- GET /api/inventory/product/:productId/batches
- POST /api/inventory/adjustment
- GET /api/inventory/valuation

**Documents:**
- GET /api/documents
- GET /api/documents/:id
- POST /api/documents/invoice
- POST /api/documents/receipt

**Reports:**
- GET /api/reports/sales-summary
- GET /api/reports/inventory-report
- GET /api/reports/profit-analysis
- GET /api/reports/customer-ledger/:customerId

**Settings:**
- GET /api/settings
- GET /api/settings/:key
- PUT /api/settings/:key

## TROUBLESHOOTING

### Database Connection Error
Check .env file has correct DATABASE_URL with valid PostgreSQL credentials.

### Port Already in Use
Change PORT in .env or stop other process using port 3001.

### Module Not Found
Make sure all dependencies are installed:
```powershell
npm install
```

### Prisma Client Not Generated
Run:
```powershell
npx prisma generate
```

### TypeScript Errors
Check tsconfig.json is properly configured and all files have .js extensions in imports.

## NEXT STEPS

After backend is running:
1. Test all API endpoints with Postman or Thunder Client
2. Verify FIFO cost calculation works correctly
3. Test Multi-UOM conversions
4. Create frontend React application
5. Connect frontend to backend APIs
6. Implement authentication flow
7. Build POS interface
8. Add reports and documents

console.log('✅ Backend setup guide created');
console.log('📚 Follow the steps in BACKEND_07_SETUP_GUIDE.md');
