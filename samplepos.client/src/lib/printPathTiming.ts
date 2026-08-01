/**
 * Dev/ops timing for restaurant print path (KOT / bill / agent).
 * Logs cumulative ms per stage — use to locate multi-second stalls.
 */
export type PrintPathMark = { stage: string; atMs: number };

export type PrintPathTrace = {
  mark: (stage: string) => void;
  end: (extra?: Record<string, unknown>) => PrintPathMark[];
  elapsedMs: () => number;
};

export function startPrintPathTrace(label: string): PrintPathTrace {
  const t0 =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  const marks: PrintPathMark[] = [{ stage: 'start', atMs: 0 }];

  return {
    mark(stage: string) {
      const now =
        typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now()
          : Date.now();
      marks.push({ stage, atMs: Math.round(now - t0) });
    },
    elapsedMs() {
      const now =
        typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now()
          : Date.now();
      return Math.round(now - t0);
    },
    end(extra?: Record<string, unknown>) {
      const now =
        typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now()
          : Date.now();
      marks.push({ stage: 'end', atMs: Math.round(now - t0) });
      if (typeof console !== 'undefined') {
        console.info(`[print-timing] ${label}`, { marks, ...extra });
      }
      return marks;
    },
  };
}
