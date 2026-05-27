import type { PoolClient } from 'pg';
import { createAuditEntry } from '../modules/audit/auditRepository.js';

export type OpeningBalanceParty = 'customer' | 'supplier';

export type OpeningBalanceAuditAction = 'IMPORT' | 'UPDATE' | 'CANCEL';

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
    reason: string;
    userId: string;
    userName?: string | null;
    userRole?: string | null;
  },
): Promise<void> {
  const tag = params.party === 'customer' ? 'OPENING_BALANCE_CUSTOMER' : 'OPENING_BALANCE_SUPPLIER';
  const entityType = params.party === 'customer' ? 'CUSTOMER' : 'SUPPLIER';

  await createAuditEntry(client, {
    entityType: entityType as 'CUSTOMER' | 'SUPPLIER',
    entityId: params.partyId,
    entityNumber: params.invoiceNumber,
    action: params.action,
    actionDetails: `${params.action} opening balance for ${params.partyName}`,
    userId: params.userId,
    userName: params.userName ?? undefined,
    userRole: params.userRole ?? undefined,
    category: 'FINANCIAL',
    severity: 'INFO',
    tags: [tag, 'OPENING_BALANCE'],
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
    },
  });
}
