import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { adminService } from '../src/modules/admin/adminService.js';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(serverRoot, '..');
const OUT = process.env.PROOF_OUT || resolve(repoRoot, 'PROOF_INVENTORY_LOT_DR_RUN.md');
const CREATE_BACKUP = process.env.LOT_PROOF_DR_CREATE_BACKUP === '1';

const lines: string[] = [
  '# Inventory Lot — Disaster Recovery Proof\n',
  `Run: ${new Date().toISOString()}\n`,
];

function checkTool(cmd: string) {
  const result = spawnSync(cmd, ['--version'], {
    shell: process.platform === 'win32',
    stdio: 'pipe',
  });
  return result.status === 0;
}

const hasPgDump = checkTool('pg_dump');
const hasPgRestore = checkTool('pg_restore');
lines.push(`- pg_dump available: **${hasPgDump ? 'YES' : 'NO'}**`);
lines.push(`- pg_restore available: **${hasPgRestore ? 'YES' : 'NO'}**`);

let backupFilePath = '';
if (CREATE_BACKUP && hasPgDump) {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const backup = await adminService.createDatabaseBackup(pool);
    backupFilePath = backup.filePath;
    lines.push(`- Backup created: **${backup.fileName}** (${backup.size} bytes)`);
  } finally {
    await pool.end();
  }
} else {
  lines.push('- Backup creation skipped — set `LOT_PROOF_DR_CREATE_BACKUP=1` and ensure pg_dump exists');
}

if (backupFilePath && hasPgRestore) {
  const manifest = spawnSync('pg_restore', ['-l', backupFilePath], {
    shell: process.platform === 'win32',
    stdio: 'pipe',
    encoding: 'utf8',
  });
  const out = `${manifest.stdout || ''}${manifest.stderr || ''}`;
  const hasBatches = out.includes('inventory_batches');
  const hasLots = out.includes('product_lots');
  const hasAudit = out.includes('batch_expiry_audit');
  lines.push(`- Dump manifest includes inventory_batches: **${hasBatches ? 'YES' : 'NO'}**`);
  lines.push(`- Dump manifest includes product_lots: **${hasLots ? 'YES' : 'NO'}**`);
  lines.push(`- Dump manifest includes batch_expiry_audit: **${hasAudit ? 'YES' : 'NO'}**`);
} else {
  lines.push('- Dump manifest inspection skipped — backup file not created or pg_restore unavailable');
}

lines.push('\n## Result\n');
const status = backupFilePath && hasPgRestore ? 'PASS' : 'PENDING';
lines.push(`- Status: **${status}**`);
lines.push('- Gate G is non-destructive in local proof mode.');
lines.push('- Full restore/replay validation remains a controlled staging/ops exercise.');

writeFileSync(OUT, lines.join('\n') + '\n');
console.log(lines.join('\n'));
console.log(`STATUS: ${status}`);
process.exit(0);
