# API-Database-Frontend Communication Guide

**Date**: February 2026  
**System**: SMART-ERP-POS - Complete Stack Integration

## Overview

This guide ensures seamless communication between the PostgreSQL database, Node.js/Express backend API, and React frontend.

## Architecture Flow

```
PostgreSQL Database (Port 5432)
         ↕
Node.js Backend API (Port 3001)
         ↕
React Frontend (Port 5173)
```

---

## Part 1: Database Setup

### 1.1 Verify PostgreSQL is Running

```powershell
# Check if PostgreSQL service is running
Get-Service -Name postgresql*

# If not running, start it
Start-Service postgresql-x64-14  # Adjust version as needed
```

### 1.2 Initialize Database

```powershell
# Run database initialization script
cd C:\Users\Chase\source\repos\SamplePOS
.\init-db.ps1
```

**What it does:**
- Creates `pos_system` database
- Runs all schema migrations
- Creates tables with proper indexes
- Sets up initial data if needed

### 1.3 Verify Database Connection

```sql
-- Connect to database
psql -U postgres -d pos_system

-- Check tables exist
\dt

-- Expected tables:
-- users, products, customers, suppliers, sales, sale_items
-- purchase_orders, po_items, goods_receipts, gr_items
-- inventory_batches, stock_movements, cost_layers, pricing_tiers
```

---

## Part 2: Backend API Setup

### 2.1 Install Dependencies

```powershell
cd SamplePOS.Server
npm install
```

**Key dependencies:**
- `express` - Web framework
- `pg` - PostgreSQL client
- `decimal.js` - Bank-grade precision
- `zod` - Schema validation
- `bcrypt` - Password hashing
- `jsonwebtoken` - Authentication
- `cors` - Cross-origin requests

### 2.2 Configure Environment

```powershell
# Check .env file exists
cat .env
```

**Required variables:**
```properties
DATABASE_URL="postgresql://postgres:password@localhost:5432/pos_system"
JWT_SECRET="your-super-secret-jwt-key"
PORT=3001
FRONTEND_URL=http://localhost:5173
```

### 2.3 Start Backend Server

```powershell
# Development mode with auto-reload
npm run dev

# OR Production mode
npm start
```

**Expected output:**
```
✅ SMART-ERP-POS backend API Started
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚀 Server running on port 3001
📍 API endpoint: http://localhost:3001
📍 Health check: http://localhost:3001/health
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 2.4 Test API Endpoints

```powershell
# Run comprehensive API tests
.\test-api-communication.ps1
```

**What it tests:**
- ✅ Database connectivity
- ✅ Health check endpoint
- ✅ User authentication (register/login)
- ✅ Products CRUD operations
- ✅ Customers CRUD operations
- ✅ Suppliers CRUD operations
- ✅ Inventory queries
- ✅ Stock movements

---

## Part 3: Frontend Setup

### 3.1 Install Dependencies

```powershell
cd ..\samplepos.client
npm install
```

**Key dependencies:**
- `react` - UI framework
- `react-query` (@tanstack/react-query) - Data fetching
- `axios` - HTTP client
- `zustand` - State management
- `tailwindcss` - Styling
- `@radix-ui/*` - UI components

### 3.2 Configure Environment

```powershell
# Check .env file
cat .env
```

**Required variables:**
```properties
VITE_API_URL=http://localhost:3001
VITE_APP_NAME=SamplePOS
```

### 3.3 Start Frontend Development Server

```powershell
npm run dev
```

**Expected output:**
```
VITE v5.x.x ready in 500 ms

➜  Local:   http://localhost:5173/
➜  Network: use --host to expose
```

---

## Part 4: API Client Integration

### 4.1 API Client (`src/utils/api.ts`)

**Features:**
- ✅ Centralized axios instance
- ✅ Request interceptor (adds auth token)
- ✅ Response interceptor (handles errors)
- ✅ Automatic token management
- ✅ 401/403 error handling
- ✅ Development logging

**Usage:**
```typescript
import { api } from '@/utils/api';

// Login
const response = await api.auth.login({ email, password });
localStorage.setItem('auth_token', response.data.data.token);

// Get products
const products = await api.products.list({ page: 1, limit: 50 });
```

### 4.2 React Query Hooks (`src/hooks/useApi.ts`)

**Features:**
- ✅ Automatic caching
- ✅ Background refetching
- ✅ Optimistic updates
- ✅ Query invalidation
- ✅ Loading/error states

**Usage:**
```typescript
import { useProducts, useCreateProduct } from '@/hooks/useApi';

function ProductList() {
  const { data, isLoading, error } = useProducts(1, 50);
  const createProduct = useCreateProduct();
  
  if (isLoading) return <Spinner />;
  if (error) return <Error message={error.message} />;
  
  return (
    <div>
      {data?.map(product => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
```

---

## Part 5: Testing Communication

### 5.1 Backend Health Check

```powershell
# PowerShell
Invoke-RestMethod -Uri "http://localhost:3001/health"
```

**Expected response:**
```json
{
  "success": true,
  "status": "healthy",
  "timestamp": "2025-10-31T..."
}
```

### 5.2 Authentication Flow

```powershell
# Register user
$body = @{
  name = "Test User"
  email = "test@example.com"
  password = "Test123456"
  role = "ADMIN"
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri "http://localhost:3001/api/auth/register" `
  -Method POST -Body $body -ContentType "application/json"

# Save token
$token = $response.data.token

# Use token for authenticated requests
$headers = @{ Authorization = "Bearer $token" }

# Get profile
Invoke-RestMethod -Uri "http://localhost:3001/api/auth/profile" `
  -Headers $headers
```

### 5.3 CRUD Operations Test

```powershell
# Create product
$product = @{
  sku = "TEST-001"
  name = "Test Product"
  costPrice = 100.00
  sellingPrice = 150.00
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3001/api/products" `
  -Method POST -Headers $headers -Body $product -ContentType "application/json"

# List products
Invoke-RestMethod -Uri "http://localhost:3001/api/products?page=1&limit=10" `
  -Headers $headers
```

### 5.4 Business Rules Validation Test

```powershell
# Test cost price change alert
# 1. Create product with cost 100
# 2. Create supplier
# 3. Create PO with unit cost 100
# 4. Create goods receipt with unit cost 120 (20% increase)
# 5. Finalize GR - should return HIGH severity alert

# Expected response:
{
  "success": true,
  "data": {...},
  "alerts": [
    {
      "type": "COST_PRICE_CHANGE",
      "severity": "HIGH",
      "message": "Cost price changed from 100.00 to 120.00 (+20.00%)"
    }
  ]
}
```

---

## Part 6: Common Issues & Solutions

### 6.1 Database Connection Failed

**Symptoms:**
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Solutions:**
1. Check PostgreSQL service is running
2. Verify DATABASE_URL in .env
3. Check firewall isn't blocking port 5432
4. Verify database exists: `psql -U postgres -l`

### 6.2 CORS Errors

**Symptoms:**
```
Access to XMLHttpRequest blocked by CORS policy
```

**Solutions:**
1. Verify FRONTEND_URL in backend .env matches frontend URL
2. Check backend is running on expected port
3. Restart backend server after .env changes

### 6.3 Authentication Failures

**Symptoms:**
```
401 Unauthorized
```

**Solutions:**
1. Check token is saved in localStorage: `localStorage.getItem('auth_token')`
2. Verify token format: `Bearer <token>`
3. Check JWT_SECRET is same across sessions
4. Token may be expired (7 days default)

### 6.4 Business Rule Violations

**Symptoms:**
```
400 Bad Request
{
  "success": false,
  "error": "Insufficient stock",
  "code": "INSUFFICIENT_STOCK",
  "rule": "BR-INV-001"
}
```

**Solutions:**
- These are intentional business logic validations
- Check the `rule` and `code` for specific violation
- Review business rules documentation
- Ensure data meets requirements (positive quantities, valid dates, etc.)

---

## Part 7: Performance Monitoring

### 7.1 API Response Times

**Target metrics:**
- Health check: < 50ms
- List queries: < 200ms
- Create/Update: < 500ms
- Complex operations (sales, GR): < 1000ms

**Monitoring:**
```typescript
// Frontend - axios interceptor logs response times
// Check browser console in development mode
```

### 7.2 Database Query Performance

```sql
-- Enable query timing
\timing

-- Check slow queries
SELECT * FROM products LIMIT 100;
-- Time: 15.234 ms (good)

-- Check indexes
SELECT tablename, indexname FROM pg_indexes 
WHERE schemaname = 'public';
```

### 7.3 React Query Cache

```typescript
// Check cache status
import { useQueryClient } from '@tanstack/react-query';

const queryClient = useQueryClient();
const cachedData = queryClient.getQueryData(['products', 'list', 1, 50]);
```

---

## Part 8: Production Checklist

### Before Deployment:

**Database:**
- [ ] Run database migrations
- [ ] Create database backups
- [ ] Configure connection pooling
- [ ] Set up read replicas (if needed)

**Backend:**
- [ ] Set NODE_ENV=production
- [ ] Use strong JWT_SECRET (64+ characters)
- [ ] Enable rate limiting
- [ ] Configure logging (Winston/Bunyan)
- [ ] Set up error monitoring (Sentry)
- [ ] Enable HTTPS
- [ ] Configure CORS properly
- [ ] Remove development console.logs

**Frontend:**
- [ ] Build production bundle: `npm run build`
- [ ] Update VITE_API_URL to production API
- [ ] Implement API error retry logic
- [ ] Configure CDN for static assets
- [ ] Enable gzip compression
- [ ] Set up analytics

**Security:**
- [ ] SQL injection prevention (parameterized queries ✅)
- [ ] XSS prevention (React escape by default ✅)
- [ ] CSRF protection
- [ ] Rate limiting on auth endpoints
- [ ] Input validation (Zod ✅)
- [ ] Secure password hashing (bcrypt ✅)

---

## Part 9: Development Workflow

### Daily Development Cycle:

```powershell
# Terminal 1 - Backend
cd SamplePOS.Server
npm run dev

# Terminal 2 - Frontend  
cd samplepos.client
npm run dev

# Terminal 3 - Database (if needed)
psql -U postgres -d pos_system
```

### Making API Changes:

1. **Update Repository** (raw SQL)
2. **Update Service** (business logic + validation)
3. **Update Controller** (HTTP handling)
4. **Update Routes** (if adding new endpoint)
5. **Update Frontend API client** (`src/utils/api.ts`)
6. **Update React Query hooks** (`src/hooks/useApi.ts`)
7. **Test with `test-api-communication.ps1`**

---

## Part 10: Quick Start (From Scratch)

```powershell
# 1. Start PostgreSQL
Start-Service postgresql-x64-14

# 2. Initialize database
cd C:\Users\Chase\source\repos\SamplePOS
.\init-db.ps1

# 3. Start backend
cd SamplePOS.Server
npm install
npm run dev

# 4. Test API (in new terminal)
cd ..
.\test-api-communication.ps1

# 5. Start frontend (in new terminal)
cd samplepos.client
npm install  
npm run dev

# 6. Open browser
# Navigate to: http://localhost:5173
```

**Expected result:**
- Database: Connected ✅
- Backend API: Running on port 3001 ✅
- Frontend: Running on port 5173 ✅
- Authentication: Working ✅
- All CRUD operations: Working ✅

---

## Support Resources

**Documentation:**
- `COMPLETE_BUSINESS_RULES_INTEGRATION.md` - Business logic
- `COST_PRICE_CHANGE_ALERTS.md` - GR cost alerts
- `ARCHITECTURE.md` - System architecture
- `COPILOT_INSTRUCTIONS.md` - Development guidelines

**Test Scripts:**
- `test-api-communication.ps1` - Full API test suite
- `SamplePOS.Server/test-api.ps1` - Legacy API tests

**Logs:**
- Backend: `SamplePOS.Server/logs/`
- Frontend: Browser console (F12)
- Database: PostgreSQL logs directory

---

**Status**: ✅ Complete Stack Integration Ready  
**Last Updated**: February 2026  
**All systems operational and tested!** 🎉
