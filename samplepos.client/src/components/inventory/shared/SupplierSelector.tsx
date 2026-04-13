import { useSuppliers } from "@/hooks/useSuppliers";

interface SupplierSelectorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  /** When false, hides the built-in label and helper text (caller renders its own). Defaults to true. */
  showLabel?: boolean;
}

/**
 * Shared Supplier Selector Component
 * Used in: Purchase Orders, Manual Goods Receipt
 * Ensures consistent supplier selection across all inventory pages
 */
export function SupplierSelector({
  value,
  onChange,
  disabled = false,
  required = true,
  className = "",
  showLabel = true,
}: SupplierSelectorProps) {
  const { data: suppliersData, isLoading } = useSuppliers();

  const rawData = suppliersData?.data;
  const suppliers = (Array.isArray(rawData) ? rawData : []) as Array<{ id: string; name: string }>;

  return (
    <div className={className}>
      {showLabel && (
        <label htmlFor="supplier" className="block text-sm font-medium text-gray-700 mb-1">
          Supplier {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <select
        id="supplier"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        required={required}
        disabled={disabled || isLoading}
      >
        <option value="">
          {isLoading ? "Loading suppliers..." : "Select a supplier..."}
        </option>
        {suppliers.map((supplier: { id: string; name: string }) => (
          <option key={supplier.id} value={supplier.id}>
            {supplier.name}
          </option>
        ))}
      </select>
      {showLabel && required && (
        <p className="mt-1 text-xs text-gray-500">BR-PO-001: Supplier validation required</p>
      )}
    </div>
  );
}
