# SMART-ERP-POS clean-PC soak checklist (Phase 3)

Use a fresh Windows 10/11 VM with **no** Node.js, Git, or PowerShell skill assumed for the tester.

## Before

- [ ] Build on release machine: `npm run product:bundle` (and `-IncludeBackend` if testing on-prem API)
- [ ] Compile `installer/SMART-ERP-POS-Setup.iss` → `SMART-ERP-POS-Setup.exe`
- [ ] Optional: sign with `installer/scripts/codesign.ps1`
- [ ] Copy Setup.exe to the clean PC

## Install

- [ ] Double-click Setup.exe → UAC Yes → Next → Finish
- [ ] No PowerShell window left open for the cashier
- [ ] Printer Setup Wizard opens (`:1811/setup`)
- [ ] Connection Setup opens (`:1812/erp-setup`) — pick local or cloud URL → Save & Open

## Print Service

- [ ] Start Menu → SMART-ERP-POS → SMART Print Service (if needed)
- [ ] `http://127.0.0.1:1811/health` returns online + version ≥ 1.4.0
- [ ] Wizard: select Receipt / Kitchen / Bar → Test prints succeed
- [ ] Windows Services: **SMART Print Service** and **SMART Service Helper** Running / Automatic

## SMART ERP

- [ ] Start Menu → SMART ERP opens the configured URL (not the wizard again)
- [ ] Restaurant → Printers shows **Online**, Auto Start Enabled, Service Helper Online
- [ ] **Start Service** works after stopping the Print Service from services.msc
- [ ] Test Kitchen / Bar / Receipt buttons work

## SMART ERP desktop

- [ ] Start Menu → SMART ERP opens **app window** (Edge/Chrome `--app=`) when `SMART ERP.exe` is installed
- [ ] First launch without `erp-url.txt` opens Connection Setup
- [ ] After saving URL, SMART ERP opens that URL (not the wizard)

## Update channel (CDN)

- [ ] `config/update-channel.json` has HTTPS `manifestUrl` (or local `updates/manifest.json`)
- [ ] Printers shows Update Available with channel/source
- [ ] Update applies and service returns online

## Uninstall

- [ ] Apps & Features → uninstall SMART-ERP-POS
- [ ] Services removed; `:1811` and `:1812` no longer respond

## Pass criteria

All boxes checked on a machine that never had Node installed. Failures → file issue with step number + screenshot.
