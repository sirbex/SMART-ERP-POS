import type { CSSProperties, ReactNode } from 'react';
import { useAdaptiveLayoutOptional } from './AdaptiveAppShell';
import { resolveFieldColumnSpan } from '../../lib/adaptiveForms';

type AdaptiveFormLayoutProps = {
  children: ReactNode;
  className?: string;
  gapClassName?: string;
  /** Override column count (tests / nested density). Default: layout tier token. */
  columnsOverride?: 1 | 2 | 3 | 4;
};

/**
 * Tier-driven form grid: 1 → 2 → 3 → 4 columns.
 * Fields are never removed — only density changes.
 */
export function AdaptiveFormLayout({
  children,
  className = '',
  gapClassName = 'gap-4',
  columnsOverride,
}: AdaptiveFormLayoutProps) {
  const layout = useAdaptiveLayoutOptional();
  const columns = columnsOverride ?? layout?.tokens.formColumns ?? 2;

  const style = {
    '--adaptive-form-columns': String(columns),
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
  } as CSSProperties;

  return (
    <div
      className={`grid ${gapClassName} ${className}`.trim()}
      style={style}
      data-form-columns={columns}
      data-adaptive-form="true"
    >
      {children}
    </div>
  );
}

type AdaptiveFormFieldProps = {
  children: ReactNode;
  className?: string;
  /** Grid span; clamped to current form columns. Never hides the field. */
  span?: 1 | 2 | 3 | 4 | 'full';
  /**
   * Optional helper / format hint. Visibility follows global chrome.fieldHelpers SSOT
   * (hidden on mobile, compact/full on larger tiers) — modules must not hard-hide helpers.
   */
  helper?: ReactNode;
};

export function AdaptiveFormField({
  children,
  className = '',
  span = 1,
  helper,
}: AdaptiveFormFieldProps) {
  const layout = useAdaptiveLayoutOptional();
  const columns = layout?.tokens.formColumns ?? 2;
  const colSpan = resolveFieldColumnSpan(span, columns);
  const helpersMode = layout?.chrome.fieldHelpers ?? 'compact';
  const showHelper = Boolean(helper) && helpersMode !== 'hidden';

  return (
    <div
      className={`min-w-0 ${className}`.trim()}
      style={{ gridColumn: `span ${colSpan} / span ${colSpan}` }}
      data-form-span={span === 'full' ? 'full' : colSpan}
      data-field-helpers={helpersMode}
    >
      {children}
      {showHelper ? (
        <div
          className={
            helpersMode === 'full'
              ? 'mt-1 text-sm text-stone-500'
              : 'mt-1 text-xs text-stone-500'
          }
          data-adaptive-helper="true"
        >
          {helper}
        </div>
      ) : null}
    </div>
  );
}
