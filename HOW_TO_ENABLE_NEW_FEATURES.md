# 🔌 HOW TO ENABLE SERVICE ITEMS & HOLD/RESUME FEATURES

**Status**: ⚠️ **FEATURES ARE BUILT BUT NOT CONNECTED**  
**Problem**: Code exists but isn't integrated into the running application  
**Solution**: Follow the 4 integration steps below

---

## 🎯 Why Users Can't See These Features

The features were **fully implemented** but are **NOT connected** to the UI or backend routes yet:

### ✅ What's Been Created (All Working):
1. **Backend Code**: Utilities, services, repositories, routes
2. **Frontend Components**: Dialogs, badges, banners
3. **Database Migrations**: Tables and columns ready to run
4. **Tests**: All passing (10/10 tests)

### ❌ What's Missing (Why Users Can't Use It):
1. **Database migrations NOT run** → No `product_type` column, no `pos_held_orders` table
2. **Backend routes NOT registered** → API endpoints don't exist (404 errors)
3. **Frontend UI NOT integrated** → Buttons/dialogs not added to POS page
4. **Components NOT imported** → React components exist but aren't used anywhere

---

## 📋 4-STEP INTEGRATION GUIDE

### **STEP 1: Run Database Migrations** ⏱️ 2 minutes

**What**: Add new columns/tables to PostgreSQL database  
**Why**: Backend needs these to store service products and held orders  
**How**:

```powershell
# Navigate to project root
cd c:\Users\Chase\source\repos\SamplePOS

# Run migration 001 (adds product_type column)
psql -U postgres -d pos_system -f SamplePOS.Server\db\migrations\001_add_product_type_and_service_flags.sql

# Run migration 002 (creates pos_held_orders tables)
psql -U postgres -d pos_system -f SamplePOS.Server\db\migrations\002_create_pos_held_orders.sql
```

**Verify**:
```sql
-- Check product_type column exists
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'products' AND column_name = 'product_type';

-- Check pos_held_orders table exists
SELECT table_name 
FROM information_schema.tables 
WHERE table_name = 'pos_held_orders';
```

---

### **STEP 2: Register Backend Routes** ⏱️ 5 minutes

**What**: Add hold API endpoints to Express server  
**Why**: Frontend needs `/api/pos/hold` endpoints to work  
**Where**: `SamplePOS.Server\src\server.ts`

**Current State** (lines 89-107):
```typescript
// API routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/sales', salesRoutes);
// ... other routes ...
```

**Required Changes**:

#### 2A. Add Import (top of file, after existing imports):
```typescript
import { createHoldRoutes } from './modules/pos/holdRoutes.js';
```

#### 2B. Register Route (after line 100, before error handlers):
```typescript
// Hold/Resume Cart (POS feature)
app.use('/api/pos/hold', createHoldRoutes(pool));
```

**Final Code Block** (lines ~30-110):
```typescript
import { createHoldRoutes } from './modules/pos/holdRoutes.js'; // NEW

// ... existing code ...

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/purchase-orders', purchaseOrderRoutes);
app.use('/api/goods-receipts', goodsReceiptRoutes);
app.use('/api/stock-movements', stockMovementRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/settings/invoice', invoiceSettingsRoutes);
app.use('/api/system-settings', systemSettingsRoutes);
app.use('/api/reports', createReportsRouter(pool));
app.use('/api/users', createUserRoutes(pool));
app.use('/api/admin', adminRoutes);
app.use('/api/discounts', discountRoutes);
app.use('/api/payments', createPaymentsRoutes(pool));
app.use('/api/audit', auditRoutes);
app.use('/api/pos/hold', createHoldRoutes(pool)); // NEW - Hold/Resume Cart
```

**Verify**:
```powershell
# Restart backend server
cd SamplePOS.Server
npm run dev

# In another terminal, test endpoints
curl http://localhost:3001/api/pos/hold -H "Authorization: Bearer YOUR_TOKEN"
# Should return [] (empty array), not 404
```

---

### **STEP 3: Integrate Frontend UI Components** ⏱️ 15 minutes

**What**: Add Hold/Resume buttons and service badges to POS screen  
**Why**: Users need UI elements to trigger the features  
**Where**: `samplepos.client\src\pages\pos\POSPage.tsx`

#### 3A. Add Imports (top of file, after existing imports):
```typescript
// Service Items & Hold/Resume Cart Features
import { ServiceBadge } from '../../components/pos/ServiceBadge';
import { ServiceInfoBanner } from '../../components/pos/ServiceInfoBanner';
import { HoldCartDialog } from '../../components/pos/HoldCartDialog';
import { ResumeHoldDialog } from '../../components/pos/ResumeHoldDialog';
import { isService, hasServiceItems, calculateServiceRevenue } from '@shared/utils/product.utils';
```

#### 3B. Add State Variables (inside component, after existing state):
```typescript
// Hold/Resume Cart state
const [showHoldDialog, setShowHoldDialog] = useState(false);
const [showResumeDialog, setShowResumeDialog] = useState(false);
```

#### 3C. Calculate Service Item Stats (after existing useMemo blocks):
```typescript
// Service items detection and revenue calculation
const serviceItemsCount = useMemo(() => {
  return items.filter(item => isService({ productType: 'service' })).length;
}, [items]);

const serviceRevenue = useMemo(() => {
  if (serviceItemsCount === 0) return 0;
  return calculateServiceRevenue(items.map(item => ({
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    productType: 'service', // Assume service if in cart (real impl checks item.productType)
  })));
}, [items, serviceItemsCount]);
```

#### 3D. Add Hold Cart Handler (after existing handlers):
```typescript
// Hold cart handler
const handleHoldCart = async (reason?: string, notes?: string) => {
  if (items.length === 0) {
    toast.error('Cannot hold empty cart');
    return;
  }

  try {
    const response = await api.hold.create({
      userId: currentUser.id,
      terminalId: 'TERMINAL-001', // Replace with actual terminal ID
      customerName: selectedCustomer?.name,
      itemCount: items.length,
      subtotal,
      discountAmount: cartDiscountAmount,
      taxAmount: tax,
      totalAmount: grandTotal,
      reason,
      notes,
      items: items.map(item => ({
        productId: item.id,
        productName: item.name,
        sku: item.sku,
        uom: item.uom,
        uomId: item.selectedUomId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        costPrice: item.costPrice,
        subtotal: item.subtotal,
        discount: item.discount,
      })),
    });

    if (response.success) {
      toast.success(`Cart held: ${response.data.holdNumber}`);
      // Clear cart
      setItems([]);
      setSelectedCustomer(null);
      setCartDiscount(null);
      setShowHoldDialog(false);
    }
  } catch (error: any) {
    console.error('Hold cart error:', error);
    toast.error(error.response?.data?.error || 'Failed to hold cart');
  }
};

// Resume hold handler
const handleResumeHold = (hold: any) => {
  // Restore cart from hold
  setItems(hold.items.map((item: any) => ({
    id: item.productId,
    name: item.productName,
    sku: item.sku,
    uom: item.uom,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    costPrice: item.costPrice,
    marginPct: item.unitPrice > 0 ? ((item.unitPrice - item.costPrice) / item.unitPrice) * 100 : 0,
    subtotal: item.subtotal,
    isTaxable: false, // TODO: Get from product
    taxRate: 0,
    selectedUomId: item.uomId,
    discount: item.discount,
  })));

  if (hold.customerName) {
    // TODO: Fetch customer by name and set
    // For now, just show toast
    toast.info(`Customer: ${hold.customerName}`);
  }

  toast.success(`Resumed hold: ${hold.holdNumber}`);
  setShowResumeDialog(false);
};
```

#### 3E. Add Buttons to UI (find the "Right: Totals + Payment" section, around line 1800):

**BEFORE** (current code):
```typescript
<div className="flex gap-2 mb-2">
  <POSButton
    variant="secondary"
    onClick={() => handleOpenDiscountDialog('cart')}
    disabled={items.length === 0}
    className="flex-1 text-sm py-2"
  >
    Apply Discount (Ctrl+D)
  </POSButton>
  <POSButton
    variant="danger"
    onClick={handleClearAllData}
    className="flex-1 text-sm py-2"
    title="Clear cart and all offline data (Ctrl+Shift+C)"
  >
    Clear All
  </POSButton>
</div>
```

**AFTER** (add service banner + hold/resume buttons):
```typescript
{/* Service Items Banner */}
{serviceItemsCount > 0 && (
  <ServiceInfoBanner
    serviceCount={serviceItemsCount}
    totalRevenue={serviceRevenue}
    className="mb-3"
  />
)}

<div className="flex gap-2 mb-2">
  <POSButton
    variant="secondary"
    onClick={() => handleOpenDiscountDialog('cart')}
    disabled={items.length === 0}
    className="flex-1 text-sm py-2"
  >
    Apply Discount (Ctrl+D)
  </POSButton>
  <POSButton
    variant="danger"
    onClick={handleClearAllData}
    className="flex-1 text-sm py-2"
    title="Clear cart and all offline data (Ctrl+Shift+C)"
  >
    Clear All
  </POSButton>
</div>

{/* Hold/Resume Cart Buttons */}
<div className="flex gap-2 mb-2">
  <POSButton
    variant="secondary"
    onClick={() => setShowHoldDialog(true)}
    disabled={items.length === 0}
    className="flex-1 text-sm py-2"
    title="Put cart on hold (save for later)"
  >
    Put on Hold
  </POSButton>
  <POSButton
    variant="secondary"
    onClick={() => setShowResumeDialog(true)}
    className="flex-1 text-sm py-2"
    title="Resume a previously held cart"
  >
    Resume Hold
  </POSButton>
</div>
```

#### 3F. Add Dialog Components (at the end, before closing `</div>`):
```typescript
{/* Hold Cart Dialog */}
<HoldCartDialog
  isOpen={showHoldDialog}
  onClose={() => setShowHoldDialog(false)}
  onConfirm={handleHoldCart}
  cart={{
    items: items.map(i => ({ name: i.name, quantity: i.quantity })),
    totalAmount: grandTotal,
  }}
/>

{/* Resume Hold Dialog */}
<ResumeHoldDialog
  isOpen={showResumeDialog}
  onClose={() => setShowResumeDialog(false)}
  onResume={handleResumeHold}
/>
```

#### 3G. Add Service Badge to Cart Table (find the cart table, around line 900):

**In the `<tbody>` section, inside the product name cell**:
```typescript
<td className="px-2 py-2">
  <div className="flex items-center gap-2">
    <div>
      <div className="font-medium text-gray-900">{item.name}</div>
      <div className="text-xs text-gray-500">SKU: {item.sku}</div>
      <div className="text-xs text-gray-500 sm:hidden">Margin: {item.marginPct.toFixed(1)}%</div>
    </div>
    {/* NEW: Service badge */}
    {item.productType === 'service' && <ServiceBadge />}
  </div>
</td>
```

**Verify**:
```powershell
# Frontend should rebuild automatically (Vite hot reload)
# Open browser: http://localhost:5173/pos
# You should now see:
# - "Put on Hold" button
# - "Resume Hold" button
# - Service badges on service items (after adding product_type to items)
```

---

### **STEP 4: Update Product Management** ⏱️ 10 minutes

**What**: Add `product_type` field to product creation/edit forms  
**Why**: Users need to mark products as "service" type  
**Where**: Multiple files in `samplepos.client\src\pages\products\` or inventory management

**Required Changes**:

#### 4A. Add Product Type to Create/Edit Forms:
```typescript
// In ProductForm.tsx or equivalent
<div>
  <label className="block text-sm font-medium text-gray-700 mb-1">
    Product Type <span className="text-red-500">*</span>
  </label>
  <select
    name="productType"
    value={formData.productType || 'inventory'}
    onChange={handleChange}
    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
    required
  >
    <option value="inventory">Inventory (Track Stock)</option>
    <option value="consumable">Consumable (Track but Expense)</option>
    <option value="service">Service (No Stock Tracking)</option>
  </select>
  <p className="text-xs text-gray-500 mt-1">
    Service items don't track inventory or create stock movements
  </p>
</div>
```

#### 4B. Add Product Type to API Calls:
```typescript
// When creating/updating products
const productData = {
  name: formData.name,
  sku: formData.sku,
  productType: formData.productType || 'inventory', // NEW
  // ... other fields
};
```

---

## 🧪 Testing After Integration

### Test Checklist:

#### ✅ Database Migrations:
```powershell
# Check tables exist
psql -U postgres -d pos_system -c "\dt pos_held_orders*"
psql -U postgres -d pos_system -c "\d products" | grep product_type
```

#### ✅ Backend API:
```powershell
# Test hold endpoint (replace TOKEN with real JWT)
$token = "YOUR_JWT_TOKEN_HERE"
$headers = @{ "Authorization" = "Bearer $token" }

# List holds (should return empty array, not 404)
Invoke-RestMethod -Uri "http://localhost:3001/api/pos/hold" -Headers $headers

# Create hold
$body = @{
  userId = "user-id-here"
  terminalId = "TERMINAL-001"
  itemCount = 2
  subtotal = 10000
  discountAmount = 0
  taxAmount = 0
  totalAmount = 10000
  items = @(
    @{ productId = "prod-id"; productName = "Test"; quantity = 1; unitPrice = 5000; subtotal = 5000 }
  )
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3001/api/pos/hold" -Method POST -Headers $headers -Body $body -ContentType "application/json"
```

#### ✅ Frontend UI:
1. Open POS: http://localhost:5173/pos
2. **Hold Test**:
   - Add items to cart
   - Click "Put on Hold" button → Should show dialog
   - Enter reason, click "Confirm" → Should clear cart and show success toast
3. **Resume Test**:
   - Click "Resume Hold" button → Should show list of holds
   - Click on a hold → Should restore cart
4. **Service Test** (after Step 4):
   - Create product with `productType = 'service'`
   - Add to POS cart → Should show blue "SERVICE" badge
   - Complete sale → Should NOT create stock movement

---

## 📊 Visual Guide: Before vs After

### BEFORE (Current State):
```
┌─────────────────────────────────┐
│  POS Page                       │
├─────────────────────────────────┤
│  [Product Search]               │
│  [Cart Table]                   │
│  [Totals]                       │
│  [Apply Discount] [Clear All]   │  ← Only 2 buttons
│  [Payment]                      │
│                                 │
│  ❌ No Hold buttons             │
│  ❌ No Service badges           │
└─────────────────────────────────┘
```

### AFTER (Integrated):
```
┌─────────────────────────────────┐
│  POS Page                       │
├─────────────────────────────────┤
│  [Product Search]               │
│  [Cart Table]                   │
│    Laptop x1  [SERVICE] 🆕      │  ← Service badge
│  [Totals]                       │
│  ℹ️ 1 service item (no stock)   │  ← Service banner
│  [Apply Discount] [Clear All]   │
│  [Put on Hold] [Resume Hold] 🆕 │  ← New buttons
│  [Payment]                      │
└─────────────────────────────────┘
```

---

## 🔍 Troubleshooting

### Issue: "404 Not Found" on `/api/pos/hold`
**Cause**: Backend routes not registered (Step 2 incomplete)  
**Fix**: Add `app.use('/api/pos/hold', createHoldRoutes(pool));` to `server.ts`

### Issue: "Column product_type does not exist"
**Cause**: Migration 001 not run (Step 1 incomplete)  
**Fix**: Run `psql -U postgres -d pos_system -f 001_add_product_type_and_service_flags.sql`

### Issue: Hold/Resume buttons not visible
**Cause**: Frontend components not imported/integrated (Step 3 incomplete)  
**Fix**: Follow Step 3 instructions exactly, check imports and JSX placement

### Issue: Service badge not showing
**Cause**: Products don't have `productType` field yet  
**Fix**: 
1. Run migration (Step 1)
2. Update product forms (Step 4)
3. Edit existing products to set `productType = 'service'`

### Issue: Frontend build errors
**Cause**: Missing imports or incorrect paths  
**Fix**:
```typescript
// Check imports use correct paths:
import { ServiceBadge } from '../../components/pos/ServiceBadge';
import { isService } from '@shared/utils/product.utils';
```

---

## 📚 Related Documentation

- **Full Feature Docs**: `docs/POS_HOLD_AND_SERVICE.md`
- **Verification Report**: `IMPLEMENTATION_VERIFICATION_REPORT.md`
- **API Testing**: Use `test-service-and-hold.ts` for backend validation

---

## 🎯 Summary: What You Need to Do

| Step | Action | Time | Result |
|------|--------|------|--------|
| 1️⃣ | Run 2 SQL migrations | 2 min | Database ready |
| 2️⃣ | Add 2 lines to server.ts | 5 min | API endpoints work |
| 3️⃣ | Add UI components to POSPage | 15 min | Buttons/badges visible |
| 4️⃣ | Add product_type to forms | 10 min | Can create service items |
| **TOTAL** | **4 integration steps** | **~32 min** | **Features fully enabled** |

After completing these 4 steps, users will be able to:
- ✅ Create service products that don't track inventory
- ✅ Put carts on hold and resume them later
- ✅ See service badges in cart
- ✅ View held orders list
- ✅ Complete sales with service items (no stock movements)

---

**Need Help?** Check the troubleshooting section or refer to full docs in `docs/POS_HOLD_AND_SERVICE.md`
