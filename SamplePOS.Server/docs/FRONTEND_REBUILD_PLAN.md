# Frontend Rebuild Plan - Step 12: Backend Integration

**Date**: October 18, 2025  
**Objective**: Connect React frontend to Node.js/Express/Prisma backend  
**Current State**: Frontend uses localStorage, Backend APIs ready (28 endpoints, 0 errors)

---

## Phase 1: Frontend Architecture Analysis

### Current Frontend Stack
```json
Tech Stack:
- React 19.1.1 + TypeScript 5.8.3
- Vite 7.1.7 (build tool)
- TanStack React Query 5.90.5 (data fetching)
- Axios 1.12.2 (HTTP client)
- Shadcn UI + Radix UI (components)
- Tailwind CSS (styling)
- IndexedDB (idb 8.0.3) - offline storage
- PWA support (service worker)
```

### Current Service Architecture

#### ✅ Good Patterns (Keep)
1. **React Query Setup** (`src/config/queryClient.tsx`)
   - Already configured with TanStack React Query
   - Centralized query keys structure
   - Cache management helpers
   - Invalidation and prefetch utilities

2. **Axios API Client** (`src/services/api.ts`)
   - Base API instance configured
   - `/api` baseURL
   - 10s timeout
   - JSON headers

3. **Component Structure**
   - Lazy-loaded components (code splitting)
   - Error boundaries
   - Loading states
   - Shadcn UI components

#### ❌ Problem Areas (Fix)
1. **localStorage Dependency**
   - CustomerAccountService.ts (1,537 lines) - 100% localStorage
   - PurchaseManagementService.ts - localStorage for suppliers/orders
   - SupplierCatalogService.ts - localStorage for catalog
   - SettingsService.ts - localStorage for settings
   - authService.ts - localStorage for tokens

2. **Type Mismatches** (550 errors)
   - ID types inconsistent (string vs number)
   - Missing type exports
   - Property name mismatches
   - Undefined property access

3. **No Authentication Flow**
   - authService.ts exists but doesn't use backend
   - No JWT token management with backend
   - No protected routes

4. **Dual Data Sources**
   - Some services use API (POSServiceAPI.ts, TransactionServiceAPI.ts)
   - Others use localStorage (CustomerAccountService.ts)
   - Inconsistent patterns

---

## Phase 2: Integration Strategy

### Approach: **Incremental Migration** (NOT full rebuild)

**Rationale**:
- Backend is ready and tested
- Frontend UI/UX is functional
- Only data layer needs updating
- Minimize risk and downtime

### Migration Path

```
Current: React → localStorage
Target:  React → React Query → Axios → Backend API → PostgreSQL
```

---

## Phase 3: Detailed Implementation Plan

### Step 1: Fix Type Definitions (Priority: CRITICAL)
**Estimated Time**: 2-3 hours  
**Goal**: Align frontend types with Prisma schema

#### Tasks:

1. **Generate Types from Prisma Schema**
   ```bash
   # In SamplePOS.Server
   npx prisma generate
   
   # Copy generated types to frontend
   # Or create shared types package
   ```

2. **Update `src/types/index.ts`**
   - Add missing type exports
   - Align ID types with backend (number from autoincrement)
   - Add backend response types
   - Add pagination types
   - Add error response types

3. **Create Backend Type Definitions**
   ```typescript
   // src/types/backend.ts (NEW)
   
   // API Response wrappers
   export interface ApiResponse<T> {
     success: boolean;
     data: T;
     message?: string;
   }
   
   export interface ApiError {
     error: string;
     details?: any;
     statusCode: number;
   }
   
   // Pagination
   export interface PaginationParams {
     page?: number;
     limit?: number;
     sortBy?: string;
     sortOrder?: 'asc' | 'desc';
   }
   
   export interface PaginatedResponse<T> {
     data: T[];
     pagination: {
       page: number;
       limit: number;
       total: number;
       totalPages: number;
     };
   }
   
   // Customer types (matching Prisma schema)
   export interface Customer {
     id: number;  // NOT string
     name: string;
     email?: string;
     phone?: string;
     address?: string;
     creditLimit: Decimal;
     currentBalance: Decimal;
     depositBalance: Decimal;
     creditUsed: Decimal;
     paymentTermsDays: number;
     accountStatus: 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
     // ... rest from Prisma schema
   }
   ```

4. **Fix Type Errors in Components**
   - POSScreenAPI.tsx (~15 errors)
   - PurchaseOrderManagement.tsx (~30 errors)
   - InventoryBatchManagement.tsx (~5 errors)

**Files to Update**:
- `src/types/index.ts`
- `src/types/backend.ts` (NEW)
- `src/types/CustomerAccount.ts`
- `src/components/POSScreenAPI.tsx`
- `src/components/PurchaseOrderManagement.tsx`
- `src/components/InventoryBatchManagement.tsx`

---

### Step 2: Setup Authentication Flow (Priority: HIGH)
**Estimated Time**: 2-3 hours  
**Goal**: Connect authService to backend, implement JWT flow

#### Tasks:

1. **Update authService.ts**
   ```typescript
   // Before: localStorage only
   // After: Backend API + localStorage for token cache
   
   class AuthService {
     async login(username: string, password: string) {
       // Call backend: POST /api/auth/login
       const response = await api.post('/auth/login', { username, password });
       
       // Store token
       this.setToken(response.data.token);
       this.setUser(response.data.user);
       
       return response.data;
     }
     
     async register(userData: RegisterData) {
       // Call backend: POST /api/auth/register
       const response = await api.post('/auth/register', userData);
       return response.data;
     }
     
     async logout() {
       // Optional: Call backend to invalidate token
       // await api.post('/auth/logout');
       
       // Clear local cache
       this.clearAuth();
     }
     
     async validateToken(): Promise<boolean> {
       try {
         // Verify token with backend
         await api.get('/auth/validate');
         return true;
       } catch {
         this.clearAuth();
         return false;
       }
     }
   }
   ```

2. **Add Axios Interceptors**
   ```typescript
   // src/services/api.ts
   import authService from './authService';
   
   // Request interceptor - add JWT token
   api.interceptors.request.use(
     (config) => {
       const token = authService.getToken();
       if (token) {
         config.headers.Authorization = `Bearer ${token}`;
       }
       return config;
     },
     (error) => Promise.reject(error)
   );
   
   // Response interceptor - handle 401
   api.interceptors.response.use(
     (response) => response,
     (error) => {
       if (error.response?.status === 401) {
         authService.clearAuth();
         window.location.href = '/login';
       }
       return Promise.reject(error);
     }
   );
   ```

3. **Create Login Page**
   ```typescript
   // src/pages/LoginPage.tsx (NEW)
   ```

4. **Add Protected Route Wrapper**
   ```typescript
   // src/components/ProtectedRoute.tsx (NEW)
   ```

**Files to Create**:
- `src/pages/LoginPage.tsx`
- `src/components/ProtectedRoute.tsx`
- `src/hooks/useAuth.ts`

**Files to Update**:
- `src/services/authService.ts`
- `src/services/api.ts`
- `src/App.tsx`

---

### Step 3: Create API Service Layer (Priority: HIGH)
**Estimated Time**: 4-5 hours  
**Goal**: Create service classes that use React Query + Axios

#### Pattern:

```typescript
// src/services/api/customerAccountsApi.ts (NEW)

import api from '../api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/config/queryClient';

// ============ API Functions ============

export const customerAccountsApi = {
  // GET /api/customers/:id/balance
  getBalance: async (customerId: number) => {
    const { data } = await api.get(`/customers/${customerId}/balance`);
    return data;
  },
  
  // POST /api/customers/:id/deposit
  makeDeposit: async (customerId: number, depositData: DepositData) => {
    const { data } = await api.post(`/customers/${customerId}/deposit`, depositData);
    return data;
  },
  
  // GET /api/customers/:id/credit-info
  getCreditInfo: async (customerId: number) => {
    const { data } = await api.get(`/customers/${customerId}/credit-info`);
    return data;
  },
  
  // ... 5 more endpoints
};

// ============ React Query Hooks ============

// Get customer balance
export function useCustomerBalance(customerId: number) {
  return useQuery({
    queryKey: ['customerBalance', customerId],
    queryFn: () => customerAccountsApi.getBalance(customerId),
    enabled: !!customerId,
  });
}

// Make deposit mutation
export function useMakeDeposit() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ customerId, depositData }: { 
      customerId: number; 
      depositData: DepositData 
    }) => customerAccountsApi.makeDeposit(customerId, depositData),
    
    onSuccess: (data, variables) => {
      // Invalidate balance query
      queryClient.invalidateQueries({ 
        queryKey: ['customerBalance', variables.customerId] 
      });
      
      // Invalidate transactions list
      queryClient.invalidateQueries({ 
        queryKey: ['customerTransactions', variables.customerId] 
      });
    },
  });
}

// ... more hooks for each endpoint
```

#### Services to Create:

1. **customerAccountsApi.ts** (8 endpoints)
   - getBalance
   - makeDeposit
   - getCreditInfo
   - adjustCredit
   - getStatement
   - recordPayment
   - getAging
   - getTransactions

2. **installmentsApi.ts** (5 endpoints)
   - createPlan
   - getCustomerPlans
   - getPlanDetails
   - recordPayment
   - updateStatus

3. **paymentsApi.ts** (6 endpoints)
   - recordPayment
   - splitPayment
   - getHistory
   - processRefund
   - getPaymentDetails
   - allocatePayment

4. **documentsApi.ts** (4 endpoints)
   - generateInvoice
   - generateReceipt
   - generateCreditNote
   - downloadPDF

5. **reportsApi.ts** (5 endpoints)
   - getAgingReport
   - getCustomerStatement
   - getProfitabilityReport
   - getCashFlowReport
   - getARSummary

**Files to Create** (13 new files):
- `src/services/api/customerAccountsApi.ts`
- `src/services/api/installmentsApi.ts`
- `src/services/api/paymentsApi.ts`
- `src/services/api/documentsApi.ts`
- `src/services/api/reportsApi.ts`
- `src/services/api/customersApi.ts`
- `src/services/api/productsApi.ts`
- `src/services/api/inventoryApi.ts`
- `src/services/api/salesApi.ts`
- `src/services/api/purchasesApi.ts`
- `src/services/api/suppliersApi.ts`
- `src/services/api/settingsApi.ts`
- `src/services/api/index.ts` (barrel export)

---

### Step 4: Migrate Components (Priority: HIGH)
**Estimated Time**: 6-8 hours  
**Goal**: Update components to use new API hooks

#### Strategy: Component by Component

**Priority Order**:
1. Authentication (Login/Logout)
2. Customer Account Manager
3. POS Screen
4. Payment & Billing
5. Inventory Management
6. Purchase Orders
7. Reports
8. Settings

#### Example Migration:

**Before** (CustomerAccountManager.tsx):
```typescript
import { CustomerAccountService } from '@/services/CustomerAccountService';

function CustomerAccountManager() {
  const [accounts, setAccounts] = useState([]);
  
  useEffect(() => {
    // Load from localStorage
    const data = CustomerAccountService.getAllCustomerAccounts();
    setAccounts(data);
  }, []);
  
  const handleDeposit = (customerId: string, amount: number) => {
    // Save to localStorage
    CustomerAccountService.recordDeposit(customerId, amount);
    // Re-fetch
    const updated = CustomerAccountService.getAllCustomerAccounts();
    setAccounts(updated);
  };
  
  return (/* UI */);
}
```

**After** (CustomerAccountManager.tsx):
```typescript
import { useCustomerAccounts, useMakeDeposit } from '@/services/api/customerAccountsApi';

function CustomerAccountManager() {
  // React Query handles loading, caching, refetching
  const { data: accounts, isLoading, error } = useCustomerAccounts();
  
  const depositMutation = useMakeDeposit();
  
  const handleDeposit = async (customerId: number, amount: number) => {
    await depositMutation.mutateAsync({ 
      customerId, 
      depositData: { amount, paymentMethod: 'CASH' } 
    });
    // React Query auto-refetches and updates UI
  };
  
  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;
  
  return (/* UI */);
}
```

#### Components to Update (in order):

1. **AuthService Integration**
   - `src/App.tsx` - Add login check
   - `src/components/layout/HeaderBar.tsx` - Add logout button

2. **Customer Components**
   - `src/components/CustomerAccountManager.tsx`
   - `src/components/CustomerBalanceDisplay.tsx`
   - `src/components/CreateCustomerModal.tsx`

3. **POS Components**
   - `src/components/POSScreenAPI.tsx`
   - `src/services/POSServiceAPI.ts`
   - `src/services/TransactionServiceAPI.ts`

4. **Payment Components**
   - `src/components/PaymentBillingRefactored.tsx`

5. **Inventory Components**
   - `src/components/InventoryManagement.tsx`
   - `src/components/InventoryBatchManagement.tsx`

6. **Purchase Components**
   - `src/components/PurchaseOrderManagement.tsx`
   - `src/components/PurchaseReceiving.tsx`
   - `src/components/EnhancedPurchaseOrderWorkflow.tsx`

7. **Reports**
   - `src/components/ReportsShadcn.tsx`

8. **Settings**
   - `src/components/AdminSettings.tsx`

---

### Step 5: Remove localStorage Dependencies (Priority: MEDIUM)
**Estimated Time**: 2-3 hours  
**Goal**: Clean up old localStorage code

#### Tasks:

1. **Deprecate Old Services**
   - Keep for reference during migration
   - Add deprecation warnings
   - Remove after all components migrated

2. **Services to Deprecate**:
   - `CustomerAccountService.ts` (1,537 lines)
   - `PurchaseManagementService.ts`
   - `SupplierCatalogService.ts`
   - Parts of `SettingsService.ts`

3. **Keep localStorage Only For**:
   - Auth token cache (for offline)
   - User preferences
   - Offline queue (PWA)
   - Settings cache

---

### Step 6: Add Error Handling (Priority: HIGH)
**Estimated Time**: 2-3 hours  
**Goal**: Graceful error handling throughout app

#### Tasks:

1. **Create Error Components**
   ```typescript
   // src/components/ErrorMessage.tsx (NEW)
   // src/components/ErrorFallback.tsx (NEW)
   ```

2. **Add Global Error Handler**
   ```typescript
   // src/utils/errorHandler.ts (NEW)
   ```

3. **Add Toast Notifications**
   - Already have ToastContext
   - Use for success/error messages
   - Show user-friendly errors

4. **Add Retry Logic**
   - React Query has built-in retry
   - Configure per query
   - Show retry button for failed queries

---

### Step 7: Offline Support (Priority: LOW)
**Estimated Time**: 4-5 hours  
**Goal**: PWA with offline capabilities

#### Tasks:

1. **Keep Service Worker**
   - Already exists: `public/service-worker.js`
   - Cache API responses
   - Queue mutations when offline

2. **IndexedDB Integration**
   - Already have `idb` package
   - Cache GET requests in IndexedDB
   - Sync mutations when back online

3. **Offline Queue**
   ```typescript
   // src/lib/offlineQueue.ts (NEW)
   ```

4. **Update Components**
   - Show offline indicator
   - Disable mutations when offline
   - Show sync status

---

### Step 8: Testing & Validation (Priority: CRITICAL)
**Estimated Time**: 4-5 hours  
**Goal**: Ensure all features work with backend

#### Test Scenarios:

1. **Authentication Flow**
   - [ ] Login with valid credentials
   - [ ] Login with invalid credentials
   - [ ] Logout
   - [ ] Token expiration handling
   - [ ] Protected routes

2. **Customer Account Operations**
   - [ ] View customer balance
   - [ ] Make deposit
   - [ ] Check credit info
   - [ ] Adjust credit limit
   - [ ] View statement
   - [ ] Record payment
   - [ ] View aging report
   - [ ] View transactions

3. **Installment Plans**
   - [ ] Create installment plan
   - [ ] View customer plans
   - [ ] Record installment payment
   - [ ] Update plan status
   - [ ] View plan details

4. **Payment Processing**
   - [ ] Record single payment
   - [ ] Split payment
   - [ ] View payment history
   - [ ] Process refund
   - [ ] Allocate payment

5. **Document Generation**
   - [ ] Generate invoice
   - [ ] Generate receipt
   - [ ] Generate credit note
   - [ ] Download PDF

6. **Financial Reports**
   - [ ] Aging report
   - [ ] Customer statement
   - [ ] Profitability report
   - [ ] Cash flow report
   - [ ] AR summary

7. **POS Operations**
   - [ ] Create sale
   - [ ] Apply customer discount
   - [ ] Process payment
   - [ ] Print receipt
   - [ ] Void transaction

8. **Inventory Operations**
   - [ ] Add product
   - [ ] Update stock
   - [ ] View batch details
   - [ ] Low stock alerts
   - [ ] Expiry tracking

9. **Purchase Orders**
   - [ ] Create PO
   - [ ] Update PO status
   - [ ] Receive goods
   - [ ] View PO history

10. **Error Scenarios**
    - [ ] Network error handling
    - [ ] 401 Unauthorized
    - [ ] 404 Not Found
    - [ ] 500 Server Error
    - [ ] Validation errors
    - [ ] Concurrent operations

---

## Phase 4: Migration Timeline

### Week 1: Foundation (Days 1-2)
- **Day 1** (4-6 hours):
  - Fix type definitions
  - Update types/index.ts
  - Create types/backend.ts
  - Fix type errors in components

- **Day 2** (4-6 hours):
  - Setup authentication flow
  - Update authService.ts
  - Add axios interceptors
  - Create login page
  - Add protected routes

### Week 1: Core Services (Days 3-5)
- **Day 3** (6-8 hours):
  - Create API service layer (Part 1)
  - customerAccountsApi.ts
  - installmentsApi.ts
  - paymentsApi.ts
  - Test with Postman

- **Day 4** (6-8 hours):
  - Create API service layer (Part 2)
  - documentsApi.ts
  - reportsApi.ts
  - customersApi.ts
  - productsApi.ts

- **Day 5** (6-8 hours):
  - Create API service layer (Part 3)
  - inventoryApi.ts
  - salesApi.ts
  - purchasesApi.ts
  - suppliersApi.ts
  - settingsApi.ts

### Week 2: Component Migration (Days 6-10)
- **Day 6** (6-8 hours):
  - Migrate authentication
  - Migrate customer components
  - Test customer operations

- **Day 7** (6-8 hours):
  - Migrate POS screen
  - Migrate transaction components
  - Test POS operations

- **Day 8** (6-8 hours):
  - Migrate payment/billing
  - Migrate reports
  - Test payment processing

- **Day 9** (6-8 hours):
  - Migrate inventory
  - Migrate purchase orders
  - Test inventory operations

- **Day 10** (6-8 hours):
  - Migrate settings
  - Add error handling
  - Remove localStorage dependencies

### Week 3: Testing & Polish (Days 11-13)
- **Day 11** (6-8 hours):
  - Integration testing
  - Fix bugs
  - Performance optimization

- **Day 12** (6-8 hours):
  - Error scenario testing
  - Add offline support
  - PWA enhancements

- **Day 13** (4-6 hours):
  - Final testing
  - Documentation
  - Deployment preparation

**Total Estimated Time**: 70-100 hours (2-3 weeks full-time)

---

## Phase 5: Risk Mitigation

### High-Risk Areas

1. **Data Migration**
   - **Risk**: Losing existing localStorage data
   - **Mitigation**: 
     - Export localStorage data first
     - Import to backend via migration script
     - Keep localStorage as fallback during transition

2. **Authentication Breaking**
   - **Risk**: Users locked out
   - **Mitigation**:
     - Test thoroughly
     - Provide admin backdoor
     - Have rollback plan

3. **Component Breaking Changes**
   - **Risk**: UI stops working
   - **Mitigation**:
     - Migrate one component at a time
     - Keep old code until tested
     - Feature flags for gradual rollout

4. **Performance Degradation**
   - **Risk**: Backend calls slower than localStorage
   - **Mitigation**:
     - React Query caching
     - Optimistic updates
     - Background refetching
     - IndexedDB cache

### Rollback Strategy

1. **Version Control**
   - Create feature branch: `feature/backend-integration`
   - Keep main branch stable
   - Only merge after full testing

2. **Feature Flags**
   ```typescript
   const USE_BACKEND = import.meta.env.VITE_USE_BACKEND === 'true';
   
   if (USE_BACKEND) {
     // Use backend API
   } else {
     // Use localStorage
   }
   ```

3. **Gradual Rollout**
   - Enable backend for one feature at a time
   - Monitor errors
   - Roll back if issues

---

## Phase 6: Success Criteria

### Must Have (MVP)
- [ ] All 28 backend endpoints integrated
- [ ] Authentication working (login/logout)
- [ ] Customer account operations functional
- [ ] POS sales working with backend
- [ ] Payment processing functional
- [ ] Basic error handling
- [ ] 0 TypeScript errors
- [ ] All components using backend (no localStorage)

### Should Have
- [ ] Offline support (PWA)
- [ ] Optimistic updates
- [ ] Loading states everywhere
- [ ] Error recovery
- [ ] Toast notifications
- [ ] Background sync

### Nice to Have
- [ ] Real-time updates (WebSocket)
- [ ] Advanced caching strategies
- [ ] Performance monitoring
- [ ] Analytics integration

---

## Phase 7: File Structure (After Migration)

```
src/
├── services/
│   ├── api/                    # NEW - Backend API services
│   │   ├── index.ts           # Barrel export
│   │   ├── customerAccountsApi.ts
│   │   ├── installmentsApi.ts
│   │   ├── paymentsApi.ts
│   │   ├── documentsApi.ts
│   │   ├── reportsApi.ts
│   │   ├── customersApi.ts
│   │   ├── productsApi.ts
│   │   ├── inventoryApi.ts
│   │   ├── salesApi.ts
│   │   ├── purchasesApi.ts
│   │   ├── suppliersApi.ts
│   │   └── settingsApi.ts
│   ├── api.ts                  # UPDATED - Axios with interceptors
│   ├── authService.ts          # UPDATED - Backend auth
│   ├── CustomerAccountService.ts  # DEPRECATED
│   ├── PurchaseManagementService.ts  # DEPRECATED
│   └── SupplierCatalogService.ts  # DEPRECATED
├── types/
│   ├── index.ts               # UPDATED - Fixed types
│   ├── backend.ts             # NEW - Backend API types
│   └── CustomerAccount.ts     # UPDATED - Fixed types
├── pages/
│   └── LoginPage.tsx          # NEW
├── components/
│   ├── ProtectedRoute.tsx     # NEW
│   ├── ErrorMessage.tsx       # NEW
│   ├── ErrorFallback.tsx      # NEW
│   └── [all existing]         # UPDATED
├── hooks/
│   ├── useAuth.ts             # NEW
│   └── [existing hooks]
├── utils/
│   ├── errorHandler.ts        # NEW
│   └── [existing utils]
└── lib/
    ├── offlineQueue.ts        # NEW
    └── [existing lib]
```

---

## Phase 8: Next Steps

### Immediate Actions (Today)

1. **Create feature branch**
   ```bash
   git checkout -b feature/backend-integration
   ```

2. **Fix type definitions** (2-3 hours)
   - Start with types/index.ts
   - Create types/backend.ts
   - Fix component type errors

3. **Test backend APIs** (1 hour)
   - Use Postman collection
   - Verify all 28 endpoints work
   - Document any issues

### Tomorrow

1. **Setup authentication** (4-6 hours)
   - Update authService.ts
   - Add axios interceptors
   - Create login page
   - Test login/logout flow

### This Week

1. **Create API service layer** (3 days)
   - One API file per day
   - Test each service
   - Document hooks

2. **Start component migration** (2 days)
   - Authentication components
   - Customer components
   - Test thoroughly

---

## Conclusion

### Summary

**Current State**:
- ✅ Backend: 28 endpoints, 0 errors, production ready
- ⚠️ Frontend: Uses localStorage, has type errors, needs backend integration

**Target State**:
- ✅ Backend: Same (already complete)
- ✅ Frontend: Uses backend APIs, 0 errors, full integration

**Approach**: Incremental migration, not full rebuild
**Timeline**: 2-3 weeks (70-100 hours)
**Risk**: Medium (mitigated with gradual rollout)

### Key Decisions

1. **Keep React Query** ✅ - Already setup, perfect for this
2. **Keep Component Structure** ✅ - UI is good, only data layer changes
3. **Keep Axios** ✅ - Already configured
4. **Incremental Migration** ✅ - Safer than full rewrite
5. **Feature Branch** ✅ - Protect main branch

### Ready to Start?

**First Task**: Fix type definitions (types/index.ts)  
**Estimated Time**: 2-3 hours  
**Blocking**: Nothing - can start immediately

**Command to begin**:
```bash
cd c:\Users\Chase\source\repos\SamplePOS\samplepos.client
git checkout -b feature/backend-integration
```

---

**Plan Created**: October 18, 2025  
**Status**: Ready for implementation  
**Next Action**: Fix type definitions
