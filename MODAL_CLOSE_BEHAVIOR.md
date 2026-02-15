# Modal Close Behavior Enhancement

**Date**: October 31, 2025  
**Status**: Implemented  
**Requirement**: All dialogs, popups, or overlays should close when the user clicks or taps outside (blank space), or presses ESC. The only exceptions are destructive confirmation modals or multi-step wizards.

## Overview

Enhanced modal/dialog components with industry-standard close behavior to improve UX fluidity, especially for operations screens (POS, inventory) where speed matters.

## Implementation Pattern

### 1. Basic Close on ESC/Outside-Click (POSModal)

**File**: `samplepos.client/src/components/pos/POSModal.tsx`

**Features**:
- Close on ESC key press
- Close on clicking outside modal (overlay or backdrop)
- Optional `preventOutsideClose` prop to disable these behaviors for critical dialogs

**Props**:
```typescript
interface POSModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  title?: string;
  description?: string;
  hideTitle?: boolean;
  preventOutsideClose?: boolean; // Default: false
}
```

**Usage**:
```tsx
// Default: closes on ESC/outside-click
<POSModal open={isOpen} onOpenChange={setIsOpen} title="Payment">
  {/* content */}
</POSModal>

// Exception: prevent closing for destructive action
<POSModal 
  open={isDeleteConfirmOpen} 
  onOpenChange={setIsDeleteConfirmOpen}
  title="Confirm Delete"
  preventOutsideClose={true}
>
  {/* confirmation content */}
</POSModal>
```

**Implementation**:
```tsx
<DialogContent
  onEscapeKeyDown={(e) => {
    if (preventOutsideClose) {
      e.preventDefault();
    } else {
      onOpenChange(false);
    }
  }}
  onPointerDownOutside={(e) => {
    if (preventOutsideClose) {
      e.preventDefault();
    }
  }}
  onInteractOutside={(e) => {
    if (preventOutsideClose) {
      e.preventDefault();
    }
  }}
>
```

### 2. Smart Close with Unsaved Data Warning (ManualGRModal)

**File**: `samplepos.client/src/components/inventory/ManualGRModal.tsx`

**Features**:
- Detects unsaved data (selected items, supplier, notes)
- Shows confirmation dialog before closing if data exists
- Closes immediately if no data entered

**Implementation**:
```tsx
// Check if there's unsaved data
const hasUnsavedData = selectedItems.length > 0 || supplierId || notes.trim() !== "";

const handleCloseAttempt = () => {
  if (hasUnsavedData) {
    const confirmed = window.confirm(
      "You have unsaved changes. Are you sure you want to close?"
    );
    if (confirmed) {
      // Reset form
      setSupplierId("");
      setSelectedItems([]);
      setNotes("");
      setSearch("");
      onClose();
    }
  } else {
    onClose();
  }
};

// In Dialog component
<Dialog
  open={open}
  onOpenChange={(isOpen) => {
    if (!isOpen) handleCloseAttempt();
  }}
>
  <DialogContent 
    className="max-w-5xl"
    onEscapeKeyDown={(e) => {
      if (hasUnsavedData) {
        e.preventDefault();
        handleCloseAttempt();
      }
    }}
    onPointerDownOutside={(e) => {
      if (hasUnsavedData) {
        e.preventDefault();
        handleCloseAttempt();
      }
    }}
    onInteractOutside={(e) => {
      if (hasUnsavedData) {
        e.preventDefault();
      }
    }}
  >
```

## Radix UI Dialog Handlers

### Available Event Handlers

1. **onEscapeKeyDown**: Triggered when ESC key is pressed
   - `e.preventDefault()` prevents the dialog from closing
   - Used for conditional close behavior

2. **onPointerDownOutside**: Triggered when pointer down event happens outside the dialog
   - `e.preventDefault()` prevents the dialog from closing
   - Fires before `onInteractOutside`

3. **onInteractOutside**: Triggered when interaction (click, touch, focus) happens outside the dialog
   - `e.preventDefault()` prevents the dialog from closing
   - Catches all interaction types

4. **onOpenChange**: Triggered when dialog open state changes
   - Called when close button is clicked or when ESC/outside-click handlers don't prevent closing
   - Used to sync with parent component state

### Handler Execution Order

1. User clicks outside → `onPointerDownOutside` fires
2. If not prevented → `onInteractOutside` fires
3. If not prevented → Dialog closes → `onOpenChange(false)` fires

## Application to Existing Modals

### Inline Modals (Page-Level Components)

Several page components have inline modal implementations that should follow the same pattern:

#### Read-Only/Info Modals
**Should close on ESC/outside-click without warning**:
- `SupplierDetailModal` (SuppliersPage.tsx)
- PO Details Modal (PurchaseOrdersPage.tsx)
- GR Details Modal (GoodsReceiptsPage.tsx)
- Cost Alerts Modal (GoodsReceiptsPage.tsx)

**Pattern**:
```tsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent>
    {/* content */}
  </DialogContent>
</Dialog>
```

#### Form/Data-Entry Modals
**Should warn if unsaved data exists**:
- `SupplierFormModal` (SuppliersPage.tsx)
- `CreatePOModal` (PurchaseOrdersPage.tsx)

**Pattern**: Same as ManualGRModal implementation above

### Extracted Modal Components

#### POSModal (Completed ✅)
- **File**: `samplepos.client/src/components/pos/POSModal.tsx`
- **Status**: Implemented with `preventOutsideClose` prop
- **Used by**: POSPage payment/receipt/edit modals

#### ManualGRModal (Completed ✅)
- **File**: `samplepos.client/src/components/inventory/ManualGRModal.tsx`
- **Status**: Implemented with unsaved data detection
- **Used by**: GoodsReceiptsPage

## Testing Checklist

For each modal implementation, verify:

- [ ] ESC key closes the modal (if no `preventOutsideClose`)
- [ ] Clicking overlay/backdrop closes the modal (if no `preventOutsideClose`)
- [ ] `preventOutsideClose` prop prevents both ESC and outside-click
- [ ] Form modals show confirmation if unsaved data exists
- [ ] Closing handlers properly reset form state
- [ ] Accessibility features preserved (DialogTitle, DialogDescription)
- [ ] Focus returns to triggering element after close
- [ ] No TypeScript errors

## Benefits

1. **Speed**: Users can quickly dismiss modals with ESC or outside-click
2. **Consistency**: Industry-standard behavior users expect
3. **Safety**: Unsaved data warnings prevent accidental loss
4. **Flexibility**: `preventOutsideClose` flag for critical confirmations
5. **Accessibility**: ESC key works for keyboard-only workflows

## Migration Guide

### For New Modals

Use POSModal as template for reusable modal components:
```tsx
import POSModal from '@/components/pos/POSModal';

function MyFeature() {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <POSModal 
      open={isOpen} 
      onOpenChange={setIsOpen}
      title="My Modal"
      description="Modal description"
    >
      {/* content */}
    </POSModal>
  );
}
```

### For Existing Inline Modals

1. Identify modal type (read-only, form, destructive)
2. Add ESC/outside-click handlers to `DialogContent`
3. For forms: Detect unsaved data and show confirmation
4. Test all close paths (ESC, outside-click, close button)

### For shadcn/ui Dialog Components

The shadcn/ui `Dialog` wrapper accepts all Radix UI props via `...props`, so handlers can be passed directly to `DialogContent`:

```tsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent
    onEscapeKeyDown={(e) => {
      if (shouldPreventClose) {
        e.preventDefault();
        handleCloseAttempt();
      }
    }}
    onPointerDownOutside={(e) => {
      if (shouldPreventClose) {
        e.preventDefault();
        handleCloseAttempt();
      }
    }}
    onInteractOutside={(e) => {
      if (shouldPreventClose) {
        e.preventDefault();
      }
    }}
  >
    {/* content */}
  </DialogContent>
</Dialog>
```

## Related Files

- **POSModal**: `samplepos.client/src/components/pos/POSModal.tsx`
- **ManualGRModal**: `samplepos.client/src/components/inventory/ManualGRModal.tsx`
- **shadcn/ui Dialog**: `samplepos.client/src/components/ui/dialog.tsx`
- **POS Integration Docs**: `POS_INTEGRATION_COMPLETE.md`

## Future Enhancements

1. **Reusable Hook**: Create `useModalCloseHandlers(hasUnsavedData, onClose)` hook
2. **Consistent Confirmation**: Replace `window.confirm()` with custom modal component
3. **Migration Script**: Auto-migrate inline modals to new pattern
4. **Visual Indicator**: Add "unsaved changes" badge to modal header
5. **Keyboard Shortcuts**: Document ESC behavior in modal footers

---

**Note**: This enhancement aligns with SamplePOS architecture principle of responsive, keyboard-friendly UX for operations screens where speed matters.
