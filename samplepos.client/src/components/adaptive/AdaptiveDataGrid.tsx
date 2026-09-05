import { Fragment, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useAdaptiveLayout } from './AdaptiveAppShell';
import { MobileListCard } from '../ui/ResponsiveActionBar';
import { ResponsiveTableWrapper } from '../ui/ResponsiveTableWrapper';
import {
  resolveCardColumnCount,
  resolveGridPresentation,
  selectCardColumns,
  selectDetailColumns,
  selectTableColumns,
  type AdaptiveCardRole,
  type AdaptiveColumnPriority,
  type AdaptiveGridPresentation,
} from '../../lib/adaptiveDataGrid';

export type AdaptiveDataColumn<T> = {
  id: string;
  header: string;
  priority?: AdaptiveColumnPriority;
  cardRole?: AdaptiveCardRole;
  align?: 'left' | 'right' | 'center';
  className?: string;
  headerClassName?: string;
  cell: (row: T) => ReactNode;
};

type AdaptiveDataGridProps<T> = {
  rows: T[];
  columns: AdaptiveDataColumn<T>[];
  getRowId: (row: T) => string;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  /** Leading control (checkbox) — same on cards and table. */
  renderLeading?: (row: T) => ReactNode;
  renderRowActions?: (row: T) => ReactNode;
  /** Expandable body (desktop/compact rows; also under mobile cards). */
  renderExpanded?: (row: T) => ReactNode;
  expandedRowId?: string | null;
  className?: string;
  /** Force a presentation (tests / storybook). Default: content pane + layout tier. */
  presentationOverride?: AdaptiveGridPresentation;
  /** Extra class for a row (selection highlight, etc.). */
  rowClassName?: (row: T) => string | undefined;
};

function alignClass(align?: 'left' | 'right' | 'center'): string {
  if (align === 'right') return 'text-right';
  if (align === 'center') return 'text-center';
  return 'text-left';
}

function pickCardField<T>(
  columns: AdaptiveDataColumn<T>[],
  role: AdaptiveCardRole,
  row: T,
): ReactNode {
  const col = columns.find((c) => c.cardRole === role);
  return col ? col.cell(row) : null;
}

/** Measure the grid's content pane so presentation tracks available width. */
function useContentPaneWidth(): {
  ref: RefObject<HTMLDivElement | null>;
  widthPx: number | null;
} {
  const ref = useRef<HTMLDivElement | null>(null);
  const [widthPx, setWidthPx] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const publish = (w: number) => {
      setWidthPx((prev) => {
        if (prev != null && Math.abs(prev - w) < 6) return prev;
        return w;
      });
    };

    publish(el.getBoundingClientRect().width);

    if (typeof ResizeObserver === 'undefined') return;

    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (typeof w === 'number' && Number.isFinite(w)) publish(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, widthPx };
}

/**
 * One dataset → cards (narrow) / reduced table (compact) / full table (desktop+).
 * Presentation follows the **content pane width** (ResizeObserver) so widening
 * the window or leaving a nested shell fills spare horizontal space instead of
 * leaving a phone-column with empty gutters.
 */
export function AdaptiveDataGrid<T>({
  rows,
  columns,
  getRowId,
  emptyMessage = 'No rows to display.',
  onRowClick,
  renderLeading,
  renderRowActions,
  renderExpanded,
  expandedRowId,
  className = '',
  presentationOverride,
  rowClassName,
}: AdaptiveDataGridProps<T>) {
  const { tier } = useAdaptiveLayout();
  const { ref: paneRef, widthPx } = useContentPaneWidth();
  const presentation =
    presentationOverride ??
    resolveGridPresentation(tier, { contentWidthPx: widthPx });
  const cardColumnCount = resolveCardColumnCount(widthPx);
  const [localExpanded, setLocalExpanded] = useState<string | null>(null);
  const activeExpanded = expandedRowId !== undefined ? expandedRowId : localExpanded;

  const tableColumns = selectTableColumns(columns, presentation);
  const cardColumns = selectCardColumns(columns);
  const detailColumns = selectDetailColumns(columns);
  const canExpand =
    renderExpanded != null ||
    (presentation === 'reduced' && detailColumns.length > 0);

  const paneAttrs = {
    ref: paneRef,
    className: `w-full min-w-0 ${className}`.trim(),
    'data-adaptive-data-grid': 'true',
    'data-grid-presentation': presentation,
    'data-grid-content-width': widthPx != null ? String(Math.round(widthPx)) : undefined,
    'data-grid-card-cols': presentation === 'cards' ? String(cardColumnCount) : undefined,
  } as const;

  if (rows.length === 0) {
    return (
      <div
        {...paneAttrs}
        className={`rounded-lg border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-500 ${className}`}
      >
        {emptyMessage}
      </div>
    );
  }

  const toggleLocalExpand = (id: string, isExpanded: boolean) => {
    if (expandedRowId !== undefined) return;
    setLocalExpanded(isExpanded ? null : id);
  };

  if (presentation === 'cards') {
    return (
      <div {...paneAttrs}>
        <div
          className={
            cardColumnCount === 2
              ? 'grid grid-cols-2 gap-3'
              : 'grid grid-cols-1 gap-3'
          }
          data-grid-cards="true"
        >
          {rows.map((row) => {
            const id = getRowId(row);
            const isExpanded = activeExpanded === id;
            const title = pickCardField(cardColumns, 'title', row);
            const subtitle = pickCardField(cardColumns, 'subtitle', row);
            const status = pickCardField(cardColumns, 'status', row);
            const amount = pickCardField(cardColumns, 'amount', row);
            const metaCols = cardColumns.filter((c) => c.cardRole === 'meta');
            const leading = renderLeading?.(row);

            return (
              <div
                key={id}
                className={`border rounded-lg bg-white overflow-hidden min-w-0 ${
                  rowClassName?.(row) ?? 'border-gray-200'
                }`}
                data-expanded={isExpanded ? 'true' : 'false'}
              >
                <MobileListCard>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2 min-w-0">
                      {leading}
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-900 truncate">{title}</div>
                        {subtitle != null && (
                          <div className="text-xs text-gray-500 mt-0.5">{subtitle}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {status}
                      {amount != null && (
                        <div className="text-sm font-bold text-gray-900 tabular-nums">
                          {amount}
                        </div>
                      )}
                    </div>
                  </div>

                  {metaCols.length > 0 && (
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      {metaCols.map((col) => (
                        <Fragment key={col.id}>
                          <span className="text-gray-500">{col.header}</span>
                          <span className="text-right text-gray-800">{col.cell(row)}</span>
                        </Fragment>
                      ))}
                    </div>
                  )}

                  {renderRowActions && (
                    <div className="pt-2 border-t border-gray-100">
                      {renderRowActions(row)}
                    </div>
                  )}
                </MobileListCard>

                {isExpanded && canExpand && (
                  <div className="border-t border-gray-100 bg-slate-50/80 px-3 py-3">
                    {renderExpanded ? (
                      renderExpanded(row)
                    ) : (
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                        {detailColumns.map((col) => (
                          <div key={col.id}>
                            <div className="text-gray-500 font-medium">{col.header}</div>
                            <div className="text-gray-900 mt-0.5">{col.cell(row)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div {...paneAttrs}>
      <ResponsiveTableWrapper>
        <table className="w-full min-w-0 divide-y divide-gray-200" data-inventory-worklist-table="true">
          <thead className="bg-gray-50">
            <tr>
              {renderLeading && (
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase w-10">
                  <span className="sr-only">Select</span>
                </th>
              )}
              {tableColumns.map((col) => (
                <th
                  key={col.id}
                  className={`px-4 py-3 text-xs font-medium text-gray-500 uppercase whitespace-nowrap ${alignClass(col.align)} ${col.headerClassName ?? ''}`}
                >
                  {col.header}
                </th>
              ))}
              {renderRowActions && (
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {rows.map((row) => {
              const id = getRowId(row);
              const isExpanded = activeExpanded === id;
              const extraRowClass = rowClassName?.(row) ?? '';

              return (
                <Fragment key={id}>
                  <tr
                    className={`${onRowClick || canExpand ? 'cursor-pointer hover:bg-gray-50' : ''} ${isExpanded ? 'bg-blue-50/40' : ''} ${extraRowClass}`}
                    onClick={() => {
                      if (canExpand) toggleLocalExpand(id, isExpanded);
                      else onRowClick?.(row);
                    }}
                    data-expanded={isExpanded ? 'true' : 'false'}
                  >
                    {renderLeading && (
                      <td
                        className="px-3 py-3 text-center align-middle"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {renderLeading(row)}
                      </td>
                    )}
                    {tableColumns.map((col) => (
                      <td
                        key={col.id}
                        className={`px-4 py-3 text-sm text-gray-900 whitespace-nowrap ${alignClass(col.align)} ${col.className ?? ''}`}
                      >
                        {col.cell(row)}
                      </td>
                    ))}
                    {renderRowActions && (
                      <td
                        className="px-4 py-3 text-sm whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {renderRowActions(row)}
                      </td>
                    )}
                  </tr>
                  {isExpanded && canExpand && (
                    <tr className="bg-slate-50/80">
                      <td
                        colSpan={
                          tableColumns.length +
                          (renderLeading ? 1 : 0) +
                          (renderRowActions ? 1 : 0)
                        }
                        className="px-4 py-3"
                      >
                        {renderExpanded ? (
                          renderExpanded(row)
                        ) : (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-xs">
                            {detailColumns.map((col) => (
                              <div key={col.id}>
                                <div className="text-gray-500 font-medium">{col.header}</div>
                                <div className="text-gray-900 mt-0.5">{col.cell(row)}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </ResponsiveTableWrapper>
    </div>
  );
}
