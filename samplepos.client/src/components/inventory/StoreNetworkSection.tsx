import type { ReactNode } from 'react';
import { useMultistoreEnabled } from '../../hooks/useMultistore';
import { StoreNetworkLayout } from './StoreNetworkLayout';

/**
 * Wraps store-network operational pages (transfers, counts, approvals).
 * Shows Store Network sub-nav when multistore is ON; plain content when OFF (single-store counts).
 */
export function StoreNetworkSection({ children }: { children: ReactNode }) {
  const { isMultistoreEnabled } = useMultistoreEnabled();
  if (isMultistoreEnabled) {
    return <StoreNetworkLayout>{children}</StoreNetworkLayout>;
  }
  return <>{children}</>;
}
