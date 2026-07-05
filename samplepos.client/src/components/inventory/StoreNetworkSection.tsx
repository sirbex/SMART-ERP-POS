import type { ReactNode } from 'react';
import { StoreNetworkLayout } from './StoreNetworkLayout';

/**
 * Wraps store-network operational pages (transfers, counts, approvals).
 * Requires multi-store mode — StoreNetworkLayout shows guidance when disabled.
 */
export function StoreNetworkSection({ children }: { children: ReactNode }) {
  return <StoreNetworkLayout>{children}</StoreNetworkLayout>;
}
