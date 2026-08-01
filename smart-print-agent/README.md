# SMART Print Service (Print Agent)

Official local printing component for SMART-ERP-POS. Cashiers never open a terminal.

## Install once (this POS PC)

From the repo root (admin / IT):

```powershell
npm run print-agent:setup
```

Or:

```powershell
powershell -ExecutionPolicy Bypass -File smart-print-agent/scripts/install-print-service.ps1
```

This registers:

- Start Menu → **SMART Print Service**
- Login auto-start
- Scheduled Task with restart-on-failure
- Watchdog (crash → restart)

Then cashiers only see **Printer Service Online** on Restaurant POS.

## Manager tools

Restaurant → **Printers** (diagnostics): health, Test Print, Restart Service, logs.

## Dev only

```powershell
npm run print-agent
```

Listens on `http://127.0.0.1:1811` (local only; works offline).
