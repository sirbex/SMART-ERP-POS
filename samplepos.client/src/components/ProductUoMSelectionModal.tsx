import React, { useState, useEffect } from 'react';
import type { InventoryItem } from '../types';
import type { ProductUoM, UnitOfMeasure } from '../types';
import { CommonUoMGroups } from '../types';
// import UoMSelector from './UoMSelector'; // Removed - was not Shadcn-only
import { formatCurrency } from '../utils/currency';

// Import Shadcn UI components
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Card, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";

interface ProductUoMSelectionModalProps {
  product: InventoryItem | null;
  isOpen: boolean;
  onClose: () => void;
  onAddToCart: (productInfo: {
    name: string;
    price: number;
    quantity: number;
    batch?: string;
    selectedUomId?: string;
    unitPrice?: number;
    basePrice?: number;
    conversionFactor?: number;
    uomDisplayName?: string;
  }) => void;
}

/**
 * Modal for selecting unit of measure and quantity when adding product to cart
 */
const ProductUoMSelectionModal: React.FC<ProductUoMSelectionModalProps> = ({
  product,
  isOpen,
  onClose,
  onAddToCart
}) => {
  const [quantity, setQuantity] = useState<number>(1);
  const [selectedUoM, setSelectedUoM] = useState<ProductUoM | null>(null);
  const [calculatedPrice, setCalculatedPrice] = useState<number>(0);
  const [totalPrice, setTotalPrice] = useState<number>(0);

  // Get all UoMs for reference
  const allUoMs: UnitOfMeasure[] = CommonUoMGroups.flatMap(group => group.units);

  // Initialize selected UoM when product changes
  useEffect(() => {
    if (product) {
      // Check if product has UoM options configured
      if (product.uomOptions && product.uomOptions.length > 0) {
        // Find default UoM or use first available
        const defaultUoM = product.uomOptions.find(uom => uom.isDefault) || product.uomOptions[0];
        setSelectedUoM(defaultUoM);
      } else if (product.price) {
        // Create a basic UoM for products without UoM configuration
        const baseUoM: ProductUoM = {
          uomId: 'piece',
          price: typeof product.price === 'number' ? product.price : 0,
          isDefault: true,
          conversionFactor: 1
        };
        setSelectedUoM(baseUoM);
      }
      setQuantity(1);
    }
  }, [product]);

  // Calculate prices when UoM or quantity changes
  useEffect(() => {
    if (selectedUoM) {
      const unitPrice = selectedUoM.price || 0;
      setCalculatedPrice(unitPrice);
      setTotalPrice(unitPrice * quantity);
    }
  }, [selectedUoM, quantity]);

  const handleAddToCart = () => {
    if (!product || !selectedUoM) return;

    const unitInfo = allUoMs.find(u => u.id === selectedUoM.uomId);
    
    onAddToCart({
      name: product.name,
      price: calculatedPrice,
      quantity: quantity,
      batch: product.batch,
      selectedUomId: selectedUoM.uomId,
      unitPrice: calculatedPrice,
      basePrice: typeof product.price === 'number' ? product.price : 0,
      conversionFactor: selectedUoM.conversionFactor,
      uomDisplayName: unitInfo?.name || selectedUoM.uomId
    });

    onClose();
  };

  const handleQuantityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value) && value > 0) {
      setQuantity(value);
    }
  };

  if (!product) return null;

  // Check if product has UoM options
  const hasUoMOptions = product.uomOptions && product.uomOptions.length > 0;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto mx-2 my-4 sm:mx-auto sm:my-auto">
        <DialogHeader>
          <DialogTitle className="text-lg sm:text-xl">Add Product to Cart</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 sm:space-y-6 py-2 sm:py-4">
          {/* Product Information */}
          <Card>
            <CardContent className="pt-3 sm:pt-4">
              <div className="space-y-2">
                <h3 className="font-semibold text-base sm:text-lg break-words">{product.name}</h3>
                <div className="flex flex-wrap gap-1 sm:gap-2 text-xs sm:text-sm text-muted-foreground">
                  {product.batch && (
                    <Badge variant="outline" className="text-xs">Batch: {product.batch}</Badge>
                  )}
                  {typeof product.quantity === 'number' && (
                    <Badge variant="outline" className="text-xs">Stock: {product.quantity}</Badge>
                  )}
                  {product.unit && (
                    <Badge variant="outline" className="text-xs">Unit: {product.unit}</Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Unit of Measure Selection */}
          {hasUoMOptions && (
            <div className="space-y-2 sm:space-y-3">
              <Label className="text-sm sm:text-base font-medium">Unit of Measure</Label>
              <div className="p-3 border rounded bg-muted text-sm text-muted-foreground">
                UoM Selector temporarily disabled (converting to Shadcn-only)
                <br />Selected: {selectedUoM?.uomId || 'None'}
              </div>
            </div>
          )}

          {/* Quantity Selection */}
          <div className="space-y-2 sm:space-y-3">
            <Label htmlFor="quantity" className="text-sm sm:text-base font-medium">Quantity</Label>
            <Input
              id="quantity"
              type="number"
              min="0.01"
              step="0.01"
              value={quantity}
              onChange={handleQuantityChange}
              className="w-full h-10 sm:h-9"
            />
          </div>

          {/* Price Summary */}
          <Card>
            <CardContent className="pt-3 sm:pt-4">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs sm:text-sm font-medium">Unit Price:</span>
                  <span className="font-semibold text-sm sm:text-base">{formatCurrency(calculatedPrice)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs sm:text-sm font-medium">Quantity:</span>
                  <span className="font-semibold text-sm sm:text-base">{quantity}</span>
                </div>
                <div className="flex justify-between items-center border-t pt-2">
                  <span className="font-bold text-sm sm:text-base">Total Price:</span>
                  <span className="font-bold text-base sm:text-lg">{formatCurrency(totalPrice)}</span>
                </div>
                {selectedUoM && (
                  <div className="text-xs text-muted-foreground break-words">
                    {allUoMs.find(u => u.id === selectedUoM.uomId)?.name || selectedUoM.uomId}
                    {selectedUoM.conversionFactor !== 1 && (
                      <span className="block sm:inline"> (1 unit = {selectedUoM.conversionFactor} base units)</span>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button 
            onClick={handleAddToCart} 
            disabled={!selectedUoM || quantity <= 0}
            className="w-full sm:w-auto"
          >
            Add to Cart
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ProductUoMSelectionModal;

