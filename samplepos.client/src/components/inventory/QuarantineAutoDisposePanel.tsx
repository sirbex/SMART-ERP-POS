interface QuarantineAutoDisposePanelProps {
  enabled: boolean;
  minAgeDays: number;
  onChange: (updates: {
    quarantineAutoDisposeEnabled?: boolean;
    quarantineAutoDisposeMinAgeDays?: number;
  }) => void;
  onPreview: () => void;
  onRun: () => void;
  isSaving: boolean;
  isRunning: boolean;
  previewCount?: number;
  previewQuantity?: number;
  previewValue?: number;
  quarantineMode?: 'HARD' | 'SOFT';
}

/** P4 — optional nightly write-off of aged EXPIRED quarantine (posts P&L). */
export function QuarantineAutoDisposePanel({
  enabled,
  minAgeDays,
  onChange,
  onPreview,
  onRun,
  isSaving,
  isRunning,
  previewCount = 0,
  previewQuantity = 0,
  previewValue = 0,
}: QuarantineAutoDisposePanelProps) {
  return (
    <div className="space-y-3" data-quarantine-auto-dispose-panel="true">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          disabled={isSaving}
          onChange={(e) => onChange({ quarantineAutoDisposeEnabled: e.target.checked })}
          className="h-4 w-4 text-blue-600 border-gray-300 rounded"
          data-quarantine-auto-dispose-enabled="true"
        />
        <span className="font-medium text-gray-900">
          Nightly auto-dispose (EXPIRED only)
          <span className="font-normal text-gray-500"> · 04:30, posts expense</span>
        </span>
      </label>

      <label className="block text-sm max-w-[8rem]">
        <span className="block text-gray-600 mb-1 text-xs">Min age (days)</span>
        <input
          type="number"
          min={0}
          max={3650}
          value={minAgeDays}
          disabled={isSaving}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!Number.isFinite(n)) return;
            onChange({
              quarantineAutoDisposeMinAgeDays: Math.min(3650, Math.max(0, Math.trunc(n))),
            });
          }}
          className="w-full border border-gray-300 rounded-lg px-3 py-1.5"
          data-quarantine-auto-dispose-min-age="true"
        />
      </label>

      {(previewCount > 0 || previewQuantity > 0) && (
        <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {previewCount} line(s) · {previewQuantity.toLocaleString()} units
          {previewValue > 0
            ? ` · ${previewValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
            : ''}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onPreview}
          disabled={isRunning}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          Preview
        </button>
        <button
          type="button"
          onClick={onRun}
          disabled={isRunning}
          className="px-3 py-1.5 text-sm bg-rose-700 text-white rounded-lg hover:bg-rose-800 disabled:opacity-50"
          data-quarantine-auto-dispose-run="true"
        >
          {isRunning ? 'Disposing…' : 'Dispose aged now'}
        </button>
      </div>
    </div>
  );
}
