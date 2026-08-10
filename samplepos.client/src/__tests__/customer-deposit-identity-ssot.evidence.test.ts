/**
 * PROOF: Customer deposit identity SSOT — list pages never authorize deposit writes.
 *
 * Run: npx vitest run src/__tests__/customer-deposit-identity-ssot.evidence.test.ts
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  canPostCustomerDeposit,
  CUSTOMER_DEPOSIT_IDENTITY_SSOT,
  FORBIDDEN_CUSTOMER_DEPOSIT_CLIENT_PATTERNS,
  resolveCustomerDepositDisplayName,
} from '../../../shared/domain/customerDepositSsot';

const repoRoot = path.resolve(__dirname, '../../..');

type Gate = { id: string; ok: boolean; detail: string };
const gates: Gate[] = [];

function gate(id: string, ok: boolean, detail: string): void {
  gates.push({ id, ok, detail });
  expect({ id, ok, detail }).toEqual({ id, ok: true, detail });
}

function read(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), 'utf8');
}

describe('Customer deposit identity SSOT', () => {
  it('shared helpers: UUID saves; list names ignored; Unknown discarded', () => {
    gate('CAN_POST_ID', canPostCustomerDeposit('a-uuid'), 'uuid posts');
    gate('CAN_POST_EMPTY', !canPostCustomerDeposit(''), 'empty blocked');
    gate(
      'NAME_ORDER',
      resolveCustomerDepositDisplayName({
        boundName: 'Bound Co',
        masterName: 'Master Co',
        balanceName: 'Bal Co',
      }) === 'Bound Co',
      'bound wins',
    );
    gate(
      'NAME_NO_LIST',
      resolveCustomerDepositDisplayName({
        boundName: null,
        masterName: 'Master Co',
        balanceName: null,
      }) === 'Master Co',
      'master next',
    );
    gate(
      'NAME_SKIP_UNKNOWN',
      resolveCustomerDepositDisplayName({
        boundName: 'Unknown',
        masterName: 'Real Name',
      }) === 'Real Name',
      'drops Unknown literal',
    );
    gate(
      'SSOT_LIST_ROLE',
      CUSTOMER_DEPOSIT_IDENTITY_SSOT.listApiRole === 'browse_picker_only',
      'list is browse only',
    );
  });

  it('CustomerDeposits UI: no list save-gate; uses SSOT helpers; bound mounts pass name', () => {
    const ui = read('samplepos.client/src/components/customers/CustomerDeposits.tsx');
    for (const re of FORBIDDEN_CUSTOMER_DEPOSIT_CLIENT_PATTERNS) {
      gate(`FORBIDDEN_${re.source.slice(0, 24)}`, !re.test(ui), re.source);
    }
    gate('USES_CAN_POST', ui.includes('canPostCustomerDeposit'), 'save uses canPost SSOT');
    gate('USES_RESOLVE_NAME', ui.includes('resolveCustomerDepositDisplayName'), 'name SSOT helper');
    gate(
      'NO_FIND_FOR_SAVE',
      !/customers\.find\s*\(/.test(ui) && !/pickerCustomers\.find\s*\(/.test(ui),
      'no find-for-save',
    );
    gate('IMPORT_SSOT', ui.includes('customerDepositSsot'), 'imports domain SSOT');
    gate('USE_CUSTOMER', ui.includes('useCustomer'), 'master GET by id');
    gate(
      'PICKER_NOT_BOUND',
      /isBound\s*\?/.test(ui) || ui.includes('pickerCustomers'),
      'list scoped to browse mode',
    );

    const page = read('samplepos.client/src/pages/customers/CustomerDetailPage.tsx');
    gate(
      'DETAIL_PASSES_NAME',
      /CustomerDeposits[\s\S]{0,200}customerName=/.test(page),
      'detail passes customerName',
    );

    const modal = read('samplepos.client/src/components/customers/CustomerDetailModal.tsx');
    gate(
      'MODAL_PASSES_NAME',
      /CustomerDeposits[\s\S]{0,200}customerName=/.test(modal),
      'modal passes customerName',
    );
  });

  it('server write path re-loads customer master for GL name', () => {
    const svc = read('SamplePOS.Server/src/modules/deposits/depositsService.ts');
    gate('FIND_BY_ID', svc.includes('findCustomerById'), 'findCustomerById');
    gate(
      'CREATE_HAS_IDENTITY_SSOT_DOC',
      /IDENTITY SSOT/.test(svc) || /customerNameSsot/.test(svc),
      'SSOT documented on create',
    );
    gate(
      'GL_USES_MASTER_NAME',
      /customerName:\s*customerNameSsot/.test(svc) ||
        (/findCustomerById[\s\S]+recordCustomerDepositToGL[\s\S]+customer\.name/.test(svc) &&
          !/customer\?\.name\s*\|\|\s*['"]Unknown['"]/.test(svc)),
      'GL name from master, not Unknown fallback',
    );
  });

  it('writes PROOF artifacts', () => {
    const pass = gates.filter((g) => g.ok).length;
    const fail = gates.filter((g) => !g.ok).length;
    const at = new Date().toISOString();
    const verdict = fail === 0 ? 'PASS' : 'FAIL';
    const evidence = {
      at,
      feature: 'CUSTOMER_DEPOSIT_IDENTITY_SSOT',
      summary: { pass, fail, total: gates.length, verdict },
      rules: CUSTOMER_DEPOSIT_IDENTITY_SSOT,
      gates,
    };
    const md = `# PROOF — Customer deposit identity SSOT

**Generated:** ${at}  
**Verdict:** **${verdict}** (${pass}/${gates.length} gates)

## Mandatory rules

1. Write identity = \`customers.id\` via \`findCustomerById\` (server).  
2. UI name = bound prop → \`GET /customers/:id\` → balance join — **never** list page slice.  
3. Paginated customer list is **browse/picker only** — never save gate.  

## Gates

| Gate | Result | Detail |
|------|--------|--------|
${gates.map((g) => `| \`${g.id}\` | ${g.ok ? 'PASS' : 'FAIL'} | ${g.detail.replace(/\|/g, '\\\\|')} |`).join('\n')}
`;
    writeFileSync(path.join(repoRoot, 'PROOF_CUSTOMER_DEPOSIT_IDENTITY_SSOT.json'), JSON.stringify(evidence, null, 2));
    writeFileSync(path.join(repoRoot, 'PROOF_CUSTOMER_DEPOSIT_IDENTITY_SSOT.md'), md);
    gate('ARTIFACTS', true, 'PROOF_CUSTOMER_DEPOSIT_IDENTITY_SSOT written');
  });
});
