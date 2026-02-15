# Quick Reference: Role-Based Access Control

## 🚀 Quick Start

### 1. Protect a Route

```tsx
import { ProtectedRoute } from './components/auth/ProtectedRoute';

// In your routing file
<Route 
  path="/accounting" 
  element={
    <ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']}>
      <AccountingPage />
    </ProtectedRoute>
  } 
/>
```

### 2. Conditional Rendering

```tsx
import { useCanAccess } from './components/auth/ProtectedRoute';

function MyComponent() {
  const canEdit = useCanAccess(['ADMIN', 'MANAGER']);
  
  return (
    <div>
      <ViewButton />
      {canEdit && <EditButton />}
    </div>
  );
}
```

### 3. RoleGate Component

```tsx
import { RoleGate } from './components/auth/ProtectedRoute';

<RoleGate requiredRoles={['ADMIN']} fallback={<p>Access Denied</p>}>
  <AdminOnlyContent />
</RoleGate>
```

### 4. Check Permissions

```tsx
import { hasPermission, Permission } from './utils/rolePermissions';
import { useAuth } from './stores';

function MyComponent() {
  const { user } = useAuth();
  
  const canPostJournal = hasPermission(user.role, Permission.POST_JOURNAL_ENTRIES);
  
  return canPostJournal ? <PostButton /> : null;
}
```

## 📋 Role Hierarchy

```
ADMIN    → Full system access
  ↓
MANAGER  → Operations & management (no system admin)
  ↓
CASHIER  → Sales & customer operations
  ↓
STAFF    → Inventory viewing only
```

## 🔑 Common Permission Patterns

### Sales & POS
```tsx
// All roles that can process sales
<ProtectedRoute requiredRoles={['ADMIN', 'MANAGER', 'CASHIER']}>
  <POSPage />
</ProtectedRoute>
```

### Accounting
```tsx
// Only ADMIN and MANAGER
<ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']}>
  <AccountingLayout />
</ProtectedRoute>
```

### Admin Panel
```tsx
// ADMIN only
<ProtectedRoute requiredRoles={['ADMIN']}>
  <AdminPanel />
</ProtectedRoute>
```

### Inventory View
```tsx
// All authenticated users
<ProtectedRoute requiredRoles={['ADMIN', 'MANAGER', 'CASHIER', 'STAFF']}>
  <InventoryPage />
</ProtectedRoute>
```

## 🛠️ Backend Protection

### Protect API Routes

```typescript
import { authenticate, authorize, requirePermission } from './middleware/auth';

// Role-based
router.get('/suppliers', 
  authenticate(), 
  authorize('ADMIN', 'MANAGER'),
  getSuppliersController
);

// Permission-based
router.post('/accounting/journal-entries',
  authenticate(),
  requirePermission('POST_JOURNAL_ENTRIES'),
  createJournalEntryController
);
```

## 📊 Permission Reference

### By Module

**Sales**: `VIEW_SALES`, `CREATE_SALES`, `EDIT_SALES`, `DELETE_SALES`, `VOID_SALES`

**Inventory**: `VIEW_INVENTORY`, `MANAGE_INVENTORY`, `ADJUST_STOCK`, `VIEW_STOCK_MOVEMENTS`

**Purchase Orders**: `VIEW_PURCHASE_ORDERS`, `CREATE_PURCHASE_ORDERS`, `APPROVE_PURCHASE_ORDERS`, `RECEIVE_GOODS`

**Customers**: `VIEW_CUSTOMERS`, `MANAGE_CUSTOMERS`, `MANAGE_CUSTOMER_GROUPS`

**Suppliers**: `VIEW_SUPPLIERS`, `MANAGE_SUPPLIERS`

**Accounting**: `VIEW_ACCOUNTING`, `MANAGE_CHART_OF_ACCOUNTS`, `POST_JOURNAL_ENTRIES`, `VIEW_GENERAL_LEDGER`

**Expenses**: `VIEW_EXPENSES`, `CREATE_EXPENSES`, `APPROVE_EXPENSES`

**Reports**: `VIEW_REPORTS`, `VIEW_FINANCIAL_REPORTS`, `EXPORT_REPORTS`

**Admin**: `MANAGE_USERS`, `MANAGE_ROLES`, `VIEW_AUDIT_LOG`, `MANAGE_SETTINGS`, `ACCESS_ADMIN_PANEL`

## 🧪 Testing

### Test User Credentials

```bash
# ADMIN
Email: admin@samplepos.com
Password: admin123

# MANAGER
Email: manager@samplepos.com
Password: manager123

# CASHIER
Email: cashier@samplepos.com
Password: cashier123

# STAFF
Email: staff@samplepos.com
Password: staff123
```

### Quick Test Checklist

1. Login as CASHIER → Cannot access `/accounting`
2. Login as STAFF → Cannot access `/pos`
3. Login as MANAGER → Cannot access `/admin`
4. Login as ADMIN → Can access everything

## 🚨 Common Mistakes

### ❌ Don't Do This

```tsx
// Checking role directly in component (tight coupling)
{user.role === 'ADMIN' && <DeleteButton />}

// No route protection
<Route path="/accounting" element={<AccountingPage />} />

// Hardcoded strings instead of constants
authorize('admin', 'manager') // Wrong case!
```

### ✅ Do This

```tsx
// Use utility hooks
const canDelete = useCanAccess(['ADMIN']);
{canDelete && <DeleteButton />}

// Always protect routes
<ProtectedRoute requiredRoles={['ADMIN', 'MANAGER']}>
  <AccountingPage />
</ProtectedRoute>

// Use correct role constants
authorize('ADMIN', 'MANAGER')
```

## 📚 Further Reading

- Full documentation: [ROLE_BASED_ACCESS_CONTROL.md](./ROLE_BASED_ACCESS_CONTROL.md)
- Type definitions: `shared/types/user.ts`
- Frontend implementation: `samplepos.client/src/components/auth/ProtectedRoute.tsx`
- Permission utilities: `samplepos.client/src/utils/rolePermissions.ts`
- Backend middleware: `SamplePOS.Server/src/middleware/auth.ts`

---

**Quick Links**:
- [Full RBAC Documentation](./ROLE_BASED_ACCESS_CONTROL.md)
- [Copilot Implementation Rules](./COPILOT_IMPLEMENTATION_RULES.md)
- [API Communication Guide](./API_COMMUNICATION_GUIDE.md)
