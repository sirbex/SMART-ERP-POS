import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from '@jest/globals';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../..');

describe('Banking & Liquidity RBAC for Manager/Accountant', () => {
  it('migration 557 grants banking module to Manager and Accountant', () => {
    const sql = readFileSync(
      join(root, 'shared/sql/557_rbac_banking_liquidity_manager_accountant.sql'),
      'utf8',
    );
    expect(sql).toMatch(/name = 'Manager'/);
    expect(sql).toMatch(/name = 'Accountant'/);
    expect(sql).toMatch(/module = 'banking'/);
    expect(sql).toMatch(/accounting\.manage/);
    expect(sql).toMatch(/schema_version.*557/);
  });

  it('treasury liquidity routes accept banking permissions', () => {
    const src = readFileSync(
      join(root, 'SamplePOS.Server/src/modules/treasury/treasuryRoutes.ts'),
      'utf8',
    );
    expect(src).toMatch(/requireLiquidityRead/);
    expect(src).toMatch(/requireLiquidityWrite/);
    expect(src).toMatch(/banking\.read/);
    expect(src).toMatch(/banking\.create/);
    expect(src).not.toMatch(/requirePermission\('accounting\.manage'\)/);
  });

  it('Banking page route requires banking.read', () => {
    const app = readFileSync(join(root, 'samplepos.client/src/App.tsx'), 'utf8');
    expect(app).toMatch(/path="\/accounting\/banking"/);
    expect(app).toMatch(/requiredPermissions=\{\['banking\.read'\]\}/);
  });
});
