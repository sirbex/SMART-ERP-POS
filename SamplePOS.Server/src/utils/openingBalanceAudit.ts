import type { PoolClient } from 'pg';
import { createAuditEntry } from '../modules/audit/auditRepository.js';

export type OpeningBalanceParty = 'customer' | 'supplier';

export type OpeningBalanceAuditAction = 'IMPORT' | 'UPDATE' | 'CANCEL' | 'INCREASE';

/**
 * audit_log.action is constrained by CHECK (see shared/sql). INCREASE is recorded as
 * UPDATE with tags/details carrying cutover-increase semantics (Tally/SAP-style delta).
 */
function toStoredAuditAction(action: OpeningBalanceAuditAction): 'IMPORT' | 'UPDATE' | 'CANCEL' {
  return action === 'INCREASE' ? 'UPDATE' : action;
}

export async function logOpeningBalanceAudit(
  client: PoolClient,
  params: {
    party: OpeningBalanceParty;
    partyId: string;
    partyName: string;
    action: OpeningBalanceAuditAction;
    invoiceId: string;
    invoiceNumber: string;
    amount?: number;
    previousAmount?: number;
    increaseBy?: number;
    reason: string;
    userId: string;
    userName?: string | null;
    userRole?: string | null;
  },
): Promise<void> {
  const tag = params.party === 'customer' ? 'OPENING_BALANCE_CUSTOMER' : 'OPENING_BALANCE_SUPPLIER';
  const entityType = params.party === 'customer' ? 'CUSTOMER' : 'SUPPLIER';
  const storedAction = toStoredAuditAction(params.action);

  const actionDetails =
    params.action === 'INCREASE'
      ? `INCREASE cutover by ${params.increaseBy ?? 0} for ${params.partyName} (new total ${params.amount})`
      : `${params.action} opening balance for ${params.partyName}`;

  await createAuditEntry(client, {
    entityType: entityType as 'CUSTOMER' | 'SUPPLIER',
    entityId: params.partyId,
    entityNumber: params.invoiceNumber,
    action: storedAction,
    actionDetails,
    userId: params.userId,
    userName: params.userName ?? undefined,
    userRole: params.userRole ?? undefined,
    category: 'FINANCIAL',
    severity: 'INFO',
    tags: [tag, 'OPENING_BALANCE', ...(params.action === 'INCREASE' ? ['CUTOVER_INCREASE'] : [])],
    notes: params.reason.trim(),
    referenceNumber: params.invoiceNumber,
    oldValues:
      params.previousAmount != null
        ? { amount: params.previousAmount, invoiceId: params.invoiceId }
        : undefined,
    newValues: {
      amount: params.amount,
      invoiceId: params.invoiceId,
      invoiceNumber: params.invoiceNumber,
      ...(params.increaseBy != null ? { increaseBy: params.increaseBy } : {}),
      ...(params.action === 'INCREASE' ? { auditKind: 'INCREASE' } : {}),
    },
  });
}
