import { useState, type ReactNode } from 'react';
import {
  useAdaptiveLayoutOptional,
  useAdaptiveWorkspaceOptional,
} from './AdaptiveAppShell';
import {
  resolveFloorplanFromWorkspace,
  type AdaptiveToolbarMode,
} from '../../lib/adaptiveFloorplan';

type AdaptiveToolbarProps = {
  /** Leading slot — typically AdaptiveSearch. */
  leading?: ReactNode;
  /** Always-visible primary controls. */
  children?: ReactNode;
  /** Filters / bulk / advanced — collapsed on icon/compact modes. */
  secondary?: ReactNode;
  className?: string;
  modeOverride?: AdaptiveToolbarMode;
  secondaryLabel?: string;
};

/**
 * Tier/workspace-driven toolbar density.
 * Does not own search or filter logic — slots only.
 */
export function AdaptiveToolbar({
  leading,
  children,
  secondary,
  className = '',
  modeOverride,
  secondaryLabel = 'Filters',
}: AdaptiveToolbarProps) {
  const layout = useAdaptiveLayoutOptional();
  const workspace = useAdaptiveWorkspaceOptional();
  const floorplan = resolveFloorplanFromWorkspace(workspace, layout?.tier ?? 'desktop');
  const mode = modeOverride ?? floorplan.toolbarMode;
  const [secondaryOpen, setSecondaryOpen] = useState(false);

  const collapseSecondary = Boolean(secondary) && mode !== 'full';

  return (
    <div
      className={[
        'flex flex-wrap items-center gap-2',
        mode === 'icon' ? 'gap-1.5' : 'gap-2',
        className,
      ].join(' ')}
      data-adaptive-toolbar="true"
      data-toolbar-mode={mode}
    >
      {leading ? (
        <div className="min-w-0 flex-1" data-adaptive-toolbar-leading="true">
          {leading}
        </div>
      ) : null}

      <div
        className="flex flex-wrap items-center gap-2 shrink-0"
        data-adaptive-toolbar-primary="true"
      >
        {children}
      </div>

      {collapseSecondary ? (
        <div className="relative shrink-0">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md border border-stone-200 bg-white px-3 text-sm font-medium text-stone-700 min-h-[var(--layout-touch-target)] hover:bg-stone-50"
            aria-expanded={secondaryOpen}
            onClick={() => setSecondaryOpen((o) => !o)}
            data-adaptive-toolbar-secondary-trigger="true"
          >
            {mode === 'icon' ? '···' : secondaryLabel}
          </button>
          {secondaryOpen ? (
            <div
              role="menu"
              className="absolute right-0 z-20 mt-1 min-w-[14rem] rounded-md border border-stone-200 bg-white p-2"
              data-adaptive-toolbar-secondary-panel="true"
            >
              <div className="flex flex-col gap-2">{secondary}</div>
            </div>
          ) : null}
        </div>
      ) : secondary ? (
        <div
          className="flex flex-wrap items-center gap-2"
          data-adaptive-toolbar-secondary="true"
        >
          {secondary}
        </div>
      ) : null}
    </div>
  );
}
