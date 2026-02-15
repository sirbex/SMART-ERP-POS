# Timezone Strategy - SMART-ERP-POS system

**Last Updated**: February 2026  
**Status**: ✅ IMPLEMENTED - PERMANENT SOLUTION

---

## 🎯 STRATEGY: UTC Everywhere + Frontend Conversion

### Core Principle
> **All timestamps stored in UTC. Timezone conversion happens ONLY on the frontend for display.**

---

## 📋 Implementation Details

### 1. Database Layer

#### Column Types
```sql
-- Transaction dates (business logic - no time component)
sale_date DATE                      -- User's intended transaction date
expiry_date DATE                    -- Product expiry (day-level precision)
order_date DATE                     -- PO order date
received_date DATE                  -- GR received date

-- Audit timestamps (system tracking - includes time)
created_at TIMESTAMP WITH TIME ZONE -- When record was created (UTC)
updated_at TIMESTAMP WITH TIME ZONE -- When record was modified (UTC)
```

#### Rules
- ✅ **DATE fields**: Store day only (2025-11-15), no timezone
- ✅ **TIMESTAMP WITH TIME ZONE**: Always stored in UTC
- ❌ **NEVER use**: TIMESTAMP WITHOUT TIME ZONE (ambiguous)

### 2. Backend Layer (Node.js + PostgreSQL)

#### Database Connection (`src/db/pool.ts`)
```typescript
// Custom type parser for DATE columns
types.setTypeParser(1082, (val: string) => val); // Returns 'YYYY-MM-DD' string

// Force UTC for all connections
pool.on('connect', (client) => {
  client.query('SET timezone = "UTC"');
});
```

**Why?**
- Prevents `node-postgres` from converting DATE to Date object at midnight UTC
- Date object conversion causes timezone shift (2025-11-15 → 2025-11-14 for UTC+3 users)
- Returning plain string eliminates timezone math

#### Repository Layer
```typescript
// ✅ CORRECT: Dates flow as strings
const result = await pool.query(
  'SELECT sale_date, created_at FROM sales WHERE id = $1',
  [id]
);
// sale_date: '2025-11-15' (string)
// created_at: Date object in UTC

// ❌ WRONG: Don't convert dates to Date objects
const saleDate = new Date(row.sale_date); // Causes timezone shift!
```

#### Service Layer
```typescript
// ✅ CORRECT: Pass dates as strings to repository
await salesRepository.createSale({
  saleDate: '2025-11-15', // Plain string YYYY-MM-DD
  customerId: 'uuid-here'
});

// ❌ WRONG: Don't call .toISOString() on dates
expiryDate: new Date(data.expiry).toISOString() // Adds timezone!
```

### 3. API Layer

#### Response Format
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "saleNumber": "SALE-2025-0001",
    "saleDate": "2025-11-15",           // String, no timezone
    "createdAt": "2025-11-16T13:20:56.222Z",  // ISO 8601 UTC
    "totalAmount": 96500
  }
}
```

**Rules:**
- DATE fields: Return as `"YYYY-MM-DD"` string
- TIMESTAMP fields: Return as ISO 8601 UTC string (`"2025-11-16T13:20:56.222Z"`)
- Frontend decides how to display based on user's timezone

### 4. Frontend Layer (React)

#### Display Dates
```typescript
// ✅ CORRECT: Format dates for user's timezone
const displayDate = (dateString: string) => {
  // For DATE fields (YYYY-MM-DD), display as-is
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return dateString; // "2025-11-15"
  }
  
  // For TIMESTAMP fields (ISO string), convert to local
  const date = new Date(dateString);
  return date.toLocaleDateString(); // User's locale
};

// For timestamps with time
const displayDateTime = (isoString: string) => {
  const date = new Date(isoString);
  return date.toLocaleString(); // User's timezone + locale
};
```

#### Date Filters
```typescript
// ✅ CORRECT: Send plain date strings to API
const filters = {
  startDate: '2025-11-01',  // Start of day in business terms
  endDate: '2025-11-15'     // End of day in business terms
};

// Backend interprets these as full days in UTC
// 2025-11-01 = 2025-11-01 00:00:00 UTC to 2025-11-01 23:59:59 UTC
```

#### Backdated Sales
```typescript
// User selects Nov 15 from date picker
const saleDateInput = '2025-11-15'; // From <input type="date">

// ✅ Send as-is to backend
await api.post('/sales', {
  saleDate: saleDateInput, // '2025-11-15' (string)
  items: [...],
  totalAmount: 96500
});

// Backend stores it as DATE '2025-11-15'
// No timezone conversion occurs
```

---

## 🔍 Common Scenarios

### Scenario 1: Sale Made Today
```
User Action: Makes sale at 4:20 PM (East Africa Time UTC+3)
Database:
  sale_date: DATE '2025-11-16'      -- Transaction date (today)
  created_at: TIMESTAMPTZ '2025-11-16 13:20:56+00' -- UTC timestamp

Frontend Display:
  Sale Date: 2025-11-16             -- As stored
  Created At: Nov 16, 2025 4:20 PM  -- Converted to EAT
```

### Scenario 2: Backdated Sale
```
User Action: Backdate sale to Nov 15 (entered on Nov 16)
Database:
  sale_date: DATE '2025-11-15'      -- Backdated transaction date
  created_at: TIMESTAMPTZ '2025-11-16 13:20:56+00' -- Actual entry time

Frontend Display:
  Sale Date: 2025-11-15             -- Shows on Nov 15 in reports ✅
  Created At: Nov 16, 2025 4:20 PM  -- Shows when actually entered
```

### Scenario 3: Date Range Filter "Today"
```
User Clicks: "Today" button on Nov 16
Frontend Sends:
  startDate: '2025-11-16'
  endDate: '2025-11-16'

Backend Query:
  WHERE sale_date >= '2025-11-16'::date
    AND sale_date <= '2025-11-16'::date

Result: All sales with sale_date = Nov 16 (full day, any time)
```

---

## ✅ Verification Checklist

- [x] Database uses DATE for transaction dates
- [x] Database uses TIMESTAMPTZ for audit timestamps
- [x] Custom type parser returns DATE as string
- [x] Database connection timezone = UTC
- [x] No `new Date(dateString).toISOString()` in backend
- [x] API returns dates as plain strings (YYYY-MM-DD)
- [x] Frontend formats dates for display only
- [x] Date filters send plain date strings
- [x] Backdated sales appear on correct date
- [x] Sorting by sale_date (transaction date) not created_at

---

## 🚫 Anti-Patterns to Avoid

### ❌ Backend
```typescript
// DON'T convert DATE to Date object
const saleDate = new Date(row.sale_date); // Causes timezone shift!

// DON'T use .toISOString() on dates
expiryDate: new Date(data.expiry).toISOString(); // Adds UTC timezone!

// DON'T use TIMESTAMP WITHOUT TIME ZONE
created_at TIMESTAMP; // Ambiguous! Use TIMESTAMPTZ instead
```

### ❌ Frontend
```typescript
// DON'T send Date objects to API
saleDate: new Date(); // Send string instead!

// DON'T use date.toLocaleDateString() on server
// Server should be timezone-agnostic
```

### ❌ SQL Queries
```sql
-- DON'T use string timestamps
WHERE created_at > '2025-11-16 00:00:00' -- Missing timezone!

-- DO use explicit timezone or date casting
WHERE created_at >= '2025-11-16'::date
WHERE created_at >= '2025-11-16 00:00:00+00'::timestamptz
```

---

## 📚 References

- **PostgreSQL DATE vs TIMESTAMPTZ**: https://www.postgresql.org/docs/current/datatype-datetime.html
- **node-postgres Type Parsing**: https://node-postgres.com/features/types
- **JavaScript Date UTC Pitfalls**: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date

---

## 🎯 Summary

| Aspect | Implementation |
|--------|---------------|
| **Database** | UTC for all TIMESTAMPTZ, plain DATE for transaction dates |
| **Backend** | Custom type parser, UTC session, dates as strings |
| **API** | Return dates as YYYY-MM-DD strings, timestamps as ISO UTC |
| **Frontend** | Display conversion only, send plain date strings |
| **Result** | ✅ No timezone issues, backdating works, reports accurate |

**Key Principle**: Timezone is a **display concern**, not a storage concern.
