interface ExpiryAutomationPanelProps {
  enabled: boolean;
  onChange: (updates: { expiryAutomationEnabled?: boolean }) => void;
  onPreview: () => void;
  onRun: () => void;
  isSaving: boolean;
  isRunning: boolean;
  previewCount?: number;
  previewQuantity?: number;
  quarantineMode?: 'HARD' | 'SOFT';
}

/** Nightly / manual quarantine of calendar-expired stock (no P&L). */
export function ExpiryAutomationPanel({
  enabled,
  onChange,
  onPreview,
  onRun,
  isSaving,
  isRunning,
  previewCount = 0,
  previewQuantity = 0,
  quarantineMode = 'HARD',
}: ExpiryAutomationPanelProps) {
  const isSoft = quarantineMode === 'SOFT';

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          disabled={isSaving}
          onChange={(e) => onChange({ expiryAutomationEnabled: e.target.checked })}
          className="h-4 w-4 text-blue-600 border-gray-300 rounded"
        />
        <span className="font-medium text-gray-900">
          Nightly expiry quarantine
          <span className="font-normal text-gray-500"> · 04:00, no write-off</span>
        </span>
      </label>

      {(previewCount > 0 || previewQuantity > 0) && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {previewCount} lot(s) · {previewQuantity.toLocaleString()} units ready
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
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {isRunning ? 'Running…' : isSoft ? 'Quarantine expired now' : 'Move expired now'}
        </button>
      </div>
    </div>
  );
}
