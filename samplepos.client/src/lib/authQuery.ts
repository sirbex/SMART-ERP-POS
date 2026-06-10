import { getAccessToken } from '../hooks/useTokenRefresh';

/** Gate React Query fetches until AuthContext finished boot and a token exists. */
export function isAuthQueryEnabled(isAuthenticated: boolean): boolean {
  return isAuthenticated && Boolean(getAccessToken());
}
