# SamplePOS Architecture - Clean Slate Implementation

**Date**: October 31, 2025  
**Branch**: restore-oct25-28-code  
**Status**: Clean slate - ready for fresh implementation

## Project Structure

This is the target architecture for the SamplePOS system rebuild:

```
erp-offline-scaffold/
├── frontend/
│   └── (React + Vite UI placeholder)
├── services/
│   └── pos-service/
│       ├── local-db/
│       │   └── localStorage           # Browser persistence
│       ├── event-queue/               # Offline event queue (JSON files)
│       ├── src/
│       │   ├── controllers/
│       │   │   └── salesController.ts
│       │   ├── services/
│       │   │   └── syncService.ts
│       │   ├── zod-schemas/
│       │   │   └── saleSchema.ts
│       │   └── server.ts
│       └── README.md                   # Copilot instructions
├── core/
│   └── accounting-api/
│       ├── Controllers/
│       │   └── LedgerController.cs
│       ├── Models/
│       ├── DTOs/
│       ├── Validators/
│       └── Program.cs
├── analytics/
│   └── ml-service/
│       ├── api/
│       │   └── main.py
│       └── models/
├── shared/
│   ├── contracts/
│   │   └── sale.ts                     # Zod contract for Node & DTOs
│   └── clients/
│       └── kafkaClient.ts
├── docker-compose.yml
└── README.md
```

## Architecture Overview

### Frontend Layer
- **Technology**: React + Vite
- **Purpose**: User interface placeholder
- **Location**: `frontend/`

### Services Layer

#### POS Service (Node.js/TypeScript)
- **Local Storage**: Browser localStorage for cart persistence
- **Event Queue**: JSON-based queue for offline event handling
- **Controllers**: Sales transaction handling
- **Services**: Sync service for online/offline coordination
- **Validation**: Zod schemas for type-safe data validation

### Core Layer

#### Accounting API (C#/.NET)
- **Controllers**: Ledger operations
- **Models**: Core business entities
- **DTOs**: Data transfer objects
- **Validators**: Input validation

### Analytics Layer

#### ML Service (Python)
- **API**: FastAPI/Flask endpoints
- **Models**: Machine learning models for business analytics

### Shared Layer
- **Contracts**: Zod-based schemas shared across services
- **Clients**: Common clients (Kafka, etc.)

## Key Architectural Principles

1. **Data Persistence**: PostgreSQL database with localStorage caching
2. **Type Safety**: Zod schemas for contract validation
3. **Microservices**: Separated POS, Accounting, and Analytics services
4. **Event-Driven**: Queue-based communication for resilience
5. **Shared Contracts**: Single source of truth for data structures

## Current State

**What Exists**:
- Configuration files (Tailwind, PostCSS, TypeScript, Vite, ESLint)
- Environment configuration (.env with Redis setup)
- Node modules installed (1,115 packages)
- Git repository with clean slate documented

**What Was Removed**:
- All frontend source code (React components, services, hooks)
- All backend source code
- All documentation files
- All backup directories
- UI component libraries (Shadcn)

**Preserved for New Implementation**:
- Build tool configurations
- Tailwind CSS setup
- Redis configuration
- Package dependencies
- Git history

## Next Steps

To implement this architecture:

1. Create the new folder structure as outlined above
2. Set up the POS service with SQLite and event queue
3. Implement Zod schemas in shared contracts
4. Build the accounting API in C#
5. Add Python ML service for analytics
6. Configure Docker Compose for orchestration
7. Implement frontend with React + Vite

## Implementation Guidelines

- Use Copilot instructions in README files for each service
- Maintain type safety with Zod schemas
- Ensure responsive UI with localStorage persistence
- Follow microservices patterns for service separation
- Use event-driven architecture for service communication
