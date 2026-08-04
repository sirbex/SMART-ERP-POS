/**
 * Integrity: OfflineSyncStatusPanel is a single smart status strip
 * (connectivity · queue · cache) — not stacked "Online" / "Offline Sales Queue" blocks.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8');

describe('offline sync status smart strip (integrity evidence)', () => {
  const panel = read('samplepos.client/src/components/offline/OfflineSyncStatusPanel.tsx');
  const settings = read('samplepos.client/src/pages/settings/SettingsPage.tsx');
  const restaurantPos = read('samplepos.client/src/pages/restaurant/RestaurantPosPage.tsx');

  it('EVIDENCE: single strip labels for Online / Queue / Refresh cache', () => {
    expect(panel).toMatch(/Smart status strip/);
    expect(panel).toMatch(/Queue clear/);
    expect(panel).toMatch(/Refresh cache/);
    expect(panel).toMatch(/pendingCount > 0 \? `\$\{pendingCount\} pending`/);
    // Stacked legacy headings must not return
    expect(panel).not.toMatch(/Offline Sales Queue/);
    expect(panel).not.toMatch(/No offline sales queued/);
    expect(panel).not.toMatch(/🔄 Refresh Cache/);
  });

  it('EVIDENCE: Settings + Restaurant floor both use OfflineSyncStatusPanel', () => {
    expect(settings).toMatch(/OfflineSyncStatusPanel/);
    expect(settings).toMatch(/value="offline"/);
    expect(restaurantPos).toMatch(/OfflineSyncStatusPanel compact/);
  });

  it('EVIDENCE: queue details expand only when totalQueueItems > 0', () => {
    expect(panel).toMatch(/showQueue && totalQueueItems > 0/);
    expect(panel).toMatch(/Sync \$\{pendingCount\}/);
  });
});
