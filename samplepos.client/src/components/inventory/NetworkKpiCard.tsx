interface NetworkKpiCardProps {
  label: string;
  value: string;
  hint?: string;
  accent?: string;
  loading?: boolean;
}

export function NetworkKpiCard({
  label,
  value,
  hint,
  accent,
  loading,
}: NetworkKpiCardProps) {
  return (
    <div className="bg-white border rounded-lg p-4 shadow-sm">
      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-bold mt-1 tabular-nums ${accent ?? 'text-gray-900'}`}>
        {loading ? '…' : value}
      </div>
      {hint && <div className="text-xs text-gray-500 mt-1">{hint}</div>}
    </div>
  );
}
