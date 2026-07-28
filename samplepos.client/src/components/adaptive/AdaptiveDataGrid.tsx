import { Fragment, useState, type ReactNode } from 'react';
import { useAdaptiveLayout } from './AdaptiveAppShell';
import { MobileListCard } from '../ui/ResponsiveActionBar';
import { ResponsiveTableWrapper } from '../ui/ResponsiveTableWrapper';
import {
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
  /** Force a presentation (tests / storybook). Default: from layout tier. */
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

/**
 * One dataset → cards (mobile) / reduced table (compact) / full table (desktop+wide).
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
  const presentation = presentationOverride ?? resolveGridPresentation(tier);
  const [localExpanded, setLocalExpanded] = useState<string | null>(null);
  const activeExpanded = expandedRowId !== undefined ? expandedRowId : localExpanded;

  const tableColumns = selectTableColumns(columns, presentation);
  const cardColumns = selectCardColumns(columns);
  const detailColumns = selectDetailColumns(columns);
  const canExpand = renderExpanded != null
    || (presentation === 'reduced' && detailColumns.length > 0);

  if (rows.length === 0) {
    return (
      <div className={`rounded-lg border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-500 ${className}`}>
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
      <div className={`space-y-3 ${className}`} data-grid-presentation="cards">
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
              className={`border rounded-lg bg-white overflow-hidden ${
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
                      <div className="text-sm font-bold text-gray-900">{amount}</div>
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
    );
  }

  return (
    <div className={className} data-grid-presentation={presentation}>
      <ResponsiveTableWrapper>
        <table className="min-w-full divide-y divide-gray-200">
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
                  className={`px-4 py-3 text-xs font-medium text-gray-500 uppercase ${alignClass(col.align)} ${col.headerClassName ?? ''}`}
                >
                  {col.header}
                </th>
              ))}
              {renderRowActions && (
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
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
                      onRowClick?.(row);
                    }}
                    data-expanded={isExpanded ? 'true' : 'false'}
                  >
                    {renderLeading && (
                      <td
                        className="px-3 py-3 text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {renderLeading(row)}
                      </td>
                    )}
                    {tableColumns.map((col) => (
                      <td
                        key={col.id}
                        className={`px-4 py-3 text-sm text-gray-900 ${alignClass(col.align)} ${col.className ?? ''}`}
                      >
                        {col.cell(row)}
                      </td>
                    ))}
                    {renderRowActions && (
                      <td
                        className="px-4 py-3 text-center"
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
                          tableColumns.length
                          + (renderLeading ? 1 : 0)
                          + (renderRowActions ? 1 : 0)
                        }
                        className="px-4 py-3"
                      >
                        {renderExpanded ? (
                          renderExpanded(row)
                        ) : (
                          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
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
