/**
 * Workspace hook — resolves Adaptive Workspace profile from capabilities + route.
 */

import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useDeviceCapabilities } from './useDeviceCapabilities';
import {
  resolveWorkspace,
  type WorkspaceProfile,
} from '../lib/workspaces';
import type { DeviceCapabilities } from '../lib/deviceCapabilities';

export type UseWorkspaceOptions = {
  /** Override pathname (tests / nested shells). Default: react-router location. */
  pathname?: string;
  /** Inject capabilities (tests). Default: useDeviceCapabilities(). */
  capabilities?: DeviceCapabilities;
};

/**
 * Resolve the active workspace profile.
 * Must run under Router when pathname is not injected.
 */
export function useWorkspace(options?: UseWorkspaceOptions): WorkspaceProfile {
  const location = useLocation();
  const liveCaps = useDeviceCapabilities();
  const capabilities = options?.capabilities ?? liveCaps;
  const pathname = options?.pathname ?? location.pathname;

  return useMemo(
    () => resolveWorkspace({ capabilities, pathname }),
    [capabilities, pathname],
  );
}

/**
 * Pure-friendly helper for callers that already hold capabilities + path
 * (avoids double capability subscription in the shell).
 */
export function workspaceFrom(
  capabilities: DeviceCapabilities,
  pathname: string,
): WorkspaceProfile {
  return resolveWorkspace({ capabilities, pathname });
}
