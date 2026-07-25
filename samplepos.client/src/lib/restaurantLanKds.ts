/**
 * Phase 5.5 — LAN / same-origin KDS + journal notification bus.
 *
 * BroadcastChannel reaches other tabs on the same origin (waiter POS + kitchen
 * browser on one device, or multiple windows). Each device keeps its own
 * journal; when online, OfflineAutoSync merges to the server so other devices
 * see the floor. Cross-device LAN without cloud still uses paper KOT (ADR Phase B).
 */

const CHANNEL = 'samplepos-restaurant-lan-kds';

export type LanKdsMessage =
  | { type: 'BOARD_CHANGED'; ts: number; reason?: string }
  | { type: 'JOURNAL_CHANGED'; ts: number; reason?: string }
  | { type: 'KOT_FIRED'; ts: number; kotOfflineId: string }
  | { type: 'KOT_STATUS'; ts: number; kotOfflineId: string; status: string };

let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  if (!channel) {
    try {
      channel = new BroadcastChannel(CHANNEL);
    } catch {
      return null;
    }
  }
  return channel;
}

export function publishLanKds(message: LanKdsMessage): void {
  try {
    getChannel()?.postMessage(message);
  } catch {
    /* ignore — kitchen still polls journal */
  }
}

export function publishLanKdsBoardChanged(reason?: string): void {
  publishLanKds({ type: 'BOARD_CHANGED', ts: Date.now(), reason });
  publishLanKds({ type: 'JOURNAL_CHANGED', ts: Date.now(), reason });
}

export function subscribeLanKds(handler: (msg: LanKdsMessage) => void): () => void {
  const ch = getChannel();
  if (!ch) return () => undefined;
  const onMessage = (ev: MessageEvent<LanKdsMessage>) => {
    if (ev.data && typeof ev.data === 'object' && 'type' in ev.data) {
      handler(ev.data);
    }
  };
  ch.addEventListener('message', onMessage);
  return () => ch.removeEventListener('message', onMessage);
}
