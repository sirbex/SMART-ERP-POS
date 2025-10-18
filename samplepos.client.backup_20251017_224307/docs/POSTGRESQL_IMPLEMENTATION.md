# PostgreSQL Implementation for SamplePOS

This guide provides instructions for setting up and using the PostgreSQL database implementation for the SamplePOS system.

## Overview

The implementation replaces the existing localStorage-based storage with a PostgreSQL database for improved reliability, data integrity, and scalability. The implementation uses the following components:

- **Database Schema**: Defined in `src/db/schema.sql`
- **Connection Pool**: Configured in `src/db/pool.ts`
- **Repository Layer**: Implementations for inventory items and batches
- **Service Layer**: Updated implementation of the inventory service
- **Data Migration**: Tool to migrate data from localStorage to PostgreSQL

## Setup Instructions

### 1. Install PostgreSQL

If you don't already have PostgreSQL installed, download and install it from the [official website](https://www.postgresql.org/download/).

### 2. Create Database

Create a new database for the application:

```sql
CREATE DATABASE samplepos;
```

### 3. Configure Environment Variables

Copy the `.env.sample` file to `.env` and update the values to match your PostgreSQL configuration:

```
PG_USER=your_postgres_user
PG_PASSWORD=your_postgres_password
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=samplepos
PG_SSL=false
```

### 4. Install Dependencies

Install the required Node.js packages:

```bash
npm install pg
npm install --save-dev @types/pg
npm install dotenv
```

### 5. Set Up Database Schema

Run the schema SQL script to create the necessary tables and indexes:

```bash
psql -U your_postgres_user -d samplepos -f src/db/schema.sql
```

Alternatively, you can copy the contents of the schema file and run it in a PostgreSQL client like pgAdmin or DBeaver.

## Migration

The application includes a data migration tool to move inventory data from localStorage to PostgreSQL.

To use the migration tool:

1. Run the application
2. Navigate to the Inventory Display component that uses PostgreSQL
3. Click the "Migrate Data" button
4. Once migration is complete, you can clear the localStorage data

## Files Overview

- `src/db/pool.ts` - PostgreSQL connection pool configuration
- `src/db/schema.sql` - Database schema definition
- `src/db/data-migration.ts` - Tool to migrate data from localStorage to PostgreSQL
- `src/repositories/inventory-item-repository.ts` - Repository for inventory items
- `src/repositories/inventory-batch-repository.ts` - Repository for inventory batches
- `src/services/InventoryService.postgres.ts` - PostgreSQL implementation of the inventory service
- `src/components/InventoryDisplayPostgres.tsx` - Example component using the PostgreSQL implementation
- `src/utils/db-errors.ts` - Utility for handling database errors

## Implementation Details

### Connection Pool

The database connection is managed by a connection pool to efficiently handle multiple database operations:

```typescript
// From src/db/pool.ts
const pool = new Pool({
  user: process.env.PG_USER || 'postgres',
  host: process.env.PG_HOST || 'localhost',
  database: process.env.PG_DATABASE || 'samplepos',
  // ...other configuration
});
```

### Repository Pattern

The implementation uses the Repository pattern to abstract database operations:

```typescript
// Example from inventory-item-repository.ts
async findAll(): Promise<DbInventoryItem[]> {
  try {
    const result = await pool.query(`
      SELECT i.*,
        COALESCE(SUM(b.remaining_quantity), 0) as quantity
      FROM inventory_items i
      LEFT JOIN inventory_batches b ON i.id = b.inventory_item_id
      WHERE i.is_active = true
      GROUP BY i.id
      ORDER BY i.name
    `);
    
    return result.rows;
  } catch (error) {
    console.error('Error fetching inventory items:', error);
    return [];
  }
}
```

### FIFO Inventory Management

The implementation maintains the FIFO (First-In, First-Out) inventory management logic:

```typescript
// Example from inventory-batch-repository.ts
async reduceInventory(
  itemId: number, 
  quantity: number
): Promise<{ 
  success: boolean; 
  batchesUsed: BatchReduction[]; 
  remainingQuantity: number 
}> {
  // Implementation that reduces inventory from oldest batches first
  // ...
}
```

## Usage

To use the PostgreSQL implementation in your components:

```typescript
// Import from the PostgreSQL implementation
import { getInventory, saveInventory } from '../services/InventoryService.postgres';

// Use in component
async function loadInventory() {
  try {
    const data = await getInventory();
    setInventory(data);
  } catch (err) {
    // Handle error
  }
}
```

## Error Handling

The implementation includes robust error handling:

- Transaction support for atomic operations
- Standardized error responses
- Detailed error logging

## Future Improvements

- Implement caching layer for frequently accessed data
- Add database migrations for schema changes
- Add unit tests for repository and service layers