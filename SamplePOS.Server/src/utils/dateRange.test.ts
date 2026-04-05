import { toUtcRange } from './dateRange.js';

describe('toUtcRange', () => {
  it('converts Africa/Kampala (UTC+3) single day correctly', () => {
    const result = toUtcRange('2026-04-04', '2026-04-04', 'Africa/Kampala');
    // Kampala midnight Apr 4 = Apr 3 21:00 UTC
    expect(result.startUtc).toBe('2026-04-03T21:00:00.000Z');
    // Kampala midnight Apr 5 = Apr 4 21:00 UTC (exclusive)
    expect(result.endUtc).toBe('2026-04-04T21:00:00.000Z');
  });

  it('converts multi-day range correctly', () => {
    const result = toUtcRange('2026-04-01', '2026-04-03', 'Africa/Kampala');
    expect(result.startUtc).toBe('2026-03-31T21:00:00.000Z');
    expect(result.endUtc).toBe('2026-04-03T21:00:00.000Z');
  });

  it('handles UTC timezone as passthrough', () => {
    const result = toUtcRange('2026-04-04', '2026-04-04', 'UTC');
    expect(result.startUtc).toBe('2026-04-04T00:00:00.000Z');
    expect(result.endUtc).toBe('2026-04-05T00:00:00.000Z');
  });

  it('handles month boundary rollover', () => {
    const result = toUtcRange('2026-01-31', '2026-01-31', 'Africa/Kampala');
    expect(result.startUtc).toBe('2026-01-30T21:00:00.000Z');
    expect(result.endUtc).toBe('2026-01-31T21:00:00.000Z');
  });

  it('handles year boundary rollover', () => {
    const result = toUtcRange('2025-12-31', '2025-12-31', 'Africa/Kampala');
    expect(result.startUtc).toBe('2025-12-30T21:00:00.000Z');
    expect(result.endUtc).toBe('2025-12-31T21:00:00.000Z');
  });

  it('handles negative offset timezone (UTC-5)', () => {
    const result = toUtcRange('2026-04-04', '2026-04-04', 'America/New_York');
    // EDT (UTC-4 in April): midnight Apr 4 = Apr 4 04:00 UTC
    expect(result.startUtc).toBe('2026-04-04T04:00:00.000Z');
    // midnight Apr 5 = Apr 5 04:00 UTC
    expect(result.endUtc).toBe('2026-04-05T04:00:00.000Z');
  });
});
