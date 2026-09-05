import { type ReactNode } from 'react';
import {
  useAdaptiveLayoutOptional,
  useAdaptiveWorkspaceOptional,
} from './AdaptiveAppShell';
import { AdaptiveActionBar } from './AdaptiveActionBar';
import { AdaptiveMoreMenu } from './AdaptiveMoreMenu';
import {
  resolveFloorplanFromWorkspace,
  type AdaptivePageDensity,
} from '../../lib/adaptiveFloorplan';

type AdaptivePageProps = {
  title?: ReactNode;
  /** Short supporting line — hidden when disclosure is essentials unless forceDescription. */
  description?: ReactNode;
  forceDescription?: boolean;
  /** Optional back control rendered above the title (e.g. ReportBackLink). */
  backLink?: ReactNode;
  /** Primary CTAs (always visible). */
  primaryActions?: ReactNode;
  /** Secondary / advanced actions — collapsed behind More on essentials/balanced. */
  secondaryActions?: ReactNode;
  /** Optional toolbar (search, filters). */
  toolbar?: ReactNode;
  /**
   * Force toolbar beside the title (same header row from `md` up).
   * Below md: title stacks above a full-width toolbar (no left dead column).
   * Default: auto — inline when there is a title and no page-level primary/secondary actions.
   */
  toolbarInline?: boolean;
  children: ReactNode;
  /** Sticky/inline footer actions. */
  footer?: ReactNode;
  footerPrimaryFab?: ReactNode;
  className?: string;
  /** Tests / nested density override. */
  densityOverride?: AdaptivePageDensity;
  /**
   * When true, omit the title/description block (embedded workbench tabs already name the surface).
   * Actions + toolbar still render.
   */
  hideTitle?: boolean;
};

/**
 * ERP page floorplan: title, progressive actions, toolbar slot, body, action bar.
 * Presentation only — commands stay in the parent (same APIs on every device).
 *
 * toolbarInline: title beside toolbar from `md` up; below that title stacks ABOVE
 * a full-width toolbar (no left dead column / cramped right cluster).
 */
export function AdaptivePage({
  title,
  description,
  forceDescription = false,
  backLink,
  primaryActions,
  secondaryActions,
  toolbar,
  toolbarInline,
  children,
  footer,
  footerPrimaryFab,
  className = '',
  densityOverride,
  hideTitle = false,
}: AdaptivePageProps) {
  const layout = useAdaptiveLayoutOptional();
  const workspace = useAdaptiveWorkspaceOptional();
  const floorplan = resolveFloorplanFromWorkspace(workspace, layout?.tier ?? 'desktop');
  const density = densityOverride ?? floorplan.pageDensity;
  const disclosure = floorplan.progressiveDisclosure;

  const showDescription =
    !hideTitle &&
    Boolean(description) &&
    (forceDescription || (disclosure !== 'essentials' && density !== 'dense'));

  const showTitleBlock = !hideTitle && Boolean(title || backLink || showDescription);

  const collapseSecondary =
    Boolean(secondaryActions) &&
    (disclosure === 'essentials' || disclosure === 'balanced');

  const hasPageActions = Boolean(primaryActions || secondaryActions);

  /** Title | toolbar on one row when no separate page CTAs (Products / catalog pattern). */
  const inlineToolbar =
    Boolean(toolbar) &&
    (toolbarInline === true ||
      (toolbarInline !== false && showTitleBlock && !hasPageActions));

  const pad =
    density === 'dense'
      ? 'space-y-2.5'
      : density === 'compact'
        ? 'space-y-3'
        : 'space-y-6';

  const titleSize =
    density === 'dense'
      ? 'text-lg font-semibold tracking-tight text-stone-900'
      : density === 'compact'
        ? 'text-xl font-semibold tracking-tight text-stone-900'
        : 'text-2xl font-semibold tracking-tight text-stone-900';

  const showHeader =
    showTitleBlock || hasPageActions || inlineToolbar;

  return (
    <div
      className={`${pad} ${className}`.trim()}
      data-adaptive-page="true"
      data-page-density={density}
      data-page-disclosure={disclosure}
      data-page-hide-title={hideTitle ? 'true' : undefined}
      data-page-toolbar-inline={inlineToolbar ? 'true' : undefined}
      data-workspace={workspace?.id}
    >
      {showHeader ? (
        <header
          className={
            inlineToolbar
              ? 'flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center md:gap-3'
              : density !== 'dense'
                ? 'flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3'
                : 'flex flex-col gap-2'
          }
          data-adaptive-page-header="true"
        >
          {showTitleBlock ? (
            <div
              className={
                inlineToolbar
                  ? 'min-w-0 w-full shrink-0 space-y-0.5 md:w-auto'
                  : 'min-w-0 flex-1 space-y-1'
              }
            >
              {backLink ? <div data-adaptive-page-back="true">{backLink}</div> : null}
              {title != null && title !== false ? <h1 className={titleSize}>{title}</h1> : null}
              {showDescription ? (
                <div
                  className={
                    density === 'comfortable'
                      ? 'text-sm text-stone-600'
                      : 'text-xs text-stone-500 leading-snug max-w-xs'
                  }
                  data-adaptive-page-description="true"
                >
                  {description}
                </div>
              ) : null}
            </div>
          ) : null}

          {inlineToolbar ? (
            <div
              className="min-w-0 w-full md:flex-1 md:basis-[12rem]"
              data-adaptive-page-toolbar="true"
              data-toolbar-inline="true"
            >
              {toolbar}
            </div>
          ) : null}

          {!inlineToolbar && hasPageActions ? (
            <div
              className="flex w-full flex-row flex-wrap items-center gap-2 sm:w-auto sm:justify-end shrink-0"
              data-adaptive-page-actions="true"
            >
              {primaryActions}
              {collapseSecondary ? (
                <AdaptiveMoreMenu>{secondaryActions}</AdaptiveMoreMenu>
              ) : (
                <div
                  className="flex flex-row flex-wrap items-center gap-2"
                  data-adaptive-page-secondary="true"
                >
                  {secondaryActions}
                </div>
              )}
            </div>
          ) : null}
        </header>
      ) : null}

      {toolbar && !inlineToolbar ? (
        <div data-adaptive-page-toolbar="true">{toolbar}</div>
      ) : null}

      <div data-adaptive-page-body="true">{children}</div>

      {footer ? (
        <AdaptiveActionBar primaryFab={footerPrimaryFab}>{footer}</AdaptiveActionBar>
      ) : null}
    </div>
  );
}
