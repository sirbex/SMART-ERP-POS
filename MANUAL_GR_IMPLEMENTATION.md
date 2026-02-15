# Manual Goods Receipts Implementation

## Overview
Implemented full manual Goods Receipt (GR) creation flow allowing users to receive inventory without linking to a Purchase Order. Includes product search, inline validation, cost variance indicators, and batch/expiry tracking.

## Features Implemented

### Backend (Node.js + TypeScript + PostgreSQL)
1. **Repository Layer** (`goodsReceiptRepository.ts`)
   - Made `purchaseOrderId` optional (nullable) to support manual GRs
   - Made `poItemId` optional in items for manual entries
   - Updated `createGR` to handle null PO IDs
   - Changed JOINs to LEFT JOINs for PO/supplier data

2. **Service Layer** (`goodsReceiptService.ts`)
   - Updated `createGR` to accept `source: 'MANUAL' | 'PURCHASE_ORDER'`
   - Skip PO validation when creating manual GRs
   - Support items without `poItemId`

3. **Routes & Validation** (`goodsReceiptRoutes.ts`)
   - Updated Zod schemas:
     - `poItemId`: optional/nullable
     - `purchaseOrderId`: optional/nullable
     - Added `source` field
     - Changed `orderedQuantity` from `positive()` to `nonnegative()`

### Frontend (React + TypeScript + TailwindCSS)

1. **ManualGRButton Component**
   - Opens modal on click
   - Styled to match existing UI patterns

2. **ManualGRModal Component**
   - **Product Search**: Real-time search with dropdown results
   - **Item Management**: Add/edit/remove products
   - **Inline Validation**:
     - Quantity must be > 0
     - Unit cost must be ≥ 0
     - Expiry date cannot be in the past
   - **Cost Variance Indicators**:
     - Uses Decimal.js for precision
     - Color-coded: red (increase), green (decrease)
     - Shows percentage change
   - **Batch & Expiry**: Optional fields per item
   - **Save as Draft**: Creates GR with `source: 'MANUAL'`

3. **API Integration**
   - Added `hydrateFromPO` endpoint to API client
   - Reused existing `useCreateGoodsReceipt` hook

4. **Goods Receipts Page Integration**
   - Added Manual GR button next to "Create from PO"
   - Maintains consistent toolbar layout

## Business Rules Enforced
- **BR-INV-002**: Positive quantity validation
- **BR-PO-003**: Non-negative unit cost
- **BR-INV-003**: Future expiry date (when provided)
- Items without PO link have `orderedQuantity = receivedQuantity`

## API Endpoints

### Create Manual GR
```http
POST /api/goods-receipts
Authorization: Bearer <token>
Content-Type: application/json

{
  "purchaseOrderId": null,
  "receiptDate": "2025-11-01T10:00:00.000Z",
  "receivedBy": "<user-uuid>",
  "notes": "Manual receipt",
  "source": "MANUAL",
  "items": [
    {
      "poItemId": null,
      "productId": "<product-uuid>",
      "productName": "Product Name",
      "orderedQuantity": 10,
      "receivedQuantity": 10,
      "unitCost": 500,
      "batchNumber": "BATCH-001",
      "expiryDate": "2026-12-31"
    }
  ]
}
```

### Hydrate GR from PO (for header-only DRAFTs)
```http
POST /api/goods-receipts/:id/hydrate-from-po
Authorization: Bearer <token>
```

## Usage Flow

1. User clicks "Create GR Manually" button
2. Modal opens with product search
3. User searches and adds products
4. For each item:
   - Edit received quantity
   - Adjust unit cost (variance calculated automatically)
   - Optional: add batch number
   - Optional: set expiry date
5. System validates:
   - Quantity > 0
   - Cost ≥ 0
   - Expiry date in future (if provided)
6. Click "Save as Draft" → creates DRAFT GR with `source: MANUAL`
7. GR appears in list, can be edited/finalized like PO-based GRs

## Finalization
Manual GRs finalize the same way as PO-based GRs:
- Creates inventory batches
- Records stock movements (`RECEIVE`)
- Creates cost layers (FIFO/AVCO)
- Updates product pricing (if auto-update enabled)
- Generates cost price change alerts

## Files Changed

### Backend
- `SamplePOS.Server/src/modules/goods-receipts/goodsReceiptRepository.ts`
- `SamplePOS.Server/src/modules/goods-receipts/goodsReceiptService.ts`
- `SamplePOS.Server/src/modules/goods-receipts/goodsReceiptRoutes.ts`

### Frontend
- `samplepos.client/src/components/inventory/ManualGRButton.tsx` (new)
- `samplepos.client/src/components/inventory/ManualGRModal.tsx` (new)
- `samplepos.client/src/pages/inventory/GoodsReceiptsPage.tsx`
- `samplepos.client/src/utils/api.ts`

## Testing

### Manual Test Steps
1. Start backend: `cd SamplePOS.Server && npm run dev`
2. Start frontend: `cd samplepos.client && npm run dev`
3. Login as ADMIN or MANAGER
4. Navigate to Inventory → Goods Receipts
5. Click "Create GR Manually"
6. Search for a product (e.g., "Paracetamol")
7. Add product, edit qty/cost/expiry
8. Verify cost variance shows correctly
9. Save as Draft
10. Verify GR appears in list with status DRAFT
11. Open GR detail → finalize
12. Verify batches/stock movements created

### Edge Cases Handled
- Empty product search results
- Duplicate product addition prevented
- Expiry date in the past → validation error
- Zero or negative quantity → validation error
- Negative cost → validation error
- Missing required user from localStorage → handled by API

## Future Enhancements
- Product barcode scanning
- Bulk import from CSV
- Print goods receipt label
- Photo attachment for delivery notes
- Signature capture for receiving
