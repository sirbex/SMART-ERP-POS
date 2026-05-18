import pkg from 'pg';
const { Pool } = pkg;
const pool = new Pool({ connectionString: 'postgresql://postgres:password@localhost:5432/pos_system' });

await pool.query(`ALTER TABLE fixed_assets ADD COLUMN IF NOT EXISTS registration_mode VARCHAR(20) NOT NULL DEFAULT 'PURCHASE'`);
await pool.query(`ALTER TABLE fixed_assets DROP CONSTRAINT IF EXISTS chk_asset_registration_mode`);
await pool.query(`ALTER TABLE fixed_assets ADD CONSTRAINT chk_asset_registration_mode CHECK (registration_mode IN ('PURCHASE', 'OPENING'))`);
console.log('Migration 016 applied to pos_system');

const r1 = await pool.query("SELECT id, code, name, asset_account_code FROM asset_categories WHERE is_active = TRUE LIMIT 1");
console.log('CATEGORY:', JSON.stringify(r1.rows[0] ?? 'NONE'));

const colsR = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='users' ORDER BY ordinal_position LIMIT 12");
console.log('USERS_COLS:', colsR.rows.map(x => x.column_name).join(', '));
const r2 = await pool.query("SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1");
console.log('ADMIN:', JSON.stringify(r2.rows[0] ?? 'NONE'));

const r3 = await pool.query("SELECT \"AccountCode\", \"AccountName\", current_balance FROM accounts WHERE \"AccountCode\" IN ('1010','1500','3050') ORDER BY \"AccountCode\"");
console.log('ACCOUNTS:', JSON.stringify(r3.rows));

await pool.end();
