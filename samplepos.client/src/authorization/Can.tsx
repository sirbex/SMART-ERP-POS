import type { ReactNode } from 'react';
import { useHasAnyPermission, useHasPermission } from './useAuthorization';

interface CanProps {
  permission?: string;
  anyOf?: string[];
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Declarative permission gate — use instead of inline user.role checks.
 */
export function Can({ permission, anyOf, fallback = null, children }: CanProps) {
  const single = useHasPermission(permission ?? '');
  const any = useHasAnyPermission(anyOf ?? []);

  const allowed = permission ? single : anyOf && anyOf.length > 0 ? any : true;

  if (!allowed) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
