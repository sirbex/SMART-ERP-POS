import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { formatZodIssues } from '../utils/formatZodIssues';

describe('formatZodIssues', () => {
  it('formats zod v4 issues without throwing', () => {
    const parsed = z
      .object({
        ownerPassword: z.string().regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'needs mixed case and digit'),
      })
      .safeParse({ ownerPassword: 'weak' });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const msg = formatZodIssues(parsed.error);
      expect(msg).toContain('ownerPassword');
      expect(msg).toContain('needs mixed case and digit');
    }
  });
});
