# PROOF — Adaptive FOH responsive integrity

**Generated:** 2026-08-15T22:43:59.362Z  
**Verdict:** **PASS** (36/36 tests)

## Guarantee

If this artifact is green, Restaurant FOH chrome is **capability-based** (width × height × touch), **OS-agnostic**, and primary CTAs (esp. Pay) plus **type scale** (caption/body/title/amount/cta) resolve from the **adaptiveChrome SSOT**. A ~10" laptop keeps a **side ticket column** with usable KOT/Bill/Pay (minmax track) — never a crushed vertical sliver, never phone sheet demotion solely because density is dense, and card/amount fonts step with density so labels are not hidden by fixed Tailwind sizes.

## Policy

| Rule | Value |
|------|--------|
| Inputs | `widthPx`, `heightPx`, `touchFirst` |
| Forbidden | UA / platform / OS / device brand |
| SSOT | `samplepos.client/src/lib/adaptiveChrome.ts` |

## Viewport matrix (doc classes only)

| Class | CSS size | Ticket pane | Action labels |
|-------|----------|-------------|---------------|
| `phone-portrait` | 390×844 | sheet | short |
| `phone-landscape-short` | 844×390 | sheet | short |
| `pos-pad-compact` | 800×1280 | sheet | short |
| `laptop-10in-1280x800` | 1280×800 | column | short |
| `laptop-1366x768` | 1366×768 | column | short |
| `desk-1440x900` | 1440×900 | column | verbose |
| `wide-1920x1080` | 1920×1080 | column | verbose |
| `wide-short-half-window` | 1800×800 | column | short |

## Gates

| Gate | Result | Detail |
|------|--------|--------|
| `R01_VIEWPORT_MATRIX` | PASS | 8 viewport classes: sheet on pads/phones; column on desk/laptop incl. dense 10" |
| `D01_DYNAMIC_PAY_LABELS` | PASS | resolvePayButtonLabel / resolveActionLabel from chrome.actionLabels only |
| `D02_LAPTOP_PACKING` | PASS | isLaptopShortViewport + isNarrowDesktopViewport densify without phone sheet |
| `D03_TYPE_SCALE` | PASS | resolveTypeScale(density) SSOT; shell stamps --type-*; FOH uses type-body/amount/cta |
| `S01_CROSS_OS_IDENTITY` | PASS | identical CSS geometry → identical chrome (Win/macOS/Linux) |
| `S02_NO_UA_FORK` | PASS | adaptiveChrome + layoutTiers forbid UA/platform/brand runtime forks |
| `L01_MINMAX_TICKET` | PASS | RestaurantPosPage minmax(19rem) ticket track + data-ticket-cta-grid |
| `L02_SHELL_STAMP` | PASS | AdaptiveAppShell + FOH stamp fohTicketPane / density / --pos-cta-min-h |
| `L03_CTA_CONTRACT` | PASS | KOT/Bill short literals; Pay from SSOT (no hard-coded verbose Pay) |
| `EVIDENCE_CHROME_SSOT` | PASS | adaptive-chrome.ssot.evidence.test.ts included in suite |
| `EVIDENCE_MULTI_TICKET_S03` | PASS | restaurantMultiTicketIntegrity S03 sheet/column SSOT included |

## Reproduce

```bash
node scripts/proof-adaptive-foh-responsive-integrity.mjs
```

## Artifacts

- JSON: `PROOF_ADAPTIVE_FOH_RESPONSIVE_INTEGRITY.json`
- MD: `PROOF_ADAPTIVE_FOH_RESPONSIVE_INTEGRITY.md`
