# 🏗️ SamplePOS Complete Rebuild Plan

## 📊 Executive Summary

**Project:** Full-stack POS system rebuild with clean architecture  
**Goal:** Modern, scalable, maintainable codebase preserving all business logic  
**Timeline:** ~20-30 hours (3-4 days intensive work)  
**Approach:** Fresh initialization → Migrate logic → Test → Deploy

---

## 🎯 Current System Analysis

### Core Features to Preserve
1. **Multi-UOM System** - Stock, purchase, and sales unit conversions
2. **FIFO Cost Tracking** - Batch-based inventory with automatic cost calculation
3. **Purchase Order Workflow** - Create → Send → Receive → Pay suppliers
4. **Customer Management** - Ledger, credit tracking, payment history
5. **Transaction System** - Sales, payments, refunds, outstanding balances
6. **Inventory Management** - Real-time stock, batch tracking, expiry dates
7. **Supplier Management** - Performance metrics, accounts payable, catalogs
8. **Reporting** - Sales, purchase, profit analysis, low stock alerts
9. **Offline Support** - PWA with React Query caching

### Current Tech Stack
- **Frontend:** React 19 + Vite 7 + Tailwind 3 + shadcn/ui
- **Backend:** Node.js + Express 4 + PostgreSQL
- **State:** React Query (TanStack)
- **Auth:** Basic (needs improvement)

### Database Schema (from investigation)
```sql
-- Core Tables
inventory_items (id, sku, name, base_price, category, is_active, reorder_level, metadata)
inventory_batches (id, inventory_item_id, batch_number, quantity, remaining_quantity, unit_cost, received_date, expiry_date)
transactions (id, invoice_number, timestamp, customer, total, paid, outstanding, payment_type, status)
customers (id, name, email, phone, credit_limit, current_balance)
suppliers (id, name, contact_person, email, phone, payment_terms, is_active)
purchase_orders (id, order_number, supplier_id, order_date, total_value, status)
purchase_order_items (id, purchase_order_id, product_id, quantity_ordered, unit_cost, total_cost)
```

---

## 🏗️ New Architecture Design

### Project Structure

```
samplepos/
├── frontend/
│   ├── src/
│   │   ├── app/                    # App initialization
│   │   │   ├── App.tsx
│   │   │   ├── router.tsx
│   │   │   └── providers.tsx
│   │   │
│   │   ├── features/               # Feature-based modules
│   │   │   ├── auth/
│   │   │   │   ├── components/
│   │   │   │   ├── hooks/
│   │   │   │   ├── services/
│   │   │   │   └── types.ts
│   │   │   ├── pos/
│   │   │   │   ├── components/
│   │   │   │   ├── hooks/
│   │   │   │   ├── services/
│   │   │   │   └── types.ts
│   │   │   ├── inventory/
│   │   │   ├── purchases/
│   │   │   ├── customers/
│   │   │   ├── suppliers/
│   │   │   ├── reports/
│   │   │   └── settings/
│   │   │
│   │   ├── shared/                 # Shared resources
│   │   │   ├── components/         # Reusable UI
│   │   │   │   ├── ui/            # shadcn/ui components
│   │   │   │   ├── forms/         # Form components
│   │   │   │   ├── tables/        # Table components
│   │   │   │   └── layouts/       # Layout components
│   │   │   ├── hooks/             # Common hooks
│   │   │   ├── utils/             # Helper functions
│   │   │   ├── constants/         # App constants
│   │   │   └── types/             # Shared types
│   │   │
│   │   ├── lib/                    # Third-party config
│   │   │   ├── api.ts            # Axios setup
│   │   │   ├── query.ts          # React Query config
│   │   │   └── utils.ts          # cn() etc
│   │   │
│   │   └── assets/                 # Static assets
│   │
│   ├── public/
│   ├── .env.development
│   ├── .env.production
│   ├── index.html
│   ├── package.json
│   ├── tailwind.config.js
│   ├── vite.config.ts
│   └── tsconfig.json
│
├── backend/
│   ├── src/
│   │   ├── config/                 # Configuration
│   │   │   ├── database.js
│   │   │   ├── env.js
│   │   │   └── logger.js
│   │   │
│   │   ├── models/                 # Database models
│   │   │   ├── Product.js
│   │   │   ├── Inventory.js
│   │   │   ├── Transaction.js
│   │   │   ├── Customer.js
│   │   │   ├── Supplier.js
│   │   │   └── index.js
│   │   │
│   │   ├── services/               # Business logic
│   │   │   ├── inventory/
│   │   │   │   ├── FIFOService.js
│   │   │   │   ├── StockService.js
│   │   │   │   └── UOMService.js
│   │   │   ├── purchase/
│   │   │   │   ├── PurchaseOrderService.js
│   │   │   │   └── ReceivingService.js
│   │   │   ├── sales/
│   │   │   │   ├── TransactionService.js
│   │   │   │   └── PaymentService.js
│   │   │   └── customer/
│   │   │       └── CustomerService.js
│   │   │
│   │   ├── controllers/            # Route handlers
│   │   │   ├── inventoryController.js
│   │   │   ├── transactionController.js
│   │   │   ├── customerController.js
│   │   │   ├── supplierController.js
│   │   │   └── purchaseController.js
│   │   │
│   │   ├── routes/                 # Express routes
│   │   │   ├── inventory.routes.js
│   │   │   ├── transaction.routes.js
│   │   │   ├── customer.routes.js
│   │   │   ├── supplier.routes.js
│   │   │   ├── purchase.routes.js
│   │   │   └── index.js
│   │   │
│   │   ├── middleware/             # Express middleware
│   │   │   ├── auth.js
│   │   │   ├── validation.js
│   │   │   ├── errorHandler.js
│   │   │   └── logger.js
│   │   │
│   │   ├── validators/             # Input validation
│   │   │   ├── inventory.validator.js
│   │   │   ├── transaction.validator.js
│   │   │   └── schemas/
│   │   │
│   │   ├── utils/                  # Utilities
│   │   │   ├── response.js
│   │   │   ├── errors.js
│   │   │   └── helpers.js
│   │   │
│   │   ├── db/                     # Database
│   │   │   ├── migrations/
│   │   │   ├── seeds/
│   │   │   └── connection.js
│   │   │
│   │   └── app.js                  # Express app
│   │
│   ├── tests/                      # Backend tests
│   ├── .env.development
│   ├── .env.production
│   ├── package.json
│   └── server.js                   # Entry point
│
├── shared/                          # Shared types (optional)
│   └── types/
│
├── .gitignore
├── README.md
├── docker-compose.yml              # For PostgreSQL
└── package.json                     # Root scripts
```

---

## 📝 Implementation Plan

### Phase 1: Project Initialization (2-3 hours)

#### 1.1 Create New Directory Structure
```bash
cd C:\Users\Chase\source\repos\
mkdir samplepos-v2
cd samplepos-v2
```

#### 1.2 Initialize Frontend
```bash
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install

# Install dependencies
npm install @tanstack/react-query axios react-router-dom
npm install lucide-react date-fns zod
npm install -D tailwindcss postcss autoprefixer
npm install -D @types/node

# Initialize Tailwind
npx tailwindcss init -p

# Install shadcn/ui
npx shadcn-ui@latest init
```

#### 1.3 Initialize Backend
```bash
cd ..
mkdir backend
cd backend
npm init -y

# Install dependencies
npm install express pg dotenv cors helmet compression
npm install express-rate-limit morgan winston express-validator
npm install -D nodemon

# Create basic structure
mkdir -p src/{config,models,services,controllers,routes,middleware,validators,utils,db}
```

#### 1.4 Setup Development Tools
```bash
# ESLint + Prettier
npm install -D eslint prettier eslint-config-prettier
npm install -D @typescript-eslint/eslint-plugin @typescript-eslint/parser

# Create config files
touch .eslintrc.json .prettierrc .env.development
```

---

### Phase 2: Database Migration (2-3 hours)

#### 2.1 Export Current Schema
```bash
# From current backend
pg_dump -h localhost -U postgres -d samplepos --schema-only > schema.sql
```

#### 2.2 Create Migration Files
```javascript
// backend/src/db/migrations/001_initial_schema.sql
CREATE TABLE inventory_items (
    id SERIAL PRIMARY KEY,
    sku VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    base_price DECIMAL(10,2) NOT NULL,
    category VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    reorder_level INTEGER DEFAULT 0,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add all other tables...
```

#### 2.3 Setup Database Connection
```javascript
// backend/src/config/database.js
import pg from 'pg';
const { Pool } = pg;

export const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});
```

---

### Phase 3: Backend Core (6-8 hours)

#### 3.1 Create Models Layer
```javascript
// backend/src/models/Product.js
export class Product {
    static async findAll() {
        const result = await pool.query(
            'SELECT * FROM inventory_items WHERE is_active = true'
        );
        return result.rows;
    }

    static async findById(id) {
        const result = await pool.query(
            'SELECT * FROM inventory_items WHERE id = $1',
            [id]
        );
        return result.rows[0];
    }

    // ... more methods
}
```

#### 3.2 Create Services Layer (Business Logic)
```javascript
// backend/src/services/inventory/FIFOService.js
export class FIFOService {
    /**
     * Calculate cost using FIFO method
     * @param {number} productId
     * @param {number} quantity
     * @returns {Promise<{cost: number, batches: Array}>}
     */
    async calculateFIFOCost(productId, quantity) {
        const batches = await pool.query(
            `SELECT * FROM inventory_batches 
             WHERE inventory_item_id = $1 
             AND remaining_quantity > 0 
             ORDER BY received_date ASC`,
            [productId]
        );

        let remainingQty = quantity;
        let totalCost = 0;
        const usedBatches = [];

        for (const batch of batches.rows) {
            if (remainingQty <= 0) break;

            const qtyFromBatch = Math.min(remainingQty, batch.remaining_quantity);
            totalCost += qtyFromBatch * batch.unit_cost;
            
            usedBatches.push({
                batchId: batch.id,
                quantity: qtyFromBatch,
                unitCost: batch.unit_cost
            });

            remainingQty -= qtyFromBatch;
        }

        if (remainingQty > 0) {
            throw new Error('Insufficient stock for FIFO calculation');
        }

        return { cost: totalCost, batches: usedBatches };
    }

    async deductStock(productId, quantity) {
        const { batches } = await this.calculateFIFOCost(productId, quantity);

        for (const batch of batches) {
            await pool.query(
                `UPDATE inventory_batches 
                 SET remaining_quantity = remaining_quantity - $1
                 WHERE id = $2`,
                [batch.quantity, batch.batchId]
            );
        }

        return batches;
    }
}
```

#### 3.3 Create Controllers
```javascript
// backend/src/controllers/inventoryController.js
import { FIFOService } from '../services/inventory/FIFOService.js';
import { Product } from '../models/Product.js';

const fifoService = new FIFOService();

export const getProducts = async (req, res, next) => {
    try {
        const products = await Product.findAll();
        res.json({ success: true, data: products });
    } catch (error) {
        next(error);
    }
};

export const sellProduct = async (req, res, next) => {
    const { productId, quantity } = req.body;

    try {
        const cost = await fifoService.calculateFIFOCost(productId, quantity);
        await fifoService.deductStock(productId, quantity);

        res.json({ 
            success: true, 
            data: { cost: cost.cost, batches: cost.batches }
        });
    } catch (error) {
        next(error);
    }
};
```

#### 3.4 Create Routes
```javascript
// backend/src/routes/inventory.routes.js
import express from 'express';
import * as inventoryController from '../controllers/inventoryController.js';

const router = express.Router();

router.get('/products', inventoryController.getProducts);
router.post('/sell', inventoryController.sellProduct);

export default router;
```

#### 3.5 Create Middleware
```javascript
// backend/src/middleware/errorHandler.js
export const errorHandler = (err, req, res, next) => {
    console.error(err.stack);

    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    res.status(statusCode).json({
        success: false,
        error: {
            message,
            ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
        }
    });
};

// backend/src/middleware/validation.js
import { validationResult } from 'express-validator';

export const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ 
            success: false, 
            errors: errors.array() 
        });
    }
    next();
};
```

#### 3.6 Create Main App
```javascript
// backend/src/app.js
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import inventoryRoutes from './routes/inventory.routes.js';
import transactionRoutes from './routes/transaction.routes.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

// Security & Performance
app.use(helmet());
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging
app.use(morgan('combined'));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000 // limit each IP to 1000 requests per windowMs
});
app.use('/api/', limiter);

// Routes
app.use('/api/inventory', inventoryRoutes);
app.use('/api/transactions', transactionRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling
app.use(errorHandler);

export default app;
```

---

### Phase 4: Frontend Core (6-8 hours)

#### 4.1 Setup React Query
```typescript
// frontend/src/lib/query.ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30000,
            gcTime: 300000,
            retry: 2,
            refetchOnWindowFocus: false,
        },
    },
});
```

#### 4.2 Setup API Client
```typescript
// frontend/src/lib/api.ts
import axios from 'axios';

export const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001/api',
    timeout: 10000,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Response interceptor
api.interceptors.response.use(
    (response) => response.data,
    (error) => {
        // Handle errors globally
        return Promise.reject(error);
    }
);
```

#### 4.3 Create Feature Modules
```typescript
// frontend/src/features/pos/services/posService.ts
import { api } from '@/lib/api';

export const posService = {
    async getProducts() {
        return api.get('/inventory/products');
    },

    async createTransaction(transaction: Transaction) {
        return api.post('/transactions', transaction);
    },

    async calculateFIFOCost(productId: number, quantity: number) {
        return api.post('/inventory/calculate-cost', { productId, quantity });
    },
};

// frontend/src/features/pos/hooks/useProducts.ts
import { useQuery } from '@tanstack/react-query';
import { posService } from '../services/posService';

export const useProducts = () => {
    return useQuery({
        queryKey: ['products'],
        queryFn: posService.getProducts,
    });
};
```

#### 4.4 Create Components
```typescript
// frontend/src/features/pos/components/POSScreen.tsx
import { useProducts } from '../hooks/useProducts';
import { Button } from '@/shared/components/ui/button';

export const POSScreen = () => {
    const { data: products, isLoading } = useProducts();

    if (isLoading) return <div>Loading...</div>;

    return (
        <div className="p-4">
            <h1 className="text-2xl font-bold mb-4">Point of Sale</h1>
            <div className="grid grid-cols-3 gap-4">
                {products?.map((product) => (
                    <Button key={product.id} variant="outline">
                        {product.name} - ${product.base_price}
                    </Button>
                ))}
            </div>
        </div>
    );
};
```

#### 4.5 Setup Routing
```typescript
// frontend/src/app/router.tsx
import { createBrowserRouter } from 'react-router-dom';
import { POSScreen } from '@/features/pos/components/POSScreen';
import { InventoryScreen } from '@/features/inventory/components/InventoryScreen';

export const router = createBrowserRouter([
    {
        path: '/',
        element: <MainLayout />,
        children: [
            { path: 'pos', element: <POSScreen /> },
            { path: 'inventory', element: <InventoryScreen /> },
            // ... more routes
        ],
    },
]);
```

---

### Phase 5: Migration & Testing (4-6 hours)

#### 5.1 Data Migration Script
```javascript
// scripts/migrate-data.js
// Export from old DB, import to new DB
// Verify data integrity
```

#### 5.2 Feature Testing Checklist
- [ ] POS: Add items, calculate totals, process payments
- [ ] Inventory: Add stock, track batches, FIFO calculation
- [ ] Purchases: Create PO, receive stock, update inventory
- [ ] Customers: Create, track balance, payments
- [ ] Reports: Generate sales, purchase, profit reports

---

## 🎯 Success Criteria

1. **Clean Code** - ESLint + Prettier passing
2. **Type Safety** - TypeScript with strict mode
3. **Performance** - <2s page load, <100ms API responses
4. **Maintainability** - Clear folder structure, documented code
5. **Functionality** - All original features working
6. **Tests** - Core business logic covered

---

## 📅 Timeline Estimate

| Phase | Time | Deliverable |
|-------|------|-------------|
| 1. Initialization | 2-3h | Fresh projects setup |
| 2. Database | 2-3h | Schema migrated |
| 3. Backend Core | 6-8h | APIs working |
| 4. Frontend Core | 6-8h | UI functional |
| 5. Testing | 4-6h | All features verified |
| **Total** | **20-28h** | Production-ready app |

---

## 🚀 Next Steps

### Option A: Full Rebuild (Recommended for long-term)
1. Create new `samplepos-v2/` directory
2. Follow phases 1-5 systematically
3. Migrate data when backend ready
4. Test everything thoroughly
5. Deploy and retire old version

### Option B: Incremental Refactor (Faster short-term)
1. Fix current CSS issue
2. Reorganize components into feature folders
3. Extract business logic to services
4. Add TypeScript gradually
5. Improve incrementally

---

## 🤔 Decision Time

**Which approach do you want to take?**

A) **Full Rebuild** - Clean slate, takes 3-4 days intensive work
B) **Incremental Refactor** - Fix and improve current code, takes 1-2 days
C) **Hybrid** - Start new backend, keep current frontend temporarily

Let me know which path you prefer, and I'll guide you through it step by step!
