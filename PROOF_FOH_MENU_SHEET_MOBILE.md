# Proof — FOH menu access on small screens (ticket sheet)

## Problem
On phones / compact handhelds the order surface stacked under the menu and capped menu height (~32–42%), so product tiles were effectively unreachable. Ticket controls always occupied space even when the waiter only needed the menu.

## Fix (adaptive SSOT)
| Token | Dense / ultra handheld | Comfortable desk |
| --- | --- | --- |
| `chrome.density` | `dense` / `ultra` | `comfortable` |
| `chrome.fohTicketPane` | **`sheet`** | **`column`** |

**Sheet mode (small screen):**
1. **Menu owns the viewport** (`max-h-none`, `data-foh-menu-full="1"`).
2. **Sticky dock** (`data-foh-order-dock`) — total + open ticket; **KOT only** when a single ticket has lines (progressive).
3. **Full ticket overlay** on demand (`← Menu` return, KOT/Bill/Pay/Merge only inside the sheet when needed).
4. Opening a multi-ticket row auto-opens the ticket sheet.

**Column mode (desktop):** side-by-side menu + ticket unchanged.

Resolver: `resolveFohTicketPane(density)` in `samplepos.client/src/lib/adaptiveChrome.ts`.

## Evidence (automated)
```bash
cd samplepos.client
npx vitest run src/__tests__/adaptive-chrome.ssot.evidence.test.ts
```

Seals:
- `fohTicketPane === 'sheet'` for mobile/compact density; `column` for desktop comfortable.
- Restaurant FOH wires `chrome.fohTicketPane`, dock + menu-full markers; **no** legacy `max-h-[32%]` / `max-h-[38%]` menu clamp.
- On-demand surface list includes `foh-ticket-pane`.

## Manual (Sunmi / phone)
1. Open Restaurant FOH on a viewport &lt; 1024px (or force narrow + short height).
2. Select an occupied table — **product grid fills the screen**; bottom dock only.
3. Tap **Ticket** dock → ticket board; **← Menu** returns to full menu.
4. Multi-ticket: open list via dock; tap coloured ticket → lines + KOT/Bill/Pay.
5. Secondary actions (Change table / Merge / Cancel) remain under **⋯** / sheets, not always-on chrome.
