/**
 * Advance recovery SSOT: register (employee_advances.RemainingAmount) drives Process/Post.
 * GL 1410 CurrentBalance must match open register or Process fails loud.
 *
 * Expenses paid to staff are NOT advances — they never create register rows.
 */

import { money2 } from './payrollMath.js';

export const ADVANCE_SSOT_EPS = 0.005;

export function advanceRegisterGlAligned(
  registerRemaining: number | string,
  glBalance: number | string,
  eps: number = ADVANCE_SSOT_EPS
): boolean {
  const reg = money2(registerRemaining);
  const gl = money2(glBalance);
  if (reg.abs().lte(eps) && gl.abs().lte(eps)) return true;
  return money2(reg.minus(gl)).abs().lte(eps);
}

export function assertAdvanceRegisterGlAligned(input: {
  employeeLabel: string;
  registerRemaining: number | string;
  glBalance: number | string;
  advanceAccountCode?: string | null;
}): void {
  const reg = money2(input.registerRemaining);
  const gl = money2(input.glBalance);
  if (advanceRegisterGlAligned(input.registerRemaining, input.glBalance)) return;

  const acct = input.advanceAccountCode ? ` (${input.advanceAccountCode})` : '';
  throw new Error(
    `ADVANCE_SSOT_DRIFT: ${input.employeeLabel}${acct} — ` +
      `register remaining ${reg.toFixed(2)} ≠ GL advance balance ${gl.toFixed(2)}. ` +
      `Recovery uses the Advances register (OPEN/PARTIAL RemainingAmount), not Expenses. ` +
      `Record or heal salary advances on HR → Advances before Process.`
  );
}
