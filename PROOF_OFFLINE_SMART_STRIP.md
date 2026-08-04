# PROOF — Offline smart status strip

## Scope
Unify Online / last online / offline queue / refresh cache into one smart strip in
`samplepos.client/src/components/offline/OfflineSyncStatusPanel.tsx`.

## Integrity
| Check | Result |
|-------|--------|
| `offline-sync-status-smart-strip.evidence.test.ts` | PASS (local pre-commit / CI) |
| No legacy headings `Offline Sales Queue` / `No offline sales queued` | Enforced by evidence |
| Settings Offline tab + Restaurant floor `compact` | Single component surface |

## Healthy strip (copy SSOT)
`● Online · Live · Queue clear · Cache …m ago` + **Refresh cache**

## Deploy fingerprint (fill after prod push)
| Field | Value |
|-------|--------|
| Commit | _pending_ |
| Deploy run | _pending_ |
| `/api/health` | _pending_ |
| SPA asset | _pending_ |
| Bundle markers | `Queue clear`, `Refresh cache` |
