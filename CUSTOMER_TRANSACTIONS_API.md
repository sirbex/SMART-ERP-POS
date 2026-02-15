# Customer Transaction API - Complete Implementation

**Date**: November 6, 2025  
**Status**: ✅ Complete - Ready for Testing

---

## Overview

Implemented comprehensive customer transaction tracking API endpoints to support:
- Customer sales/invoice history
- Transaction timeline (sales, payments, adjustments)
- Customer summary statistics
- Accounting and balance tracking

All endpoints follow the existing architecture pattern: Controller → Service → Repository with raw SQL.

---

## 🔌 New API Endpoints

### 1. Get Customer Sales/Invoices
**Endpoint**: `GET /api/customers/:id/sales`

**Query Parameters**:
- `page` (number, default: 1)
- `limit` (number, default: 50)

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "saleNumber": "SALE-2025-0001",
      "saleDate": "2025-11-06T10:30:00Z",
      "totalAmount": 50000,
      "paymentMethod": "CASH|MOBILE_MONEY|CREDIT",
      "amountPaid": 50000,
      "changeAmount": 0,
      "status": "COMPLETED",
      "itemCount": 5,
      "cashierName": "John Doe"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 120,
    "totalPages": 3
  }
}
```

**Description**: Returns all sales for a specific customer, ordered by most recent first. Includes sale details, payment info, and item count.

---

### 2. Get Customer Transactions
**Endpoint**: `GET /api/customers/:id/transactions`

**Query Parameters**:
- `page` (number, default: 1)
- `limit` (number, default: 50)

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "transactionDate": "2025-11-06T10:30:00Z",
      "type": "SALE",
      "amount": 50000,
      "description": "Sale #SALE-2025-0001",
      "referenceNumber": "SALE-2025-0001"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 80,
    "totalPages": 2
  }
}
```

**Transaction Types**:
- `SALE`: Credit sales that increase customer balance (debt)
- `PAYMENT`: Payments that reduce customer balance (future)
- `ADJUSTMENT`: Manual balance adjustments (future)

**Description**: Returns chronological transaction history for accounting purposes. Currently shows CREDIT sales only (cash/mobile money sales don't affect customer balance).

---

### 3. Get Customer Summary Statistics
**Endpoint**: `GET /api/customers/:id/summary`

**Response**:
```json
{
  "success": true,
  "data": {
    "totalSales": 45,
    "totalSpent": 2500000,
    "totalInvoices": 45,
    "outstandingBalance": 150000,
    "creditUsed": 150000,
    "creditAvailable": 350000,
    "lastPurchaseDate": "2025-11-05T14:22:00Z"
  }
}
```

**Fields**:
- `totalSales`: Total number of sales/invoices
- `totalSpent`: Lifetime spending (UGX)
- `totalInvoices`: Same as totalSales (for clarity)
- `outstandingBalance`: Current amount owed (absolute value if negative balance)
- `creditUsed`: Current credit utilized
- `creditAvailable`: Remaining credit limit (creditLimit - creditUsed)
- `lastPurchaseDate`: Date of most recent purchase (optional)

**Calculation Logic**:
```typescript
creditUsed = customer.balance < 0 ? Math.abs(customer.balance) : 0
creditAvailable = customer.creditLimit - creditUsed
outstandingBalance = customer.balance < 0 ? Math.abs(customer.balance) : 0
```

---

## 🏗️ Backend Implementation

### Repository Layer (`customerRepository.ts`)

**Added Interfaces**:
```typescript
interface CustomerSale {
  id: string;
  saleNumber: string;
  saleDate: Date;
  totalAmount: number;
  paymentMethod: string;
  amountPaid: number;
  changeAmount: number;
  status: string;
  itemCount: number;
  cashierName?: string;
}

interface CustomerTransaction {
  id: string;
  transactionDate: Date;
  type: 'SALE' | 'PAYMENT' | 'ADJUSTMENT';
  amount: number;
  balance: number;
  description: string;
  referenceNumber?: string;
}

interface CustomerSummary {
  totalSales: number;
  totalSpent: number;
  totalInvoices: number;
  outstandingBalance: number;
  creditUsed: number;
  creditAvailable: number;
  lastPurchaseDate?: Date;
}
```

**Added Functions**:
1. `findCustomerSales(customerId, limit, offset)` - Get paginated sales list
2. `countCustomerSales(customerId)` - Count total sales for pagination
3. `findCustomerTransactions(customerId, limit, offset)` - Get transaction history
4. `getCustomerSummary(customerId)` - Calculate summary statistics

**SQL Queries**:

**Sales Query** (with JOIN to users for cashier name):
```sql
SELECT 
  s.id,
  s.sale_number as "saleNumber",
  s.sale_date as "saleDate",
  s.total_amount as "totalAmount",
  s.payment_method as "paymentMethod",
  s.amount_paid as "amountPaid",
  s.change_amount as "changeAmount",
  s.status,
  COUNT(si.id) as "itemCount",
  u.name as "cashierName"
FROM sales s
LEFT JOIN sale_items si ON s.id = si.sale_id
LEFT JOIN users u ON s.cashier_id = u.id
WHERE s.customer_id = $1
GROUP BY s.id, u.name
ORDER BY s.sale_date DESC, s.created_at DESC
LIMIT $2 OFFSET $3
```

**Transaction Query** (credit sales only):
```sql
SELECT 
  s.id,
  s.sale_date as "transactionDate",
  'SALE' as type,
  s.total_amount as amount,
  s.sale_number as "referenceNumber",
  CONCAT('Sale #', s.sale_number) as description
FROM sales s
WHERE s.customer_id = $1
  AND s.payment_method = 'CREDIT'
ORDER BY s.sale_date DESC, s.created_at DESC
LIMIT $2 OFFSET $3
```

**Summary Query**:
```sql
SELECT 
  COUNT(*) as "totalInvoices",
  COALESCE(SUM(total_amount), 0) as "totalSpent",
  MAX(sale_date) as "lastPurchaseDate"
FROM sales 
WHERE customer_id = $1
```

---

### Service Layer (`customerService.ts`)

**Added Functions**:

1. **`getCustomerSales(customerId, page, limit)`**
   - Validates customer exists
   - Fetches paginated sales with count
   - Returns data + pagination metadata

2. **`getCustomerTransactions(customerId, page, limit)`**
   - Validates customer exists
   - Fetches transaction history
   - Returns data + pagination metadata

3. **`getCustomerSummary(customerId)`**
   - Validates customer exists
   - Calculates all summary statistics
   - Returns summary object

**Error Handling**:
- Throws error if customer not found
- All errors caught by Express error middleware

---

### Controller Layer (`customerController.ts`)

**Added Controllers**:

1. **`getCustomerSales(req, res, next)`**
   - Extracts customerId from URL params
   - Parses page/limit from query params
   - Calls service, returns JSON response

2. **`getCustomerTransactions(req, res, next)`**
   - Extracts customerId from URL params
   - Parses page/limit from query params
   - Calls service, returns JSON response

3. **`getCustomerSummary(req, res, next)`**
   - Extracts customerId from URL params
   - Calls service, returns JSON response

**Response Format** (standard):
```json
{
  "success": true,
  "data": { ... },
  "pagination": { ... } // if applicable
}
```

---

### Routes (`customerRoutes.ts`)

**Added Routes** (all require authentication):
```typescript
router.get('/:id/sales', authenticate, customerController.getCustomerSales);
router.get('/:id/transactions', authenticate, customerController.getCustomerTransactions);
router.get('/:id/summary', authenticate, customerController.getCustomerSummary);
```

**Route Order** (important - specific before general):
```
GET /api/customers/:id/sales       ← New
GET /api/customers/:id/transactions ← New
GET /api/customers/:id/summary      ← New
GET /api/customers/:id              ← Existing
```

**Authentication**:
- All endpoints require authentication (`authenticate` middleware)
- No special role required (ADMIN, MANAGER, CASHIER, STAFF all have access)
- Read-only operations

---

## 🎨 Frontend Implementation

### API Client (`utils/api.ts`)

**Added Methods**:
```typescript
customers: {
  // ... existing methods
  getSales: (id: string, params?: { page?: number; limit?: number }) =>
    apiClient.get<ApiResponse>(`customers/${id}/sales`, { params }),
  getTransactions: (id: string, params?: { page?: number; limit?: number }) =>
    apiClient.get<ApiResponse>(`customers/${id}/transactions`, { params }),
  getSummary: (id: string) =>
    apiClient.get<ApiResponse>(`customers/${id}/summary`),
}
```

---

### React Query Hooks (`hooks/useApi.ts`)

**Added Hooks**:

1. **`useCustomerSales(customerId, page, limit)`**
   ```typescript
   const { data, isLoading, error } = useCustomerSales(customerId, 1, 50);
   ```
   - Returns paginated sales list
   - Stale time: 10 seconds
   - Enabled only when customerId exists

2. **`useCustomerTransactions(customerId, page, limit)`**
   ```typescript
   const { data, isLoading, error } = useCustomerTransactions(customerId, 1, 50);
   ```
   - Returns transaction history
   - Stale time: 10 seconds
   - Enabled only when customerId exists

3. **`useCustomerSummary(customerId)`**
   ```typescript
   const { data, isLoading, error } = useCustomerSummary(customerId);
   ```
   - Returns summary statistics
   - Stale time: 30 seconds
   - Enabled only when customerId exists

**Usage Example**:
```typescript
function CustomerDetailPage({ customerId }: { customerId: string }) {
  const { data: summary } = useCustomerSummary(customerId);
  const { data: salesData } = useCustomerSales(customerId, 1, 20);
  const { data: transactions } = useCustomerTransactions(customerId);

  const summaryStats = summary?.data?.data;
  const sales = salesData?.data?.data || [];
  const txns = transactions?.data?.data || [];

  return (
    <div>
      <h2>{summaryStats?.totalSpent} Total Spent</h2>
      <ul>
        {sales.map(sale => (
          <li key={sale.id}>{sale.saleNumber}: {sale.totalAmount}</li>
        ))}
      </ul>
    </div>
  );
}
```

---

## 📊 Data Flow

### Getting Customer Sales
```
Frontend Component
  ↓ useCustomerSales(customerId, page, limit)
React Query
  ↓ api.customers.getSales(customerId, { page, limit })
Axios Client
  ↓ GET /api/customers/:id/sales?page=1&limit=50
Backend Route (authenticate middleware)
  ↓ customerController.getCustomerSales
Controller (extract params)
  ↓ customerService.getCustomerSales(id, page, limit)
Service (validate customer exists)
  ↓ customerRepository.findCustomerSales(id, limit, offset)
  ↓ customerRepository.countCustomerSales(id)
Repository (SQL queries)
  ↓ JOIN sales + sale_items + users
PostgreSQL Database
  ↓ Result rows
Repository (parse itemCount)
  ↓ Return CustomerSale[]
Service (combine data + pagination)
  ↓ Return { data, pagination }
Controller (wrap in success response)
  ↓ { success: true, data: [...], pagination: {...} }
Frontend (React Query cache)
  ↓ Component re-renders with data
```

---

## 🔐 Business Logic

### Credit Sales vs Cash Sales

**Credit Sales** (payment_method = 'CREDIT'):
- Increase customer balance (customer owes money)
- Appear in transaction history
- Tracked against credit limit
- Balance calculation: `balance = balance + sale_amount`

**Cash/Mobile Money Sales**:
- Do NOT affect customer balance
- Still appear in sales history (for reporting)
- NOT shown in transaction history (no debt impact)

### Balance Tracking

**Customer Balance** (`customers.balance`):
- **Negative balance** = Customer owes money (debt)
- **Zero balance** = No outstanding debt
- **Positive balance** = Customer has credit (overpayment/prepayment)

**Credit Calculations**:
```typescript
creditUsed = balance < 0 ? Math.abs(balance) : 0
creditAvailable = creditLimit - creditUsed
outstandingBalance = balance < 0 ? Math.abs(balance) : 0
```

**Example**:
- Credit Limit: 500,000 UGX
- Current Balance: -150,000 UGX (owes 150k)
- Credit Used: 150,000 UGX
- Credit Available: 350,000 UGX
- Outstanding Balance: 150,000 UGX

---

## 🧪 Testing

### Manual Testing Checklist

**1. Get Customer Sales**
- [ ] GET `/api/customers/{valid-id}/sales` returns sales list
- [ ] Sales ordered by date DESC (most recent first)
- [ ] Pagination works (`?page=2&limit=10`)
- [ ] itemCount is correct (matches sale_items count)
- [ ] cashierName appears (from users table JOIN)
- [ ] Returns 404 for invalid customer ID
- [ ] Empty array if customer has no sales

**2. Get Customer Transactions**
- [ ] GET `/api/customers/{valid-id}/transactions` returns transactions
- [ ] Only CREDIT sales appear (no CASH/MOBILE_MONEY)
- [ ] Transactions ordered by date DESC
- [ ] Type is always 'SALE' (for now)
- [ ] referenceNumber matches sale_number
- [ ] Returns empty array if no credit sales

**3. Get Customer Summary**
- [ ] GET `/api/customers/{valid-id}/summary` returns statistics
- [ ] totalSales counts all sales (CASH + CREDIT)
- [ ] totalSpent sums all sale amounts
- [ ] outstandingBalance correct for negative balance
- [ ] creditUsed matches outstanding balance
- [ ] creditAvailable = creditLimit - creditUsed
- [ ] lastPurchaseDate is most recent sale date
- [ ] Works for customer with zero sales

**4. Frontend Hooks**
- [ ] `useCustomerSales` fetches and caches sales
- [ ] `useCustomerTransactions` fetches and caches transactions
- [ ] `useCustomerSummary` fetches and caches summary
- [ ] Loading states work correctly
- [ ] Error states handled
- [ ] Data structure matches API response

**5. Integration Tests**
- [ ] Create customer → make CREDIT sale → check balance updated
- [ ] Create customer → make CASH sale → balance unchanged
- [ ] Sales appear in /sales endpoint immediately
- [ ] Transactions appear for CREDIT sales only
- [ ] Summary updates after new sale

---

## 📝 Database Schema (Relevant Tables)

### `sales` Table
```sql
id UUID PRIMARY KEY
sale_number VARCHAR(50) UNIQUE
customer_id UUID REFERENCES customers(id)
sale_date TIMESTAMP
total_amount NUMERIC(12,2)
payment_method VARCHAR(20) -- CASH, MOBILE_MONEY, CREDIT
amount_paid NUMERIC(12,2)
change_amount NUMERIC(12,2)
status VARCHAR(20)
cashier_id UUID REFERENCES users(id)
created_at TIMESTAMP
updated_at TIMESTAMP
```

### `sale_items` Table
```sql
id UUID PRIMARY KEY
sale_id UUID REFERENCES sales(id)
product_id UUID REFERENCES products(id)
product_name VARCHAR(255)
quantity NUMERIC(10,2)
unit_price NUMERIC(12,2)
line_total NUMERIC(12,2)
cost_price NUMERIC(12,2)
profit NUMERIC(12,2)
```

### `customers` Table
```sql
id UUID PRIMARY KEY
name VARCHAR(255)
email VARCHAR(255) UNIQUE
phone VARCHAR(50)
address TEXT
customer_group_id UUID REFERENCES customer_groups(id)
balance NUMERIC(12,2) DEFAULT 0  ← Negative = debt
credit_limit NUMERIC(12,2) DEFAULT 0
is_active BOOLEAN DEFAULT true
created_at TIMESTAMP
updated_at TIMESTAMP
```

---

## 🚀 Next Steps

### Phase 1: Customer Detail View (Frontend)
- [ ] Create `CustomerDetailPage.tsx` component
- [ ] Add route `/customers/:id`
- [ ] Display customer info header
- [ ] Add tabs: Overview, Invoices, Payments, Activity
- [ ] Use `useCustomerSummary` for header stats
- [ ] Use `useCustomerSales` for invoices tab
- [ ] Use `useCustomerTransactions` for activity tab

### Phase 2: Payments Tracking
- [ ] Create `payments` database table
- [ ] Add payment recording API endpoints
- [ ] Update `findCustomerTransactions` to include payments
- [ ] Add payment recording UI
- [ ] Link payments to reduce customer balance

### Phase 3: Enhanced Features
- [ ] Manual balance adjustments (with reason/notes)
- [ ] Customer statements (PDF generation)
- [ ] Date range filters for sales/transactions
- [ ] Export sales to CSV/Excel
- [ ] Payment reminders for overdue balances
- [ ] Customer activity log (audit trail)

---

## ✅ Files Modified

### Backend
1. **`customerRepository.ts`** (+130 lines)
   - Added CustomerSale, CustomerTransaction, CustomerSummary interfaces
   - Added findCustomerSales, countCustomerSales functions
   - Added findCustomerTransactions function
   - Added getCustomerSummary function

2. **`customerService.ts`** (+70 lines)
   - Added getCustomerSales service
   - Added getCustomerTransactions service
   - Added getCustomerSummary service

3. **`customerController.ts`** (+65 lines)
   - Added getCustomerSales controller
   - Added getCustomerTransactions controller
   - Added getCustomerSummary controller

4. **`customerRoutes.ts`** (+3 lines)
   - Added GET /:id/sales route
   - Added GET /:id/transactions route
   - Added GET /:id/summary route

### Frontend
5. **`api.ts`** (+6 lines)
   - Added customers.getSales method
   - Added customers.getTransactions method
   - Added customers.getSummary method

6. **`useApi.ts`** (+22 lines)
   - Added useCustomerSales hook
   - Added useCustomerTransactions hook
   - Added useCustomerSummary hook

---

## 🎯 Success Criteria

- [x] All endpoints compile without TypeScript errors
- [x] Backend follows Controller → Service → Repository pattern
- [x] All SQL queries are parameterized (no SQL injection risk)
- [x] Pagination implemented for list endpoints
- [x] Standard API response format used
- [x] Authentication middleware applied to all routes
- [x] Frontend hooks use React Query best practices
- [x] Stale time configured appropriately
- [x] Query keys include all relevant parameters
- [ ] Manual testing completed
- [ ] Customer detail view implemented (next phase)

---

## 📚 API Documentation Summary

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/customers` | GET | ✓ | List all customers |
| `/api/customers/:id` | GET | ✓ | Get customer details |
| `/api/customers` | POST | ✓ (Admin/Manager) | Create customer |
| `/api/customers/:id` | PUT | ✓ (Admin/Manager) | Update customer |
| `/api/customers/:id` | DELETE | ✓ (Admin/Manager) | Delete customer |
| `/api/customers/:id/sales` | GET | ✓ | **NEW** - Get customer sales history |
| `/api/customers/:id/transactions` | GET | ✓ | **NEW** - Get transaction timeline |
| `/api/customers/:id/summary` | GET | ✓ | **NEW** - Get summary statistics |

**Total Endpoints**: 8 (3 new, 5 existing)

---

**Implementation Complete** ✅  
Ready for integration with Customer Detail View UI.
