# ⏰ Timezone Strategy - Quick Reference Card

**Print this and keep it visible while coding!**

---

## 🎯 ONE RULE: UTC Everywhere + Frontend Display Only

---

## ✅ DO THIS

### Database Schema
```sql
sale_date DATE                       -- Transaction dates (no time)
created_at TIMESTAMP WITH TIME ZONE  -- Audit timestamps (UTC)
```

### Backend (Node.js)
```typescript
// Return dates as plain strings
const result = await pool.query('SELECT sale_date FROM sales WHERE id = $1', [id]);
// result.rows[0].sale_date = '2025-11-15' ✅

// Pass dates as strings
await salesRepository.createSale({
  saleDate: '2025-11-15',  // ✅ Plain string
  customerId: 'uuid-here'
});
```

### API Response
```json
{
  "saleDate": "2025-11-15",                   // ✅ YYYY-MM-DD string
  "createdAt": "2025-11-16T13:20:56.222Z"    // ✅ ISO UTC
}
```

### Frontend (React)
```typescript
// Send plain strings to API
const saleData = {
  saleDate: '2025-11-15',  // ✅ From <input type="date">
  items: [...]
};

// Display conversion only
const displayDate = (dateStr: string) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr; // ✅ DATE - display as-is
  }
  return new Date(dateStr).toLocaleString(); // ✅ TIMESTAMP - convert
};
```

---

## ❌ NEVER DO THIS

### Backend
```typescript
// ❌ WRONG: Converting DATE to Date object
const saleDate = new Date(row.sale_date); // Causes timezone shift!

// ❌ WRONG: Using toISOString() on dates
expiryDate: new Date(data.expiry).toISOString(); // Adds timezone!

// ❌ WRONG: TIMESTAMP WITHOUT TIME ZONE
created_at TIMESTAMP  // Ambiguous timezone
```

### Frontend
```typescript
// ❌ WRONG: Sending Date object to API
saleDate: new Date()  // Send string instead!

// ❌ WRONG: Converting date strings unnecessarily
const date = new Date('2025-11-15'); // Keep as string!
```

---

## 🚨 RED FLAGS (Stop immediately if you see this)

1. `new Date(row.sale_date)` in backend
2. `.toISOString()` on date fields
3. `TIMESTAMP` without `WITH TIME ZONE`
4. Sending `Date` objects from frontend to API
5. Timezone math on DATE columns

---

## 📊 Data Flow Diagram

```
┌─────────────┐
│  Database   │
│ 2025-11-15  │ (DATE column)
└──────┬──────┘
       │
       ↓ (pg custom parser)
┌─────────────┐
│  Backend    │
│'2025-11-15' │ (string)
└──────┬──────┘
       │
       ↓ (API response)
┌─────────────┐
│  Frontend   │
│'2025-11-15' │ (string)
└──────┬──────┘
       │
       ↓ (display only)
┌─────────────┐
│    User     │
│ Nov 15 2025 │ (formatted)
└─────────────┘
```

**No timezone conversion at any step!**

---

## 🔧 Configuration Files

1. **`src/db/pool.ts`** - Custom type parser + UTC session
2. **`TIMEZONE_STRATEGY.md`** - Full documentation
3. **`COPILOT_IMPLEMENTATION_RULES.md`** - Section 0 (mandatory)

---

## 📝 Quick Test

Before committing, check:
- [ ] No `new Date(dateColumn)` in backend
- [ ] No `.toISOString()` on date fields  
- [ ] Dates returned as `YYYY-MM-DD` strings
- [ ] Frontend sends plain date strings
- [ ] All TIMESTAMP columns use `WITH TIME ZONE`

---

**Remember**: Timezone is a **display concern**, not a **storage concern**.

---

Last Updated: February 2026
