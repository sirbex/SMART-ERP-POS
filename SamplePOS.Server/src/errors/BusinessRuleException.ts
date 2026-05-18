/**
 * BusinessRuleException — the single base class for all domain rule violations.
 *
 * Returns HTTP 422 Unprocessable Entity (not a server error).
 *
 * Subclasses:
 *   PostingGovernanceError  — GOV_RULE_* accounting governance rules
 *   BusinessRuleViolation   — BR-INV-*, BR-SAL-* inventory/sales business rules
 *
 * Does NOT extend AppError to avoid circular imports (accountingCore chain).
 *
 * ARCHITECTURE:
 * - HTTP 422 = the server understood the request but refuses it due to a rule
 * - HTTP 500 = the server failed unexpectedly
 * - This distinction lets the UI tell users "you broke a rule" vs "server crashed"
 */
export class BusinessRuleException extends Error {
  /** HTTP status returned by the global error handler */
  readonly statusCode = 422 as const;

  /** Mark as operational so the error handler does not treat it as unexpected */
  readonly isOperational = true as const;

  constructor(
    message: string,
    /** Machine-readable code, e.g. 'GOV_RULE_A_NORMAL_BALANCE' */
    public readonly error_code: string,
    /** Structured context for the frontend (always includes `reason`) */
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'BusinessRuleException';
    // Ensure instanceof checks work correctly with TypeScript subclasses
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
