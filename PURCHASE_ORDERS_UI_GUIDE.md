# Purchase Orders UI Guide

**Visual Reference for Enhanced PO Creation Modal**

---

## Modal Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Create Purchase Order                                              [X]  │
│ Add products and specify quantities for this order                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│ ┌─────────────────────────────┐ ┌──────────────────────────────────┐  │
│ │ Supplier *                  │ │ Expected Delivery Date           │  │
│ │ [Select a supplier...    ▼] │ │ [2025-11-15             📅]      │  │
│ │ BR-PO-001: Required         │ │ BR-PO-005: Must be future        │  │
│ └─────────────────────────────┘ └──────────────────────────────────┘  │
│                                                                          │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ Notes                                                              │ │
│ │ [Optional notes about this purchase order...                    ] │ │
│ │                                                                    │ │
│ └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│ ╔════════════════════════════════════════════════════════════════════╗ │
│ ║ Line Items *                       BR-PO-002: At least one required║ │
│ ╠════════════════════════════════════════════════════════════════════╣ │
│ ║                                                                    ║ │
│ ║ ┌──────────────────────────────────────────────────────────────┐ ║ │
│ ║ │ Search products to add (name or SKU)...         [Clear]     │ ║ │
│ ║ └──────────────────────────────────────────────────────────────┘ ║ │
│ ║                                                                    ║ │
│ ║   ┌────────────────────────────────────────────────────────┐     ║ │
│ ║   │ Product A                                              │     ║ │
│ ║   │ SKU: PRD-001                                           │     ║ │
│ ║   ├────────────────────────────────────────────────────────┤     ║ │
│ ║   │ Product B                                              │     ║ │
│ ║   │ SKU: PRD-002                                           │     ║ │
│ ║   └────────────────────────────────────────────────────────┘     ║ │
│ ║                                                                    ║ │
│ ║ ┌──────────────────────────────────────────────────────────────┐ ║ │
│ ║ │ Product    │ Quantity │ Unit Cost │ Line Total │ Action    │ ║ │
│ ║ ├────────────┼──────────┼───────────┼────────────┼───────────┤ ║ │
│ ║ │ Product A  │ [10.50]  │ [2500.75] │ 26,257.88  │   🗑️     │ ║ │
│ ║ │ Product B  │ [5.00]   │ [1500.00] │  7,500.00  │   🗑️     │ ║ │
│ ║ │ Product C  │ [20.00]  │ [3000.50] │ 60,010.00  │   🗑️     │ ║ │
│ ║ └──────────────────────────────────────────────────────────────┘ ║ │
│ ║                                                                    ║ │
│ ║ ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────┐  ║ │
│ ║ │ Items Count  │ │ Subtotal     │ │ Avg Cost/Item            │  ║ │
│ ║ │              │ │              │ │                          │  ║ │
│ ║ │      3       │ │ 93,767.88    │ │    31,255.96             │  ║ │
│ ║ │              │ │              │ │                          │  ║ │
│ ║ └──────────────┘ └──────────────┘ └──────────────────────────┘  ║ │
│ ╚════════════════════════════════════════════════════════════════════╝ │
│                                                                          │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ 📋 Business Rules Applied:                                         │ │
│ │ • BR-PO-001: Supplier must be selected and validated               │ │
│ │ • BR-PO-002: Minimum 1 line item required                          │ │
│ │ • BR-INV-002: All quantities must be positive                      │ │
│ │ • BR-PO-004: Unit costs cannot be negative                         │ │
│ │ • BR-PO-005: Expected delivery must be future date (if specified)  │ │
│ │ • Precision: Decimal.js used for all calculations (20 decimals)    │ │
│ └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│                                           [Cancel] [✓ Create PO]        │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Component Breakdown

### 1. Modal Header
```
┌─────────────────────────────────────────────────────────────────┐
│ Create Purchase Order                                      [X] │
│ Add products and specify quantities for this order             │
└─────────────────────────────────────────────────────────────────┘
```
- **Title**: Bold, large font
- **Subtitle**: Gray, smaller font
- **Close Button**: Gray X, hover effect

### 2. Header Section (Grid)
```
┌─────────────────────────┐ ┌──────────────────────────────┐
│ Supplier *              │ │ Expected Delivery Date       │
│ [Dropdown           ▼]  │ │ [Date Picker          📅]    │
│ Validation message      │ │ Validation message           │
└─────────────────────────┘ └──────────────────────────────┘
```
- **Layout**: 2-column grid (responsive)
- **Required Fields**: Red asterisk
- **Validation**: Small gray text below field

### 3. Notes Section
```
┌────────────────────────────────────────────────────────────┐
│ Notes                                                      │
│ [                                                        ] │
│ [                                                        ] │
└────────────────────────────────────────────────────────────┘
```
- **Height**: 2 rows (auto-resize)
- **Placeholder**: Light gray text
- **Optional**: No asterisk

### 4. Line Items Section

#### 4a. Product Search
```
┌──────────────────────────────────────────────────────────┐
│ Search products to add (name or SKU)...     [Clear]     │
└──────────────────────────────────────────────────────────┘
```
- **Search Input**: Full width, focus ring
- **Clear Button**: Secondary style, right-aligned

#### 4b. Product Dropdown (When Active)
```
┌────────────────────────────────────────────────┐
│ Product A                                      │ ← Hover: Light blue
│ SKU: PRD-001                                   │
├────────────────────────────────────────────────┤
│ Product B                                      │
│ SKU: PRD-002                                   │
├────────────────────────────────────────────────┤
│ Product C                                      │
│ SKU: PRD-003                                   │
└────────────────────────────────────────────────┘
```
- **Max Items**: 10 visible
- **Scroll**: If more than 10 results
- **Hover**: Light blue background
- **Click**: Adds to line items, closes dropdown

#### 4c. Line Items Table
```
┌──────────────────────────────────────────────────────────────┐
│ Product      │ Quantity │ Unit Cost │ Line Total │ Action  │
├──────────────┼──────────┼───────────┼────────────┼─────────┤
│ Product A    │ [10.50]  │ [2500.75] │ 26,257.88  │  🗑️    │
│ Product B    │ [5.00]   │ [1500.00] │  7,500.00  │  🗑️    │
└──────────────────────────────────────────────────────────────┘
```

**Column Details**:
- **Product**: Read-only text, left-aligned
- **Quantity**: Number input, right-aligned, step=0.01
- **Unit Cost**: Number input, right-aligned, step=0.01
- **Line Total**: Calculated, bold, right-aligned
- **Action**: Trash icon button, center-aligned

**Empty State**:
```
┌────────────────────────────────────────────────┐
│                                                │
│  No line items added yet.                     │
│  Search and add products above.               │
│                                                │
└────────────────────────────────────────────────┘
```

#### 4d. Totals Summary
```
┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐
│ Items Count  │ │ Subtotal     │ │ Avg Cost/Item        │
│   (Blue)     │ │   (Green)    │ │   (Purple)           │
│      3       │ │  93,767.88   │ │    31,255.96         │
└──────────────┘ └──────────────┘ └──────────────────────┘
```

**Card Styles**:
- **Items Count**: Blue background (#EFF6FF), blue text
- **Subtotal**: Green background (#F0FDF4), green text
- **Avg Cost**: Purple background (#F5F3FF), purple text

### 5. Business Rules Panel
```
┌────────────────────────────────────────────────────────────┐
│ 📋 Business Rules Applied:                                 │
│                                                            │
│ • BR-PO-001: Supplier must be selected and validated      │
│ • BR-PO-002: Minimum 1 line item required                 │
│ • BR-INV-002: All quantities must be positive             │
│ • BR-PO-004: Unit costs cannot be negative                │
│ • BR-PO-005: Expected delivery future date (if specified) │
│ • Precision: Decimal.js - 20 decimal places               │
└────────────────────────────────────────────────────────────┘
```
- **Background**: Light blue (#EFF6FF)
- **Border**: Blue (#BFDBFE)
- **Text**: Dark blue (#1E3A8A)
- **Icon**: 📋 emoji

### 6. Form Actions
```
┌────────────────────────────────────────────────────────────┐
│                                  [Cancel] [✓ Create PO]   │
└────────────────────────────────────────────────────────────┘
```

**Button Styles**:
- **Cancel**: Gray border, white background, hover: light gray
- **Create**: Blue background, white text, hover: dark blue
- **Disabled**: Opacity 50%, cursor not-allowed
- **Loading**: Spinner animation, "Creating..." text

---

## State Visualizations

### Initial State (Empty Form)
```
Supplier: [Not selected]
Expected Delivery: [Empty]
Notes: [Empty]
Line Items: []
  → Empty state message shown
  → Totals not visible
  → Create button DISABLED
```

### Adding First Product
```
1. User types "Sugar" in search
   → Dropdown appears with matching products

2. User clicks "Sugar - 1kg"
   → Product added to line items
   → Search cleared
   → Dropdown hidden
   → Line items table appears
   → Totals cards appear
   → Create button still DISABLED (no supplier)
```

### Valid Form Ready to Submit
```
Supplier: [Acme Supplies] ✓
Expected Delivery: [2025-11-15] ✓
Notes: [Bulk order for Q4]
Line Items: [3 items] ✓
  - Sugar - 1kg: 10.5 × 2500.75 = 26,257.88
  - Rice - 5kg: 5.0 × 1500.00 = 7,500.00
  - Flour - 2kg: 20.0 × 3000.50 = 60,010.00
Totals:
  - Items: 3
  - Subtotal: 93,767.88 UGX
  - Avg Cost: 31,255.96 UGX
  → Create button ENABLED ✓
```

### Validation Error Examples

#### Error: No Supplier
```
User clicks [Create PO] without selecting supplier
→ Alert: "BR-PO-001: Please select a supplier"
```

#### Error: No Line Items
```
User clicks [Create PO] with supplier but no items
→ Alert: "BR-PO-002: At least one line item is required"
```

#### Error: Zero Quantity
```
User enters 0 in quantity field and clicks [Create PO]
→ Alert: "BR-INV-002: Quantity must be positive for Sugar - 1kg"
```

#### Error: Negative Cost
```
User enters -100 in unit cost field and clicks [Create PO]
→ Alert: "BR-PO-004: Unit cost cannot be negative for Sugar - 1kg"
```

#### Error: Past Delivery Date
```
User selects yesterday's date and clicks [Create PO]
→ Alert: "BR-PO-005: Expected delivery date must be in the future"
```

### Loading State (Submitting)
```
User clicks [Create PO]
→ Button text: "⏳ Creating..."
→ All inputs DISABLED
→ Spinner animation on button
→ Form cannot be modified
```

### Success State
```
API returns success
→ Alert: "Purchase order created successfully!"
→ Modal closes
→ PO list refreshes
→ New PO appears with status "DRAFT"
```

---

## Interaction Flows

### Flow 1: Create PO with Single Product
```
1. Click [Create Purchase Order] button
2. Select supplier from dropdown
3. (Optional) Set expected delivery date
4. (Optional) Add notes
5. Type product name in search
6. Click product from dropdown
7. Enter quantity (e.g., 10)
8. Enter unit cost (e.g., 2500.00)
9. Click [✓ Create Purchase Order]
10. Success → Modal closes, list refreshes
```

### Flow 2: Create PO with Multiple Products
```
1. Click [Create Purchase Order] button
2. Select supplier: "Acme Supplies"
3. Search "sugar" → Add Sugar - 1kg (qty: 10.5, cost: 2500.75)
4. Search "rice" → Add Rice - 5kg (qty: 5.0, cost: 1500.00)
5. Search "flour" → Add Flour - 2kg (qty: 20.0, cost: 3000.50)
6. Review totals:
   - Items: 3
   - Subtotal: 93,767.88 UGX
   - Avg Cost: 31,255.96 UGX
7. Click [✓ Create Purchase Order]
8. Success → Modal closes
```

### Flow 3: Edit Line Items Before Submit
```
1. Add Product A (qty: 10, cost: 100)
2. Add Product B (qty: 5, cost: 200)
3. Realize quantity wrong for Product A
4. Update Product A quantity: 10 → 15
   → Line total updates: 1,000 → 1,500
   → Subtotal updates: 2,000 → 2,500
5. Realize Product B not needed
6. Click 🗑️ for Product B
   → Product B removed
   → Subtotal updates: 2,500 → 1,500
   → Items count: 2 → 1
7. Review final totals
8. Click [✓ Create Purchase Order]
```

### Flow 4: Validation Error Recovery
```
1. Click [Create Purchase Order] button
2. Add products but forget supplier
3. Click [✓ Create Purchase Order]
   → Alert: "BR-PO-001: Please select a supplier"
4. Click OK on alert
5. Select supplier: "Acme Supplies"
6. Click [✓ Create Purchase Order] again
7. Success → Modal closes
```

---

## Responsive Behavior

### Desktop (> 768px)
- 2-column grid for supplier + delivery date
- Full-width line items table
- 3-column totals cards
- Modal width: 72rem (max-width)

### Tablet (640px - 768px)
- 2-column grid maintained
- Table scrolls horizontally if needed
- 3-column totals cards (smaller)
- Modal width: 90% of viewport

### Mobile (< 640px)
- Single column for all header fields
- Table scrolls horizontally (guaranteed)
- Totals cards stack vertically (1 column)
- Modal width: 95% of viewport
- Reduced padding for space efficiency

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Tab` | Navigate between fields |
| `Shift+Tab` | Navigate backward |
| `Enter` | Submit form (when valid) |
| `Escape` | Close modal |
| `Arrow Down` | Navigate dropdown (future) |
| `Arrow Up` | Navigate dropdown (future) |

---

## Color Palette

### Semantic Colors
- **Primary Blue**: #2563EB (buttons, links)
- **Success Green**: #10B981 (subtotal card)
- **Warning Yellow**: #F59E0B (not used yet)
- **Error Red**: #EF4444 (required indicators, validation)
- **Info Blue**: #3B82F6 (items count card)
- **Purple**: #8B5CF6 (avg cost card)

### Neutral Colors
- **Gray 50**: #F9FAFB (backgrounds)
- **Gray 100**: #F3F4F6 (table header)
- **Gray 300**: #D1D5DB (borders)
- **Gray 500**: #6B7280 (secondary text)
- **Gray 700**: #374151 (labels)
- **Gray 900**: #111827 (primary text)

### Background Colors
- **Blue 50**: #EFF6FF (info panels)
- **Green 50**: #F0FDF4 (success cards)
- **Purple 50**: #F5F3FF (purple cards)
- **Red 50**: #FEF2F2 (error states)

---

## Accessibility Features

### Screen Readers
- All inputs have `<label>` elements
- Required fields marked with aria-required
- Validation errors announced
- Button states announced (loading, disabled)

### Keyboard Navigation
- All interactive elements focusable
- Focus visible with ring style
- Tab order logical (top to bottom, left to right)
- Modal traps focus (can't tab outside)

### Visual Indicators
- High contrast text (WCAG AA compliant)
- Required fields: Red asterisk
- Disabled fields: Reduced opacity
- Hover states: Background color change
- Focus states: Blue ring around element

---

## Performance Considerations

### Render Optimization
- `useMemo` for totals calculation (recalc only when lineItems change)
- `useMemo` for filtered products (recalc only when search or products change)
- Minimal state updates (update only changed field)

### Network Optimization
- Products fetched once (cached by React Query)
- PO creation: Single API call with all data
- Optimistic UI updates (modal closes immediately)

### Memory Management
- No memory leaks (proper cleanup)
- Efficient string operations
- Decimal.js instances garbage collected

---

**Last Updated**: November 1, 2025  
**Version**: 1.0  
**Status**: Production Ready
