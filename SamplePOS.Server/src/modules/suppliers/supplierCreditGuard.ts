import type { PoolClient } from 'pg';
import Decimal from 'decimal.js';
import { BusinessRuleViolation } from '../../middleware/businessRules.js';
import { computeSupplierOpenItemBalance } from '../supplier-payments/apReconciliationEngine.js';
import { Money } from '../../utils/money.js';

/**
 * BR-SUP-002: Enforce supplier CreditLimit against open-item AP balance + new exposure.
 * CreditLimit <= 0 means unlimited (no enforcement).
 */
export async function assertSupplierCreditHeadroom(
  client: PoolClient,
  supplierId: string,
  additionalExposure: number,
  contextLabel: string,
): Promise<void> {
  if (additionalExposure <= 0) {
    return;
  }

  const supplierRes = await client.query<{
    CompanyName: string;
    CreditLimit: string | number | null;
  }>(
    `SELECT "CompanyName", "CreditLimit" FROM suppliers WHERE "Id" = $1`,
    [supplierId],
  );

  if (supplierRes.rows.length === 0) {
    throw new BusinessRuleViolation(
      'BR-SUP-001',
      `Supplier ${supplierId} not found`,
      'SUPPLIER_NOT_FOUND',
    );
  }

  const { CompanyName, CreditLimit } = supplierRes.rows[0];
  const creditLimit = Money.parseDb(CreditLimit ?? 0).toNumber();
  if (creditLimit <= 0) {
    return;
  }

  const open = await computeSupplierOpenItemBalance(client, supplierId);
  const projected = new Decimal(open.openItemBalance).plus(additionalExposure);

  if (projected.greaterThan(creditLimit + 0.01)) {
    throw new BusinessRuleViolation(
      'BR-SUP-002',
      `Supplier credit limit exceeded for ${contextLabel}. ` +
        `Limit: ${creditLimit.toFixed(2)}, open AP: ${open.openItemBalance.toFixed(2)}, ` +
        `additional: ${additionalExposure.toFixed(2)}, projected: ${projected.toFixed(2)}`,
      'SUPPLIER_CREDIT_LIMIT_EXCEEDED',
    );
  }
}
