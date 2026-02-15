# SamplePOS Hybrid System Setup

This document describes how to set up and run the SamplePOS hybrid architecture with both Node.js and C# APIs working together.

## Architecture Overview

The SamplePOS system uses a hybrid architecture:

- **Node.js API** (Port 3001): Handles POS operations, inventory, sales, customers, suppliers
- **C# Accounting API** (Port 5062): Handles double-entry bookkeeping, financial reports, accounting
- **React Frontend** (Port 5173): Single-page application with intelligent API routing
- **PostgreSQL Database**: Shared database for both APIs
- **Redis** (Optional): Caching and background job processing

## Quick Start (Development)

### Prerequisites

- Node.js 18+ and npm
- .NET 8.0 SDK
- PostgreSQL 15+
- Git

### 1. Clone and Install Dependencies

```powershell
git clone <repository-url>
cd SamplePOS

# Install Node.js backend dependencies
cd SamplePOS.Server
npm install

# Install C# API dependencies
cd ..\server-dotnet\accounting-api\AccountingApi
dotnet restore

# Install frontend dependencies  
cd ..\..\..\samplepos.client
npm install
```

### 2. Database Setup

```powershell
# Create PostgreSQL database
createdb pos_system

# Set up Node.js backend environment
cd ..\SamplePOS.Server
copy .env.example .env
# Edit .env with your database credentials

# Run Node.js migrations
npm run migrate

# Set up C# API database
cd ..\server-dotnet\accounting-api\AccountingApi
dotnet ef database update
```

### 3. Start the Hybrid System

```powershell
# From the root directory
.\start-hybrid-dev.ps1
```

This script will:
1. ✅ Verify all project directories exist
2. 🔍 Check database connectivity  
3. 🚀 Start Node.js API (port 3001)
4. 🚀 Start C# Accounting API (port 5062)
5. 🚀 Start React frontend (port 5173)
6. 🏥 Perform health checks on all services

### 4. Access the Application

- **Frontend**: http://localhost:5173
- **Node.js API**: http://localhost:3001
- **C# Accounting API**: http://localhost:5062
- **C# API Docs**: http://localhost:5062 (Swagger UI)

## API Routing

The frontend automatically routes API calls based on the endpoint:

```
/api/accounting/*  →  C# Accounting API (port 5062)
/api/*            →  Node.js API (port 3001)  
```

### Examples:

- `GET /api/products` → Node.js API
- `GET /api/sales` → Node.js API  
- `GET /api/accounting/income-statement` → C# Accounting API
- `POST /api/accounting/ledger/entries` → C# Accounting API

## Management Scripts

### Health Checking

```powershell
# Check if all services are running
.\check-hybrid-health.ps1

# Detailed health information
.\check-hybrid-health.ps1 -Detailed
```

### Stopping Services

```powershell
# Stop all services gracefully
.\stop-hybrid-dev.ps1
```

## Configuration

### Environment Variables

Copy `.env.hybrid` to `SamplePOS.Server\.env`:

```bash
# Key variables for hybrid setup
ACCOUNTING_API_BASE_URL=http://localhost:5062
ACCOUNTING_API_KEY=dev_shared_secret_key_2025
ENABLE_ACCOUNTING_INTEGRATION=true
```

### C# API Configuration

The C# API is configured in `server-dotnet/accounting-api/AccountingApi/appsettings.Development.json`:

```json
{
  "Urls": "http://localhost:5062",
  "ApiKeys": {
    "NodeBackend": "dev_shared_secret_key_2025"
  }
}
```

## Production Deployment

### Docker Compose

```powershell
# Build and run all services
docker-compose -f docker-compose.hybrid.yml up -d

# View logs
docker-compose -f docker-compose.hybrid.yml logs -f

# Stop services
docker-compose -f docker-compose.hybrid.yml down
```

The production setup includes:
- Nginx reverse proxy with intelligent routing
- PostgreSQL and Redis containers
- Health checks and automatic restarts
- Proper networking and security

## Troubleshooting

### Common Issues

1. **Port Already in Use**
   ```powershell
   .\stop-hybrid-dev.ps1  # Stop any existing services
   ```

2. **Database Connection Failed**
   - Ensure PostgreSQL is running
   - Check connection strings in both `.env` and `appsettings.json`
   - Verify database `pos_system` exists

3. **C# API Won't Start**
   - Ensure .NET 8.0 SDK is installed: `dotnet --version`
   - Check for compilation errors: `cd server-dotnet\accounting-api\AccountingApi && dotnet build`

4. **Frontend API Calls Failing**
   - Check Vite proxy configuration in `vite.config.ts`
   - Verify both APIs are running: `.\check-hybrid-health.ps1`

### Health Check URLs

- Node.js: http://localhost:3001/health
- C# API: http://localhost:5062/health
- Frontend: http://localhost:5173

### Log Files

- **Node.js**: Console output in terminal
- **C# API**: `server-dotnet/accounting-api/AccountingApi/logs/`
- **Frontend**: Browser Developer Tools Console

## Development Workflow

1. **Start System**: `.\start-hybrid-dev.ps1`
2. **Check Health**: `.\check-hybrid-health.ps1`
3. **Make Changes**: Edit code in any project
4. **Hot Reload**: All services support hot reloading
5. **Stop System**: `.\stop-hybrid-dev.ps1`

## API Integration Examples

### Node.js to C# API Call

```javascript
// In Node.js backend
const response = await axios.get(`${ACCOUNTING_API_BASE_URL}/api/accounts`, {
  headers: { 'X-API-Key': process.env.ACCOUNTING_API_KEY }
});
```

### Frontend to Both APIs

```javascript
// POS operations → Node.js API
const sales = await api.get('/api/sales');

// Accounting operations → C# API (via proxy)
const incomeStatement = await api.get('/api/accounting/income-statement');
```

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review service logs in terminal windows
3. Use health check scripts to diagnose problems
4. Consult individual API documentation