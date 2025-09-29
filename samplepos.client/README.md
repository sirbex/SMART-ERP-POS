## Sample POS (React + TypeScript + Vite)

This project is an in-browser Point of Sale (POS) prototype featuring inventory management (batches, expiry, unit conversions), a searchable cart, customer ledger integration, payments, and receipt printing. It is designed to function fully offline using `localStorage` for persistence.

### Key Features

- Inventory management with:
  - Batch & expiry tracking
  - Reorder level flagging & low stock highlighting
  - Optional unit conversions (e.g. carton -> pieces)
  - Barcode printing (CODE128)
- Predictive unified search across products, cart items, and customers
- POS cart with inline quantity & unit changes and edit/remove modals
- Persistent cart (auto-saved) surviving page reloads until checkout
- Centralized currency formatting via `formatCurrency` in `src/utils/currency.ts` (currently configured for UGX display)
- Save / recall cart manually (Ctrl+S / Ctrl+R) separate from auto persistence
- Payment modal (multi payment types) with validation & change calc
- Receipt modal with print support
- CSV export (inventory, audit log, cart)
- Inventory audit log (add actions & quantity context)
- Keyboard shortcuts: Ctrl+F (focus search), Ctrl+Enter (payment), Ctrl+S (save cart), Ctrl+R (recall cart), Esc (close modal)
- Accessibility enhancements with focus trapping and aria labels

### Persistence

Inventory and the active cart are stored in `localStorage` using these keys:

| Key | Purpose |
| --- | ------- |
| `inventory_items` | Current inventory list shared between Inventory and POS screens |
| `pos_persisted_cart_v1` | Auto-saved active cart restored on refresh until sale completion |

The persisted cart is filtered on load to discard items whose inventory entries were removed (matching by name + batch when available). It is cleared after a successful sale.

### Focus Trapping

All modal dialogs (payment, receipt, edit item, remove confirm) use a custom hook located at `src/hooks/useFocusTrap.ts` which:
1. Captures the previously focused element
2. Moves focus to the first interactive element inside the modal
3. Cycles Tab / Shift+Tab within focusable elements
4. Handles Escape to close the current modal
5. Restores original focus on unmount

### Accessibility Notes

Each modal uses `role="dialog"` and `aria-modal="true"`. Interactive elements include descriptive `aria-label` or visible labels. Keyboard-only workflows are supported end-to-end (search → add → edit → pay → receipt → print/close).

### Development

Run dev server:

```powershell
npm install
npm run dev
```

### Potential Next Enhancements

- Offline sync & conflict resolution layer (Service Worker + background sync)
- Split payments / partial credit ledger posting
- Advanced tax rules & multi-currency support
- Report dashboards (daily sales, inventory aging, customer balances)
- Undo/rollback for recent actions

### License

For internal demonstration / prototype purposes only (add a proper license if distributing).
