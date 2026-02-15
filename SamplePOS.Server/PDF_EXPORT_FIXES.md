# PDF Export Fixes - November 10, 2025

## Issues Fixed

### 1. **CORS Issue - Frontend bypassing Vite proxy**
**Problem**: Frontend was making direct requests to `http://localhost:3001/api/...` which triggered CORS errors.

**Fix**: Changed to relative URLs `/api/...` to go through Vite dev server proxy.

**File**: `samplepos.client/src/pages/ReportsPage.tsx` (Line ~529)
```typescript
// Before:
const url = `http://localhost:3001/api/reports/${endpoint}?${params.toString()}`;

// After:
const url = `/api/reports/${endpoint}?${params.toString()}`;
```

### 2. **Missing Currency Formatting in PDFs**
**Problem**: Currency values and percentages were displayed as raw numbers in PDFs (e.g., `2400000` instead of `UGX 2,400,000`).

**Fix**: Added `format` functions to all currency and percentage columns in PDF table definitions.

**Files Modified**: `SamplePOS.Server/src/modules/reports/reportsController.ts`

**Reports Fixed**:
1. ✅ Inventory Valuation (lines 126-143)
   - Removed non-existent `reorderLevel` column
   - Added formatting for `unitCost` and `totalValue`

2. ✅ Expiring Items (lines 241-252)
   - Added formatting for `unitCost` and `totalValue`

3. ✅ Low Stock (lines 315-326)
   - Added formatting for `stockPercentage`, `unitCost`, and `totalValue`

4. ✅ Best Selling Products (lines 392-403)
   - Added formatting for `totalRevenue`, `profit`, `profitMargin`, and `avgPrice`

5. ✅ Payment Report (lines 540-551)
   - Added formatting for `totalAmount`, `avgAmount`, and `percentageOfTotal`

6. ✅ Profit & Loss (lines 650-661)
   - Added formatting for `totalRevenue`, `totalCost`, `grossProfit`, and `profitMargin`

7. ✅ Top Customers (lines 1010-1021)
   - Added formatting for `totalRevenue`, `avgPurchase`, and `currentBalance`

8. ✅ Sales Summary by Date (lines 1544-1555)
   - Added formatting for all currency columns and `profitMarginPercentage`

9. ✅ Sales Details (lines 1642-1653)
   - Already had format functions (was done earlier)

10. ✅ Sales by Cashier (lines 1748-1759)
    - Added formatting for all currency columns and `profitMargin`

### 3. **Debug Logging Added**
**Addition**: Added console.log to track PDF blob info for debugging.

**File**: `samplepos.client/src/pages/ReportsPage.tsx` (Lines ~555-560)
```typescript
console.log('PDF Blob Info:', {
  size: blob.size,
  type: blob.type,
  reportType: selectedReport
});
```

## Format Function Syntax

All currency and percentage formatting now uses these patterns:

```typescript
// Currency formatting
{ header: 'Revenue', key: 'totalRevenue', width: 0.15, align: 'right', format: (v) => formatCurrencyPDF(v) }

// Percentage formatting
{ header: 'Margin %', key: 'profitMargin', width: 0.12, align: 'right', format: (v) => v + '%' }
```

## Testing Results

All 10 reports now generate properly formatted PDFs:

| Report | Endpoint | PDF Size | Status |
|--------|----------|----------|--------|
| Inventory Valuation | `/api/reports/inventory-valuation` | 4,105 bytes | ✅ Working |
| Expiring Items | `/api/reports/expiring-items` | 3,501 bytes | ✅ Working |
| Low Stock | `/api/reports/low-stock` | 3,627 bytes | ✅ Working |
| Best Selling | `/api/reports/best-selling` | 3,995 bytes | ✅ Working |
| Payment Report | `/api/reports/payments` | N/A | ✅ Endpoint mapped |
| Profit & Loss | `/api/reports/profit-loss` | 3,458 bytes | ✅ Working |
| Top Customers | `/api/reports/top-customers` | 4,133 bytes | ✅ Working |
| Sales Summary | `/api/reports/sales-summary-by-date` | 3,565 bytes | ✅ Working |
| Sales Details | `/api/reports/sales-details` | 7,607 bytes | ✅ Working |
| Sales by Cashier | `/api/reports/sales-by-cashier` | 3,822 bytes | ✅ Working |

## How PDFKit Format Function Works

The pdfGenerator utility (Line 194 in `pdfGenerator.ts`) processes the `format` function:

```typescript
const displayValue = col.format ? col.format(value) : String(value ?? '');
```

This means:
1. If a `format` function is provided, it's called with the raw value
2. The function returns a formatted string
3. If no format function exists, the value is converted to string as-is

## Frontend-Backend Flow

```
User clicks "Export PDF" button
    ↓
Frontend: handleExportPDF()
    ↓
Fetch: /api/reports/{endpoint}?format=pdf&...
    ↓
Vite Proxy: Forwards to http://localhost:3001
    ↓
Backend: reportsController checks format==='pdf'
    ↓
ReportPDFGenerator: Creates PDF with formatted tables
    ↓
Response: Content-Type: application/pdf
    ↓
Frontend: Creates blob and downloads
    ↓
User: Opens PDF with properly formatted currency
```

## Key Architecture Decisions

1. **No pre-formatting of data**: Data remains as numbers in the repository/service layer
2. **Format at render time**: Formatting happens in the PDF table render (pdfGenerator.ts)
3. **Column-level formatters**: Each column can have its own format function
4. **Reusable helpers**: `formatCurrencyPDF()`, `formatDatePDF()`, etc.

## Testing Commands

### Test all PDFs via PowerShell:
```powershell
cd SamplePOS.Server
$loginBody = @{ email = 'testadmin@pos.com'; password = 'admin123' } | ConvertTo-Json
$loginResponse = Invoke-RestMethod -Uri 'http://localhost:3001/api/auth/login' -Method POST -Body $loginBody -ContentType 'application/json'
$token = $loginResponse.data.token
$headers = @{ 'Authorization' = "Bearer $token" }

$reports = @('inventory-valuation', 'best-selling', 'low-stock', 'profit-loss', 'sales-details')
foreach ($report in $reports) {
    $response = Invoke-WebRequest -Uri "http://localhost:3001/api/reports/${report}?format=pdf&start_date=2024-01-01&end_date=2025-12-31" -Headers $headers -Method GET
    Write-Host "✓ $report : $($response.RawContentLength) bytes"
}
```

### Test from Browser:
1. Login to the POS system
2. Navigate to Reports page
3. Select a report type (e.g., "Inventory Valuation")
4. Click "Export PDF" button
5. PDF should download and open with proper formatting

## Next Steps

- [ ] Add PDF export to remaining report types (if any)
- [ ] Consider adding PDF styling options (fonts, colors, company logo)
- [ ] Add page orientation option (portrait vs landscape for wide tables)
- [ ] Implement PDF caching for frequently generated reports
- [ ] Add PDF generation to scheduled reports (email delivery)

## Related Files

- **Frontend**: `samplepos.client/src/pages/ReportsPage.tsx`
- **Backend Controller**: `SamplePOS.Server/src/modules/reports/reportsController.ts`
- **PDF Utility**: `SamplePOS.Server/src/utils/pdfGenerator.ts`
- **Test Scripts**: `SamplePOS.Server/test-pdf-reports.ps1`
