import type { ReactNode } from 'react';
import {
  WORKLIST_KPI_CARD_CLASS,
  WORKLIST_KPI_LABEL_CLASS,
  WORKLIST_KPI_SUB_CLASS,
  WORKLIST_KPI_VALUE_CLASS,
  worklistKpiGridClass,
} from '../../lib/adaptiveDashboard';

export type AdaptiveKpiItem = {
  id: string;
  label: ReactNode;
  value: ReactNode;
  /** Optional secondary line under the value (e.g. currency note). */
  sub?: ReactNode;
  /** Extra classes on the value (tone: text-yellow-600, etc.). */
  valueClassName?: string;
};

type AdaptiveKpiStripProps = {
  items: AdaptiveKpiItem[];
  className?: string;
  /** Tests / nested override of column count resolution. */
  columnsOverride?: number;
};

/**
 * Global worklist KPI strip — phone is always 2-up (never full-width towers).
 * Import this instead of hand-rolling grid-cols-1 status cards per page.
 */
export function AdaptiveKpiStrip({
  items,
  className = '',
  columnsOverride,
}: AdaptiveKpiStripProps) {
  const count = columnsOverride ?? items.length;
  const grid = worklistKpiGridClass(count);

  return (
    <div
      className={[grid, className].filter(Boolean).join(' ')}
      data-adaptive-kpi-strip="true"
      data-kpi-ssot="adaptiveDashboard"
      data-kpi-count={String(items.length)}
    >
      {items.map((item) => (
        <div key={item.id} className={WORKLIST_KPI_CARD_CLASS} data-adaptive-kpi-card={item.id}>
          <div className={WORKLIST_KPI_LABEL_CLASS}>{item.label}</div>
          {item.sub ? <div className={WORKLIST_KPI_SUB_CLASS}>{item.sub}</div> : null}
          <div
            className={[
              WORKLIST_KPI_VALUE_CLASS,
              item.sub ? 'mt-0.5' : 'mt-1',
              item.valueClassName,
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}
