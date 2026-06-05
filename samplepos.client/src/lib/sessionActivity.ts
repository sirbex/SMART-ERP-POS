/**
 * Shared session activity signals for keepalive + idle timeout.
 * Updated by useIdleTimeout (user input) and TransactionGuardProvider (open forms).
 */

let lastActivityAt = Date.now();
let transactionGuardDepth = 0;

export function touchSessionActivity(): void {
  lastActivityAt = Date.now();
}

export function getLastActivityAt(): number {
  return lastActivityAt;
}

export function setTransactionGuardDepth(depth: number): void {
  transactionGuardDepth = depth;
}

export function isTransactionGuardActive(): boolean {
  return transactionGuardDepth > 0;
}

/** User is actively working or has a transactional panel open (PO create, etc.). */
export function shouldKeepSessionAlive(maxIdleMs: number): boolean {
  if (transactionGuardDepth > 0) return true;
  return Date.now() - lastActivityAt < maxIdleMs;
}
