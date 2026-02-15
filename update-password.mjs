import { createRequire } from 'module';
const require = createRequire(import.meta.url + '/../SamplePOS.Server/package.json');

const bcrypt = require('bcrypt');
const pg = require('pg');

async function main() {
    const hash = await bcrypt.hash('admin123', 10);
    console.log('Generated hash:', hash);

    const pool = new pg.Pool({
        connectionString: 'postgresql://postgres:password@localhost:5432/pos_system'
    });

    const result = await pool.query(
        'UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING email, password_hash',
        [hash, 'admin@samplepos.com']
    );
    console.log('Updated:', result.rows[0]);
    await pool.end();
}

main().catch(console.error);
