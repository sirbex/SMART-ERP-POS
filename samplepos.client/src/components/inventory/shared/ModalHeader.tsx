/**
 * Shared Modal Header Component
 * Used in: Purchase Orders, Manual Goods Receipt, all inventory modals
 * Provides consistent header styling with title, description, and close button
 */

interface ModalHeaderProps {
  title: string;
  description?: string;
  onClose: () => void;
}

export function ModalHeader({ title, description, onClose }: ModalHeaderProps) {
  return (
    <div className="flex justify-between items-center mb-4">
      <div>
        <h3 className="text-lg font-semibold">{title}</h3>
        {description && <p className="text-sm text-gray-600">{description}</p>}
      </div>
      <button
        onClick={onClose}
        className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
        aria-label="Close"
      >
        ×
      </button>
    </div>
  );
}
