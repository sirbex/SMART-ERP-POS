import { describe, expect, it } from '@jest/globals';
import { GLReconciliationService } from './glReconciliationService.js';

describe('GLReconciliationService.validatePostingDate', () => {
  it('documents permission-based advisor lock (no role-name check)', async () => {
    const signature = GLReconciliationService.validatePostingDate.toString();
    expect(signature).toContain('userId');
    expect(signature).not.toContain('ADMIN');
    expect(signature).not.toContain('ACCOUNTANT');
  });
});
