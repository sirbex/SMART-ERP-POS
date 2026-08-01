# SMART Print Service (Print Agent)

Official local printing for SMART-ERP-POS.

## Managers

Install **`SMART-ERP-POS-Setup.exe`** (full product) or **`SMART-ERP-POS-PrintService-Setup.exe`** (print only).

See `installer/README.md` — no Node.js, no PowerShell.

## Engineers

```powershell
npm run print-agent          # dev
npm run print-agent:bundle   # print-only commercial bundle
npm run product:bundle       # Phase 2 product bundle
```

Agent: `http://127.0.0.1:1811` · Setup wizard: `/setup` · Service Helper: `:1812`
