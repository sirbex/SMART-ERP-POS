/**
 * Direct script to repost missing GL entries.
 * Usage: npx tsx scripts/repost-missing-gl.ts
 */
import { pool } from '../src/db/pool.js';
import { repostMissingGL } from '../src/services/glValidationService.js';

async function main() {
  try {
    console.log('Starting repost of missing GL entries...\n');
    const result = await repostMissingGL(pool);
    console.log('=== RESULTS ===');
    console.log(JSON.stringify(result, null, 2));
    console.log('\nSummary:', result.summary);
  } catch (err) {
    console.error('Failed:', err);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

main();
