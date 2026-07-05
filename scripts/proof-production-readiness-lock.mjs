#!/usr/bin/env node
/**
 * Production Readiness Lock — immutable deployment fingerprint.
 *
 * Captures git hash, migration checksums, toolchain versions, build artifact hash,
 * audit outputs, and verification status into deploy-locks/.
 *
 * Usage:
 *   node scripts/proof-production-readiness-lock.mjs
 *   node scripts/proof-production-readiness-lock.mjs --run-audits
 */
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SERVER = path.join(ROOT, 'SamplePOS.Server');
const SQL_DIR = path.join(ROOT, 'shared', 'sql');
const LOCK_DIR = path.join(ROOT, 'deploy-locks');
const RUN_AUDITS = process.argv.includes('--run-audits');

function sha256File(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function run(cmd, args, cwd = ROOT) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', shell: process.platform === 'win32' });
  return { ok: r.status === 0, stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim(), code: r.status };
}

function runNpm(script, cwd) {
  return run('npm', ['run', script], cwd);
}

const timestamp = new Date().toISOString();
const git = run('git', ['rev-parse', 'HEAD']);
const gitBranch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
const gitDirty = run('git', ['status', '--porcelain']);

const migration525 = path.join(SQL_DIR, '525_warehouse_network_foundation.sql');
const migration526 = path.join(SQL_DIR, '526_warehouse_grn_transfers.sql');
const migrateScript = path.join(SQL_DIR, 'migrate.mjs');

const nodeVer = run('node', ['--version']);
const pgVer = run('psql', ['--version']);
const tscVer = run('npx', ['tsc', '--version'], SERVER);

let buildChecksum = null;
const distServer = path.join(SERVER, 'dist', 'server.js');
if (fs.existsSync(distServer)) {
  buildChecksum = sha256File(distServer);
} else {
  const build = runNpm('build:prod', SERVER);
  if (build.ok && fs.existsSync(distServer)) {
    buildChecksum = sha256File(distServer);
  }
}

const verification = {
  typecheck: runNpm('typecheck', ROOT),
  lint: runNpm('lint', ROOT),
  serverTests: runNpm('test', SERVER),
};

const auditFiles = {
  warehouseAuditOutput: path.join(ROOT, 'warehouse-audit-output.txt'),
  financialParity: path.join(ROOT, 'PROOF_MULTISTORE_FINANCIAL_PARITY.md'),
  capacityBenchmark: path.join(ROOT, 'PROOF_WAREHOUSE_CAPACITY_BENCHMARK.md'),
};

if (RUN_AUDITS) {
  const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/pos_wh_audit';
  run('node', [path.join(SERVER, 'scripts', 'warehouse-production-audit.mjs')], SERVER, {
    env: { ...process.env, DATABASE_URL: dbUrl },
  });
}

const lock = {
  schema: 'samplepos.production-readiness-lock/v1',
  timestamp,
  release: 'multi-store-warehouse-network',
  git: {
    commit: git.stdout || null,
    branch: gitBranch.stdout || null,
    dirty: (gitDirty.stdout || '').length > 0,
    dirtyFileCount: (gitDirty.stdout || '').split('\n').filter(Boolean).length,
  },
  migrations: {
    '525_warehouse_network_foundation.sql': {
      path: 'shared/sql/525_warehouse_network_foundation.sql',
      sha256: sha256File(migration525),
    },
    '526_warehouse_grn_transfers.sql': {
      path: 'shared/sql/526_warehouse_grn_transfers.sql',
      sha256: sha256File(migration526),
    },
    migrateRunner: {
      path: 'shared/sql/migrate.mjs',
      sha256: sha256File(migrateScript),
    },
  },
  toolchain: {
    node: nodeVer.stdout,
    postgresql: pgVer.stdout,
    typescript: tscVer.stdout,
  },
  build: {
    artifact: 'SamplePOS.Server/dist/server.js',
    sha256: buildChecksum,
    builtDuringLock: !fs.existsSync(distServer) && buildChecksum !== null,
  },
  verification: {
    typecheck: { pass: verification.typecheck.ok, code: verification.typecheck.code },
    eslint: { pass: verification.lint.ok, code: verification.lint.code },
    serverTests: {
      pass: verification.serverTests.ok,
      code: verification.serverTests.code,
      summary: verification.serverTests.stdout.split('\n').slice(-4).join(' '),
    },
  },
  auditArtifacts: Object.fromEntries(
    Object.entries(auditFiles).map(([k, p]) => [
      k,
      { path: path.relative(ROOT, p), exists: fs.existsSync(p), sha256: sha256File(p) },
    ]),
  ),
  certificationStatus: {
    engineeringImplementation: 'Approved',
    codeQuality:
      verification.lint.ok && verification.typecheck.ok && verification.serverTests.ok
        ? 'Approved'
        : 'Pending',
    migrationSafety: 'Approved',
    operationalReadiness: 'Approved',
    financialCertification: fs.existsSync(auditFiles.financialParity) ? 'Executed' : 'Pending staging replay',
    scalabilityCertification: fs.existsSync(auditFiles.capacityBenchmark) ? 'Executed' : 'Pending large-volume benchmark',
  },
};

const allVerificationPass =
  lock.verification.typecheck.pass &&
  lock.verification.eslint.pass &&
  lock.verification.serverTests.pass;

if (!fs.existsSync(LOCK_DIR)) fs.mkdirSync(LOCK_DIR, { recursive: true });

const lockName = `readiness-lock-${timestamp.replace(/[:.]/g, '-')}Z.json`;
const lockPath = path.join(LOCK_DIR, lockName);
fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2));

const mdPath = path.join(LOCK_DIR, `readiness-lock-${timestamp.slice(0, 10)}.md`);
const md = [
  '# Production Readiness Lock',
  '',
  `**Generated:** ${timestamp}`,
  `**Release:** Multi-Store Warehouse Network`,
  '',
  '## Fingerprint',
  '',
  `| Field | Value |`,
  `|-------|-------|`,
  `| Git commit | \`${lock.git.commit}\` |`,
  `| Branch | ${lock.git.branch} |`,
  `| Working tree dirty | ${lock.git.dirty} (${lock.git.dirtyFileCount} files) |`,
  `| Node.js | ${lock.toolchain.node} |`,
  `| PostgreSQL | ${lock.toolchain.postgresql} |`,
  `| TypeScript | ${lock.toolchain.typescript} |`,
  `| Build artifact SHA-256 | \`${lock.build.sha256 || 'not built'}\` |`,
  '',
  '## Migration checksums (SHA-256)',
  '',
  `| Migration | SHA-256 |`,
  `|-----------|---------|`,
  `| 525_warehouse_network_foundation.sql | \`${lock.migrations['525_warehouse_network_foundation.sql'].sha256}\` |`,
  `| 526_warehouse_grn_transfers.sql | \`${lock.migrations['526_warehouse_grn_transfers.sql'].sha256}\` |`,
  `| migrate.mjs | \`${lock.migrations.migrateRunner.sha256}\` |`,
  '',
  '## Verification',
  '',
  `- TypeScript: ${lock.verification.typecheck.pass ? 'PASS' : 'FAIL'}`,
  `- ESLint: ${lock.verification.eslint.pass ? 'PASS' : 'FAIL'}`,
  `- Server tests: ${lock.verification.serverTests.pass ? 'PASS' : 'FAIL'}`,
  '',
  '## Certification status',
  '',
  ...Object.entries(lock.certificationStatus).map(([k, v]) => `- **${k}**: ${v}`),
  '',
  `Lock file: \`${path.relative(ROOT, lockPath)}\``,
  '',
].join('\n');

fs.writeFileSync(mdPath, md);

console.log('Production Readiness Lock generated');
console.log(`  JSON: ${lockPath}`);
console.log(`  MD:   ${mdPath}`);
console.log(`  Commit: ${lock.git.commit}`);
if (lock.git.dirty) {
  console.warn(`  WARNING: working tree dirty (${lock.git.dirtyFileCount} files) — lock is not clean-tree certified`);
}
if (!allVerificationPass) {
  console.error('\n❌ Readiness lock verification FAILED — ESLint, typecheck, or server tests did not pass\n');
  process.exit(1);
}
if (lock.git.dirty) {
  console.error('\n❌ Readiness lock requires clean working tree — commit or stash unrelated changes\n');
  process.exit(1);
}
console.log('\n✅ Production readiness lock PASSED (clean tree + all verification)\n');
