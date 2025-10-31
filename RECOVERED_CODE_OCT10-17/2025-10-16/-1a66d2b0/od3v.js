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
        if (typeof migration.up === 'function') {
          // Detect Sequelize-style signature (expects queryInterface, Sequelize)
          if (migration.up.length >= 1) {
            console.log(`Skipping ${file} (appears to be Sequelize migration).`);
          } else {
            await migration.up();
          }
        } else if (typeof migration.createInvoicesTable === 'function') {
          // Backward compatibility with first ad-hoc migration
          await migration.createInvoicesTable();
        } else {
          console.log(`Skipping ${file} as it does not export an up() function.`);
        }
      } catch (err) {
        console.error(`Error running migration ${file}:`, err);
        process.exit(1);
      }
    }
  }

  console.log('All migrations completed successfully.');
  pool.end(); // Close the connection pool
};

runMigrations();
