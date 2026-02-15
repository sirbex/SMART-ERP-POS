# SamplePOS API Testing Guide

## ✅ Database Initialization

The database has been successfully initialized with:
- ✅ PostgreSQL database `pos_system` created
- ✅ Complete schema with all tables, indexes, and triggers applied
- ✅ Default admin user created
- ✅ Default customer groups seeded

**Default Admin Credentials:**
```
Email: admin@samplepos.com
Password: admin123
⚠️ Change this in production!
```

---

## 🗂️ Modules Implemented

### 1. **Authentication** (`/api/auth`)
JWT-based authentication with login, register, and profile endpoints.

### 2. **Products** (`/api/products`)
Full CRUD with pagination, cost tracking, and pricing formulas.

### 3. **Customers** (`/api/customers`)
Customer management with group support, credit limits, and balance tracking.

### 4. **Suppliers** (`/api/suppliers`)
Supplier management with contact details and payment terms.

### 5. **Sales** (`/api/sales`)
Sales transactions with FIFO cost calculation, payment processing, and profit tracking.

### 6. **Inventory** (`/api/inventory`)
FEFO batch tracking, expiry warnings, stock levels, and inventory adjustments.

### 7. **Purchase Orders** (`/api/purchase-orders`)
PO creation with DRAFT→PENDING→COMPLETED workflow and supplier management.

### 8. **Goods Receipts** (`/api/goods-receipts`)
Receiving workflow with batch creation, cost layer generation, and PO completion.

### 9. **Stock Movements** (`/api/stock-movements`)
Complete audit trail for all inventory movements with full transaction history.

---

## 📡 API Endpoints

### Health Check
```bash
GET http://localhost:3001/health
```

**Response:**
```json
{
  "success": true,
  "status": "healthy",
  "timestamp": "2025-10-31T..."
}
```

---

### Authentication

#### Register New User
```bash
POST http://localhost:3001/api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123",
  "fullName": "John Doe",
  "role": "CASHIER"
}
```

**Roles:** `ADMIN`, `MANAGER`, `CASHIER`, `STAFF`

#### Login
```bash
POST http://localhost:3001/api/auth/login
Content-Type: application/json

{
  "email": "admin@samplepos.com",
  "password": "admin123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "...",
      "email": "admin@samplepos.com",
      "fullName": "System Administrator",
      "role": "ADMIN"
    },
    "token": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

#### Get Profile (Protected)
```bash
GET http://localhost:3001/api/auth/profile
Authorization: Bearer {your_token}
```

---

### Products

#### List Products
```bash
GET http://localhost:3001/api/products?page=1&limit=50
```

#### Get Single Product
```bash
GET http://localhost:3001/api/products/{id}
```

#### Create Product
```bash
POST http://localhost:3001/api/products
Content-Type: application/json

{
  "sku": "PROD-001",
  "name": "Sample Product",
  "description": "Product description",
  "category": "Electronics",
  "costPrice": 10.50,
  "sellingPrice": 15.99,
  "reorderLevel": 10,
  "costingMethod": "FIFO"
}
```

#### Update Product
```bash
PUT http://localhost:3001/api/products/{id}
Content-Type: application/json

{
  "sellingPrice": 17.99,
  "reorderLevel": 15
}
```

#### Delete Product (Soft Delete)
```bash
DELETE http://localhost:3001/api/products/{id}
```

---

### Customers

#### List Customers
```bash
GET http://localhost:3001/api/customers?page=1&limit=50
```

#### Get Single Customer
```bash
GET http://localhost:3001/api/customers/{id}
```

#### Create Customer
```bash
POST http://localhost:3001/api/customers
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+1234567890",
  "address": "123 Main St",
  "customerGroupId": "{group_id}",
  "creditLimit": 1000.00
}
```

#### Update Customer
```bash
PUT http://localhost:3001/api/customers/{id}
Content-Type: application/json

{
  "phone": "+0987654321",
  "creditLimit": 2000.00
}
```

#### Delete Customer
```bash
DELETE http://localhost:3001/api/customers/{id}
```

---

### Suppliers

#### List Suppliers
```bash
GET http://localhost:3001/api/suppliers?page=1&limit=50
```

#### Get Single Supplier
```bash
GET http://localhost:3001/api/suppliers/{id}
```

#### Create Supplier
```bash
POST http://localhost:3001/api/suppliers
Content-Type: application/json

{
  "name": "ABC Suppliers Inc.",
  "contactPerson": "Jane Smith",
  "email": "jane@abcsuppliers.com",
  "phone": "+1234567890",
  "address": "456 Supply St",
  "paymentTerms": "NET30"
}
```

---

## 🚀 Starting the Server

### Option 1: Using the launcher script
```powershell
.\start-dev.ps1
```

### Option 2: Manual start
```powershell
cd SamplePOS.Server
npm run dev
```

The server will start on **http://localhost:3001**

---

## 🧪 Testing with PowerShell

```powershell
# Health check
Invoke-RestMethod -Uri "http://localhost:3001/health"

# Login
$loginBody = @{
    email = "admin@samplepos.com"
    password = "admin123"
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri "http://localhost:3001/api/auth/login" `
    -Method POST `
    -Body $loginBody `
    -ContentType "application/json"

$token = $response.data.token
Write-Host "Token: $token"

# Get profile (with auth)
$headers = @{
    "Authorization" = "Bearer $token"
}

Invoke-RestMethod -Uri "http://localhost:3001/api/auth/profile" `
    -Headers $headers

# Create a product
$productBody = @{
    sku = "TEST-001"
    name = "Test Product"
    costPrice = 10.00
    sellingPrice = 15.00
    reorderLevel = 5
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3001/api/products" `
    -Method POST `
    -Body $productBody `
    -ContentType "application/json"
```

---

## 🏗️ Architecture Summary

All modules follow the strict 3-layer pattern:

```
HTTP Request → Controller (Zod validation) → Service (business logic) → Repository (SQL only) → Database
```

### Key Features Implemented:
- ✅ **No ORM** - Pure parameterized SQL with pg
- ✅ **Zod Validation** - Shared schemas between frontend/backend
- ✅ **JWT Authentication** - Secure token-based auth
- ✅ **Decimal Precision** - Ready for Decimal.js integration
- ✅ **Soft Deletes** - Records marked inactive, not removed
- ✅ **Pagination** - All list endpoints support page/limit
- ✅ **Error Handling** - Consistent error response format

---

## 📊 Database Structure

**Tables Created:**
- `users` - System users with roles
- `customers` - Customer records with groups
- `customer_groups` - Customer segmentation
- `suppliers` - Supplier management
- `products` - Product catalog with costing
- `inventory_batches` - FEFO batch tracking
- `cost_layers` - FIFO/AVCO valuation
- `pricing_tiers` - Flexible pricing rules
- `purchase_orders` - PO management
- `purchase_order_items` - PO line items
- `goods_receipts` - Receiving workflow
- `goods_receipt_items` - GR line items
- `stock_movements` - Inventory audit trail
- `sales` - Sales transactions
- `sale_items` - Sale line items

---

## 🔧 Troubleshooting

### Server won't start
```powershell
# Check if database is running
psql -U postgres -d pos_system -c "SELECT version();"

# Re-initialize database if needed
.\init-db.ps1

# Reinstall dependencies
cd SamplePOS.Server
Remove-Item -Recurse -Force node_modules
npm install
```

### Port already in use
```powershell
# Find and kill process on port 3001
Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue | 
    Select-Object -ExpandProperty OwningProcess | 
    ForEach-Object { Stop-Process -Id $_ -Force }
```

---

## 📖 Next Steps

1. **Frontend Development**: Build React components that call these APIs
2. **Add More Modules**: Sales, Inventory Batches, Purchase Orders, Stock Movements
3. **Implement Middleware**: Rate limiting, request logging, authentication guards
4. **Add Tests**: Unit tests for services, integration tests for API endpoints
5. **Deploy**: Configure for production with proper secrets management

---

## 🎯 Summary

✅ **Database**: Fully initialized with complete schema  
✅ **Backend**: 4 modules implemented (Products, Customers, Suppliers, Auth)  
✅ **Architecture**: Strict 3-layer pattern enforced  
✅ **Authentication**: JWT-based with roles  
✅ **Validation**: Zod schemas shared between layers  
✅ **Documentation**: Complete API reference  

**Ready for frontend integration and further development!** 🚀
