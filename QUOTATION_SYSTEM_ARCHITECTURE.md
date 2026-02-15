# Quotation System Architecture

**Status**: ✅ Implemented | **Date**: February 2026 | **Integration**: Hybrid with Existing Invoice System

---

## Overview

The Quotation System provides a complete quote-to-sale-to-invoice workflow that integrates seamlessly with the existing invoice system without modifying core business logic. It supports two entry points (direct POS sales vs quote-first workflow) that converge at the invoice stage.

## Architecture Principles

### 1. **Hybrid Integration (Non-Destructive)**
- Existing invoice system **NOT MODIFIED** - only extended
- New `quote_id` columns added to `sales` and `invoices` tables
- All existing business rules preserved (BR-INV-001 through BR-INV-005)
- Backward compatibility: Sales without quotes work exactly as before

### 2. **Two Entry Points, One Invoice System**
```
Path A: Direct Sale (Existing)
  └─> Sale (COMPLETED) ─> Invoice (if CREDIT) ─> Payments

Path B: Quote-First (New)
  └─> Quote (DRAFT → SENT → ACCEPTED) ─> Sale (COMPLETED) ─> Invoice (if CREDIT) ─> Payments
```

Both paths converge at the **Sale** stage, then follow identical invoice/payment logic.

### 3. **Quote Types**
- **`quick`**: Simple POS quotes (minimal fields, 30-day default validity)
- **`standard`**: Detailed quotes (terms, attachments, approval workflow)

---

## Database Schema

### Quotations Table
```sql
CREATE TABLE quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number VARCHAR(50) UNIQUE NOT NULL,        -- Q-YYYY-####
  quote_type quote_type NOT NULL,                  -- 'quick' | 'standard'
  
  -- Customer Info
  customer_id UUID REFERENCES customers(id),       -- Optional FK
  customer_name VARCHAR(255),                      -- Walk-in customers
  customer_phone VARCHAR(20),
  customer_email VARCHAR(255),
  
  -- Quote Details
  reference VARCHAR(100),
  description TEXT,
  subtotal NUMERIC(12,2) NOT NULL,
  discount_amount NUMERIC(12,2) DEFAULT 0,
  tax_amount NUMERIC(12,2) DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL,
  
  -- Status & Validity
  status quotation_status DEFAULT 'DRAFT',
  valid_from DATE NOT NULL,
  valid_until DATE NOT NULL,
  
  -- Conversion Tracking
  converted_to_sale_id UUID REFERENCES sales(id),
  converted_to_invoice_id UUID REFERENCES invoices(id),
  converted_at TIMESTAMPTZ,
  
  -- Workflow
  created_by_id UUID REFERENCES users(id),
  assigned_to_id UUID REFERENCES users(id),
  terms_and_conditions TEXT,
  payment_terms TEXT,
  delivery_terms TEXT,
  internal_notes TEXT,
  rejection_reason TEXT,
  
  -- Approval
  requires_approval BOOLEAN DEFAULT false,
  approved_by_id UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  
  -- Revisions
  parent_quote_id UUID REFERENCES quotations(id),
  revision_number INTEGER DEFAULT 1,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Quotation Items Table
```sql
CREATE TABLE quotation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL,
  
  -- Item Details
  product_id UUID REFERENCES products(id),
  item_type quote_item_type NOT NULL,              -- 'product' | 'service' | 'custom'
  sku VARCHAR(100),
  description VARCHAR(500) NOT NULL,
  notes TEXT,
  
  -- Pricing
  quantity NUMERIC(12,3) NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL,
  discount_amount NUMERIC(12,2) DEFAULT 0,
  subtotal NUMERIC(12,2) NOT NULL,
  
  -- Tax
  is_taxable BOOLEAN DEFAULT true,
  tax_rate NUMERIC(5,2) DEFAULT 0,
  tax_amount NUMERIC(12,2) DEFAULT 0,
  line_total NUMERIC(12,2) NOT NULL,
  
  -- UOM
  uom_id UUID,
  uom_name VARCHAR(50),
  
  -- Cost Tracking
  unit_cost NUMERIC(12,2),
  cost_total NUMERIC(12,2),
  
  product_type VARCHAR(50) DEFAULT 'inventory',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Enhanced Existing Tables
```sql
-- Non-destructive addition to sales table
ALTER TABLE sales ADD COLUMN quote_id UUID REFERENCES quotations(id);

-- Non-destructive addition to invoices table
ALTER TABLE invoices ADD COLUMN quote_id UUID REFERENCES quotations(id);
```

### Enums
```sql
CREATE TYPE quotation_status AS ENUM (
  'DRAFT',           -- Initial state, editable
  'SENT',            -- Sent to customer
  'ACCEPTED',        -- Customer approved
  'REJECTED',        -- Customer declined
  'EXPIRED',         -- Past valid_until date
  'CONVERTED',       -- Converted to sale
  'CANCELLED'        -- Manually cancelled
);

CREATE TYPE quote_type AS ENUM ('quick', 'standard');
CREATE TYPE quote_item_type AS ENUM ('product', 'service', 'custom');
```

---

## Business Rules

### Quote Business Rules

#### BR-QUOTE-001: Single Conversion
**Rule**: A quote can only be converted to a sale once.  
**Enforcement**: Check `converted_to_sale_id IS NULL` before conversion.  
**Rationale**: Prevents duplicate sales from same quote.

#### BR-QUOTE-002: Expiry Check
**Rule**: Expired quotes cannot be converted (unless renewed).  
**Enforcement**: Check `valid_until >= CURRENT_DATE` before conversion.  
**Rationale**: Customer must reconfirm pricing on expired quotes.

#### BR-QUOTE-003: Atomic Conversion
**Rule**: Converting quote creates sale + invoice in single transaction.  
**Enforcement**: BEGIN TRANSACTION → create sale → create invoice → mark converted → COMMIT.  
**Rationale**: Ensures data consistency if any step fails.

#### BR-QUOTE-004: Exact Item Copy
**Rule**: Quote items copied exactly to sale items (no modifications).  
**Enforcement**: Map quotation_items → sale_items with same quantities/prices.  
**Rationale**: What customer approved must match what they get.

#### BR-QUOTE-005: Total Match
**Rule**: Quote total must equal sale total.  
**Enforcement**: Verify `quote.total_amount = sale.total_amount` in conversion.  
**Rationale**: Financial integrity check.

#### BR-QUOTE-006: Universal Conversion Rules
**Rule**: Both quick and standard quotes follow same conversion rules.  
**Enforcement**: No special cases in conversion logic based on `quote_type`.  
**Rationale**: Consistent behavior regardless of quote origin.

### Existing Invoice Rules (Preserved)

#### BR-INV-001: No Overpayment
**Status**: ✅ Preserved  
**Impact**: Quote conversion respects deposit limits.

#### BR-INV-002: Sale-Invoice Sync
**Status**: ✅ Preserved  
**Impact**: Quote-originated sales follow same sync rules.

#### BR-INV-003: Customer Balance
**Status**: ✅ Preserved  
**Impact**: Quote deposits update customer balances correctly.

#### BR-INV-004: One Invoice Per Sale
**Status**: ✅ Preserved  
**Impact**: Quote-originated sales get one invoice.

#### BR-INV-005: CREDIT Sales Only
**Status**: ✅ Preserved  
**Impact**: Full-payment quotes don't create invoices.

---

## API Endpoints

### Standard Quotations

#### Create Standard Quotation
```http
POST /api/quotations
Authorization: Bearer <token>

{
  "customerId": "uuid",              // Optional (OR customerName required)
  "customerName": "John Doe",        // Optional (OR customerId required)
  "customerPhone": "0700123456",
  "customerEmail": "john@example.com",
  "reference": "PROJECT-2025-001",
  "description": "Construction materials quote",
  "validFrom": "2025-01-15",
  "validUntil": "2025-02-14",
  "termsAndConditions": "50% deposit...",
  "paymentTerms": "Net 30 days",
  "deliveryTerms": "FOB Warehouse",
  "internalNotes": "VIP customer",
  "requiresApproval": false,
  "items": [
    {
      "itemType": "product",
      "productId": "uuid",             // Optional
      "sku": "CEMENT-50KG",
      "description": "Portland Cement 50kg",
      "quantity": 100,
      "unitPrice": 35000,
      "discountAmount": 0,
      "isTaxable": true,
      "taxRate": 18,
      "uomId": "uuid",
      "uomName": "Bag",
      "unitCost": 30000,
      "productType": "inventory"
    },
    {
      "itemType": "service",
      "description": "Delivery service",
      "quantity": 1,
      "unitPrice": 150000,
      "isTaxable": true,
      "taxRate": 18
    }
  ]
}

Response:
{
  "success": true,
  "data": {
    "quotation": { ... },
    "items": [ ... ]
  },
  "message": "Quotation Q-2025-0001 created successfully"
}
```

#### List Quotations
```http
GET /api/quotations?page=1&limit=20&status=SENT&customerId=uuid&quoteType=standard
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "quotations": [ ... ],
    "total": 45,
    "page": 1,
    "limit": 20,
    "totalPages": 3
  }
}
```

#### Get Quotation Details
```http
GET /api/quotations/:id
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "quotation": { ... },
    "items": [ ... ]
  }
}
```

#### Update Quotation Status
```http
PUT /api/quotations/:id/status
Authorization: Bearer <token>

{
  "status": "ACCEPTED",
  "notes": "Customer confirmed order"
}
```

#### Convert Quotation to Sale
```http
POST /api/quotations/:id/convert
Authorization: Bearer <token>

{
  "paymentOption": "partial",        // 'full' | 'partial' | 'none'
  "depositAmount": 2000000,          // Required if paymentOption = 'partial'
  "depositMethod": "CARD",           // Required if depositAmount provided
  "notes": "50% deposit received"
}

Response:
{
  "success": true,
  "data": {
    "sale": { ... },
    "invoice": { ... },
    "payment": { ... }               // Only if depositAmount provided
  },
  "message": "Quotation converted to sale successfully"
}
```

#### Delete Quotation
```http
DELETE /api/quotations/:id
Authorization: Bearer <token>

Note: Only DRAFT quotations can be deleted
```

### POS Quick Quotes

#### Create Quick Quote
```http
POST /api/pos/quote
Authorization: Bearer <token>

{
  "customerId": "uuid",              // Optional
  "customerName": "Walk-in Customer",
  "customerPhone": "0700123456",
  "items": [
    {
      "itemType": "product",
      "sku": "PROD-001",
      "description": "Product A",
      "quantity": 5,
      "unitPrice": 10000,
      "isTaxable": true,
      "taxRate": 18,
      "unitCost": 7000
    }
  ]
}

Note: Quick quotes automatically get:
- quote_type = 'quick'
- validFrom = today
- validUntil = today + 30 days
- Default description
```

---

## Conversion Workflow

### Full Payment Conversion
```typescript
Quote (ACCEPTED) → Sale (COMPLETED, CASH/CARD) → Receipt
                    ↳ No Invoice (payment complete)
```

**Steps**:
1. Verify quote is ACCEPTED/SENT
2. Check not expired
3. Create sale with `payment_method = CASH/CARD`
4. Create sale items from quote items
5. Mark quote as CONVERTED
6. Return sale (no invoice created per BR-INV-005)

### Partial Payment Conversion
```typescript
Quote (ACCEPTED) → Sale (COMPLETED, CREDIT) → Invoice (PARTIALLY_PAID) → Payment Record
                                               ↳ Balance due tracked
```

**Steps**:
1. Verify quote is ACCEPTED/SENT
2. Check not expired
3. Create sale with `payment_method = CREDIT`
4. Create sale items from quote items
5. Create invoice linked to sale + quote
6. Create invoice_payment for deposit
7. Update invoice: `status = PARTIALLY_PAID`, `balance = total - deposit`
8. Mark quote as CONVERTED
9. Return sale + invoice + payment

### No Payment Conversion (Credit Sale)
```typescript
Quote (ACCEPTED) → Sale (COMPLETED, CREDIT) → Invoice (UNPAID)
                                               ↳ Full balance due
```

**Steps**:
1. Verify quote is ACCEPTED/SENT
2. Check not expired
3. Create sale with `payment_method = CREDIT`
4. Create sale items from quote items
5. Create invoice with `status = UNPAID`, `balance = total_amount`
6. Mark quote as CONVERTED
7. Return sale + invoice

---

## Reporting Views

### Quote Conversion Metrics
```sql
CREATE VIEW v_quote_conversion_metrics AS
SELECT 
  DATE_TRUNC('month', q.created_at) as month,
  q.quote_type,
  COUNT(*) as total_quotes,
  COUNT(q.converted_to_sale_id) as converted_quotes,
  ROUND((COUNT(q.converted_to_sale_id)::NUMERIC / NULLIF(COUNT(*), 0)) * 100, 2) as conversion_rate,
  SUM(q.total_amount) as total_quoted_value,
  SUM(CASE WHEN q.converted_to_sale_id IS NOT NULL 
           THEN q.total_amount ELSE 0 END) as converted_value
FROM quotations q
GROUP BY DATE_TRUNC('month', q.created_at), q.quote_type;
```

### Quote Aging Report
```sql
CREATE VIEW v_quote_aging AS
SELECT 
  q.id,
  q.quote_number,
  q.status,
  q.valid_until,
  CURRENT_DATE - q.valid_until as days_expired,
  CASE 
    WHEN q.status = 'CONVERTED' THEN 'Converted'
    WHEN q.status = 'CANCELLED' THEN 'Cancelled'
    WHEN q.valid_until < CURRENT_DATE THEN 'Expired'
    WHEN q.valid_until - CURRENT_DATE <= 7 THEN 'Expiring Soon'
    ELSE 'Active'
  END as aging_status,
  q.total_amount
FROM quotations q;
```

### Quote Payment Timeline
```sql
CREATE VIEW v_quote_payment_timeline AS
SELECT 
  q.quote_number,
  q.created_at as quote_date,
  q.converted_at as sale_date,
  MIN(ip.payment_date) as first_payment_date,
  MAX(ip.payment_date) as last_payment_date,
  EXTRACT(DAY FROM q.converted_at - q.created_at) as quote_to_sale_days,
  EXTRACT(DAY FROM MIN(ip.payment_date) - q.converted_at) as sale_to_first_payment_days
FROM quotations q
LEFT JOIN invoices i ON i.quote_id = q.id
LEFT JOIN invoice_payments ip ON ip.invoice_id = i.id
WHERE q.converted_to_sale_id IS NOT NULL
GROUP BY q.id;
```

---

## Frontend Integration (Planned)

### Shared Types (TypeScript)
```typescript
// shared/types/quotation.ts
export interface Quotation {
  id: string;
  quoteNumber: string;
  quoteType: 'quick' | 'standard';
  customerId: string | null;
  customerName: string | null;
  totalAmount: number;
  status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'CONVERTED' | 'CANCELLED';
  validFrom: string;
  validUntil: string;
  convertedToSaleId: string | null;
  convertedToInvoiceId: string | null;
  // ... other fields
}

export interface QuotationItem {
  id: string;
  lineNumber: number;
  itemType: 'product' | 'service' | 'custom';
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  // ... other fields
}
```

### API Client
```typescript
// samplepos.client/src/api/quotations.ts
export const quotationApi = {
  create: (data: CreateQuotationInput) => 
    apiClient.post('/quotations', data),
  
  list: (filters: QuotationFilters) => 
    apiClient.get('/quotations', { params: filters }),
  
  getById: (id: string) => 
    apiClient.get(`/quotations/${id}`),
  
  convert: (id: string, data: ConvertQuotationInput) => 
    apiClient.post(`/quotations/${id}/convert`, data),
  
  createQuickQuote: (data: CreateQuickQuoteInput) => 
    apiClient.post('/pos/quote', data),
};
```

### POS Integration Points

1. **Save as Quote Button**: Add to POS screen next to "Pay Now"
2. **Load Quote Button**: Load quote items into cart
3. **Quick Quote Flow**: Simplified quote creation from cart
4. **Convert Quote**: Load quote → optionally edit → pay/partial pay/credit

---

## Migration Strategy

### Phase 1: Backend (✅ Complete)
- [x] Database migration (004_create_quotations_system.sql)
- [x] Zod validation schemas
- [x] Repository layer (quotationRepository.ts)
- [x] Service layer (quotationService.ts)
- [x] Controller & routes (quotationController.ts, quotationRoutes.ts)
- [x] Enhance sales/invoice repositories for quote_id
- [x] Testing script (test-quotations.ps1)

### Phase 2: Frontend (Pending)
- [ ] Create TypeScript types
- [ ] Build API client
- [ ] Add POS quick quote UI
- [ ] Create quote management module (list/detail/create/edit)
- [ ] Add quote conversion UI

### Phase 3: Enhancements (Future)
- [ ] Email quote to customer (PDF generation)
- [ ] Quote approval workflow
- [ ] Quote revisions (parent_quote_id usage)
- [ ] Quote attachments (site photos, specs)
- [ ] Advanced reporting dashboards

---

## Testing

### Run API Tests
```powershell
.\test-quotations.ps1
```

**Test Coverage**:
- ✅ Create standard quotation
- ✅ Create quick quote (POS)
- ✅ List quotations with filters
- ✅ Get quotation details
- ✅ Update quotation status
- ✅ Convert quote (full payment)
- ✅ Convert quote (partial payment)
- ✅ Convert quote (no payment)
- ✅ Verify invoice integration
- ✅ Verify sale integration
- ✅ Business rule enforcement (BR-QUOTE-001)

---

## Key Files

### Backend
- `shared/sql/004_create_quotations_system.sql` - Database migration
- `shared/zod/quotation.ts` - Validation schemas
- `SamplePOS.Server/src/modules/quotations/quotationRepository.ts` - Data access
- `SamplePOS.Server/src/modules/quotations/quotationService.ts` - Business logic
- `SamplePOS.Server/src/modules/quotations/quotationController.ts` - HTTP handlers
- `SamplePOS.Server/src/modules/quotations/quotationRoutes.ts` - Route definitions
- `SamplePOS.Server/src/server.ts` - Route registration
- `test-quotations.ps1` - Comprehensive API tests

### Database Changes
- `SamplePOS.Server/src/modules/sales/salesRepository.ts` - Added `quote_id` support
- `SamplePOS.Server/src/modules/invoices/invoiceRepository.ts` - Added `quote_id` + `createInvoiceFromSale()`

---

## Maintenance

### Auto-Expiry Job (Recommended)
```sql
-- Run daily via cron
SELECT expire_old_quotations();
```

### Data Cleanup
```sql
-- Delete old DRAFT quotes (>90 days)
DELETE FROM quotations 
WHERE status = 'DRAFT' 
AND created_at < NOW() - INTERVAL '90 days';
```

### Audit Trail
All quote status changes are logged in `quotation_status_history` via database trigger.

---

## Success Criteria

✅ **Architecture**: Hybrid integration without modifying existing invoice system  
✅ **Business Rules**: All 6 BR-QUOTE rules enforced + 5 BR-INV rules preserved  
✅ **Database**: Non-destructive extension (quote_id columns added)  
✅ **API**: Complete CRUD + conversion endpoints  
✅ **Testing**: 12-test suite covering full workflow  
✅ **Documentation**: Comprehensive architecture, API, and business rule docs  

---

**Next Steps**: Frontend implementation (Types → API Client → POS Integration → Quote Module)
