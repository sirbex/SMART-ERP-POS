import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');

describe('DatePicker responsive layout', () => {
  const tsx = readFileSync(resolve(root, 'components/ui/date-picker.tsx'), 'utf8');
  const css = readFileSync(resolve(root, 'components/ui/date-picker.css'), 'utf8');

  it('uses viewport-scaled widths on md and lg breakpoints', () => {
    expect(tsx).toContain('md:w-[min(100vw-2rem,40rem)]');
    expect(tsx).toContain('lg:w-[min(42rem,calc(100vw-2rem))]');
    expect(tsx).not.toContain('max-h-[min(var(--radix-popover-content-available-height),28rem)]');
  });

  it('places calendar and actions side-by-side on medium+ screens', () => {
    expect(tsx).toContain('md:flex-row');
    expect(tsx).toContain('md:w-56');
  });

  it('centers popover under trigger for better large-screen placement', () => {
    expect(tsx).toContain('align="center"');
  });

  it('scales calendar cell size with viewport via CSS variables', () => {
    expect(css).toContain('--rdp-day_button-height');
    expect(css).toContain('@media (min-width: 1024px)');
  });

  it('uses business-date SSOT for quick picks (not browser local Date)', () => {
    expect(tsx).toContain("from '@/utils/businessDate'");
    expect(tsx).toContain('getBusinessDate');
    expect(tsx).toContain('addDaysToDateString');
    expect(tsx).toContain('handleQuickSelect');
  });

  it('documents DatePicker as global SSOT', () => {
    expect(tsx).toContain('global SSOT for single-date selection');
  });

  it('commits typed custom dates on Enter, blur, and Apply', () => {
    expect(tsx).toContain('parseTypedDateToIso');
    expect(tsx).toContain('commitTypedDate');
    expect(tsx).toContain('onBlur={() => commitTypedDate(false)}');
    expect(tsx).toContain("e.key === 'Enter'");
    expect(tsx).toContain('Apply');
    expect(tsx).toContain('Press Enter or Apply after typing');
  });

  it('focuses the type-in field when the popover opens', () => {
    expect(tsx).toContain('inputRef.current?.focus()');
  });
});
