/**
 * Shared Modal Container Component
 * Used in: Purchase Orders, Manual Goods Receipt, all inventory modals
 * Provides consistent modal backdrop and container styling
 */

interface ModalContainerProps {
  children: React.ReactNode;
  maxWidth?: "2xl" | "4xl" | "6xl";
  className?: string;
  onClose?: () => void;
}

export function ModalContainer({
  children,
  maxWidth = "6xl",
  className = "",
  onClose,
}: ModalContainerProps) {
  const widthClasses = {
    "2xl": "max-w-2xl",
    "4xl": "max-w-4xl",
    "6xl": "max-w-6xl",
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className={`bg-white rounded-lg p-6 ${widthClasses[maxWidth]} w-full mx-4 max-h-[90vh] overflow-y-auto ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
