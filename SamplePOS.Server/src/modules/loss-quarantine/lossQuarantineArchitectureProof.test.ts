/**
 * Gate A / E architecture + governance proof — Loss & Quarantine (ADR-004 Phase 2E)
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LOSS_QUARANTINE_TOUCHPOINT_REGISTRY,
  countLossTouchpointsByStatus,
  LOSS_QUARANTINE_WRITE_GATEWAY,
} from './lossQuarantineTouchpointRegistry.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

function readRepo(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), 'utf8');
}

describe('Loss & Quarantine architecture proof (Gate A)', () => {
  it('A-01 ADR-004 freeze statement exists', () => {
    const adr = readRepo('docs/architecture/LOSS_QUARANTINE_ADR.md');
    expect(adr).toMatch(/Freeze inventory loss recognition/i);
    expect(adr).toMatch(/\*\*Status:\*\* Accepted/i);
  });

  it('A-02 registry lists quarantine and disposal touchpoints', () => {
    const ids = new Set(LOSS_QUARANTINE_TOUCHPOINT_REGISTRY.map((t) => t.id));
    for (const id of ['LQ01', 'LQ02', 'LQ03', 'LQ05', 'LQ08', 'LQ09', 'LQ11', 'LQ12']) {
      expect(ids.has(id)).toBe(true);
    }
    expect(LOSS_QUARANTINE_TOUCHPOINT_REGISTRY.length).toBeGreaterThanOrEqual(12);
    expect(countLossTouchpointsByStatus('NOT_STARTED')).toBe(0);
  });

  it('A-03 every touchpoint has status + owner + proof', () => {
    for (const t of LOSS_QUARANTINE_TOUCHPOINT_REGISTRY) {
      expect([
        'MIGRATED',
        'SHIMMED',
        'ALLOW_LISTED',
        'DEFERRED',
        'CLASSIFIED',
        'NOT_STARTED',
      ]).toContain(t.status);
      expect(t.owner.length).toBeGreaterThan(0);
      expect(t.proof.length).toBeGreaterThan(0);
    }
  });

  it('A-04 quarantine paths tag QUARANTINE_TRANSFER with posts_gl=false', () => {
    const adj = readRepo(
      'SamplePOS.Server/src/modules/inventory/warehouse/warehouseAdjustmentService.ts',
    );
    expect(adj).toMatch(/economicEvent:\s*'QUARANTINE_TRANSFER'/);
    expect(adj).toMatch(/postsGl:\s*false/);

    const exp = readRepo(
      'SamplePOS.Server/src/modules/inventory/warehouse/expiryAutomationService.ts',
    );
    expect(exp).toMatch(/economicEvent:\s*'QUARANTINE_TRANSFER'/);
  });

  it('A-04 handler tags GL-bearing OUT as LOSS_DISPOSAL', () => {
    const handler = readRepo(
      'SamplePOS.Server/src/modules/inventory/stockMovementHandler.ts',
    );
    expect(handler).toMatch(/LOSS_DISPOSAL/);
    expect(handler).toMatch(/economic_event/);
  });

  it('A-05 schema 545 classifiers + gateway module exist', () => {
    expect(LOSS_QUARANTINE_WRITE_GATEWAY).toContain('modules/loss-quarantine');
    expect(
      existsSync(path.join(repoRoot, 'shared/sql/545_loss_quarantine_foundation.sql')),
    ).toBe(true);
    expect(existsSync(path.join(repoRoot, 'shared/loss-quarantine/index.ts'))).toBe(true);
    const sql = readRepo('shared/sql/545_loss_quarantine_foundation.sql');
    expect(sql).toMatch(/loss_quarantine_document_enabled/);
    expect(sql).toMatch(/economic_event/);
    expect(sql).toMatch(/posts_gl/);
  });

  it('A-06 legacy recordStockAdjustmentToGL is guarded', () => {
    const gl = readRepo('SamplePOS.Server/src/services/glEntryService.ts');
    expect(gl).toMatch(/ALLOW_LEGACY_STOCK_ADJUSTMENT_GL/);
    expect(gl).toMatch(/retired \(ADR-004/);
  });

  it('A repair exclusions + trigger drop (2D) are present', () => {
    const repair = readRepo('SamplePOS.Server/src/modules/system/glRepairService.ts');
    expect(repair).toMatch(/posts_gl IS FALSE/);
    expect(repair).toMatch(/QUARANTINE_TRANSFER/);
    expect(
      existsSync(path.join(repoRoot, 'shared/sql/547_drop_stock_movement_gl_trigger.sql')),
    ).toBe(true);
  });
});

describe('Loss & Quarantine governance proof (Gate E)', () => {
  it('E-01 dispose requires inventory.adjust; aging requires inventory.read', () => {
    const routes = readRepo(
      'SamplePOS.Server/src/modules/loss-quarantine/lossQuarantineRoutes.ts',
    );
    expect(routes).toMatch(/requirePermission\('inventory\.read'\)/);
    expect(routes).toMatch(/requirePermission\('inventory\.adjust'\)/);
    expect(routes).toMatch(/\/dispose/);
  });

  it('E-04 reverse requires elevated accounting.manage', () => {
    const routes = readRepo(
      'SamplePOS.Server/src/modules/loss-quarantine/lossQuarantineRoutes.ts',
    );
    expect(routes).toMatch(
      /dispose\/:id\/reverse[\s\S]*?requirePermission\('accounting\.manage'\)/,
    );
  });

  it('E-02 / LQ-INV-10 posted disposal is reverse-only (no edit path)', () => {
    const svc = readRepo(
      'SamplePOS.Server/src/modules/loss-quarantine/lossDisposalService.ts',
    );
    expect(svc).toMatch(/reverseDisposal/);
    expect(svc).toMatch(/Cannot reverse disposal in status/);
    expect(svc).toMatch(/Disposal already reversed/);
    expect(svc).not.toMatch(/function updateDisposal|editDisposal|patchDisposal/);
  });

  it('E-03 audit fields present on disposal documents schema', () => {
    const sql = readRepo('shared/sql/546_loss_disposal_documents.sql');
    expect(sql).toMatch(/created_by/);
    expect(sql).toMatch(/posted_at/);
    expect(sql).toMatch(/journal_entry_id/);
    expect(sql).toMatch(/expense_account_code/);
    expect(sql).toMatch(/inventory_batch_id/);
    expect(sql).toMatch(/product_lot_id/);
  });

  it('E-05 quarantine aging attachable to period-close checklist', () => {
    const checklist = readRepo('samplepos.client/src/lib/financialCloseChecklist.ts');
    expect(checklist).toMatch(/step-quarantine-aging/);
    expect(checklist).toMatch(/\/inventory\/quarantine/);
    expect(checklist).toMatch(/blocksClose:\s*false/);
  });
});
