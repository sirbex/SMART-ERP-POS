import type { ReactNode } from 'react';
import { useMultistoreEnabled } from '../../hooks/useMultistore';

interface MultistoreGateProps {
  children: ReactNode;
}

/**
 * Renders children only when multistore is enabled for the tenant.
 * Returns null while loading or when disabled — prevents blank store headers/columns leaking.
 */
export function MultistoreGate({ children }: MultistoreGateProps) {
  const { isMultistoreEnabled, isLoading } = useMultistoreEnabled();

  if (isLoading || !isMultistoreEnabled) {
    return null;
  }

  return <>{children}</>;
}
