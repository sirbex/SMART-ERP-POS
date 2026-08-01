# SMART-ERP-POS commercial installer

**Managers never see Node.js, PowerShell, Git, or npm.**

## What managers do

1. Download **`SMART-ERP-POS-Setup.exe`**
2. Next → Finish  
3. **Printer Setup Wizard** → pick printers → test  
4. **Connection Setup** → This PC or Cloud URL → Save & Open  
5. Start Menu → **SMART ERP** → sell  
6. Restaurant → **Printers** → Online / Start Service / Update  

## Phase status

| Phase | Item | Status |
|-------|------|--------|
| 1 | Bundled Print Service + wizard | Done |
| 2 | Full Setup + Helper + in-app Update | Done |
| 3 | ERP URL wizard | Done |
| 3 | Backend serves Frontend (`SERVE_FRONTEND`) | Done |
| 3 | CI → Setup.exe artifact | Done (`.github/workflows/commercial-setup.yml`) |
| 3 | Optional Authenticode | Done (`installer/scripts/codesign.ps1` + secrets) |
| 3 | Clean-PC soak checklist | Done (`installer/SOAK-CHECKLIST.md`) |
| 4 | `SMART ERP.exe` app-window launcher | Done (`installer/smart-erp-shell`) |
| 4 | CDN update channel (`config/update-channel.json`) | Done |
| 4 | Commercial integrity proof | Done (`npm run proof:commercial`) |

## Integrity

```powershell
npm run proof:commercial
```

## CDN updates

1. Host `manifest.json` + zip on HTTPS CDN  
2. Set `config/update-channel.json` → `manifestUrl`  
   (or `POST http://127.0.0.1:1812/update/channel`)  
3. Restaurant → Printers → Update Available → Update  

## SMART ERP.exe

```powershell
npm run shell:build
```

Requires .NET 8 SDK. Bundle includes it when present; otherwise Start Menu uses `Open-SMART-ERP.vbs` (still opens Edge `--app=` via exe when built later).

```powershell
npm run product:bundle
npm run product:bundle:backend   # on-prem API + embedded SPA
```

Compile `installer/SMART-ERP-POS-Setup.iss` (or let CI do it).

## CI

- Workflow: **Commercial Setup.exe**
- Trigger: `workflow_dispatch` or tag `setup-v*`
- Artifact: `SMART-ERP-POS-Setup.exe`
- Optional secrets: `CODESIGN_PFX_BASE64`, `CODESIGN_PASSWORD`

## Soak

Follow `installer/SOAK-CHECKLIST.md` on a clean Windows PC.
