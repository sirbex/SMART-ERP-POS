import { WorkflowHelpTrigger } from './WorkflowHelpTrigger';

interface BusinessRule {
  code: string;
  description: string;
}

interface BusinessRulesInfoProps {
  rules: BusinessRule[];
  title?: string;
  className?: string;
}

/**
 * Business rules reference — icon popover (same UX as page workflow help).
 */
export function BusinessRulesInfo({
  rules,
  title = 'Business Rules Applied',
  className = '',
}: BusinessRulesInfoProps) {
  return (
    <WorkflowHelpTrigger title={title} className={className}>
      <ul className="space-y-1">
        {rules.map((rule, index) => (
          <li key={index}>
            • <strong>{rule.code}:</strong> {rule.description}
          </li>
        ))}
      </ul>
    </WorkflowHelpTrigger>
  );
}

/**
 * Pre-configured Business Rules for common scenarios
 */
export const PURCHASE_ORDER_RULES: BusinessRule[] = [
  { code: 'BR-PO-001', description: 'Supplier must be active and validated' },
  { code: 'BR-PO-002', description: 'Minimum 1 line item required' },
  { code: 'BR-PO-003', description: 'Unit costs must be non-negative' },
  { code: 'BR-PO-005', description: 'Expected delivery must be future date (if specified)' },
  { code: 'BR-PO-009', description: 'Duplicate PO detection (24-hour window, ±5% tolerance)' },
  { code: 'BR-PO-011', description: 'Delivery date validated against supplier lead time' },
  { code: 'BR-PO-012', description: 'Total must meet supplier minimum order value' },
  { code: 'BR-INV-002', description: 'All quantities must be positive' },
  { code: 'Precision', description: 'Decimal.js used for all calculations (20 decimal places)' },
];

export const GOODS_RECEIPT_RULES: BusinessRule[] = [
  { code: 'BR-INV-002', description: 'All quantities must be positive' },
  { code: 'BR-INV-003', description: 'Expiry dates cannot be in the past' },
  { code: 'BR-INV-007', description: 'Items expiring within 30 days trigger warning' },
  { code: 'BR-INV-008', description: 'Items expiring within 7 days are REJECTED' },
  { code: 'BR-INV-009', description: 'Maximum stock level check (prevents overstocking)' },
  { code: 'BR-INV-010', description: 'Batch expiry sequence validation' },
  { code: 'BR-INV-011', description: 'All required item fields must be complete' },
  { code: 'BR-PO-003', description: 'Unit costs must be non-negative' },
  { code: 'BR-PO-006', description: 'Received qty cannot exceed ordered qty (unless allowed)' },
  { code: 'BR-PO-007', description: 'Cost variance >10% triggers warning' },
  { code: 'BR-PO-008', description: 'Quantity variance >5% triggers warning' },
  { code: 'BR-PO-010', description: 'Batch number uniqueness checked per product' },
];
