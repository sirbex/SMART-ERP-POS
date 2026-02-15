# Product Multi-Unit of Measure - Visual Guide

## User Interface Preview

### Product Modal with MUoM Section

```
╔══════════════════════════════════════════════════════════════════╗
║  Create/Edit Product                                        [X] ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  BASIC INFORMATION                                               ║
║  ┌────────────────────────────────────────────────────────────┐ ║
║  │ Product Name *: [Coca Cola 500ml___________________]      │ ║
║  │ SKU *:          [PRD-2025-001______________________]      │ ║
║  │ Barcode:        [5449000000996_____________________]      │ ║
║  │ Category:       [Beverages_________________________]      │ ║
║  │ Base Unit *:    [PIECE ▼                           ]      │ ║
║  │ Description:    [                                  ]      │ ║
║  └────────────────────────────────────────────────────────────┘ ║
║                                                                  ║
║  PRICING & COSTING                                               ║
║  ┌────────────────────────────────────────────────────────────┐ ║
║  │ Cost Price *:     [1500.00]  Selling Price *: [2000.00]  │ ║
║  │ Costing Method:   [FIFO ▼]   Tax Rate (%):   [18.00]    │ ║
║  │ 📊 Profit Margin: 33.33%                                  │ ║
║  └────────────────────────────────────────────────────────────┘ ║
║                                                                  ║
║  STOCK LEVEL SETTINGS                                            ║
║  ┌────────────────────────────────────────────────────────────┐ ║
║  │ Reorder Level: [10]                                        │ ║
║  │ ☑ Track Expiry Date (perishables)                         │ ║
║  └────────────────────────────────────────────────────────────┘ ║
║                                                                  ║
║  ✨ MULTI-UNIT OF MEASURE                      [+ Add Unit]     ║
║  ┌────────────────────────────────────────────────────────────┐ ║
║  │ Configure alternate units with automatic conversion        │ ║
║  │                                                             │ ║
║  │ ┌──────────┬────────┬────────────┬─────────┬──────────┐  │ ║
║  │ │ Unit     │ Symbol │ Conversion │ Default │ Actions  │  │ ║
║  │ ├──────────┼────────┼────────────┼─────────┼──────────┤  │ ║
║  │ │ Bottle   │ btl    │ 1          │ Default │ Edit Del │  │ ║
║  │ │ Case     │ cs     │ 24         │ Set Def │ Edit Del │  │ ║
║  │ │ Pallet   │ plt    │ 1200       │ Set Def │ Edit Del │  │ ║
║  │ └──────────┴────────┴────────────┴─────────┴──────────┘  │ ║
║  └────────────────────────────────────────────────────────────┘ ║
║                                                                  ║
║  STATUS                                                          ║
║  ┌────────────────────────────────────────────────────────────┐ ║
║  │ ☑ Active                                                   │ ║
║  └────────────────────────────────────────────────────────────┘ ║
║                                                                  ║
║                                     [Cancel]  [Save Product]    ║
╚══════════════════════════════════════════════════════════════════╝
```

### Add/Edit UoM Form

```
╔══════════════════════════════════════════════════════════════════╗
║  ✨ MULTI-UNIT OF MEASURE                      [+ Add Unit]     ║
║  ┌────────────────────────────────────────────────────────────┐ ║
║  │ ┌──────────────────────────────────────────────────────┐  │ ║
║  │ │ 📝 Add Unit of Measure                                │  │ ║
║  │ │                                                        │  │ ║
║  │ │ Unit *:              Conversion Factor *:             │  │ ║
║  │ │ [Case (cs) ▼      ]  [24.0_______________]            │  │ ║
║  │ │                      💡 How many base units = 1 unit  │  │ ║
║  │ │                                                        │  │ ║
║  │ │ Cost Override:       Price Override:                  │  │ ║
║  │ │ [36000.00_________]  [48000.00__________]             │  │ ║
║  │ │ (optional)           (optional)                       │  │ ║
║  │ │                                                        │  │ ║
║  │ │ ☐ Set as default unit for this product               │  │ ║
║  │ │                                                        │  │ ║
║  │ │                              [Add]  [Cancel]          │  │ ║
║  │ └──────────────────────────────────────────────────────┘  │ ║
║  └────────────────────────────────────────────────────────────┘ ║
╚══════════════════════════════════════════════════════════════════╝
```

### Empty State (No UoMs Configured)

```
╔══════════════════════════════════════════════════════════════════╗
║  ✨ MULTI-UNIT OF MEASURE                      [+ Add Unit]     ║
║  ┌────────────────────────────────────────────────────────────┐ ║
║  │ Configure alternate units with automatic conversion        │ ║
║  │                                                             │ ║
║  │ ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐ │ ║
║  │                                                             │ ║
║  │        📦 No alternate units configured                     │ ║
║  │   Click "Add Unit" to configure conversion factors          │ ║
║  │                                                             │ ║
║  │ └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘ │ ║
║  └────────────────────────────────────────────────────────────┘ ║
╚══════════════════════════════════════════════════════════════════╝
```

## User Workflows

### Workflow 1: Create Product with Multiple UoMs

```
Step 1: Open Product Modal
┌────────────────────────────┐
│ [+ Create New Product]     │ ← Click this button
└────────────────────────────┘

Step 2: Fill Basic Information
┌────────────────────────────┐
│ Product Name: Coca Cola    │
│ SKU: PRD-2025-001          │
│ Base Unit: PIECE           │
└────────────────────────────┘

Step 3: Add First UoM (Bottle = 1 piece)
┌────────────────────────────┐
│ [+ Add Unit]               │ ← Click to open form
│                            │
│ Unit: Bottle               │ ← Select from dropdown
│ Conversion: 1              │ ← 1 bottle = 1 piece
│ ☑ Set as default           │ ← Check this
│ [Add]                      │ ← Click to save
└────────────────────────────┘

Step 4: Add Second UoM (Case = 24 bottles)
┌────────────────────────────┐
│ [+ Add Unit]               │ ← Click again
│                            │
│ Unit: Case                 │ ← Select Case
│ Conversion: 24             │ ← 1 case = 24 pieces
│ ☐ Set as default           │
│ [Add]                      │ ← Click to save
└────────────────────────────┘

Step 5: Add Third UoM (Pallet = 1200 bottles)
┌────────────────────────────┐
│ Unit: Pallet               │
│ Conversion: 1200           │ ← 1 pallet = 1200 pieces
│ [Add]                      │
└────────────────────────────┘

Step 6: Review Configured UoMs
┌─────────────────────────────────────────┐
│ Unit    │ Symbol │ Conv │ Default       │
├─────────────────────────────────────────┤
│ Bottle  │ btl    │ 1    │ ✓ Default     │
│ Case    │ cs     │ 24   │   Set Default │
│ Pallet  │ plt    │ 1200 │   Set Default │
└─────────────────────────────────────────┘

Step 7: Save Product
┌────────────────────────────┐
│          [Save Product]    │ ← Click to save everything
└────────────────────────────┘

✅ Success! Product and all UoMs saved
```

### Workflow 2: Edit Existing Product UoMs

```
Step 1: Open Product for Edit
┌────────────────────────────┐
│ Coca Cola  [Edit] [Delete] │ ← Click Edit
└────────────────────────────┘

Step 2: Modal Opens with Existing Data
┌─────────────────────────────────────────┐
│ Unit    │ Symbol │ Conv │ Default       │
├─────────────────────────────────────────┤
│ Bottle  │ btl    │ 1    │ ✓ Default     │
│ Case    │ cs     │ 24   │   Set Default │
│ Pallet  │ plt    │ 1200 │   Set Default │
└─────────────────────────────────────────┘

Step 3: Edit Conversion Factor
┌────────────────────────────┐
│ Case  [Edit] [Delete]      │ ← Click Edit
│                            │
│ Unit: Case                 │ ← Pre-filled
│ Conversion: 20             │ ← Change from 24 to 20
│ [Update]                   │ ← Click to update
└────────────────────────────┘

Step 4: Delete UoM
┌────────────────────────────┐
│ Pallet [Edit] [Delete]     │ ← Click Delete
└────────────────────────────┘
Are you sure? [Yes] [No]

Step 5: Add New UoM
┌────────────────────────────┐
│ [+ Add Unit]               │
│                            │
│ Unit: Carton               │
│ Conversion: 12             │
│ [Add]                      │
└────────────────────────────┘

Step 6: Review Changes
┌─────────────────────────────────────────┐
│ Unit    │ Symbol │ Conv │ Default       │
├─────────────────────────────────────────┤
│ Bottle  │ btl    │ 1    │ ✓ Default     │
│ Case    │ cs     │ 20   │   Set Default │ ← Updated
│ Carton  │ crt    │ 12   │   Set Default │ ← New
└─────────────────────────────────────────┘
(Pallet removed)

Step 7: Save Changes
┌────────────────────────────┐
│          [Save Product]    │
└────────────────────────────┘

✅ Product updated with new UoM configuration
```

### Workflow 3: Set Different Default UoM

```
Step 1: Current State
┌─────────────────────────────────────────┐
│ Unit    │ Symbol │ Conv │ Default       │
├─────────────────────────────────────────┤
│ Bottle  │ btl    │ 1    │ ✓ Default     │ ← Current
│ Case    │ cs     │ 24   │   Set Default │
└─────────────────────────────────────────┘

Step 2: Change Default
┌────────────────────────────┐
│ Case [Set Default]         │ ← Click Set Default
└────────────────────────────┘

Step 3: New State
┌─────────────────────────────────────────┐
│ Unit    │ Symbol │ Conv │ Default       │
├─────────────────────────────────────────┤
│ Bottle  │ btl    │ 1    │   Set Default │
│ Case    │ cs     │ 24   │ ✓ Default     │ ← New default
└─────────────────────────────────────────┘

💡 Only one UoM can be default at a time
```

## Validation Messages

### Error Messages Shown

```
❌ "Please select a unit of measure"
   → User tried to save without selecting a unit

❌ "Conversion factor must be greater than 0"
   → User entered 0 or negative number

❌ "This unit of measure is already configured"
   → User tried to add duplicate UoM

❌ "Failed to load master UoMs"
   → Backend API error (console log for details)

❌ "Failed to load product UoMs"
   → Backend API error when editing product

❌ "Failed to save product"
   → Backend error during product save operation
```

### Success Messages

```
✅ "Product created successfully!"
   → New product and all UoMs saved

✅ "Product updated successfully!"
   → Product and UoM changes saved

💡 Success messages auto-dismiss after 3 seconds
```

## Keyboard Shortcuts

```
Tab           → Navigate between form fields
Shift+Tab     → Navigate backwards
Enter         → Submit form (when in input field)
Escape        → Cancel current operation
Click outside → Close dropdown (if open)
```

## Accessibility Features

```
✓ ARIA labels on all inputs
✓ Keyboard navigation support
✓ Focus management
✓ Screen reader compatible
✓ Clear error messages
✓ Required field indicators (*)
✓ Help text for complex fields
```

## Mobile Responsive Design

```
Desktop (>768px)
┌─────────────────────────────────────┐
│ Unit:              Conversion:      │
│ [Dropdown____]     [24.0________]   │
└─────────────────────────────────────┘

Mobile (<768px)
┌─────────────────────┐
│ Unit:               │
│ [Dropdown________]  │
│                     │
│ Conversion:         │
│ [24.0___________]   │
└─────────────────────┘
```

## Color Coding

```
🔵 Blue      → Primary actions (Add Unit, Save)
⚪ White     → Input backgrounds
🔴 Red       → Delete actions, error messages
🟢 Green     → Success messages
🟡 Yellow    → Warnings
⚫ Gray      → Secondary actions (Cancel), disabled states
🔷 Light Blue → Default badge, info sections
```

## Icons Used

```
✨ → Multi-Unit of Measure section header
📦 → Empty state icon
💡 → Help text / tips
☑ → Checked checkbox
☐ → Unchecked checkbox
▼ → Dropdown indicator
[Edit] → Edit button (text)
[Delete] → Delete button (text)
[+ Add Unit] → Add new UoM button
```

## Real-World Example: Beverage Product

```
Product: Coca Cola 500ml
Base Unit: PIECE (1 bottle)

Configured UoMs:
┌────────────────────────────────────────────────────┐
│ Bottle  │ 1     │ ✓ Default │ 1 bottle = 1 piece  │
│ Six-Pack│ 6     │           │ 1 six-pack = 6 pcs  │
│ Case    │ 24    │           │ 1 case = 24 pcs     │
│ Pallet  │ 1200  │           │ 1 pallet = 1200 pcs │
└────────────────────────────────────────────────────┘

In Purchase Order:
"Receive 5 Cases" → System auto-converts to 120 pieces

In Goods Receipt:
"Received 2 Pallets" → System adds 2400 pieces to inventory

In POS:
"Sell 1 Six-Pack" → System deducts 6 pieces from stock
```

## Tips for Users

```
💡 Tip 1: Base Unit
Always set the smallest sellable unit as the base unit (e.g., PIECE for
individual items). Larger units (boxes, cases) are configured as UoMs.

💡 Tip 2: Conversion Factors
Conversion factor = How many base units in 1 of this unit
Example: 1 box contains 12 pieces → conversion factor = 12

💡 Tip 3: Default UoM
The default UoM appears first in dropdowns throughout the system.
Set the most commonly used unit as default.

💡 Tip 4: Price Overrides
Leave price/cost overrides blank for automatic calculation based on
conversion factor. Override only when actual price differs from
calculated value.

💡 Tip 5: Testing UoMs
After configuring UoMs, test in Goods Receipt and Purchase Order
pages to ensure dropdowns show correctly and conversions work.
```

## Troubleshooting Guide

```
Problem: Dropdown shows no master UoMs
Fix: Check that master UoMs exist in system. Go to UoM Management
     page to create master UoMs first.

Problem: Cannot see configured UoMs in GR/PO
Fix: Refresh the page after saving product. UoMs are loaded when
     product is selected in dropdown.

Problem: Conversion not calculating correctly
Fix: Verify conversion factor is correct. Remember: factor is how
     many BASE units equal 1 of this unit.

Problem: Cannot set Case as default
Fix: Make sure another UoM isn't already default. Only one default
     allowed per product.

Problem: Changes not saving
Fix: Check browser console for errors. Verify backend is running on
     port 3001. Check network tab for API responses.
```

---

**Last Updated**: December 24, 2024  
**Version**: 1.0.0  
**Component**: ProductsPage.tsx - Product Dialog Enhancement
