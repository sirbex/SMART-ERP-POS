# Quick Reference Guide - Shared Utilities & Types

**Quick access guide for new shared utilities and centralized types created in Phases 6 & 7**

---

## Import Paths

```typescript
// Centralized Types
import { Customer, Transaction, Product, Supplier } from '@/types';

// Error Handling
import { parseApiError, handleApiError, createErrorToast } from '@/utils/apiErrorHandler';

// Data Transformations
import { transformCustomer, transformProduct, transformSale } from '@/utils/dataTransformers';

// Pagination
import { buildPaginationQuery, usePaginationState } from '@/utils/paginationHelper';

// Validation
import { validateFields, validationRules } from '@/utils/validationUtils';
```

---

## Error Handling (`apiErrorHandler.ts`)

### Basic Usage
```typescript
import { handleApiError } from '@/utils/apiErrorHandler';

try {
  const response = await api.post('/customers', customerData);
} catch (error) {
  handleApiError(error, 'Create Customer');
  // Automatically logs error and shows toast notification
}
```

### Custom Error Handling
```typescript
import { parseApiError, isAuthError, createErrorToast } from '@/utils/apiErrorHandler';

try {
  const response = await api.get('/products');
} catch (error) {
  const apiError = parseApiError(error);
  
  if (isAuthError(apiError)) {
    // Redirect to login
    router.push('/login');
  } else {
    // Show error toast
    toast(createErrorToast(apiError));
  }
}
```

### Validation Error Extraction
```typescript
import { parseApiError, extractValidationErrors } from '@/utils/apiErrorHandler';

try {
  await api.post('/customers', formData);
} catch (error) {
  const apiError = parseApiError(error);
  const fieldErrors = extractValidationErrors(apiError);
  
  // fieldErrors = { email: 'Invalid email', phone: 'Required' }
  setFormErrors(fieldErrors);
}
```

---

## Data Transformations (`dataTransformers.ts`)

### Backend → Frontend
```typescript
import { transformCustomer, transformProduct, transformSale } from '@/utils/dataTransformers';

// Transform single item
const response = await api.get('/customers/1');
const customer = transformCustomer(response.data);

// Transform array
const response = await api.get('/products');
const products = response.data.map(transformProduct);
```

### Frontend → Backend
```typescript
import { toBackendCustomer, toBackendProduct } from '@/utils/dataTransformers';

const frontendCustomer = {
  name: 'John Doe',
  phone: '1234567890',
  creditLimit: 5000
};

const backendData = toBackendCustomer(frontendCustomer);
await api.post('/customers', backendData);
```

### Paginated Response
```typescript
import { transformPaginatedResponse, transformProduct } from '@/utils/dataTransformers';

const response = await api.get('/products?page=1&limit=20');
const result = transformPaginatedResponse(response, transformProduct);

// result = {
//   data: Product[],
//   pagination: { total, page, limit, totalPages, hasNext, hasPrev }
// }
```

### Utility Functions
```typescript
import { 
  formatDateForDisplay, 
  normalizePhone,
  toNumber,
  toBoolean 
} from '@/utils/dataTransformers';

const displayDate = formatDateForDisplay('2024-01-15T10:30:00Z'); // "Jan 15, 2024"
const cleanPhone = normalizePhone('(123) 456-7890'); // "1234567890"
const price = toNumber('$12.99', 0); // 12.99
const isActive = toBoolean('true'); // true
```

---

## Pagination (`paginationHelper.ts`)

### Using React Hook
```typescript
import { usePaginationState } from '@/utils/paginationHelper';

function ProductList() {
  const {
    params,
    goToPage,
    goToNextPage,
    goToPrevPage,
    setSearch,
    setLimit
  } = usePaginationState({ limit: 20 });
  
  // Fetch data with pagination
  const query = buildPaginationQuery(params);
  const { data } = useQuery(['products', params], () => 
    api.get(`/products${query}`)
  );
  
  return (
    <>
      <input onChange={(e) => setSearch(e.target.value)} />
      <button onClick={goToPrevPage}>Previous</button>
      <button onClick={goToNextPage}>Next</button>
    </>
  );
}
```

### Building Query Strings
```typescript
import { buildPaginationQuery } from '@/utils/paginationHelper';

const query = buildPaginationQuery({
  page: 2,
  limit: 20,
  search: 'apple',
  sortBy: 'name',
  sortOrder: 'asc',
  filters: { category: 'fruits' }
});

// Result: "?page=2&limit=20&search=apple&sortBy=name&sortOrder=asc&category=fruits"
const response = await api.get(`/products${query}`);
```

### Display Pagination Info
```typescript
import { getPaginationInfoText, calculatePageNumbers } from '@/utils/paginationHelper';

const metadata = {
  total: 100,
  page: 2,
  limit: 20,
  totalPages: 5,
  hasNext: true,
  hasPrev: true
};

const infoText = getPaginationInfoText(metadata);
// Result: "Showing 21-40 of 100"

const pageNumbers = calculatePageNumbers(metadata.page, metadata.totalPages, 5);
// Result: [1, 2, 3, 4, 5]
```

### Client-Side Pagination
```typescript
import { paginateArray } from '@/utils/paginationHelper';

const allItems = [...]; // Large array
const result = paginateArray(allItems, 2, 20);

// result = {
//   data: items for page 2 (items 21-40),
//   pagination: { total, page, limit, totalPages, hasNext, hasPrev }
// }
```

---

## Validation (`validationUtils.ts`)

### Form Validation
```typescript
import { validateFields, validationRules } from '@/utils/validationUtils';

const formData = {
  name: 'John Doe',
  email: 'john@example.com',
  phone: '1234567890',
  price: 99.99
};

const rules = {
  name: validationRules.customerName,
  email: validationRules.email,
  phone: validationRules.customerPhone,
  price: validationRules.productPrice
};

const result = validateFields(formData, rules);

if (!result.isValid) {
  console.log(result.errors);
  // { email: 'Invalid email address', phone: 'Invalid phone number' }
}
```

### Custom Validation Rules
```typescript
import { 
  required, 
  minLength, 
  maxLength, 
  email,
  composeValidators 
} from '@/utils/validationUtils';

// Single rule
const nameRule = required('Name is required');

// Multiple rules (composed)
const passwordRule = composeValidators(
  required('Password is required'),
  minLength(8, 'Password must be at least 8 characters'),
  maxLength(100, 'Password is too long')
);

// Use in validation
const rules = {
  name: nameRule,
  password: passwordRule,
  email: [required(), email()]
};
```

### Input Sanitization
```typescript
import { 
  sanitizeString, 
  sanitizePhone, 
  sanitizeEmail,
  sanitizeCurrency 
} from '@/utils/validationUtils';

const cleanName = sanitizeString('  John   Doe  '); // "John Doe"
const cleanPhone = sanitizePhone('(123) 456-7890'); // "1234567890"
const cleanEmail = sanitizeEmail('  JOHN@EXAMPLE.COM  '); // "john@example.com"
const price = sanitizeCurrency('$1,234.56'); // 1234.56
```

### Formatting
```typescript
import { formatCurrency, formatPhone } from '@/utils/validationUtils';

const formattedPrice = formatCurrency(1234.56); // "$1,234.56"
const formattedPhone = formatPhone('1234567890'); // "(123) 456-7890"
```

### Specialized Validators
```typescript
import { 
  validateCreditCard, 
  validateBarcode, 
  validateSKU,
  isNumeric,
  isEmpty 
} from '@/utils/validationUtils';

const validCard = validateCreditCard('4532015112830366'); // true (Luhn check)
const validBarcode = validateBarcode('1234567890123'); // true (EAN-13)
const validSKU = validateSKU('PROD-ABC-123'); // true
const isNum = isNumeric('123.45'); // true
const empty = isEmpty(''); // true
```

---

## Centralized Types (`types/index.ts`)

### Basic Usage
```typescript
import { Customer, Product, Transaction, Supplier } from '@/types';

const customer: Customer = {
  id: 1,
  name: 'John Doe',
  phone: '1234567890',
  balance: 0
};

const product: Product = {
  id: 1,
  name: 'Apple',
  price: 1.99,
  quantity: 100
};
```

### With Pagination
```typescript
import { PaginatedResponse, Customer } from '@/types';

const response: PaginatedResponse<Customer> = {
  data: customers,
  pagination: {
    total: 100,
    page: 1,
    limit: 20,
    totalPages: 5,
    hasNext: true,
    hasPrev: false
  }
};
```

### Type Guards
```typescript
import { isCustomer, isProduct, isTransaction } from '@/types';

function processData(data: unknown) {
  if (isCustomer(data)) {
    console.log('Customer:', data.name);
  } else if (isProduct(data)) {
    console.log('Product:', data.name, data.price);
  } else if (isTransaction(data)) {
    console.log('Transaction:', data.total);
  }
}
```

### Utility Types
```typescript
import { PartialExcept, RequiredExcept, ApiResponse } from '@/types';

// Make all optional except 'id' and 'name'
type UpdateCustomer = PartialExcept<Customer, 'id' | 'name'>;

// Make all required except 'metadata'
type CreateProduct = RequiredExcept<Product, 'metadata'>;

// API response wrapper
const response: ApiResponse<Customer> = {
  success: true,
  data: customer,
  message: 'Customer created successfully'
};
```

---

## Complete Example: Create Customer Form

```typescript
import { useState } from 'react';
import { Customer } from '@/types';
import { handleApiError } from '@/utils/apiErrorHandler';
import { toBackendCustomer } from '@/utils/dataTransformers';
import { validateFields, validationRules, sanitizeString } from '@/utils/validationUtils';
import api from '@/config/api.config';

function CreateCustomerForm() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    creditLimit: 0
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate
    const rules = {
      name: validationRules.customerName,
      email: validationRules.customerEmail,
      phone: validationRules.customerPhone
    };
    
    const validation = validateFields(formData, rules);
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }
    
    // Sanitize
    const sanitized = {
      ...formData,
      name: sanitizeString(formData.name),
      email: sanitizeEmail(formData.email),
      phone: sanitizePhone(formData.phone)
    };
    
    // Transform to backend format
    const backendData = toBackendCustomer(sanitized);
    
    try {
      const response = await api.post('/customers', backendData);
      const customer = transformCustomer(response.data);
      console.log('Created customer:', customer);
      // Success!
    } catch (error) {
      handleApiError(error, 'Create Customer');
    }
  };
  
  return (
    <form onSubmit={handleSubmit}>
      {/* Form fields */}
    </form>
  );
}
```

---

## Complete Example: Paginated Product List

```typescript
import { useState } from 'react';
import { Product, PaginatedResponse } from '@/types';
import { usePaginationState, buildPaginationQuery, getPaginationInfoText } from '@/utils/paginationHelper';
import { transformPaginatedResponse, transformProduct } from '@/utils/dataTransformers';
import { handleApiError } from '@/utils/apiErrorHandler';
import { useQuery } from '@tanstack/react-query';
import api from '@/config/api.config';

function ProductList() {
  const {
    params,
    goToPage,
    goToNextPage,
    goToPrevPage,
    setSearch
  } = usePaginationState({ limit: 20 });
  
  const { data, isLoading } = useQuery(
    ['products', params],
    async () => {
      const query = buildPaginationQuery(params);
      const response = await api.get(`/products${query}`);
      return transformPaginatedResponse(response, transformProduct);
    },
    {
      onError: (error) => {
        handleApiError(error, 'Fetch Products');
      }
    }
  );
  
  if (isLoading) return <div>Loading...</div>;
  if (!data) return <div>No data</div>;
  
  return (
    <div>
      <input 
        type="text"
        placeholder="Search products..."
        onChange={(e) => setSearch(e.target.value)}
      />
      
      <div>{getPaginationInfoText(data.pagination)}</div>
      
      <table>
        <tbody>
          {data.data.map((product: Product) => (
            <tr key={product.id}>
              <td>{product.name}</td>
              <td>${product.price}</td>
              <td>{product.quantity}</td>
            </tr>
          ))}
        </tbody>
      </table>
      
      <div>
        <button onClick={goToPrevPage} disabled={!data.pagination.hasPrev}>
          Previous
        </button>
        <button onClick={goToNextPage} disabled={!data.pagination.hasNext}>
          Next
        </button>
      </div>
    </div>
  );
}
```

---

## Migration Checklist

### For Each Component/Service

- [ ] Replace local type definitions with imports from `@/types`
- [ ] Use `handleApiError` for error handling in API calls
- [ ] Use `transformX` functions for backend → frontend data
- [ ] Use `toBackendX` functions for frontend → backend data
- [ ] Use `usePaginationState` for list views with pagination
- [ ] Use `validateFields` for form validation
- [ ] Use sanitization functions before submitting data
- [ ] Remove duplicate error handling code
- [ ] Remove duplicate validation logic
- [ ] Remove inline data transformation code

### Testing

- [ ] Verify TypeScript compilation (no type errors)
- [ ] Test API error handling (401, 403, 400, 500, network errors)
- [ ] Test data transformations (backend ↔ frontend)
- [ ] Test pagination (navigation, search, filters)
- [ ] Test form validation (required fields, formats, ranges)
- [ ] Test input sanitization (trim, normalize, clean)

---

## Common Patterns

### API Call with Error Handling
```typescript
import { handleApiError } from '@/utils/apiErrorHandler';

try {
  const response = await api.get('/endpoint');
  return response.data;
} catch (error) {
  handleApiError(error, 'Operation Name');
  throw error; // Re-throw if needed
}
```

### Transform Backend Data
```typescript
import { transformCustomer } from '@/utils/dataTransformers';

const response = await api.get('/customers');
const customers = response.data.map(transformCustomer);
```

### Validate Form
```typescript
import { validateFields, validationRules } from '@/utils/validationUtils';

const result = validateFields(formData, {
  name: validationRules.customerName,
  email: validationRules.email
});

if (!result.isValid) {
  setErrors(result.errors);
  return;
}
```

### Paginated List
```typescript
import { usePaginationState, buildPaginationQuery } from '@/utils/paginationHelper';

const { params, goToPage } = usePaginationState();
const query = buildPaginationQuery(params);
const response = await api.get(`/endpoint${query}`);
```

---

## Support

For questions or issues with the new utilities:
1. Check this quick reference guide
2. Review comprehensive documentation:
   - `docs/REFACTORING_COMPLETION_REPORT.md`
   - `docs/TYPE_CONSOLIDATION_SUMMARY.md`
3. Check source files for JSDoc comments
4. Refer to example usage in this guide

---

*Last Updated: December 2024*  
*Phases 6 & 7 Complete*
