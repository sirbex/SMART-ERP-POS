/**
 * Print Job SSOT architecture proof — durable queue + local agent delivery.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

function readRepo(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), 'utf8');
}

describe('Print Job SSOT architecture', () => {
  it('migration 580 creates print_jobs queue', () => {
    const sql = readRepo('shared/sql/580_print_jobs.sql');
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS print_jobs/i);
    expect(sql).toMatch(/document_type/);
    expect(sql).toMatch(/target_printer/);
    expect(sql).toMatch(/payload_json/);
    expect(sql).toMatch(/PENDING.*PRINTING.*PRINTED.*ERROR/s);
    expect(sql).toMatch(/INSERT INTO schema_version \(version\) VALUES \(580\)/);

    const ver = readRepo('SamplePOS.Server/src/constants/schemaVersion.ts');
    expect(ver).toMatch(/CURRENT_SCHEMA_VERSION\s*=\s*58[0-9]/);
  });

  it('server module enqueues jobs on sendKot / bill and exposes status API', () => {
    expect(
      existsSync(path.join(repoRoot, 'SamplePOS.Server/src/modules/print-jobs/printJobsService.ts')),
    ).toBe(true);

    const service = readRepo('SamplePOS.Server/src/modules/restaurant/restaurantService.ts');
    const sendKot = service.slice(
      service.indexOf('async sendKot('),
      service.indexOf('async voidCheckItems('),
    );
    expect(sendKot).toMatch(/printJobsService\.enqueue/);
    expect(sendKot).toMatch(/documentType: isVoid \? 'VOID_KOT' : 'KOT'/);
    expect(sendKot).toMatch(/return \{ kots, printJobs \}/);

    expect(service).toMatch(/documentType: 'GUEST_BILL'/);

    const routes = readRepo('SamplePOS.Server/src/modules/print-jobs/printJobsRoutes.ts');
    expect(routes).toMatch(/\/pending/);
    expect(routes).toMatch(/\/:id\/status/);
    expect(routes).toMatch(/\/:id\/requeue/);

    const server = readRepo('SamplePOS.Server/src/server.ts');
    expect(server).toMatch(/printJobsRoutes/);
    expect(server).toMatch(/\/api\/print-jobs/);

    const svc = readRepo('SamplePOS.Server/src/modules/print-jobs/printJobsService.ts');
    expect(svc).toMatch(/printJobsTableReady/);
    expect(svc).toMatch(/incrementRetry: status === 'ERROR'/);
    expect(svc).toMatch(/reclaimStalePrinting/);
  });

  it('client dispatcher delivers per-job targetPrinter via :1811 (no browser picker)', () => {
    const dispatcher = readRepo('samplepos.client/src/lib/printJobDispatcher.ts');
    expect(dispatcher).toMatch(/dispatchPrintJobs/);
    expect(dispatcher).toMatch(/normalizePrintJob/);
    expect(dispatcher).toMatch(/flushPendingPrintJobs/);
    expect(dispatcher).toMatch(/targetPrinter/);
    expect(dispatcher).toMatch(/printKitchenTicket|printRestaurantBill/);
    expect(dispatcher).toMatch(/enqueueOfflinePrintJob/);
    expect(dispatcher).not.toMatch(/window\.print\(/);

    const api = readRepo('samplepos.client/src/utils/api.ts');
    expect(api).toMatch(/printJobs:\s*\{/);
    expect(api).toMatch(/print-jobs\/pending/);
    expect(api).toMatch(/print-jobs\/\$\{id\}\/requeue/);

    const pos = readRepo('samplepos.client/src/pages/restaurant/RestaurantPosPage.tsx');
    expect(pos).toMatch(/dispatchPrintJobs/);
    expect(pos).toMatch(/flushPendingPrintJobs/);
    expect(pos).toMatch(/printJobs/);
  });

  it('updateStatus SQL uses explicit casts (no ambiguous $2 CASE reuse)', () => {
    const repo = readRepo('SamplePOS.Server/src/modules/print-jobs/printJobsRepository.ts');
    expect(repo).toMatch(/\$2::varchar\(16\)/);
    expect(repo).toMatch(/\$3::text/);
    expect(repo).toMatch(/NULL::timestamptz/);
    // Must not reuse bare $2 inside CASE (PG: inconsistent types deduced for parameter $2)
    const updateBlock = repo.slice(repo.indexOf('async updateStatus'), repo.lastIndexOf('};'));
    expect(updateBlock).not.toMatch(/WHEN \$2 IN/);
    expect(updateBlock).not.toMatch(/WHEN \$2 =/);
  });

  it('reuses station routing — one sale/send creates distinct Kitchen + Bar jobs', () => {
    const service = readRepo('SamplePOS.Server/src/modules/restaurant/restaurantService.ts');
    const sendKot = service.slice(
      service.indexOf('async sendKot('),
      service.indexOf('async voidCheckItems('),
    );
    expect(sendKot).toMatch(/byStation/);
    expect(sendKot).toMatch(/targetPrinter: station\.printerName/);
    expect(sendKot).toMatch(/healUnsentLineKitchenStations/);
  });
});
