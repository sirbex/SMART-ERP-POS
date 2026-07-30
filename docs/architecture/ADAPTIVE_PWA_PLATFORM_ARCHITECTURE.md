# SMART-ERP-POS Adaptive PWA Platform Architecture

**Status:** Phase 6 wave 2 complete (Accounting hubs + Reports AdaptiveReportShell)  
**Date:** 2026-07-30  
**Scope:** Single adaptive Progressive Web App across desktop, tablet, phone, and Android POS (including Sunmi) — one backend, one API, one domain model, one SSOT  
**Audience:** Engineering, product, and platform owners  

### Implementation progress

| Phase | Status | Notes |
|-------|--------|-------|
| 0 Ratify ADR | Done | This document |
| 1 Capabilities + Workspace SSOT | **Done** | `deviceCapabilities.ts`, `workspaces.ts`, hooks, shell wiring, evidence tests |
| 2 AdaptivePage/Toolbar/Search/Scanner/Print | **Done** | `adaptiveFloorplan.ts` + five Adaptive* components, evidence tests |
| 3 Shell unification (Layout + POS nav) | **Done** | `adaptiveShellNav.ts` + workspace-driven AdaptiveNavigation/Layout/POS |
| 4 Floorplans: POS + Sales/Invoices | **Done** | SalesPage + DistInvoiceListPage Adaptive*; POS AdaptiveScanner; PrintReceipt AdaptiveDialog |
| 5 Floorplans: Inventory + Purchasing | **Done** | Stock/GRN/PO/Suppliers Adaptive*; Restaurant KOT small-screen fix |
| 6–8 | Pending | See §20 |

---

## 0. Executive verdict

SMART-ERP-POS already has the correct **SSOT spine** and a **partial adaptive presentation layer**. This redesign is **not a rewrite** and **not a second product**.

| Layer | Current state | Decision |
|-------|---------------|----------|
| Domain / API / DB | One Express API, PostgreSQL, shared Zod, server-side pricing/tax/FEFO/GL/RBAC | **Preserve. Do not fork.** |
| Offline | Immutable event journal → `POST /api/pos/sync-events` | **Preserve and harden.** |
| Adaptive UI | Layout tiers, Adaptive* components, progressive chrome | **Extend into a Workspace System.** |
| PWA install / native feel | Custom SW, tenant manifest, Sunmi WebView + print bridge | **Complete gaps; do not replace with a native app.** |
| Android shell | `android/` WebView host for Sunmi printer | **Keep as thin hardware bridge only.** |

**Non-negotiable:** UI may adapt. Business rules may not. No `/api/mobile/*`, no parallel controllers, no client-authoritative tax/pricing/inventory/accounting.

---

## 1. Investigation summary (current architecture)

### 1.1 Monorepo SSOT stack

```
Presentation (samplepos.client PWA + optional android WebView)
        ↓ same REST
Application (SamplePOS.Server controllers/routes)
        ↓
Domain services (pricing, tax, inventory-lot/FEFO, sales, accountingCore, RBAC)
        ↓
Infrastructure (pg, Redis/Bull, PDFKit, caches)
        ↓
PostgreSQL (per-tenant DBs; schema via shared/sql)
```

Contracts live in `shared/` (`@samplepos/shared`: Zod, types, authorization, migrations).

### 1.2 What already exists (reuse — do not duplicate)

| Capability | Canonical location |
|------------|-------------------|
| Layout tiers (mobile / compact / desktop / wide) | `samplepos.client/src/lib/layoutTiers.ts` |
| Capability detection (width, touch, pointer) | `samplepos.client/src/hooks/useLayoutTier.ts` |
| Progressive disclosure SSOT | `samplepos.client/src/lib/adaptiveChrome.ts` |
| Adaptive shell / nav / grid / form / dialog / action bar / reports | `samplepos.client/src/components/adaptive/*` |
| App chrome | `samplepos.client/src/components/Layout.tsx` |
| Offline journal + sync | `offlineEventJournal.ts`, `offlineSyncEngine.ts`, `docs/OFFLINE_ARCHITECTURE_RULES.md` |
| IndexedDB catalog | `offlineDb.ts`, `offlineCatalogService.ts` |
| Print strategies (Sunmi → local bridge → browser) | `lib/print.ts`, `localPrintBridge.ts`, `android/.../PrintBridge.kt` |
| HID barcode wedge | `hooks/useBarcodeScanner.ts` |
| Auth + quick login / device fingerprint | `/api/auth`, `/api/auth/quick-login` |
| RBAC | `SamplePOS.Server/src/rbac/*`, `shared/authorization/*` |
| GL posting SSOT | `services/accountingCore.ts` (see `ACCOUNTING_SINGLE_SOURCE_OF_TRUTH.md`) |

### 1.3 Gaps vs target platform

| Gap | Impact |
|-----|--------|
| Adaptive foundation exists but **module adoption is uneven** (large pages still bespoke) | Inconsistent UX; risk of per-page hide/show forks |
| No first-class **Workspace** abstraction (POS / Handheld / Management as policies) | Tier alone is insufficient for role×task surfaces |
| PWA **install prompt / splash polish / Wake Lock / BarcodeDetector** incomplete | Feels less “native” on phone/Sunmi |
| Capability model lacks printer/scanner/camera/keyboard/offline as first-class signals | Hardware-aware layouts under-specified |
| Dual API client heads (`utils/api.ts` + `services/api.ts`) | Drift risk for adaptive work |
| Legacy offline sale sync endpoint still present | Must stay legacy-only per offline rules |
| `ARCHITECTURE.md` module counts stale | Use `server.ts` + `src/modules/` as live inventory |

### 1.4 Benchmarking (interaction principles, not visual copy)

| System | Principle to adopt | How it maps here |
|--------|--------------------|------------------|
| **SAP Fiori** | Shell + floorplans; progressive disclosure; one OData/API | Non-scrolling app shell (`index.css`); Adaptive* floorplans; one REST |
| **Microsoft Business Central / Fluent** | Dense desktop grids; role centers | Desktop/Wide workspace + AdaptiveDataGrid |
| **Odoo Mobile** | Same models, mobile views | Same Zod/API; card/list views by tier |
| **Oracle Fusion** | Task flows; springboards | Workspace shortcuts + role lockdown |
| **Shopify POS / Square POS** | Fast scan→cart→pay; hardware bridges | POS Workspace + print/scan capability adapters |
| **Sunmi best practice** | WebView + native print SDK; large touch targets | Existing Android bridge; compact/touch-first tokens |

---

## 2. Absolute constraints (SSOT)

1. **Never duplicate business logic** — pricing, tax, allocation, FEFO/FIFO, approvals, posting, RBAC stay on the server (and shared validators). Client may cache projections and enqueue events only.
2. **Single API** — every surface calls the same routes. Device differences are headers/capabilities at most (e.g. idempotency, device fingerprint), never alternate controllers.
3. **One domain model** — Products, Inventory, Sales, Purchasing, Accounting, CRM, Restaurant, Manufacturing, Treasury remain canonical in modules + `shared/`.
4. **Presentation-only adaptation** — Desktop grid / Phone cards / Sunmi wizard = same command (e.g. create sale, post JE, receive GRN).
5. **Offline is journal → replay** — not a second domain engine (`docs/OFFLINE_ARCHITECTURE_RULES.md`).
6. **Do not modify** accounting, inventory, pricing, or treasury logic unless a defect is proven.

---

## 3. Adaptive Workspace Architecture

### 3.1 Concept

A **Workspace** is a **presentation policy** bound to capabilities + role + task context. It does **not** own business rules.

```
DeviceCapabilities  ×  UserRole/Permissions  ×  TaskContext
                    →  WorkspaceProfile
                    →  Adaptive chrome + layout + component variants
                    →  Same Application Commands → Same API
```

### 3.2 Workspace catalog

| Workspace | Primary triggers | Presentation intent |
|-----------|------------------|---------------------|
| **Desktop Workspace** | `tier ∈ {desktop, wide}`, fine pointer, keyboard | Persistent sidebar, multi-column forms, full data grids, keyboard shortcuts |
| **Tablet Workspace** | `tier = compact` or large touch landscape | Collapsible rail, two-column forms, reduced columns, near-full dialogs |
| **Handheld Workspace** | `tier = mobile` | Bottom nav, single column, cards, progressive “More/Advanced” |
| **POS Workspace** | Route family `/pos`, `/restaurant/*` + touchFirst | Multi-panel (desktop) / large buttons + scan-first (compact/mobile); minimal chrome |
| **Management Workspace** | Accounting / reports / admin routes on desktop-like | Dense analytics, AdaptiveReportShell, keyboard-heavy |

Workspaces compose; they do not fork APIs. Example: a Sunmi T2 in landscape may be **POS Workspace + Compact tokens**.

### 3.3 Implementation shape (extend existing — no parallel system)

```
lib/layoutTiers.ts          // viewport tier SSOT (exists)
lib/adaptiveChrome.ts       // progressive disclosure SSOT (exists)
lib/deviceCapabilities.ts   // NEW: printer, scanner, camera, keyboard, network, wake-lock, install
lib/workspaces.ts           // NEW: resolveWorkspace(capabilities, role, route) → WorkspaceProfile
components/adaptive/*       // extend; do not create AdaptiveV2
```

`WorkspaceProfile` references existing tokens (`LayoutShellTokens`, `AdaptiveChrome`) plus workspace-specific layout slots (nav pattern, list density, POS panel mode).

### 3.4 Command pattern (presentation → application)

Every UI action maps to a **command** already backed by hooks/API:

| UI variant | Command | API |
|------------|---------|-----|
| Invoice grid row → Open | `openCustomerInvoice(id)` | `GET /api/...` existing |
| Invoice card → Open | same | same |
| Sunmi invoice wizard step Confirm | `postCustomerInvoice(...)` | same POST |
| POS Pay (any device) | sale/order completion path | online: sales/orders; offline: journal → `sync-events` |

**Impact:** New workspace code touches presentation + thin command wrappers only. Zero new business endpoints.

---

## 4. Responsive Design System

### 4.1 Breakpoints (already SSOT)

| Tier | Width | Nav | Forms | Dialogs | Touch target |
|------|-------|-----|-------|---------|--------------|
| Mobile | &lt;768 | drawer + bottom nav | 1 col | full | 48px |
| Compact | 768–1023 | rail | 2 col | near-full | 48px |
| Desktop | 1024–1599 | sidebar | 3 col | modal | 44px |
| Wide | ≥1600 | sidebar | 4 col | modal | 44px |

Tailwind aliases already include `compact`, `desktop`, `wide` in `tailwind.config.js`.

### 4.2 Design tokens

- Continue CSS variables from AdaptiveAppShell (`--layout-touch-target`, sidebar widths, form columns, `data-layout-tier`).
- Keep Radix + Tailwind + CVA primitives in `components/ui/`.
- **Deprecate parallel “Responsive*” usage** in new code in favor of Adaptive* (migrate opportunistically).

### 4.3 Progressive disclosure (product rule)

| Tier | Default | Deferred behind More / Advanced / Expand |
|------|---------|------------------------------------------|
| Desktop / Wide | Show primary + secondary inline | Rare admin/debug only |
| Compact | Primary + compact helpers | Secondary actions in sheets |
| Mobile / POS compact | Essentials only | Coach, field helpers, advanced filters, destructive ops |

Policy must continue to flow from `resolveAdaptiveChrome` — modules must not invent private matrices (`adaptiveChrome.ts` contract).

---

## 5. Device Capability Detection Strategy

### 5.1 Detect capabilities, never brands

**Do detect:**

| Signal | Source | Use |
|--------|--------|-----|
| Viewport width/height | `window` resize / orientation | Tier |
| Pointer coarse / fine | `matchMedia('(pointer: …)')` | Touch-first controls |
| Touch points | `navigator.maxTouchPoints` | Touch-first |
| Hover capability | `matchMedia('(hover: hover)')` | Tooltips vs long-press |
| Hardware keyboard | `keydown` heuristics / `navigator.keyboard` where available | Shortcut coach |
| Camera | `mediaDevices.enumerateDevices` | Camera scan affordance |
| BarcodeDetector API | `'BarcodeDetector' in window` | Camera barcode path |
| Network / offline | `navigator.onLine` + OfflineContext | Queue UI, sync |
| Display mode standalone | `display-mode: standalone` | Hide browser chrome assumptions |
| Wake Lock support | `'wakeLock' in navigator` | POS shift lock |
| Printer bridge | `window.SunmiPrinter` or `localhost:1811` probe | Print strategy order |
| Bluetooth / USB | Feature-detect only; optional | Future peripherals |

**Do not detect:** “Is Sunmi V3?” via UA as a layout switch. Sunmi is satisfied by **compact + touchFirst + printer capability**.

### 5.2 Capability object (target)

```ts
type DeviceCapabilities = LayoutCapabilities & {
  hasHwKeyboard: boolean;
  hasCamera: boolean;
  hasBarcodeDetector: boolean;
  hasHidScannerBehavior: boolean; // wedge already via useBarcodeScanner
  printer: 'sunmi' | 'local-bridge' | 'browser' | 'none';
  canWakeLock: boolean;
  isStandalone: boolean;
  isOffline: boolean;
};
```

Extend `useLayoutTier` or add `useDeviceCapabilities` composing it — single hook consumed by workspace resolver.

---

## 6. PWA Architecture

### 6.1 Current

- Custom `public/sw.js` (Cache API; not Workbox)
- Tenant-branded manifest via `/api/tenant/manifest.json`
- SW registration in production (`main.tsx`)
- Background Sync tag `sync-offline-sales` → journal POST
- Offline fallback `offline.html`
- Update toast in `App.tsx`

### 6.2 Target native-feel checklist

| Feature | Approach | SSOT impact |
|---------|----------|-------------|
| App install | `beforeinstallprompt` UX + Android WebView already “installed” | Presentation only |
| Splash / theme | Manifest + branding settings (exists) | Tenant settings API only |
| Offline launch | Keep SW shell + IDB catalog | No domain change |
| Background sync | Keep SW tag + `offlineSyncEngine` | Replay stays server-side |
| Push notifications | Optional phase; Web Push + server topic | New infra; no business fork |
| Camera / barcode | Progressive enhancement beside HID wedge | Same product lookup APIs |
| Clipboard | Existing browser APIs | — |
| Keyboard shortcuts | Desktop workspace | — |
| Fullscreen | Already partially in POSPage | — |
| Screen Wake Lock | POS Workspace when supported | — |
| Bluetooth / USB | Feature-detect; prefer existing print bridge | Do not invent parallel print domain |
| Thermal / Sunmi | Existing strategy chain in `print.ts` | — |

### 6.3 Decision: keep custom SW unless proven insufficient

Migrating to Workbox is optional hardening, not a prerequisite. Any SW change must preserve:

- Non-interception of mutating API calls (journal owns offline writes)
- Background sync → `/api/pos/sync-events`
- Tenant manifest URL

---

## 7. Sunmi Native Integration Strategy

```
┌─────────────────────────────────────────┐
│  Android WebView shell (android/)       │
│  - Loads same PWA origin                │
│  - Injects window.SunmiPrinter          │
│  - PrintBridge / SunmiPrinterManager    │
└──────────────────┬──────────────────────┘
                   │ same HTTPS origin / API
                   ▼
┌─────────────────────────────────────────┐
│  Adaptive PWA (samplepos.client)        │
│  POS Workspace + compact/touch tokens    │
│  print.ts Strategy 0: SunmiPrinter      │
└──────────────────┬──────────────────────┘
                   │ REST (identical)
                   ▼
            SamplePOS.Server
```

**Rules:**

1. Android project stays a **hardware host**, not a second UI codebase.
2. No Kotlin business logic for pricing/tax/stock/GL.
3. Printer name routing for restaurant stations remains client metadata + server config (`printerName`); print execution stays on device.
4. Target devices (V2/V3/T2/other Android POS) share one WebView app + capability detection.
5. Prefer large touch targets via compact/mobile tokens (already 48px).

**Impact analysis:** Changes limited to `android/*` bridge + `lib/print.ts` / capability detection. Zero API surface change.

---

## 8. Offline-First Architecture

### 8.1 Preserve immutable journal model

Per `docs/OFFLINE_ARCHITECTURE_RULES.md`:

- Append-only events in journal storage
- Sync state separate from events
- Replay via `POST /api/pos/sync-events` → `posEventReplayer` → existing sales/orders services
- Conflicts: idempotent 409 = synced; 422/review = human review (not silent merge)
- **Forbidden:** client posting authoritative sales while inventing GL/FEFO locally

### 8.2 Layers

| Concern | Store | Authority |
|---------|-------|-----------|
| Catalog / stock projection | IndexedDB (`offlineDb`) | Server on sync; local decrement is optimistic |
| POS/restaurant events | Event journal | Server on replay |
| Generic failed mutations | `offlineRequestQueue` | Server when online |
| Accounting / FEFO / tax | — | **Server only** |

### 8.3 Offline printing

Receipt HTML/payload generated from local sale projection; print via Sunmi/bridge/browser **without** waiting for sync. Reprint audit remains server permission when online.

---

## 9. Adaptive Component Library

### 9.1 Canonical set (extend existing)

| Component | Status | Responsibility |
|-----------|--------|----------------|
| AdaptiveAppShell | Exists | Tier context, CSS vars |
| AdaptiveNavigation / ShellBar / BottomNav | Exists | Nav modes |
| AdaptiveDataGrid | Exists | Table ↔ cards |
| AdaptiveFormLayout / Field | Exists | Column policy |
| AdaptiveDialog | Exists | full / near-full / modal |
| AdaptiveActionBar | Exists | Sticky / sheet |
| AdaptiveReportShell / Summary | Exists | Report chrome |
| AdaptivePage | **Add** | Page template: title, primary actions, disclosure slots |
| AdaptiveToolbar | **Add** | Search + filters + bulk actions density |
| AdaptiveSearch | **Add** | Compact vs expanded search (wrap POSSearchBar patterns) |
| AdaptiveScanner | **Add** | HID + optional camera; emits same barcode callback |
| AdaptivePrintPreview | **Add** | Preview + strategy-aware print |
| AdaptiveCards | **Standardize** | Align MobileListCard / grid card variant |

### 9.2 Adoption rule

Every ERP module **consumes** these. New screens must not introduce one-off breakpoint matrices. Evidence tests already exist (`layout-tiers.evidence.test.ts`, `adaptive-chrome.ssot.evidence.test.ts`, `adaptive-phase4.evidence.test.ts`) — extend them for workspaces.

### 9.3 Deprecation path

`ResponsiveGrid`, `ResponsiveFormGrid`, `ResponsiveActionBar`, `ResponsiveTableWrapper` → thin wrappers over Adaptive* or migrate call sites; delete when unused.

---

## 10. Navigation System

| Surface | Pattern | Source of truth for *what* appears |
|---------|---------|-------------------------------------|
| Desktop / Wide | Persistent sidebar | Permissions + plan features + lockdown utils |
| Tablet / Compact | Collapsible rail | Same |
| Phone | Bottom nav (3 + More) + drawer | Same |
| Sunmi / POS | Minimal / role shortcuts | Cashier/waiter lockdown + POS workspace |
| Nested domains | Inventory tabs, Accounting sidebar | Existing layouts |

**Do not** create a second permission catalog for mobile. Client authorization (`createClientAuthorization`) remains a **projection** of server RBAC.

---

## 11. UX standards by surface

### 11.1 Mobile UX

- Essentials first; Advanced behind disclosure
- Cards over grids; full-screen dialogs
- 48px targets; thumb-zone primary CTAs
- Avoid hover-only affordances
- Network banner + sync status always reachable

### 11.2 Tablet UX

- Two-column forms; rail navigation
- Reduced grid columns; near-full dialogs
- Support landscape POS on T2-class devices

### 11.3 Desktop UX

- Persistent sidebar; multi-column forms
- Full data grids with sort/filter/keyboard
- Modal dialogs; verbose labels OK
- Shortcut map for POS and high-frequency accounting

### 11.4 POS UX

| Capability | Desktop | Phone | Sunmi / compact |
|------------|---------|-------|-----------------|
| Layout | Multi-panel catalog + cart + pay | Compact selling stack | Large buttons, scan-first |
| Scanner | HID + optional camera | Camera preferred + HID | HID primary |
| Print | Bridge / browser | Browser / share | Sunmi native |
| Offline | Full journal path | Same | Same |
| One-handed | Secondary | Primary design goal | Primary on handheld |

**Same POS engine:** `cartStore`, sales/orders APIs, offline journal — no Sunmi-specific sale service.

---

## 12. Performance optimisations

| Area | Practice |
|------|----------|
| Routing | Keep `lazyWithRetry` route splitting |
| Data | React Query `offlineFirst`; tune staleTimes per catalog vs transactional |
| Lists | Virtualize large desktop grids; card windows on mobile |
| POS | Catalog from IDB when offline; avoid refetch storms on resume |
| SW | Cache static + selected GETs; never cache authenticated mutating semantics incorrectly |
| Bundle | Do not ship desktop-only chart stacks into POS-critical path without split |
| Images / icons | Prefer lucide; compress PWA icons |
| Wake Lock / fullscreen | Only on POS surfaces to save battery |

No change to server posting paths for performance theater.

---

## 13. Accessibility standards

- WCAG 2.2 AA target for management/desktop; POS may prioritize speed but must keep focus order, labels, contrast
- Touch targets ≥ 44–48px per tier tokens
- Do not rely on color alone for sync/error states
- `user-scalable=no` in `index.html` is a **known tension** with a11y — revisit for non-POS routes; keep pinch-lock only where industrial POS requires it
- Dialog modes must trap focus (Radix)
- Screen reader labels on icon-only compact actions

---

## 14. Printing Architecture

```
printReceipt / printHtmlDocument
    ├─ 0. window.SunmiPrinter (Android WebView)
    ├─ 1. local ESC/POS agent http://localhost:1811
    └─ 2. Browser iframe print
```

- Settings: `GET /api/system-settings/printing/*`
- Documents/PDF: server `modules/documents` for formal docs; thermal remains device-local
- Reprint: permission `sales.reprint` + audit
- AdaptivePrintPreview selects strategy from capabilities; **payload builders stay shared**

**Impact:** Presentation + bridge only. No print-job microservice required for SSOT.

---

## 15. Scanning Architecture

```
Physical scanner (HID keyboard wedge)
    → useBarcodeScanner → product lookup APIs / offline catalog

Optional camera (BarcodeDetector / getUserMedia)
    → AdaptiveScanner → same lookup callback
```

- Lookup SSOT: existing product/barcode APIs + `barcodeService` cache
- No `/api/scan` domain fork
- Offline: resolve against IndexedDB catalog; queue sale events normally

---

## 16. SSOT Validation Matrix

| Concern | Single owner | Client may | Client must not |
|---------|--------------|------------|-----------------|
| Pricing | `pricingEngineService` / pricing services | Display quoted prices | Invent discount/tax math as authority |
| Tax | `taxEngine.ts` | Show lines | Alternate tax engine |
| FEFO / lots | `lotService` / `fefoDeduction` | Optimistic batch hint | Final allocation authority offline without replay |
| FIFO / cost | `costLayerService` | — | Recalculate COGS as truth |
| GL posting | `accountingCore` | — | Post journals locally |
| RBAC | Server RBAC + shared grants | Hide nav | Bypass via alternate API |
| Sale creation | `salesService` (+ replayer) | Journal events | Dual write paths for new features |
| Validation shapes | `shared/zod` | Mirror UX validation | Diverge schemas |
| Offline truth | Journal + server replay | Derive UI | Mutable queues / parallel keys |

**Validation method:** Architecture CI/evidence tests; forbid new `/api/mobile` routes; PR checklist includes “workspace-only change?”.

---

## 17. Migration plan from current UI

### Phase A — Foundations (no user-visible breakage)

1. Add `deviceCapabilities` + `workspaces` resolvers composing existing tiers/chrome.
2. Add AdaptivePage / Toolbar / Search / Scanner / PrintPreview shells.
3. Document adoption rules in `DEVELOPMENT_RULES` / Copilot instructions.
4. Consolidate new API calls onto `utils/api.ts` + React Query (stop growing `services/api.ts`).

### Phase B — Shell & navigation parity

1. Ensure Layout + POS/Restaurant shells read WorkspaceProfile.
2. Normalize bottom nav / rail / sidebar solely via workspace + tier.
3. Cashier/waiter lockdown unchanged (policy projection).

### Phase C — Module floorplan migration

Migrate high-traffic surfaces to Adaptive* in this order:

1. POS + Restaurant FOH  
2. Sales / Invoices / Customers  
3. Inventory documents (GRN, transfers, adjustments)  
4. Purchasing / Suppliers  
5. Accounting lists & journals  
6. Reports (AdaptiveReportShell)  
7. Settings / Admin  

Rule: **one floorplan at a time**; behavior tests prove same API commands.

### Phase D — PWA native completion

Install UX, Wake Lock on POS, optional BarcodeDetector, splash/manifest QA on Android WebView + desktop Chromium.

### Phase E — Cleanup

Remove dead Responsive* wrappers; delete unused legacy offline sync call sites; refresh `ARCHITECTURE.md` counts.

**Rollback:** Feature-flag workspace profiles if needed; tiers alone remain fallback.

---

## 18. Impact analysis (every change class)

| Change class | Touches | API | Domain | Risk |
|--------------|---------|-----|--------|------|
| Workspace resolver | client lib/hooks | None | None | Low |
| Adaptive component | client components | None | None | Low |
| Page migration to Adaptive* | pages only | None | None | Medium (UX regression) |
| Capability detection | hooks | None | None | Low |
| PWA install / Wake Lock | client + manifest | None | None | Low |
| SW cache tweak | `sw.js` | Must not alter mutation semantics | None | Medium |
| Sunmi bridge | android + print.ts | None | None | Medium (device QA) |
| Offline journal fields | client + replayer + zod | sync-events contract | Replay only | **High** — needs ADR |
| New business rule | server service | maybe | Yes | **Out of scope** unless defect |

---

## 19. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Parallel “mobile design system” forks SSOT | Ban new Responsive*; evidence tests on chrome/workspace |
| Offline client becomes second ledger | Enforce offline rules; review-only conflicts |
| Sunmi UA hacks | Capability-only; printer presence signal |
| Mega-page migrations (POSPage ~5.5k LOC) | Extract presentational panels behind Adaptive*; keep hooks/commands |
| Dual API clients drift | Lint/convention: new code → `utils/api.ts` |
| a11y vs POS scale lock | Route-conditional viewport meta |
| Scope creep into accounting rewrite | Explicit exclusion; defect-only changes |
| Push notifications / Bluetooth overreach | Phase later; optional capabilities |

---

## 20. End-to-end implementation roadmap

| Phase | Horizon | Outcomes | Exit criteria |
|-------|---------|----------|---------------|
| **0. Ratify** | 1 week | This ADR accepted; checklist in PR template | Stakeholder sign-off |
| **1. Capability + Workspace SSOT** | 2–3 weeks | `useDeviceCapabilities`, `resolveWorkspace`, evidence tests | Desktop/tablet/phone/POS profiles resolve deterministically |
| **2. Component completion** | 3–4 weeks | AdaptivePage/Toolbar/Search/Scanner/PrintPreview | Story/fixtures per tier |
| **3. Shell unification** | 2 weeks | Layout + POS/Restaurant consume workspaces | Nav modes match matrix |
| **4. Floorplan wave 1** | 4–6 weeks | POS + Sales/Invoices adaptive | Same API traces; UX QA on Sunmi + phone + desktop |
| **5. Floorplan wave 2** | 4–6 weeks | Inventory + Purchasing | No logic changes; visual parity tests |
| **6. Floorplan wave 3** | 4–6 weeks | Accounting + Reports | AdaptiveReportShell everywhere |
| **7. PWA native pack** | 2–3 weeks | Install, Wake Lock, camera scan optional | Lighthouse PWA + device QA |
| **8. Hardening** | ongoing | Perf, a11y, remove legacy Responsive/offline paths | Debt burn-down board |

**Staffing note:** Frontend-platform heavy; backend involvement only for sync contract or proven defects.

---

## 21. Explicit non-goals

- Separate Android/iOS business applications  
- Mobile-specific REST controllers  
- Rewriting GL, FEFO, pricing, or treasury for “mobile”  
- Replacing the offline journal with a mutable sync queue  
- Visual clone of SAP/Odoo/Square themes  

---

## 22. References (repo)

- `ARCHITECTURE.md` — system overview (module counts may be stale)  
- `ACCOUNTING_SINGLE_SOURCE_OF_TRUTH.md`  
- `docs/OFFLINE_ARCHITECTURE_RULES.md`  
- `docs/architecture/RESTAURANT_OFFLINE_ADR.md`  
- `docs/architecture/INVENTORY_LOT_DOMAIN_ADR.md`  
- `BARCODE_SERVICE_ARCHITECTURE.md`  
- `samplepos.client/src/lib/layoutTiers.ts`  
- `samplepos.client/src/lib/adaptiveChrome.ts`  
- `samplepos.client/src/components/adaptive/*`  
- `android/app/src/main/java/com/smarterp/pos/*`  

---

## Document control

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-07-30 | Initial platform ADR from codebase investigation |
