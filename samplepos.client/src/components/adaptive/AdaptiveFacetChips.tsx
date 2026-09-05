import type { ReactNode } from 'react';

export type AdaptiveFacetChip = {
  id: string;
  label: ReactNode;
  active?: boolean;
  onSelect: () => void;
  tone?: 'neutral' | 'amber' | 'emerald' | 'slate';
};

type AdaptiveFacetChipsProps = {
  items: AdaptiveFacetChip[];
  className?: string;
  /** Accessible name for the chip group. */
  'aria-label'?: string;
};

const TONE_IDLE: Record<NonNullable<AdaptiveFacetChip['tone']>, string> = {
  neutral: 'bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-100',
  amber: 'bg-amber-50 text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100',
  emerald: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-100',
  slate: 'bg-slate-100 text-slate-800 ring-1 ring-slate-200 hover:bg-slate-200',
};

const TONE_ACTIVE: Record<NonNullable<AdaptiveFacetChip['tone']>, string> = {
  neutral: 'bg-gray-800 text-white ring-1 ring-gray-800',
  amber: 'bg-amber-600 text-white ring-1 ring-amber-600',
  emerald: 'bg-emerald-600 text-white ring-1 ring-emerald-600',
  slate: 'bg-slate-700 text-white ring-1 ring-slate-700',
};

/**
 * Horizontal facet / lane chips — GLOBAL SSOT for billing, status, workflow lanes.
 * Content-sized (never steal flex from Search). One scrollable row — never 2×2 towers.
 */
export function AdaptiveFacetChips({
  items,
  className = '',
  'aria-label': ariaLabel = 'Quick filters',
}: AdaptiveFacetChipsProps) {
  if (items.length === 0) return null;

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={[
        'flex w-max max-w-full items-center gap-1 overflow-x-auto overscroll-x-contain',
        '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      data-adaptive-facet-chips="true"
    >
      {items.map((item) => {
        const tone = item.tone ?? 'neutral';
        const active = Boolean(item.active);
        return (
          <button
            key={item.id}
            type="button"
            onClick={item.onSelect}
            aria-pressed={active}
            className={[
              'shrink-0 whitespace-nowrap rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors',
              'min-h-[2rem] sm:min-h-[var(--layout-touch-target)] sm:px-3 sm:text-xs',
              active ? TONE_ACTIVE[tone] : TONE_IDLE[tone],
            ].join(' ')}
            data-facet-chip={item.id}
            data-facet-active={active ? 'true' : undefined}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
