/**
 * Shared Modal Footer Component
 * Used in: Purchase Orders, Manual Goods Receipt, all inventory modals
 * Provides consistent action buttons styling (Cancel + Submit)
 */

interface ModalFooterProps {
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel?: string;
  cancelLabel?: string;
  isSubmitting?: boolean;
  submitDisabled?: boolean;
  submitIcon?: string;
  className?: string;
}

export function ModalFooter({
  onCancel,
  onSubmit,
  submitLabel = "Save",
  cancelLabel = "Cancel",
  isSubmitting = false,
  submitDisabled = false,
  submitIcon = "✓",
  className = "",
}: ModalFooterProps) {
  return (
    <div className={`flex justify-end gap-3 ${className}`}>
      <button
        type="button"
        onClick={onCancel}
        className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
        disabled={isSubmitting}
      >
        {cancelLabel}
      </button>
      <button
        type="button"
        onClick={onSubmit}
        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        disabled={submitDisabled || isSubmitting}
      >
        {isSubmitting ? (
          <>
            <span className="animate-spin">⏳</span>
            Processing...
          </>
        ) : (
          <>
            {submitIcon} {submitLabel}
          </>
        )}
      </button>
    </div>
  );
}
