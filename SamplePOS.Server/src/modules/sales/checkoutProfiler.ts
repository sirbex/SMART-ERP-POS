/**
 * Opt-in checkout TX phase profiler (P4 — Measure → Prove → Refactor).
 *
 * Enable via CHECKOUT_PROFILE=1 or CreateSaleInput.profileCheckout / X-Checkout-Profile.
 * Zero cost when disabled (mark is a no-op).
 */
export type CheckoutPhaseSample = { phase: string; ms: number };

export type CheckoutProfileSnapshot = {
  totalMs: number;
  phases: CheckoutPhaseSample[];
  /** Ranked hottest phases (desc). */
  ranked: CheckoutPhaseSample[];
};

export function createCheckoutProfiler(enabled: boolean) {
  const t0 = performance.now();
  let last = t0;
  const phases: CheckoutPhaseSample[] = [];

  return {
    get enabled() {
      return enabled;
    },
    mark(phase: string): void {
      if (!enabled) return;
      const now = performance.now();
      phases.push({ phase, ms: Number((now - last).toFixed(3)) });
      last = now;
    },
    snapshot(): CheckoutProfileSnapshot | undefined {
      if (!enabled) return undefined;
      const totalMs = Number((performance.now() - t0).toFixed(3));
      const ranked = [...phases].sort((a, b) => b.ms - a.ms);
      return { totalMs, phases, ranked };
    },
  };
}

export function isCheckoutProfileEnabled(
  flag?: boolean | null,
): boolean {
  if (flag === true) return true;
  return process.env.CHECKOUT_PROFILE === '1';
}

/** Aggregate multiple snapshots into p50/p95/p99 per phase + totals. */
export function aggregateCheckoutProfiles(snapshots: CheckoutProfileSnapshot[]) {
  const totals = snapshots.map((s) => s.totalMs).sort((a, b) => a - b);
  const byPhase = new Map<string, number[]>();
  for (const s of snapshots) {
    for (const p of s.phases) {
      const arr = byPhase.get(p.phase) ?? [];
      arr.push(p.ms);
      byPhase.set(p.phase, arr);
    }
  }
  const pct = (sorted: number[], p: number) => {
    if (sorted.length === 0) return null;
    const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
    return sorted[Math.max(0, idx)];
  };
  const phaseStats = [...byPhase.entries()].map(([phase, samples]) => {
    const sorted = [...samples].sort((a, b) => a - b);
    return {
      phase,
      n: sorted.length,
      p50: pct(sorted, 50),
      p95: pct(sorted, 95),
      p99: pct(sorted, 99),
      max: sorted[sorted.length - 1] ?? null,
      mean: sorted.reduce((a, b) => a + b, 0) / sorted.length,
    };
  });
  phaseStats.sort((a, b) => (b.p95 ?? 0) - (a.p95 ?? 0));
  return {
    n: snapshots.length,
    totalMs: {
      p50: pct(totals, 50),
      p95: pct(totals, 95),
      p99: pct(totals, 99),
      max: totals[totals.length - 1] ?? null,
      mean: totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : null,
    },
    phasesByP95: phaseStats,
  };
}
