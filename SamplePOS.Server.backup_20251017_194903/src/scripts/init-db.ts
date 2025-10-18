import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { logger } from '../utils/logger';

// Load environment variables
dotenv.config();

/**
 * Script to initialize the database with the schema
 */
async function initializeDatabase() {
  const pool = new Pool(); // Uses env variables by default
  
  try {
    logger.info('Starting database initialization...');
    
    // Read the schema SQL file
    const schemaPath = path.join(__dirname, '../db/schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    
    // Execute the schema
    logger.info('Creating database schema...');
    await pool.query(schemaSql);
    
    logger.info('Database initialization completed successfully!');
    return true;
  } catch (error) {
    logger.error('Error initializing database:');
    logger.error(error instanceof Error ? error.message : String(error));
    return false;
  } finally {
    await pool.end();
  }
}

// Run the initialization if this script is executed directly
if (require.main === module) {
  initializeDatabase()
    .then(success => {
      if (success) {
        logger.info('Database setup completed successfully.');
        process.exit(0);
      } else {
        logger.error('Database setup failed.');
        process.exit(1);
      }
    })
    .catch(error => {
      logger.error('Unexpected error during database setup:');
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}

export { initializeDatabase };