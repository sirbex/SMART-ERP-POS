/**
 * Purchase-order product search — thin wrapper over EnterpriseProductSearch (SSOT).
 */
import { EnterpriseProductSearch, type ProcurementProduct } from './EnterpriseProductSearch';

export type { ProcurementProduct };

interface ProcurementProductSearchProps {
  /** When omitted, searches full catalog (supplier-agnostic). */
  supplierId?: string;
  onProductSelect: (product: ProcurementProduct) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

export function ProcurementProductSearch({
  supplierId,
  onProductSelect,
  disabled,
  className,
  placeholder,
  inputRef,
}: ProcurementProductSearchProps) {
  return (
    <EnterpriseProductSearch
      mode="procurement"
      supplierId={supplierId}
      onProductSelect={onProductSelect}
      disabled={disabled}
      className={className}
      placeholder={placeholder}
      inputRef={inputRef}
    />
  );
}
