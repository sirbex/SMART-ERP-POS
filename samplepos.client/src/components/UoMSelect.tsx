/**
 * UoM Select Component
 * 
 * Reusable dropdown for selecting Unit of Measure for a product.
 * Automatically handles products with single or multiple UoMs.
 * 
 * Usage:
 * <UoMSelect 
 *   product={product}
 *   value={selectedUomId}
 *   onChange={handleUoMChange}
 *   disabled={false}
 * />
 */

import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import type { ProductWithUoMs } from '../types';
import { getAllowedUoMs, formatUoMDisplayName, hasUoMSystem } from '../utils/uomUtils';

export interface UoMSelectProps {
  /** Product with UoM associations */
  product: ProductWithUoMs;
  
  /** Currently selected UoM ID */
  value?: string;
  
  /** Callback when UoM changes */
  onChange: (uomId: string) => void;
  
  /** Disable the select */
  disabled?: boolean;
  
  /** Additional CSS classes */
  className?: string;
  
  /** Show as readonly text if only one UoM available */
  readonlyIfSingle?: boolean;
  
  /** Size variant */
  size?: 'sm' | 'default' | 'lg';
  
  /** Show full name with abbreviation */
  showFullName?: boolean;
}

export const UoMSelect: React.FC<UoMSelectProps> = ({
  product,
  value,
  onChange,
  disabled = false,
  className = '',
  readonlyIfSingle = true,
  size = 'default',
  showFullName = true,
}) => {
  // Check if product has UoM system
  if (!hasUoMSystem(product)) {
    return (
      <span className="text-xs text-gray-500">
        {product.baseUnit || product.unit || 'pcs'}
      </span>
    );
  }

  // Get allowed UoMs for sale
  const allowedUoMs = getAllowedUoMs(product);

  if (allowedUoMs.length === 0) {
    return (
      <span className="text-xs text-gray-500">
        {product.baseUnit || product.unit || 'No UoM'}
      </span>
    );
  }

  // If only one UoM and readonlyIfSingle is true, show as text
  if (allowedUoMs.length === 1 && readonlyIfSingle) {
    const uom = allowedUoMs[0];
    return (
      <span className="text-xs text-gray-700 font-medium">
        {showFullName ? formatUoMDisplayName(uom, true) : uom.abbreviation}
      </span>
    );
  }

  // Determine current value (use first if not set)
  const currentValue = value || allowedUoMs[0]?.id;

  // Size classes
  const sizeClasses = {
    sm: 'h-7 text-xs',
    default: 'h-9 text-sm',
    lg: 'h-11 text-base',
  };

  return (
    <Select 
      value={currentValue} 
      onValueChange={onChange}
      disabled={disabled}
    >
      <SelectTrigger className={`${sizeClasses[size]} ${className}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent 
        position="popper" 
        sideOffset={4}
        className="z-50"
      >
        {allowedUoMs.map(uom => {
          const displayName = showFullName 
            ? formatUoMDisplayName(uom, true) 
            : uom.abbreviation;
          
          return (
            <SelectItem 
              key={uom.id} 
              value={uom.id}
              className={size === 'sm' ? 'text-xs' : ''}
            >
              <div className="flex items-center justify-between w-full gap-2">
                <span>{displayName}</span>
                {uom.isDefault && (
                  <span className="text-blue-600 text-xs font-medium ml-2">
                    (Default)
                  </span>
                )}
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
};

export default UoMSelect;
