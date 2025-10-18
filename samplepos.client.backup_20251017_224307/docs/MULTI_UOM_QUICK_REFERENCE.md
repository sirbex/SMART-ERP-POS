# Multi-UOM Quick Reference Card

## 🔧 Essential Imports

```javascript
const { Decimal, toBaseQty, fromBaseQty } = require('../utils/uomUtils');
const { calcEffectiveCostPerPurchaseUnit, calcCOGS } = require('../utils/costUtils');
const FifoService = require('../services/FifoService');
const LandedCostService = require('../services/LandedCostService');
```

## 📥 Receive Purchase

```javascript
const purchaseData = {
  productId: 42,
  uom: 'bag',                    // Purchase UOM
  quantity: 10,                   // Quantity in purchase UOM
  unitCost: '40.00',             // Cost per purchase UOM
  discount: {
    type: 'percent',             // or 'amount'
    value: 5
  },
  taxes: [{
    type: 'vat',
    percent: 18                   // or amount: 100
  }],
  landedCosts: [{
    type: 'shipping',
    amount: 100.00,
    description: 'Freight'
  }],
  supplierInvoice: 'INV-999',
  currency: 'USD',
  exchangeRate: 1.0,
  includeTaxesInCost: false,     // false for recoverable VAT
  landedCostAllocationMethod: 'quantity' // or 'value'
};

// POST /api/purchases/receive
const response = await fetch('/api/purchases/receive', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(purchaseData)
});
```

## 💰 Record Sale

```javascript
const saleData = {
  productId: 42,
  uom: 'kg',                     // Sale UOM
  quantity: 2,                    // Quantity in sale UOM
  pricePerUom: '3.50',           // Price per sale UOM
  customerId: 55
};

// POST /api/sales
const response = await fetch('/api/sales', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(saleData)
});

// Response includes:
// - cogsAmount: COGS from FIFO
// - cogsBreakdown: Array of batches consumed
// - grossProfit: Revenue - COGS
// - grossProfitMargin: Percentage
```

## 🔍 Preview Sale (Before Committing)

```javascript
// POST /api/sales/preview
const preview = await fetch('/api/sales/preview', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    productId: 42,
    uom: 'kg',
    quantity: 2,
    pricePerUom: '3.50'
  })
});

// Returns: canFulfill, estimatedCOGS, grossProfit, availableStock
```

## 📊 Check Stock

```javascript
// GET /api/products/42/stock?uom=kg
const stock = await fetch('/api/products/42/stock?uom=kg');

// Returns:
// - stockInBase: Total stock in base UOM
// - inventoryValue: Total value
// - averageCost: Weighted average cost
// - uomInfo: Stock in requested UOM
// - batches: FIFO batch details
```

## 🏷️ Get Product UOMs

```javascript
// GET /api/products/42/uoms?uomType=purchase
const uoms = await fetch('/api/products/42/uoms?uomType=purchase');

// uomType: 'purchase', 'sale', 'stock', or omit for all
// Returns array of UOMs with conversion factors
```

## 🧮 Key Calculations

### Convert to Base Units
```javascript
const qtyInBase = toBaseQty(10, 50); // 10 bags * 50 kg/bag = 500 kg
```

### Convert from Base Units
```javascript
const qtyInUOM = fromBaseQty(500, 50); // 500 kg / 50 kg/bag = 10 bags
```

### Calculate Effective Cost (after discount)
```javascript
const effectiveCost = calcEffectiveCostPerPurchaseUnit(
  40,                              // unitCost
  { type: 'percent', value: 5 },  // discount
  [{ percent: 18 }],              // taxes
  false                           // includeTaxesInCost
);
// Result: 38 (40 * 0.95)
```

### Calculate Unit Cost in Base Units
```javascript
const unitCostBase = new Decimal(38).dividedBy(50); // 38/bag ÷ 50kg/bag = 0.76/kg
```

### Calculate COGS
```javascript
const cogs = calcCOGS(2, 0.96); // 2 kg * $0.96/kg = $1.92
```

## 🎯 React Component Examples

### Purchase Form with UOM Dropdown

```jsx
function PurchaseForm({ productId }) {
  const [uoms, setUoms] = useState([]);
  const [selectedUOM, setSelectedUOM] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    // Fetch UOMs
    fetch(`/api/products/${productId}/uoms?uomType=purchase`)
      .then(res => res.json())
      .then(data => {
        setUoms(data.data);
        const defaultUOM = data.data.find(u => u.isDefault);
        if (defaultUOM) setSelectedUOM(defaultUOM.uomName);
      });
  }, [productId]);

  useEffect(() => {
    // Live preview of qty in base units
    if (selectedUOM && quantity) {
      const uom = uoms.find(u => u.uomName === selectedUOM);
      if (uom) {
        const qtyBase = quantity * parseFloat(uom.conversionToBase);
        const costBase = unitCost / parseFloat(uom.conversionToBase);
        setPreview({
          qtyInBase: qtyBase.toFixed(6),
          unitCostBase: costBase.toFixed(6)
        });
      }
    }
  }, [selectedUOM, quantity, unitCost, uoms]);

  return (
    <form>
      <select value={selectedUOM} onChange={e => setSelectedUOM(e.target.value)}>
        {uoms.map(uom => (
          <option key={uom.id} value={uom.uomName}>
            {uom.uomName} (1 = {uom.conversionToBase} base units)
          </option>
        ))}
      </select>
      
      <input
        type="number"
        value={quantity}
        onChange={e => setQuantity(e.target.value)}
        placeholder="Quantity"
      />
      
      <input
        type="number"
        value={unitCost}
        onChange={e => setUnitCost(e.target.value)}
        placeholder="Unit Cost"
      />
      
      {preview && (
        <div className="preview">
          <p>Qty in base: {preview.qtyInBase}</p>
          <p>Unit cost base: ${preview.unitCostBase}</p>
        </div>
      )}
    </form>
  );
}
```

### POS Form with Stock Check

```jsx
function POSForm({ productId }) {
  const [uoms, setUoms] = useState([]);
  const [selectedUOM, setSelectedUOM] = useState('');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [stockInfo, setStockInfo] = useState(null);
  const [salePreview, setSalePreview] = useState(null);

  useEffect(() => {
    // Fetch sale UOMs
    fetch(`/api/products/${productId}/uoms?uomType=sale`)
      .then(res => res.json())
      .then(data => setUoms(data.data));
  }, [productId]);

  useEffect(() => {
    // Check stock when UOM changes
    if (selectedUOM) {
      fetch(`/api/products/${productId}/stock?uom=${selectedUOM}`)
        .then(res => res.json())
        .then(data => setStockInfo(data.data));
    }
  }, [productId, selectedUOM]);

  const handlePreview = async () => {
    const res = await fetch('/api/sales/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId,
        uom: selectedUOM,
        quantity: parseFloat(quantity),
        pricePerUom: parseFloat(price)
      })
    });
    const data = await res.json();
    setSalePreview(data.data);
  };

  const canSell = stockInfo && 
                  salePreview && 
                  parseFloat(stockInfo.uomInfo?.stockInUOM || 0) >= parseFloat(quantity);

  return (
    <form>
      <select value={selectedUOM} onChange={e => setSelectedUOM(e.target.value)}>
        {uoms.map(uom => (
          <option key={uom.id} value={uom.uomName}>{uom.uomName}</option>
        ))}
      </select>
      
      {stockInfo?.uomInfo && (
        <p className="stock-info">
          Available: {stockInfo.uomInfo.stockInUOM} {selectedUOM}
        </p>
      )}
      
      <input
        type="number"
        value={quantity}
        onChange={e => setQuantity(e.target.value)}
        placeholder="Quantity"
      />
      
      <input
        type="number"
        value={price}
        onChange={e => setPrice(e.target.value)}
        placeholder="Price per unit"
      />
      
      <button type="button" onClick={handlePreview}>Preview</button>
      
      {salePreview && (
        <div className="preview">
          <p>Revenue: ${salePreview.revenue}</p>
          <p>COGS: ${salePreview.estimatedCOGS}</p>
          <p>Profit: ${salePreview.grossProfit} ({salePreview.grossProfitMargin})</p>
        </div>
      )}
      
      <button type="submit" disabled={!canSell}>
        {canSell ? 'Complete Sale' : 'Insufficient Stock'}
      </button>
    </form>
  );
}
```

## 🗃️ Database Schema Quick Reference

### ProductUOM
```
id, product_id, uom_name, conversion_to_base, uom_type, is_default
```

### InventoryBatch
```
id, product_id, source_purchase_id, batch_reference,
qty_in_base, remaining_qty_in_base, unit_cost_base, total_cost_base,
currency, exchange_rate, metadata, received_at
```

## 🔐 Best Practices

1. ✅ **Always use Decimal.js** for calculations
2. ✅ **Wrap in transactions** for data consistency
3. ✅ **Validate UOMs exist** before processing
4. ✅ **Check stock availability** before sales
5. ✅ **Store full precision** (6 decimals), round for display
6. ✅ **Persist COGS breakdown** for auditing
7. ✅ **Lock batches** during FIFO with `transaction.LOCK.UPDATE`

## 🚨 Common Errors

| Error | Solution |
|-------|----------|
| "UOM not found" | Create ProductUOM record |
| "Insufficient stock" | Check via GET /products/:id/stock |
| Incorrect COGS | Verify batch unit_cost_base includes landed costs |
| Rounding issues | Ensure using Decimal.js everywhere |

## 📞 Quick Links

- Full Guide: `MULTI_UOM_IMPLEMENTATION_GUIDE.md`
- Test Example: `server/src/tests/multiUomIntegrationTest.js`
- API Routes: `server/src/routes/multiUomRoutes.js`
