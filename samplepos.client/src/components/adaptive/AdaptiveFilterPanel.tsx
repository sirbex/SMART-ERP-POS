import type { ButtonHTMLAttributes, ReactNode } from 'react';
import {
  ADAPTIVE_FILTER_CONTROL_CLASS,
  ADAPTIVE_FILTER_DONE_CLASS,
  ADAPTIVE_FILTER_FIELD_CLASS,
  ADAPTIVE_FILTER_GRID_CLASS,
  ADAPTIVE_FILTER_LABEL_CLASS,
  ADAPTIVE_FILTER_PANEL_CLASS,
} from '../../lib/adaptiveDashboard';

type AdaptiveFilterPanelProps = {
  children: ReactNode;
  /** Done / Clear row under the field grid. */
  footer?: ReactNode;
  className?: string;
  /**
   * Page evidence key — sets `data-filter-panel` and known `data-*-filter-panel` hooks.
   */
  panelKey?: 'gr' | 'po' | 'products' | 'movements' | 'stock' | 'batch' | string;
  'data-gr-filter-panel'?: string;
  'data-po-filter-panel'?: string;
};

type AdaptiveFilterFieldProps = {
  label: string;
  htmlFor?: string;
  /** Span both columns (full-width control). Default 1. */
  span?: 1 | 2;
  children: ReactNode;
  className?: string;
};

/**
 * Worklist Filters body — GLOBAL SSOT (phone-first dense sheet).
 * Always 2-up on small screens; pair short fields; span=2 for long selects.
 * Use inside AdaptiveToolbar `secondary` only.
 */
export function AdaptiveFilterPanel({
  children,
  footer,
  className = '',
  panelKey,
  'data-gr-filter-panel': dataGrFilterPanel,
  'data-po-filter-panel': dataPoFilterPanel,
}: AdaptiveFilterPanelProps) {
  return (
    <div
      className={`${ADAPTIVE_FILTER_PANEL_CLASS} ${className}`.trim()}
      data-adaptive-filter-panel="true"
      data-filter-panel={panelKey ?? 'true'}
      data-gr-filter-panel={
        dataGrFilterPanel ?? (panelKey === 'gr' ? 'true' : undefined)
      }
      data-po-filter-panel={
        dataPoFilterPanel ?? (panelKey === 'po' ? 'true' : undefined)
      }
    >
      <div className={ADAPTIVE_FILTER_GRID_CLASS} data-adaptive-filter-grid="true">
        {children}
      </div>
      {footer ? (
        <div className="pt-0.5" data-adaptive-filter-footer="true">
          {footer}
        </div>
      ) : null}
    </div>
  );
}

export function AdaptiveFilterField({
  label,
  htmlFor,
  span = 1,
  children,
  className = '',
}: AdaptiveFilterFieldProps) {
  return (
    <div
      className={[
        ADAPTIVE_FILTER_FIELD_CLASS,
        span === 2 ? 'col-span-2' : 'col-span-1',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      data-adaptive-filter-field="true"
      data-filter-span={String(span)}
    >
      <label htmlFor={htmlFor} className={ADAPTIVE_FILTER_LABEL_CLASS}>
        {label}
      </label>
      {children}
    </div>
  );
}

export function AdaptiveFilterDoneButton({
  onClick,
  children = 'Done',
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${ADAPTIVE_FILTER_DONE_CLASS} ${className}`.trim()}
      data-adaptive-filter-done="true"
      {...rest}
    >
      {children}
    </button>
  );
}

/** Shared control class for selects inside AdaptiveFilterField. */
export const adaptiveFilterControlClass = ADAPTIVE_FILTER_CONTROL_CLASS;
