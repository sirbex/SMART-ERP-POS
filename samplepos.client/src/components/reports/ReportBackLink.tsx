import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

type ReportBackLinkProps = {
  /** Destination — defaults to reports hub. */
  to?: string;
  label?: string;
  /** Button mode (hub params/results) instead of router Link. */
  onClick?: () => void;
  className?: string;
};

/**
 * SSOT back control for every report surface → reports hub (or custom handler).
 */
export function ReportBackLink({
  to = '/reports',
  label = 'Back to Reports',
  onClick,
  className = '',
}: ReportBackLinkProps) {
  const classes = [
    'inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900',
    'min-h-[var(--layout-touch-target,2.75rem)] px-1 -ml-1 rounded-md',
    'hover:bg-slate-50 transition-colors',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes} data-report-back="true">
        <ArrowLeft className="w-4 h-4 shrink-0" aria-hidden />
        {label}
      </button>
    );
  }

  return (
    <Link to={to} className={classes} data-report-back="true">
      <ArrowLeft className="w-4 h-4 shrink-0" aria-hidden />
      {label}
    </Link>
  );
}
