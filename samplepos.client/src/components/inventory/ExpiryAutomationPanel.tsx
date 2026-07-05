import { MultistoreGate } from './MultistoreGate';

interface ExpiryAutomationPanelProps {
  enabled: boolean;
  onChange: (updates: { expiryAutomationEnabled?: boolean }) => void;
  onPreview: () => void;
  onRun: () => void;
  isSaving: boolean;
  isRunning: boolean;
  previewCount?: number;
  previewQuantity?: number;
}

/**
 * Store Network settings — auto-move expired sellable stock to EXPIRED store (Phase 9).
 */
export function ExpiryAutomationPanel({
  enabled,
  onChange,
  onPreview,
  onRun,
  isSaving,
  isRunning,
  previewCount = 0,
  previewQuantity = 0,
}: ExpiryAutomationPanelProps) {
  return (
    <MultistoreGate>
      <div className="border-t border-gray-200 pt-6 mt-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Expiry automation</h3>
        <p className="text-sm text-gray-500 mb-4">
          Lots past expiry with sellable quantity at Main or Selling Floor are moved to the
          EXPIRED quarantine store. A nightly job runs when enabled; you can also process now.
        </p>

        <label className="flex items-start gap-2 text-sm mb-4">
          <input
            type="checkbox"
            checked={enabled}
            disabled={isSaving}
            onChange={(e) => onChange({ expiryAutomationEnabled: e.target.checked })}
            className="mt-0.5 h-4 w-4 text-blue-600 border-gray-300 rounded"
          />
          <span>
            <span className="font-medium text-gray-900">Enable nightly expiry processing</span>
            <span className="block text-gray-500">Runs daily at 04:00 server time.</span>
          </span>
        </label>

        {(previewCount > 0 || previewQuantity > 0) && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
            {previewCount} lot line(s) ready — {previewQuantity.toLocaleString()} units total.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onPreview}
            disabled={isRunning}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Refresh preview
          </button>
          <button
            type="button"
            onClick={onRun}
            disabled={isRunning}
            className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {isRunning ? 'Processing…' : 'Process expired stock now'}
          </button>
        </div>
      </div>
    </MultistoreGate>
  );
}
