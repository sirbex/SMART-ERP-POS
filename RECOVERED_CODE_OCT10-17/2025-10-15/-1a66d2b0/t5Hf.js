const fs = require('fs');
const path = require('path');
const { pool } = require('./pool');

const runMigrations = async () => {
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir).sort();

  for (const file of files) {
    if (file.endsWith('.js')) {
      console.log(`Running migration: ${file}`);
      try {
        const migration = require(path.join(migrationsDir, file));
        if (typeof migration.createInvoicesTable === 'function') {
            await migration.createInvoicesTable();
        } else {
            // If there are other migration patterns, add them here
            console.log(`Skipping ${file} as it does not export a known migration function.`);
        }
      } catch (err) {
        console.error(`Error running migration ${file}:`, err);
        // Exit on first error to prevent further issues
        process.exit(1);
      }
    }
  }

  console.log('All migrations completed successfully.');
  pool.end(); // Close the connection pool
};

runMigrations();
