# Install code 5 — tested with proof

## Verdict: **PASS (5/5 evidence tests)**

Command:
```bash
cd samplepos.client && npx vitest run src/__tests__/print-service-install-code5.evidence.test.ts
```

| # | Evidence test | Result |
|---|---------------|--------|
| 1 | ISS `PrepareToInstall` + extract stop cmd before file copy | PASS |
| 2 | `[InstallDelete]` stale `app\dist` / `node_modules` + `restartreplace` | PASS |
| 3 | `Stop-PrintService-ForUpgrade.cmd` = sc stop + WinSW stop + scoped node kill | PASS |
| 4 | Built Setup.exe **FileVersion = 1.4.0.0** (not 0.0.0.0) | PASS |
| 5 | Bundle includes stop script + agent `1.4.0` | PASS |

## Disk confirmed
- `installer/dist/SMART-ERP-POS-PrintService-Setup.exe`
- FileVersion **1.4.0.0** · Product **1.4.0** · LastWrite **2026-08-15 12:32:51**

## What this proves / does not prove
- **Proves:** installer is built to stop the locked service before replace (the code-5 root cause).
- **Does not replace:** a live upgrade on the POS PC (install over running service once with this Setup).
