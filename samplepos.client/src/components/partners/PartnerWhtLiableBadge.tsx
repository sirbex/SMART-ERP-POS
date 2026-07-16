/** Compact list/header badge when a partner is marked WHT-liable. */
export function PartnerWhtLiableBadge({
  liable,
  className = '',
}: {
  liable?: boolean | null;
  className?: string;
}) {
  if (!liable) return null;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-sky-100 text-sky-800 ${className}`.trim()}
      title="Partner is subject to withholding tax"
    >
      WHT liable
    </span>
  );
}
