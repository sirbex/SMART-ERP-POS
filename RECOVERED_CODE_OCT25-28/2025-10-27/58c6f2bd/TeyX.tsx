/**
 * Example Cart Item Component with UoM Support
 * 
 * This is a simplified example showing how to integrate UoMSelect
 * into a cart item component. Use this as a reference for updating
 * your POSScreenAPI.tsx or any other component that needs UoM selection.
 */

import React from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Minus, Plus, Trash2 } from 'lucide-react';
import UoMSelect from './UoMSelect';
import type { ProductWithUoMs, SaleItem } from '../types';
import { hasUoMSystem } from '../utils/uomUtils';

interface CartItemWithUoMProps {
  item: SaleItem;
  index: number;
  product: ProductWithUoMs;
  onQuantityChange: (index: number, quantity: number) => void;
  onUoMChange: (index: number, uomId: string) => void;
  onRemove: (index: number) => void;
  formatCurrency: (value: number) => string;
}

export const CartItemWithUoM: React.FC<CartItemWithUoMProps> = ({
  item,
  index,
  product,
  onQuantityChange,
  onUoMChange,
  onRemove,
  formatCurrency,
}) => {
  return (
    <div className="border border-gray-200 rounded-md hover:border-blue-300 transition-colors bg-white">
      {/* Main row with product info, quantity controls, and total */}
      <div className="flex items-center justify-between p-3">
        {/* Product Info */}
        <div className="flex-1 mr-3">
          <p className="font-medium text-gray-900 text-sm">{item.name}</p>
          <p className="text-xs text-gray-500">
            {formatCurrency(item.price || 0)} per {item.unit}
          </p>
        </div>

        {/* Quantity Controls and Total */}
        <div className="flex items-center gap-2">
          {/* Quantity Buttons */}
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="outline"
              className="h-7 w-7 hover:bg-blue-50 hover:border-blue-300"
              onClick={() => onQuantityChange(index, item.quantity - 1)}
            >
              <Minus className="h-3 w-3" />
            </Button>
            
            <Input
              className="w-14 h-8 text-center text-sm font-medium border-gray-200"
              type="number"
              value={item.quantity}
              onChange={(e) => onQuantityChange(index, parseInt(e.target.value) || 1)}
            />
            
            <Button
              size="icon"
              variant="outline"
              className="h-7 w-7 hover:bg-blue-50 hover:border-blue-300"
              onClick={() => onQuantityChange(index, item.quantity + 1)}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>

          {/* Line Total */}
          <div className="w-20 text-right font-semibold text-gray-900 text-sm">
            {formatCurrency((item.price || 0) * item.quantity)}
          </div>

          {/* Remove Button */}
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-red-600 hover:bg-red-50"
            onClick={() => onRemove(index)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* UoM Selector Row (only shows if product has UoM system with multiple units) */}
      {product && hasUoMSystem(product) && (
        <div className="px-3 pb-3 pt-0 border-t border-gray-100">
          <div className="flex items-center gap-2 mt-2">
            <Label className="text-xs text-gray-600 whitespace-nowrap min-w-[35px]">
              Unit:
            </Label>
            <UoMSelect
              product={product}
              value={item.uomId}
              onChange={(newUomId) => onUoMChange(index, newUomId)}
              size="sm"
              className="flex-1"
              readonlyIfSingle={true}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default CartItemWithUoM;
