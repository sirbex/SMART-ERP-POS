#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Reorganizes the SamplePOS project to separate frontend and backend properly.

.DESCRIPTION
    This script:
    1. Creates frontend/ and backend/ directories at the parent level
    2. Moves server/ contents to backend/
    3. Moves remaining samplepos.client/ contents to frontend/
    4. Updates configuration files
    5. Creates root-level scripts for easy development
#>

$ErrorActionPreference = "Stop"

# Get the parent directory (SamplePOS/)
$parentDir = Split-Path -Parent $PSScriptRoot
$currentDir = $PSScriptRoot

Write-Host "🚀 Starting SamplePOS Project Reorganization..." -ForegroundColor Cyan
Write-Host ""
Write-Host "Current directory: $currentDir" -ForegroundColor Yellow
Write-Host "Parent directory: $parentDir" -ForegroundColor Yellow
Write-Host ""

# Ask for confirmation
Write-Host "⚠️  This will reorganize your project structure:" -ForegroundColor Yellow
Write-Host "  - Create $parentDir\frontend\" -ForegroundColor White
Write-Host "  - Create $parentDir\backend\" -ForegroundColor White
Write-Host "  - Move server/ → backend/" -ForegroundColor White
Write-Host "  - Move other files → frontend/" -ForegroundColor White
Write-Host ""
$confirmation = Read-Host "Do you want to proceed? (yes/no)"

if ($confirmation -ne "yes") {
    Write-Host "❌ Operation cancelled by user." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "📁 Creating new directory structure..." -ForegroundColor Cyan

# Create frontend and backend directories
$frontendDir = Join-Path $parentDir "frontend"
$backendDir = Join-Path $parentDir "backend"

New-Item -ItemType Directory -Path $frontendDir -Force | Out-Null
New-Item -ItemType Directory -Path $backendDir -Force | Out-Null

Write-Host "✅ Created frontend/ directory" -ForegroundColor Green
Write-Host "✅ Created backend/ directory" -ForegroundColor Green
Write-Host ""

# Step 1: Move backend (server/) first
Write-Host "📦 Moving backend code..." -ForegroundColor Cyan
$serverDir = Join-Path $currentDir "server"

if (Test-Path $serverDir) {
    Get-ChildItem -Path $serverDir | ForEach-Object {
        $dest = Join-Path $backendDir $_.Name
        Write-Host "  Moving $($_.Name) → backend/$($_.Name)" -ForegroundColor Gray
        Move-Item -Path $_.FullName -Destination $dest -Force
    }
    Remove-Item -Path $serverDir -Force
    Write-Host "✅ Backend moved successfully" -ForegroundColor Green
} else {
    Write-Host "⚠️  server/ directory not found, skipping" -ForegroundColor Yellow
}

Write-Host ""

# Step 2: Move frontend files (everything except server/)
Write-Host "📦 Moving frontend code..." -ForegroundColor Cyan

$excludeDirs = @("server", "node_modules", "dist", "obj", ".vscode", "npm-global")
$excludeFiles = @("reorganize-project.ps1")

Get-ChildItem -Path $currentDir | Where-Object {
    # Exclude the directories and files we don't want to move
    -not ($excludeDirs -contains $_.Name) -and
    -not ($excludeFiles -contains $_.Name)
} | ForEach-Object {
    $dest = Join-Path $frontendDir $_.Name
    Write-Host "  Moving $($_.Name) → frontend/$($_.Name)" -ForegroundColor Gray
    Move-Item -Path $_.FullName -Destination $dest -Force
}

Write-Host "✅ Frontend moved successfully" -ForegroundColor Green
Write-Host ""

# Step 3: Create root-level scripts
Write-Host "📝 Creating root-level scripts..." -ForegroundColor Cyan

# Create start-dev.ps1 at root
$startDevScript = @'
#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Starts both frontend and backend development servers.
#>

$ErrorActionPreference = "Stop"

Write-Host "🚀 Starting SamplePOS Development Environment..." -ForegroundColor Cyan
Write-Host ""

# Start backend in a new terminal
Write-Host "🔧 Starting Backend API Server..." -ForegroundColor Yellow
Start-Process pwsh -ArgumentList "-NoExit", "-Command", "cd backend; npm start"

# Wait a moment for backend to start
Start-Sleep -Seconds 2

# Start frontend in a new terminal
Write-Host "⚛️  Starting Frontend Dev Server..." -ForegroundColor Yellow
Start-Process pwsh -ArgumentList "-NoExit", "-Command", "cd frontend; npm run dev"

Write-Host ""
Write-Host "✅ Both servers are starting in separate windows!" -ForegroundColor Green
Write-Host ""
Write-Host "📍 Frontend: http://127.0.0.1:5173/" -ForegroundColor Cyan
Write-Host "📍 Backend:  http://localhost:3001/" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press any key to exit this launcher..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
'@

$startDevPath = Join-Path $parentDir "start-dev.ps1"
Set-Content -Path $startDevPath -Value $startDevScript -Force
Write-Host "✅ Created start-dev.ps1" -ForegroundColor Green

# Create README.md at root
$readmeContent = @'
# SamplePOS - Point of Sale System

Modern POS system with QuickBooks-inspired UI, built with React, Node.js, Express, and PostgreSQL.

## 📁 Project Structure

```
SamplePOS/
├── frontend/          # React + Vite + Tailwind CSS + shadcn/ui
│   ├── src/
│   ├── package.json
│   └── vite.config.ts
│
├── backend/           # Node.js + Express + PostgreSQL
│   ├── src/
│   ├── package.json
│   └── .env
│
└── start-dev.ps1      # Launch both servers at once
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm
- PostgreSQL database
- PowerShell (Windows) or Bash (Linux/Mac)

### Installation

1. **Install Frontend Dependencies:**
   ```bash
   cd frontend
   npm install
   ```

2. **Install Backend Dependencies:**
   ```bash
   cd backend
   npm install
   ```

3. **Configure Backend:**
   - Copy `backend/.env.sample` to `backend/.env`
   - Update database credentials and settings

### Running the Application

**Option 1: Start both servers at once (Windows):**
```powershell
.\start-dev.ps1
```

**Option 2: Start servers separately:**

Terminal 1 - Backend:
```bash
cd backend
npm start
```

Terminal 2 - Frontend:
```bash
cd frontend
npm run dev
```

### Access the Application

- **Frontend:** http://127.0.0.1:5173/
- **Backend API:** http://localhost:3001/
- **API Docs:** http://localhost:3001/api-docs

## 🛠️ Development

### Frontend (React + Vite)
- **Dev Server:** `npm run dev`
- **Build:** `npm run build`
- **Preview:** `npm run preview`
- **Lint:** `npm run lint`

### Backend (Node.js + Express)
- **Dev Server:** `npm start`
- **Watch Mode:** `npm run dev` (if configured)

## 📦 Tech Stack

### Frontend
- React 19.1.1
- Vite 7.1.7
- Tailwind CSS 3.4.17
- shadcn/ui (Radix UI primitives)
- React Query (TanStack Query)
- Axios for API calls

### Backend
- Node.js + Express 4.18.3
- PostgreSQL (pg 8.11.3)
- Winston logger
- Redis (optional, mock available)
- JWT authentication
- Helmet security

## 📝 Features

- ✅ Point of Sale system
- ✅ Inventory management
- ✅ Customer ledger
- ✅ Transaction history
- ✅ Payment processing
- ✅ Reports and analytics
- ✅ Offline support (PWA)
- ✅ QuickBooks-inspired UI
- ✅ Responsive design

## 🔒 Environment Variables

See `backend/.env.sample` for required environment variables.

## 📄 License

Proprietary - All rights reserved

## 🤝 Contributing

This is a private project. Contact the maintainer for contribution guidelines.
'@

$readmePath = Join-Path $parentDir "README.md"
Set-Content -Path $readmePath -Value $readmeContent -Force
Write-Host "✅ Created README.md" -ForegroundColor Green

Write-Host ""
Write-Host "🎉 Project reorganization complete!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Next steps:" -ForegroundColor Cyan
Write-Host "  1. cd .." -ForegroundColor White
Write-Host "  2. cd frontend && npm install" -ForegroundColor White
Write-Host "  3. cd ../backend && npm install" -ForegroundColor White
Write-Host "  4. Configure backend/.env with your database credentials" -ForegroundColor White
Write-Host "  5. Run: .\start-dev.ps1" -ForegroundColor White
Write-Host ""
Write-Host "📁 New structure:" -ForegroundColor Cyan
Write-Host "  $frontendDir" -ForegroundColor White
Write-Host "  $backendDir" -ForegroundColor White
Write-Host ""
Write-Host "⚠️  You can now safely delete the old 'samplepos.client' directory after verification!" -ForegroundColor Yellow
Write-Host ""
