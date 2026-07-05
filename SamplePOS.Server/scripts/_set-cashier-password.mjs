#!/usr/bin/env node
import pg from 'pg';
import bcrypt from 'bcrypt';

const email = process.argv[2] || 'cashier@test.com';
const password = process.argv[3] || 'cashier123';
const url = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/pos_system';

const pool = new pg.Pool({ connectionString: url });
const hash = await bcrypt.hash(password, 10);
await pool.query(
  `UPDATE users SET password_hash = $1, failed_login_attempts = 0, lockout_until = NULL WHERE email = $2`,
  [hash, email],
);
const verify = await bcrypt.compare(password, hash);
console.log(JSON.stringify({ email, hashLength: hash.length, verify }));
await pool.end();
