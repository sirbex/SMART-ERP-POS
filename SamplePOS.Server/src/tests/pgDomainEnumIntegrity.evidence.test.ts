/**
 * GLOBAL integrity: Postgres domain enum labels must match schema SSOT.
 *
 * Prevents enterprise regressions like:
 *   invalid input value for enum goods_receipt_status: "FINALIZED" (PG 22P02)
 *
 * Emits PROOF_PG_DOMAIN_ENUM_INTEGRITY.md + .json
 *
 * npm test -- --runInBand src/tests/pgDomainEnumIntegrity.evidence.test.ts
 */
import { afterAll, describe, expect, it } from '@jest/globals';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ENUM_COALESCE_EMPTY_ANTIPATTERN,
  FORBIDDEN_GOODS_RECEIPT_SQL_STATUS_LITERALS,
  GOODS_RECEIPT_STATUSES,
  GR_POSTED_STATUS,
  isGoodsReceiptPosted,
  PAYMENT_METHOD_CORE,
  PURCHASE_ORDER_STATUSES,
} from '@shared/domain/pgDomainEnums.js';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = path.resolve(serverRoot, '..');

type Gate = { id: string; ok: boolean; detail: string };
const gates: Gate[] = [];

function gate(id: string, ok: boolean, detail: string): void {
  gates.push({ id, ok, detail });
  if (!ok) expect({ id, ok, detail }).toEqual({ id, ok: true, detail });
}

function walk(dir: string, out: string[] = [], depth = 0): string[] {
  if (depth > 12) return out;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (
      name === 'node_modules' ||
      name === 'dist' ||
      name === 'logs' ||
      name === '.git' ||
      name === 'coverage'
    ) {
      continue;
    }
    const full = path.join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, out, depth + 1);
    else if (/\.(ts|tsx|js|mjs|sql)$/.test(name) && !name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** Suspicious SQL casting invalid labels into goods_receipt status comparisons. */
const FORBIDDEN_GR_SQL = [
  // Invalid goods_receipt_status labels in IN lists / equality
  /status\s+IN\s*\(\s*'(?:COMPLETED|DRAFT|CANCELLED)'\s*,\s*'FINALIZED'/i,
  /status\s+IN\s*\(\s*'FINALIZED'/i,
  /status\s*=\s*'FINALIZED'/i,
  /gr\.status\s+IN\s*\([^)]*'FINALIZED'[^)]*\)/i,
  /goods_receipts[\s\S]{0,200}'FINALIZED'/i,
  /FROM\s+goods_receipts[\s\S]{0,160}FINALIZED/i,
];

describe('PROOF: PG domain enum integrity (enterprise SSOT)', () => {
  it('shared SSOT matches 001_initial_schema.sql enums', () => {
    const schema = readFileSync(
      path.join(repoRoot, 'shared/sql/001_initial_schema.sql'),
      'utf8',
    );
    gate(
      'SCHEMA_GR_ENUM',
      /CREATE TYPE goods_receipt_status AS ENUM \(\s*'DRAFT',\s*'COMPLETED',\s*'CANCELLED'\s*\)/.test(
        schema,
      ),
      'goods_receipt_status DRAFT|COMPLETED|CANCELLED',
    );
    gate(
      'SCHEMA_PO_ENUM',
      /CREATE TYPE purchase_order_status AS ENUM \(\s*'DRAFT',\s*'PENDING',\s*'COMPLETED',\s*'CANCELLED'\s*\)/.test(
        schema,
      ),
      'purchase_order_status DRAFT|PENDING|COMPLETED|CANCELLED',
    );
    gate(
      'SSOT_GR_MATCHES',
      GOODS_RECEIPT_STATUSES.join(',') === 'DRAFT,COMPLETED,CANCELLED',
      GOODS_RECEIPT_STATUSES.join('|'),
    );
    gate(
      'SSOT_PO_MATCHES',
      PURCHASE_ORDER_STATUSES.join(',') === 'DRAFT,PENDING,COMPLETED,CANCELLED',
      PURCHASE_ORDER_STATUSES.join('|'),
    );
    gate(
      'SSOT_POSTED_IS_COMPLETED',
      GR_POSTED_STATUS === 'COMPLETED',
      `posted=${GR_POSTED_STATUS}`,
    );
    gate(
      'HELPER_POSTED',
      isGoodsReceiptPosted('COMPLETED') && !isGoodsReceiptPosted('DRAFT'),
      'isGoodsReceiptPosted COMPLETED only (canonical)',
    );
  });

  it('zod GR status uses SSOT (not FINALIZED-only pair)', () => {
    const zod = readFileSync(path.join(repoRoot, 'shared/zod/goods-receipt.ts'), 'utf8');
    gate('ZOD_IMPORTS_SSOT', zod.includes('GOODS_RECEIPT_STATUSES'), 'zod imports domain SSOT');
    gate('ZOD_NO_FINALIZED_ENUM', !zod.includes("'FINALIZED'"), 'zod does not enum FINALIZED');
  });

  it('server source: no invalid goods_receipt status SQL literals', () => {
    const files = walk(path.join(serverRoot, 'src'));
    const hits: string[] = [];
    for (const f of files) {
      if (f.includes('pgDomainEnumIntegrity') || f.includes('purchaseOrderGrStatusEnum')) continue;
      const src = readFileSync(f, 'utf8');
      // Skip pure comments mentioning FINALIZED in long docs? Still fail SQL patterns.
      for (const re of FORBIDDEN_GR_SQL) {
        if (re.test(src)) {
          hits.push(`${path.relative(repoRoot, f)} :: ${re}`);
        }
      }
    }
    gate(
      'SERVER_NO_FORBIDDEN_GR_SQL',
      hits.length === 0,
      hits.length === 0 ? `scanned ${files.length} files` : hits.slice(0, 8).join(' | '),
    );
  });

  it('shared sql migrations: no goods_receipt FINALIZED enum widen without SSOT', () => {
    const sqlFiles = walk(path.join(repoRoot, 'shared/sql'));
    const widenHits: string[] = [];
    for (const f of sqlFiles) {
      const src = readFileSync(f, 'utf8');
      if (/ALTER TYPE goods_receipt_status[\s\S]{0,80}FINALIZED/i.test(src)) {
        widenHits.push(path.relative(repoRoot, f));
      }
      if (/goods_receipt_status AS ENUM[^;]*FINALIZED/i.test(src)) {
        widenHits.push(path.relative(repoRoot, f));
      }
    }
    gate(
      'SQL_NO_GR_FINALIZED_TYPE',
      widenHits.length === 0,
      widenHits.length === 0 ? `scanned ${sqlFiles.length} sql` : widenHits.join(', '),
    );
  });

  it('forbidden label list documents FINALIZED as SQL ban', () => {
    gate(
      'FORBIDDEN_LIST',
      (FORBIDDEN_GOODS_RECEIPT_SQL_STATUS_LITERALS as readonly string[]).includes('FINALIZED'),
      'FINALIZED forbidden in SQL',
    );
  });

  it('PO supplier blocker uses COMPLETED only', () => {
    const src = readFileSync(
      path.join(serverRoot, 'src/modules/purchase-orders/purchaseOrderRepository.ts'),
      'utf8',
    );
    const slice = src.slice(
      src.indexOf('getPOSupplierChangeBlocker'),
      src.indexOf('updatePOHeader'),
    );
    gate(
      'PO_BLOCKER_COMPLETED_ONLY',
      slice.includes("status = 'COMPLETED'") &&
        !/status\s+IN\s*\([^)]*FINALIZED/.test(slice),
      'COMPLETED only in blocker',
    );
  });

  it('payment_method: schema has CREDIT; no COALESCE(enum,\'\') in aging path', () => {
    const schema = readFileSync(
      path.join(repoRoot, 'shared/sql/001_initial_schema.sql'),
      'utf8',
    );
    gate(
      'SCHEMA_PM_HAS_CREDIT',
      /CREATE TYPE payment_method AS ENUM[\s\S]*?'CREDIT'/.test(schema),
      'payment_method includes CREDIT',
    );
    gate(
      'SSOT_PM_CORE_HAS_CREDIT',
      (PAYMENT_METHOD_CORE as readonly string[]).includes('CREDIT'),
      PAYMENT_METHOD_CORE.join('|'),
    );

    // Global anti-pattern: COALESCE(payment_method, '') → 22P02 empty enum
    const coalesceEmptyPm = /COALESCE\s*\(\s*[^,)]*payment_method(?!::text)\s*,\s*''\s*\)/i;
    const files = walk(path.join(serverRoot, 'src')).filter(
      (f) =>
        !f.includes('.evidence.') &&
        !f.includes('.test.') &&
        !f.endsWith('.test.ts'),
    );
    const hits: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      // Skip string literals that only document the anti-pattern
      if (coalesceEmptyPm.test(src) || ENUM_COALESCE_EMPTY_ANTIPATTERN.test(src)) {
        hits.push(path.relative(repoRoot, f));
      }
    }
    gate(
      'NO_COALESCE_PM_TO_EMPTY',
      hits.length === 0,
      hits.length === 0 ? 'no COALESCE(payment_method, \'\')' : hits.join(', '),
    );

    const aging = readFileSync(
      path.join(serverRoot, 'src/services/agedBalanceService.ts'),
      'utf8',
    );
    gate(
      'AGING_PM_VIA_TEXT',
      /payment_method::text/.test(aging),
      'aged receivables casts payment_method to text before filter',
    );
  });
});

afterAll(() => {
  const pass = gates.filter((g) => g.ok).length;
  const fail = gates.filter((g) => !g.ok).length;
  const verdict = fail === 0 ? 'PASS' : 'FAIL';
  const at = new Date().toISOString();
  const evidence = {
    at,
    feature: 'PG_DOMAIN_ENUM_INTEGRITY',
    summary: { pass, fail, total: gates.length, verdict },
    ssot: {
      goodsReceipt: GOODS_RECEIPT_STATUSES,
      purchaseOrder: PURCHASE_ORDER_STATUSES,
      paymentMethodCore: PAYMENT_METHOD_CORE,
      grPosted: GR_POSTED_STATUS,
      forbiddenGrSqlLiterals: FORBIDDEN_GOODS_RECEIPT_SQL_STATUS_LITERALS,
    },
    gates,
  };

  const md = `# PROOF — Postgres domain enum integrity

**Generated:** ${at}  
**Verdict:** **${verdict}** (${pass}/${gates.length} gates)

## Why this exists

Enterprise ERP cannot invent status labels **or cast empty / invented strings into PG enums**. Invalid SQL causes **PG 22P02**:

- \`invalid input value for enum goods_receipt_status: "FINALIZED"\`
- \`invalid input value for enum payment_method: ""\` (from \`COALESCE(enum_col, '')\`)

### Canonical (SQL + TypeScript SSOT)

| Domain | Values | File |
|--------|--------|------|
| goods_receipt_status | DRAFT, COMPLETED, CANCELLED | \`shared/domain/pgDomainEnums.ts\` |
| purchase_order_status | DRAFT, PENDING, COMPLETED, CANCELLED | same |
| payment_method | CASH, CARD, …, **CREDIT** (+ migrations) | same; always compare via \`::text\` |
| Posted GR | **COMPLETED** only | \`GR_POSTED_STATUS\` / \`isGoodsReceiptPosted\` |

## Gates

| Gate | Result | Detail |
|------|--------|--------|
${gates.map((g) => `| \`${g.id}\` | ${g.ok ? 'PASS' : 'FAIL'} | ${g.detail.replace(/\|/g, '\\\\|')} |`).join('\n')}

## Re-run

\`\`\`bash
cd SamplePOS.Server
npm test -- --runInBand src/tests/pgDomainEnumIntegrity.evidence.test.ts
\`\`\`
`;

  writeFileSync(path.join(repoRoot, 'PROOF_PG_DOMAIN_ENUM_INTEGRITY.json'), JSON.stringify(evidence, null, 2));
  writeFileSync(path.join(repoRoot, 'PROOF_PG_DOMAIN_ENUM_INTEGRITY.md'), md);
});
