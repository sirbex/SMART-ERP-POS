import { useEffect, useState } from 'react';
import Decimal from 'decimal.js';
import { api } from '../utils/api';
import { money2 } from '@shared/domain/invoiceDepositPayment';

export type DepositBalanceStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Fail-loud deposit balance for Receive Payment.
 * Never treats a fetch failure as zero available.
 */
export function useInvoiceDepositBalance(
  customerId: string | null | undefined,
  enabled: boolean,
) {
  const [available, setAvailable] = useState<Decimal>(() => new Decimal(0));
  const [status, setStatus] = useState<DepositBalanceStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const retry = () => setReloadToken((t) => t + 1);

  useEffect(() => {
    if (!enabled || !customerId) {
      setStatus('idle');
      setError(null);
      return;
    }
    let cancelled = false;
    setStatus('loading');
    setError(null);
    api.deposits
      .getCustomerBalance(customerId)
      .then((response) => {
        if (cancelled) return;
        if (!response.data?.success) {
          throw new Error(
            (response.data as { error?: string } | undefined)?.error ||
              'Deposit balance request failed',
          );
        }
        const raw = (response.data?.data as { availableBalance?: unknown } | undefined)
          ?.availableBalance;
        setAvailable(money2(raw ?? 0));
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load deposit balance');
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, customerId, reloadToken]);

  return {
    available,
    status,
    error,
    retry,
    hasDeposit: status === 'ready' && available.gt(0),
  };
}
