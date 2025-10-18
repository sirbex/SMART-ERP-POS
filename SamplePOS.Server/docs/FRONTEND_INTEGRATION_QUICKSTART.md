# Frontend Integration - Quick Start Guide

**Goal**: Connect React frontend to backend APIs  
**Approach**: Incremental migration (NOT full rebuild)  
**Timeline**: 2-3 weeks

---

## Current Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      FRONTEND (React)                        │
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐ │
│  │  Components  │ -> │   Services   │ -> │ localStorage │ │
│  │   (UI/UX)    │    │  (Business)  │    │   (Data)     │ │
│  └──────────────┘    └──────────────┘    └──────────────┘ │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Target Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      FRONTEND (React)                        │
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐ │
│  │  Components  │ -> │ React Query  │ -> │    Axios     │ │
│  │   (UI/UX)    │    │   (Cache)    │    │  (HTTP)      │ │
│  └──────────────┘    └──────────────┘    └──────┬───────┘ │
│                                                   │          │
└───────────────────────────────────────────────────┼─────────┘
                                                    │ JWT Auth
                                                    ▼
┌─────────────────────────────────────────────────────────────┐
│                   BACKEND (Node.js/Express)                  │
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐ │
│  │   Routes     │ -> │   Services   │ -> │    Prisma    │ │
│  │ (28 APIs)    │    │  (Business)  │    │   (ORM)      │ │
│  └──────────────┘    └──────────────┘    └──────┬───────┘ │
│                                                   │          │
└───────────────────────────────────────────────────┼─────────┘
                                                    │
                                                    ▼
                                            ┌──────────────┐
                                            │  PostgreSQL  │
                                            │  (Database)  │
                                            └──────────────┘
```

---

## Step-by-Step Checklist

### Phase 1: Foundation ⏱️ 2 days (8-12 hours)

#### Day 1: Fix Types (2-3 hours)
- [ ] Create feature branch: `git checkout -b feature/backend-integration`
- [ ] Update `src/types/index.ts`
  - [ ] Change all `id: number | string` to `id: number`
  - [ ] Add missing type exports
  - [ ] Fix property names to match Prisma schema
- [ ] Create `src/types/backend.ts`
  - [ ] Add `ApiResponse<T>` type
  - [ ] Add `ApiError` type
  - [ ] Add `PaginatedResponse<T>` type
  - [ ] Copy Customer/Sale/Product types from Prisma
- [ ] Fix type errors in components
  - [ ] POSScreenAPI.tsx
  - [ ] PurchaseOrderManagement.tsx
  - [ ] InventoryBatchManagement.tsx
- [ ] **Test**: Run `npm run build` - should have 0 errors

#### Day 2: Setup Auth (4-6 hours)
- [ ] Update `src/services/api.ts`
  - [ ] Add request interceptor (add JWT token)
  - [ ] Add response interceptor (handle 401)
- [ ] Update `src/services/authService.ts`
  - [ ] Replace localStorage login with API call
  - [ ] Add token validation method
  - [ ] Keep token in localStorage (for offline)
- [ ] Create `src/pages/LoginPage.tsx`
  - [ ] Login form with username/password
  - [ ] Call authService.login()
  - [ ] Redirect on success
- [ ] Create `src/components/ProtectedRoute.tsx`
  - [ ] Check if user authenticated
  - [ ] Redirect to login if not
- [ ] Update `src/App.tsx`
  - [ ] Add login route
  - [ ] Wrap routes with ProtectedRoute
- [ ] **Test**: Login with admin/admin123 should work

---

### Phase 2: API Services ⏱️ 3 days (18-24 hours)

#### Day 3: Customer APIs (6-8 hours)
- [ ] Create `src/services/api/customerAccountsApi.ts`
  - [ ] API functions for 8 endpoints
  - [ ] React Query hooks (useQuery/useMutation)
  - [ ] Proper error handling
- [ ] Create `src/services/api/customersApi.ts`
  - [ ] getCustomers, getCustomer, createCustomer, etc.
- [ ] **Test**: Use Postman to verify endpoints

#### Day 4: Payment & Document APIs (6-8 hours)
- [ ] Create `src/services/api/installmentsApi.ts` (5 endpoints)
- [ ] Create `src/services/api/paymentsApi.ts` (6 endpoints)
- [ ] Create `src/services/api/documentsApi.ts` (4 endpoints)
- [ ] Create `src/services/api/reportsApi.ts` (5 endpoints)
- [ ] **Test**: Curl test each endpoint

#### Day 5: Inventory & Sales APIs (6-8 hours)
- [ ] Create `src/services/api/productsApi.ts`
- [ ] Create `src/services/api/inventoryApi.ts`
- [ ] Create `src/services/api/salesApi.ts`
- [ ] Create `src/services/api/purchasesApi.ts`
- [ ] Create `src/services/api/suppliersApi.ts`
- [ ] Create `src/services/api/settingsApi.ts`
- [ ] Create `src/services/api/index.ts` (barrel export)
- [ ] **Test**: Build project, no errors

---

### Phase 3: Component Migration ⏱️ 5 days (30-40 hours)

#### Day 6: Auth & Customer Components (6-8 hours)
- [ ] Update `src/components/layout/HeaderBar.tsx`
  - [ ] Add logout button
  - [ ] Show current user
- [ ] Update `src/components/CustomerAccountManager.tsx`
  - [ ] Replace CustomerAccountService with useCustomerAccounts hook
  - [ ] Use useMakeDeposit, useRecordPayment hooks
  - [ ] Add loading states
  - [ ] Add error handling
- [ ] Update `src/components/CreateCustomerModal.tsx`
  - [ ] Use useCreateCustomer hook
- [ ] **Test**: Create customer, view balance, make deposit

#### Day 7: POS Screen (6-8 hours)
- [ ] Update `src/components/POSScreenAPI.tsx`
  - [ ] Replace localStorage with API hooks
  - [ ] Use useProducts, useCustomers
  - [ ] Use useCreateSale hook
  - [ ] Add optimistic updates
- [ ] Update `src/services/TransactionServiceAPI.ts`
  - [ ] Connect to backend
- [ ] **Test**: Complete sale transaction, verify in database

#### Day 8: Payments & Billing (6-8 hours)
- [ ] Update `src/components/PaymentBillingRefactored.tsx`
  - [ ] Use payment hooks
  - [ ] Use installment hooks
  - [ ] Add loading/error states
- [ ] **Test**: Record payment, create installment plan

#### Day 9: Inventory & Purchases (6-8 hours)
- [ ] Update `src/components/InventoryManagement.tsx`
  - [ ] Use inventory hooks
  - [ ] Add batch management
- [ ] Update `src/components/PurchaseOrderManagement.tsx`
  - [ ] Use purchase order hooks
  - [ ] Fix type errors
- [ ] Update `src/components/PurchaseReceiving.tsx`
  - [ ] Connect to backend
- [ ] **Test**: Add inventory, create PO, receive goods

#### Day 10: Reports & Settings (6-8 hours)
- [ ] Update `src/components/ReportsShadcn.tsx`
  - [ ] Use report hooks
  - [ ] Generate PDFs
- [ ] Update `src/components/AdminSettings.tsx`
  - [ ] Use settings hooks
  - [ ] Sync with backend
- [ ] **Test**: Generate reports, update settings

---

### Phase 4: Testing & Polish ⏱️ 3 days (18-24 hours)

#### Day 11: Integration Testing (6-8 hours)
- [ ] Test complete workflows
  - [ ] Create customer → Make sale → Record payment
  - [ ] Create installment plan → Record payments → Complete
  - [ ] Create PO → Receive → Update inventory
  - [ ] Generate all reports
- [ ] Fix bugs found
- [ ] Optimize performance

#### Day 12: Error Handling (6-8 hours)
- [ ] Add error boundaries to all routes
- [ ] Add toast notifications (success/error)
- [ ] Test error scenarios
  - [ ] Network offline
  - [ ] 401 Unauthorized
  - [ ] 404 Not Found
  - [ ] 500 Server Error
  - [ ] Validation errors
- [ ] Add retry buttons

#### Day 13: Final Polish (4-6 hours)
- [ ] Remove localStorage dependencies
  - [ ] Delete/deprecate old services
  - [ ] Keep only auth token cache
- [ ] Update documentation
- [ ] Performance audit
- [ ] Create deployment guide
- [ ] Merge to main branch

---

## Quick Commands

### Development
```bash
# Frontend
cd c:\Users\Chase\source\repos\SamplePOS\samplepos.client
npm run dev              # Start dev server (http://localhost:5173)
npm run build            # Build for production
npm run lint             # Check for errors

# Backend
cd c:\Users\Chase\source\repos\SamplePOS\SamplePOS.Server
npm run dev              # Start server (http://localhost:5000)
npm run build            # Build TypeScript
npx prisma studio        # Open database GUI
```

### Testing
```bash
# Check TypeScript errors
npm run build

# Test backend endpoints
# Import Postman collection:
# SamplePOS.Server/postman/POS_Customer_Accounting_APIs.postman_collection.json

# Test with curl
curl http://localhost:5000/api/health
```

### Git Workflow
```bash
# Create feature branch
git checkout -b feature/backend-integration

# Commit changes
git add .
git commit -m "Fix: Update types to match backend schema"

# Push to remote
git push origin feature/backend-integration

# Merge when ready
git checkout main
git merge feature/backend-integration
```

---

## Key Files to Create

### New Files (13 API services)
```
src/services/api/
├── index.ts                    # Barrel export
├── customerAccountsApi.ts      # 8 endpoints
├── installmentsApi.ts          # 5 endpoints
├── paymentsApi.ts              # 6 endpoints
├── documentsApi.ts             # 4 endpoints
├── reportsApi.ts               # 5 endpoints
├── customersApi.ts
├── productsApi.ts
├── inventoryApi.ts
├── salesApi.ts
├── purchasesApi.ts
├── suppliersApi.ts
└── settingsApi.ts

src/types/
└── backend.ts                  # Backend API types

src/pages/
└── LoginPage.tsx               # Login form

src/components/
├── ProtectedRoute.tsx          # Auth wrapper
├── ErrorMessage.tsx            # Error display
└── ErrorFallback.tsx           # Error boundary

src/hooks/
└── useAuth.ts                  # Auth hook

src/utils/
└── errorHandler.ts             # Error utilities
```

### Files to Update
```
src/services/
├── api.ts                      # Add interceptors
└── authService.ts              # Connect to backend

src/types/
└── index.ts                    # Fix types

src/
└── App.tsx                     # Add login route

src/components/
├── CustomerAccountManager.tsx  # Use API hooks
├── POSScreenAPI.tsx           # Use API hooks
├── PaymentBillingRefactored.tsx # Use API hooks
├── InventoryManagement.tsx    # Use API hooks
├── PurchaseOrderManagement.tsx # Use API hooks
├── ReportsShadcn.tsx          # Use API hooks
└── AdminSettings.tsx          # Use API hooks
```

---

## Code Patterns

### API Service Pattern
```typescript
// src/services/api/exampleApi.ts

import api from '../api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

// API functions
export const exampleApi = {
  getItems: async () => {
    const { data } = await api.get('/items');
    return data;
  },
  
  createItem: async (itemData: ItemData) => {
    const { data } = await api.post('/items', itemData);
    return data;
  },
};

// React Query hooks
export function useItems() {
  return useQuery({
    queryKey: ['items'],
    queryFn: exampleApi.getItems,
  });
}

export function useCreateItem() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: exampleApi.createItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });
}
```

### Component Migration Pattern
```typescript
// BEFORE
function MyComponent() {
  const [data, setData] = useState([]);
  
  useEffect(() => {
    const stored = localStorage.getItem('key');
    setData(JSON.parse(stored || '[]'));
  }, []);
  
  const handleCreate = (item) => {
    const updated = [...data, item];
    setData(updated);
    localStorage.setItem('key', JSON.stringify(updated));
  };
  
  return <div>{/* UI */}</div>;
}

// AFTER
function MyComponent() {
  const { data, isLoading, error } = useItems();
  const createMutation = useCreateItem();
  
  const handleCreate = async (item) => {
    await createMutation.mutateAsync(item);
    // React Query auto-refetches
  };
  
  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;
  
  return <div>{/* UI */}</div>;
}
```

---

## Success Metrics

### Must Have (Before Merge)
- [ ] 0 TypeScript errors
- [ ] All 28 endpoints integrated
- [ ] Authentication working
- [ ] All CRUD operations functional
- [ ] No localStorage dependencies (except auth)
- [ ] Basic error handling

### Should Have
- [ ] Loading states everywhere
- [ ] Error recovery
- [ ] Toast notifications
- [ ] Optimistic updates

### Nice to Have
- [ ] Offline support
- [ ] Background sync
- [ ] Real-time updates

---

## Troubleshooting

### Common Issues

**Issue**: TypeScript errors after type changes  
**Fix**: Restart TS server in VSCode (Ctrl+Shift+P → "Restart TS Server")

**Issue**: 401 Unauthorized  
**Fix**: Check JWT token in localStorage, re-login if expired

**Issue**: CORS errors  
**Fix**: Backend needs `cors` middleware (already configured)

**Issue**: React Query not refetching  
**Fix**: Check `staleTime` and `cacheTime` in queryClient config

**Issue**: Component not updating after mutation  
**Fix**: Add `invalidateQueries` in `onSuccess` callback

---

## Resources

### Documentation
- Backend API Docs: `SamplePOS.Server/docs/STEP_11_API_TESTING_GUIDE.md`
- Postman Collection: `SamplePOS.Server/postman/`
- Backend Error Analysis: `SamplePOS.Server/docs/ERROR_ANALYSIS_REPORT.md`

### External Docs
- React Query: https://tanstack.com/query/latest
- Axios: https://axios-http.com/docs/intro
- TypeScript: https://www.typescriptlang.org/docs/

---

## Next Action

**Start with Day 1: Fix Types** (2-3 hours)

1. Create feature branch
2. Update `src/types/index.ts`
3. Create `src/types/backend.ts`
4. Fix component type errors
5. Test build

**Command to begin**:
```bash
cd c:\Users\Chase\source\repos\SamplePOS\samplepos.client
git checkout -b feature/backend-integration
code src/types/index.ts
```

---

**Document Created**: October 18, 2025  
**Status**: Ready to implement  
**Estimated Completion**: 2-3 weeks  
**Next Step**: Fix type definitions
