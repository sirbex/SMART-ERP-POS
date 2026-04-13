interface NotesFieldProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  rows?: number;
  className?: string;
}

/**
 * Shared Notes/Comments Field Component
 * Used in: Purchase Orders, Manual Goods Receipt, Goods Receipts
 * Ensures consistent notes input styling and behavior
 */
export function NotesField({
  value,
  onChange,
  disabled = false,
  placeholder = "Optional notes about this transaction...",
  rows = 2,
  className = "",
}: NotesFieldProps) {
  return (
    <div className={className}>
      <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
        Notes
      </label>
      <textarea
        id="notes"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        placeholder={placeholder}
        disabled={disabled}
      />
    </div>
  );
}
