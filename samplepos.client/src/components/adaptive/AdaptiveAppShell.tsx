import {
  createContext,
  useContext,
  useEffect,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { useLayoutTier } from '../../hooks/useLayoutTier';
import type { LayoutCapabilities } from '../../lib/layoutTiers';

const LayoutCapabilitiesContext = createContext<LayoutCapabilities | null>(null);

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

type AdaptiveAppShellProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Phase 0 foundation: layout capabilities + CSS custom properties.
 * Phase 1 chrome (AdaptiveNavigation / AdaptiveDataGrid) consumes this context.
 */
export function AdaptiveAppShell({ children, className }: AdaptiveAppShellProps) {
  const layout = useLayoutTier();

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.layoutTier = layout.tier;
    root.dataset.navMode = layout.tokens.navMode;
    root.dataset.touchFirst = layout.touchFirst ? 'true' : 'false';
    root.dataset.adaptiveCoach = layout.chrome.coach;
    root.dataset.adaptivePad = layout.chrome.numericPad;
    root.dataset.adaptiveSecondary = layout.chrome.secondaryActions;
    root.dataset.adaptiveLabels = layout.chrome.actionLabels;
    root.dataset.adaptiveListRow = layout.chrome.listRow;
    root.style.setProperty('--layout-touch-target', `${layout.tokens.touchTargetPx}px`);
    root.style.setProperty('--layout-sidebar-expanded', `${layout.tokens.sidebarExpandedPx}px`);
    root.style.setProperty('--layout-sidebar-rail', `${layout.tokens.sidebarRailPx}px`);
    root.style.setProperty('--layout-form-columns', String(layout.tokens.formColumns));
    root.style.setProperty('--layout-content-max', layout.tokens.contentMaxWidth);
    return () => {
      delete root.dataset.layoutTier;
      delete root.dataset.navMode;
      delete root.dataset.touchFirst;
      delete root.dataset.adaptiveCoach;
      delete root.dataset.adaptivePad;
      delete root.dataset.adaptiveSecondary;
      delete root.dataset.adaptiveLabels;
      delete root.dataset.adaptiveListRow;
    };
  }, [layout]);

  const style = {
    '--layout-touch-target': `${layout.tokens.touchTargetPx}px`,
    '--layout-sidebar-expanded': `${layout.tokens.sidebarExpandedPx}px`,
    '--layout-sidebar-rail': `${layout.tokens.sidebarRailPx}px`,
    '--layout-form-columns': String(layout.tokens.formColumns),
    '--layout-content-max': layout.tokens.contentMaxWidth,
  } as CSSProperties;

  return (
    <LayoutCapabilitiesContext.Provider value={layout}>
      <div
        className={['app-shell', 'adaptive-app-shell', className].filter(Boolean).join(' ')}
        data-layout-tier={layout.tier}
        data-nav-mode={layout.tokens.navMode}
        data-dialog-mode={layout.tokens.dialogMode}
        data-touch-first={layout.touchFirst ? 'true' : 'false'}
        data-adaptive-coach={layout.chrome.coach}
        data-adaptive-pad={layout.chrome.numericPad}
        data-adaptive-secondary={layout.chrome.secondaryActions}
        data-adaptive-labels={layout.chrome.actionLabels}
        data-adaptive-list-row={layout.chrome.listRow}
        style={style}
      >
        {children}
      </div>
    </LayoutCapabilitiesContext.Provider>
  );
}
