import { describe, it, expect } from 'vitest';
import { parseTypedDateToIso } from '@/components/ui/date-picker';

describe('DatePicker typed custom dates (evidence)', () => {
  it('accepts ISO YYYY-MM-DD', () => {
    expect(parseTypedDateToIso('2026-07-15')).toBe('2026-07-15');
  });

  it('accepts DD/MM/YYYY and unpadded d/M/yyyy', () => {
    expect(parseTypedDateToIso('15/07/2026')).toBe('2026-07-15');
    expect(parseTypedDateToIso('5/7/2026')).toBe('2026-07-05');
  });

  it('accepts dash and dot separators', () => {
    expect(parseTypedDateToIso('15-07-2026')).toBe('2026-07-15');
    expect(parseTypedDateToIso('15.07.2026')).toBe('2026-07-15');
  });

  it('rejects incomplete mid-keystroke values', () => {
    expect(parseTypedDateToIso('15')).toBeNull();
    expect(parseTypedDateToIso('15/07')).toBeNull();
    expect(parseTypedDateToIso('15/07/20')).toBeNull();
  });

  it('rejects impossible calendar dates', () => {
    expect(parseTypedDateToIso('2026-02-31')).toBeNull();
    expect(parseTypedDateToIso('32/01/2026')).toBeNull();
  });

  it('trims whitespace', () => {
    expect(parseTypedDateToIso('  2026-07-15  ')).toBe('2026-07-15');
  });
});
