const { pool } = require('../pool');

/**
 * Migration: Add invoice_no to transactions and receipt_no to payments
 * - Adds columns if missing
 * - Creates sequences if missing and sets default nextval
 * - Backfills NULLs, fixes duplicates by reassigning from sequence
 * - Adds UNIQUE constraints
 */
async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1) Add columns if not exists
    await client.query(`
      ALTER TABLE transactions ADD COLUMN IF NOT EXISTS invoice_no INTEGER;
    `);
    await client.query(`
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_no INTEGER;
    `);

    // 2) Ensure sequences exist
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'invoice_seq') THEN
          CREATE SEQUENCE invoice_seq START 1000;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'receipt_seq') THEN
          CREATE SEQUENCE receipt_seq START 1000;
        END IF;
      END$$;
    `);

    // 3) Align sequences to max+1
    await client.query(`
      SELECT setval('invoice_seq', GREATEST(COALESCE(MAX(invoice_no), 999), 999), true)
      FROM transactions;
    `);
    await client.query(`
      SELECT setval('receipt_seq', GREATEST(COALESCE(MAX(receipt_no), 999), 999), true)
      FROM payments;
    `);

    // 4) Set defaults to use sequences
    await client.query(`
      ALTER TABLE transactions ALTER COLUMN invoice_no SET DEFAULT nextval('invoice_seq');
    `);
    await client.query(`
      ALTER TABLE payments ALTER COLUMN receipt_no SET DEFAULT nextval('receipt_seq');
    `);

    // 5) Backfill NULLs
    await client.query(`
      UPDATE transactions SET invoice_no = nextval('invoice_seq') WHERE invoice_no IS NULL;
    `);
    await client.query(`
      UPDATE payments SET receipt_no = nextval('receipt_seq') WHERE receipt_no IS NULL;
    `);

    // 6) Fix duplicates in transactions
    await client.query(`
      WITH dups AS (
        SELECT id,
               row_number() OVER (PARTITION BY invoice_no ORDER BY created_at, id) AS rn
        FROM transactions
        WHERE invoice_no IS NOT NULL
      )
      UPDATE transactions t
      SET invoice_no = nextval('invoice_seq')
      FROM dups
      WHERE t.id = dups.id AND dups.rn > 1;
    `);

    // 7) Fix duplicates in payments
    await client.query(`
      WITH dups AS (
        SELECT id,
               row_number() OVER (PARTITION BY receipt_no ORDER BY created_at, id) AS rn
        FROM payments
        WHERE receipt_no IS NOT NULL
      )
      UPDATE payments p
      SET receipt_no = nextval('receipt_seq')
      FROM dups
      WHERE p.id = dups.id AND dups.rn > 1;
    `);

    // 8) Add unique constraints if not already present
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'unique_invoice_no') THEN
          ALTER TABLE transactions ADD CONSTRAINT unique_invoice_no UNIQUE(invoice_no);
        END IF;
      END$$;
    `);
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'unique_receipt_no') THEN
          ALTER TABLE payments ADD CONSTRAINT unique_receipt_no UNIQUE(receipt_no);
        END IF;
      END$$;
    `);

    await client.query('COMMIT');
    console.log('Migration 002: invoice_no and receipt_no applied successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration 002 failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { up };
