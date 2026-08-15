import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { useDeviceCapabilities } from '../../hooks/useDeviceCapabilities';
import type { DeviceCapabilities } from '../../lib/deviceCapabilities';
import type { LayoutCapabilities } from '../../lib/layoutTiers';
import {
  resolveWorkspace,
  workspaceDatasetValue,
  type WorkspaceProfile,
} from '../../lib/workspaces';

const LayoutCapabilitiesContext = createContext<LayoutCapabilities | null>(null);
const DeviceCapabilitiesContext = createContext<DeviceCapabilities | null>(null);
const WorkspaceContext = createContext<WorkspaceProfile | null>(null);

export function useAdaptiveLayout(): LayoutCapabilities {
  const ctx = useContext(LayoutCapabilitiesContext);
  if (!ctx) {
    throw new Error('useAdaptiveLayout must be used within AdaptiveAppShell');
  }
  return ctx;
}

/** Safe optional access when a module may render outside the shell (tests, portals). */
export function useAdaptiveLayoutOptional(): LayoutCapabilities | null {
  return useContext(LayoutCapabilitiesContext);
}

export function useAdaptiveDeviceCapabilities(): DeviceCapabilities {
  const ctx = useContext(DeviceCapabilitiesContext);
  if (!ctx) {
    throw new Error('useAdaptiveDeviceCapabilities must be used within AdaptiveAppShell');
  }
  return ctx;
}

export function useAdaptiveDeviceCapabilitiesOptional(): DeviceCapabilities | null {
  return useContext(DeviceCapabilitiesContext);
}

export function useAdaptiveWorkspace(): WorkspaceProfile {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error(
      'useAdaptiveWorkspace must be used within AdaptiveAppShell with a pathname',
    );
  }
  return ctx;
}

export function useAdaptiveWorkspaceOptional(): WorkspaceProfile | null {
  return useContext(WorkspaceContext);
}

type AdaptiveAppShellProps = {
  children: ReactNode;
  className?: string;
  /**
   * Current route pathname for workspace resolution.
   * Pass from a Router parent (Layout / POS). When omitted, workspace context is null
   * and layout/device capability contexts still work (backward compatible).
   */
  pathname?: string;
};

/**
 * Adaptive foundation: layout + device capabilities + optional workspace profile.
 * CSS custom properties remain the presentation SSOT for descendants.
 * Business logic is never resolved here.
 */
export function AdaptiveAppShell({ children, className, pathname }: AdaptiveAppShellProps) {
  const capabilities = useDeviceCapabilities();
  const layout: LayoutCapabilities = capabilities;

  const workspace = useMemo(() => {
    if (!pathname) return null;
    return resolveWorkspace({ capabilities, pathname });
  }, [capabilities, pathname]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.layoutTier = layout.tier;
    root.dataset.navMode = workspace?.navPattern ?? layout.tokens.navMode;
    root.dataset.touchFirst = layout.touchFirst ? 'true' : 'false';
    root.dataset.adaptiveCoach = layout.chrome.coach;
    root.dataset.adaptivePad = layout.chrome.numericPad;
    root.dataset.adaptiveSecondary = layout.chrome.secondaryActions;
    root.dataset.adaptiveLabels = layout.chrome.actionLabels;
    root.dataset.adaptiveListRow = layout.chrome.listRow;
    root.dataset.printerCapability = capabilities.printer;
    root.dataset.deviceOffline = capabilities.isOffline ? 'true' : 'false';
    if (workspace) {
      root.dataset.workspace = workspaceDatasetValue(workspace);
      root.dataset.workspaceNav = workspace.navPattern;
      root.dataset.workspaceList = workspace.listPresentation;
      if (workspace.posPanelMode) {
        root.dataset.posPanel = workspace.posPanelMode;
      } else {
        delete root.dataset.posPanel;
      }
    } else {
      delete root.dataset.workspace;
      delete root.dataset.workspaceNav;
      delete root.dataset.workspaceList;
      delete root.dataset.posPanel;
    }
    root.style.setProperty('--layout-touch-target', `${layout.tokens.touchTargetPx}px`);
    root.style.setProperty('--layout-sidebar-expanded', `${layout.tokens.sidebarExpandedPx}px`);
    root.style.setProperty('--layout-sidebar-rail', `${layout.tokens.sidebarRailPx}px`);
    root.style.setProperty('--layout-form-columns', String(layout.tokens.formColumns));
    root.style.setProperty('--layout-content-max', layout.tokens.contentMaxWidth);
    root.style.setProperty('--type-caption', `${layout.chrome.typeScale.captionPx}px`);
    root.style.setProperty('--type-body', `${layout.chrome.typeScale.bodyPx}px`);
    root.style.setProperty('--type-title', `${layout.chrome.typeScale.titlePx}px`);
    root.style.setProperty('--type-amount', `${layout.chrome.typeScale.amountPx}px`);
    root.style.setProperty('--type-cta', `${layout.chrome.typeScale.ctaPx}px`);
    root.dataset.adaptiveDensity = layout.chrome.density;
    return () => {
      delete root.dataset.layoutTier;
      delete root.dataset.navMode;
      delete root.dataset.touchFirst;
      delete root.dataset.adaptiveCoach;
      delete root.dataset.adaptivePad;
      delete root.dataset.adaptiveSecondary;
      delete root.dataset.adaptiveLabels;
      delete root.dataset.adaptiveListRow;
      delete root.dataset.printerCapability;
      delete root.dataset.deviceOffline;
      delete root.dataset.workspace;
      delete root.dataset.workspaceNav;
      delete root.dataset.workspaceList;
      delete root.dataset.posPanel;
      delete root.dataset.adaptiveDensity;
    };
  }, [layout, capabilities.printer, capabilities.isOffline, workspace]);

  const style = {
    '--layout-touch-target': `${layout.tokens.touchTargetPx}px`,
    '--layout-sidebar-expanded': `${layout.tokens.sidebarExpandedPx}px`,
    '--layout-sidebar-rail': `${layout.tokens.sidebarRailPx}px`,
    '--layout-form-columns': String(layout.tokens.formColumns),
    '--layout-content-max': layout.tokens.contentMaxWidth,
    '--type-caption': `${layout.chrome.typeScale.captionPx}px`,
    '--type-body': `${layout.chrome.typeScale.bodyPx}px`,
    '--type-title': `${layout.chrome.typeScale.titlePx}px`,
    '--type-amount': `${layout.chrome.typeScale.amountPx}px`,
    '--type-cta': `${layout.chrome.typeScale.ctaPx}px`,
  } as CSSProperties;

  return (
    <LayoutCapabilitiesContext.Provider value={layout}>
      <DeviceCapabilitiesContext.Provider value={capabilities}>
        <WorkspaceContext.Provider value={workspace}>
          <div
            className={['app-shell', 'adaptive-app-shell', className].filter(Boolean).join(' ')}
            data-layout-tier={layout.tier}
            data-nav-mode={workspace?.navPattern ?? layout.tokens.navMode}
            data-dialog-mode={layout.tokens.dialogMode}
            data-touch-first={layout.touchFirst ? 'true' : 'false'}
            data-adaptive-coach={layout.chrome.coach}
            data-adaptive-pad={layout.chrome.numericPad}
            data-adaptive-secondary={layout.chrome.secondaryActions}
            data-adaptive-labels={layout.chrome.actionLabels}
            data-adaptive-list-row={layout.chrome.listRow}
            data-adaptive-density={layout.chrome.density}
            data-adaptive-foh-ticket={layout.chrome.fohTicketPane}
            data-printer-capability={capabilities.printer}
            data-device-offline={capabilities.isOffline ? 'true' : 'false'}
            data-workspace={workspace ? workspaceDatasetValue(workspace) : undefined}
            data-workspace-nav={workspace?.navPattern}
            data-workspace-list={workspace?.listPresentation}
            data-pos-panel={workspace?.posPanelMode ?? undefined}
            style={style}
          >
            {children}
          </div>
        </WorkspaceContext.Provider>
      </DeviceCapabilitiesContext.Provider>
    </LayoutCapabilitiesContext.Provider>
  );
}
