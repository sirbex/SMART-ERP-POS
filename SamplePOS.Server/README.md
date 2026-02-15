# SamplePOS Server

Backend API server for SamplePOS - Enterprise Point of Sale System

## 🔧 Local Database Setup (Using `.env.local`)

For local development, credentials are managed via a private `.env.local` file:

```bash
# SamplePOS.Server/.env.local
PGHOST=localhost
PGPORT=5432
PGDATABASE=pos_system
PGUSER=postgres
PGPASSWORD=password
```

This file is gitignored and never committed.

### 💡 PowerShell Helper

You can run any psql command using your `.env.local`:

```powershell
psql-env.ps1 -- -c '\d users'
psql-env.ps1 -- -c 'SELECT current_database(), current_user;'
psql-env.ps1 -- -h localhost -p 5432 -U postgres -d pos_system -c 'SELECT NOW();'
```

### 🪶 Edit Credentials

Edit `SamplePOS.Server/.env.local` to update your local password.

You can also create a user-scoped override at:

```
%USERPROFILE%\.samplepos-db.env
```

This file takes precedence over `.env.local`.
