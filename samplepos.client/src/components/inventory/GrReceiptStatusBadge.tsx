export function GrReceiptStatusBadge({
  status,
  isReversed,
}: {
  status: string;
  /** Counter-document reverse — keep Completed for audit but surface Reversed. */
  isReversed?: boolean | null;
}) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    DRAFT: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Draft' },
    COMPLETED: { bg: 'bg-green-100', text: 'text-green-800', label: 'Completed' },
    // Historic alias only for display if dirty data ever surfaces
    FINALIZED: { bg: 'bg-green-100', text: 'text-green-800', label: 'Completed' },
    CANCELLED: { bg: 'bg-red-100', text: 'text-red-800', label: 'Cancelled' },
  };
  const badge = config[status] ?? { bg: 'bg-gray-100', text: 'text-gray-800', label: status };
  const showReversed =
    Boolean(isReversed) &&
    (status === 'COMPLETED' || status === 'FINALIZED');

  if (showReversed) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <span
          className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${badge.bg} ${badge.text}`}
          title="Original receipt remains posted for audit (counter-document pattern)"
        >
          {badge.label}
        </span>
        <span
          className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-rose-100 text-rose-900 ring-1 ring-rose-200/80"
          title="Fully reversed via Return GRN — not billable; stock and GR/IR unwound"
        >
          Reversed
        </span>
      </span>
    );
  }

  return (
    <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${badge.bg} ${badge.text}`}>
      {badge.label}
    </span>
  );
}
