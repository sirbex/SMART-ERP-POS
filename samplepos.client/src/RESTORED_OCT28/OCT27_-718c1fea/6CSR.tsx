import React from 'react';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { priceFromCost, marginFromCostAndPrice } from '@/utils/pricing';

export interface ProductFormData {
  name: string;
  sku: string;
  description: string;
  category: string;
  unitPrice: string;
  costPrice: string;
  // Pricing helpers
  marginPercent?: string; // derived/display only
  autoCalcPrice?: boolean; // when true, update unitPrice when cost/margin changes
  unit: string;
  reorderLevel: string;
  isActive: boolean;
  // Tax settings
  taxRatePercent?: string; // e.g., "10" for 10%; set 0 for tax-exempt
}

interface ProductFormProps {
  mode: 'create' | 'edit';
  formData: ProductFormData;
  setFormData: React.Dispatch<React.SetStateAction<ProductFormData>>;
}

const ProductForm: React.FC<ProductFormProps> = ({ mode, formData, setFormData }) => {
  const id = (suffix: string) => `${mode}-${suffix}`;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
      <div className="space-y-2">
        <Label htmlFor={id('name')}>
          Product Name <span className="text-red-600">*</span>
        </Label>
        <Input
          id={id('name')}
          value={formData.name}
          onChange={(e) => setFormData((s) => ({ ...s, name: e.target.value }))}
          placeholder="e.g., Coca-Cola 500ml"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={id('sku')}>
          SKU{mode === 'create' ? ' ' : ''}{mode === 'create' && <span className="text-red-600">*</span>}
        </Label>
        <Input
          id={id('sku')}
          value={formData.sku}
          onChange={(e) => setFormData((s) => ({ ...s, sku: e.target.value }))}
          placeholder="e.g., COKE-500"
        />
      </div>

      <div className="space-y-2 md:col-span-2">
        <Label htmlFor={id('description')}>Description</Label>
        <Input
          id={id('description')}
          value={formData.description}
          onChange={(e) => setFormData((s) => ({ ...s, description: e.target.value }))}
          placeholder="Product description"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={id('unit-price')}>
          Unit Price (₱) <span className="text-red-600">*</span>
        </Label>
        <Input
          id={id('unit-price')}
          type="number"
          step="0.01"
          value={formData.unitPrice}
          onChange={(e) => {
            const unitPrice = e.target.value;
            const marginPercent = marginFromCostAndPrice(formData.costPrice, unitPrice);
            setFormData((s) => ({ ...s, unitPrice, marginPercent }));
          }}
          placeholder="0.00"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={id('cost-price')}>Cost Price (₱)</Label>
        <Input
          id={id('cost-price')}
          type="number"
          step="0.01"
          value={formData.costPrice}
          onChange={(e) => {
            const costPrice = e.target.value;
            if (formData.autoCalcPrice) {
              const unitPrice = priceFromCost(costPrice, formData.marginPercent ?? '25');
              const marginPercent = marginFromCostAndPrice(costPrice, unitPrice);
              setFormData((s) => ({ ...s, costPrice, unitPrice, marginPercent }));
            } else {
              const marginPercent = marginFromCostAndPrice(costPrice, formData.unitPrice);
              setFormData((s) => ({ ...s, costPrice, marginPercent }));
            }
          }}
          placeholder="0.00"
        />
      </div>

      {/* Margin and auto-calc controls */}
      <div className="space-y-2">
        <Label htmlFor={id('margin')}>Target Margin (%)</Label>
        <Input
          id={id('margin')}
          type="number"
          step="0.01"
          value={formData.marginPercent ?? ''}
          onChange={(e) => {
            const marginPercent = e.target.value;
            if (formData.autoCalcPrice) {
              const unitPrice = priceFromCost(formData.costPrice, marginPercent);
              setFormData((s) => ({ ...s, marginPercent, unitPrice }));
            } else {
              setFormData((s) => ({ ...s, marginPercent }));
            }
          }}
          placeholder="25.00"
        />
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id={id('auto-calc')}
            checked={!!formData.autoCalcPrice}
            onChange={(e) => {
              const autoCalcPrice = e.target.checked;
              if (autoCalcPrice) {
                const unitPrice = priceFromCost(formData.costPrice, formData.marginPercent ?? '25');
                setFormData((s) => ({ ...s, autoCalcPrice, unitPrice }));
              } else {
                setFormData((s) => ({ ...s, autoCalcPrice }));
              }
            }}
            className="h-4 w-4"
            aria-label="Auto-calculate price from cost and margin"
          />
          <Label htmlFor={id('auto-calc')} className="cursor-pointer">
            Auto-calculate price from cost and margin
          </Label>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={id('unit')}>Unit</Label>
        <Input
          id={id('unit')}
          value={formData.unit}
          onChange={(e) => setFormData((s) => ({ ...s, unit: e.target.value }))}
          placeholder="pcs, kg, liter, etc."
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={id('reorder-level')}>Reorder Level</Label>
        <Input
          id={id('reorder-level')}
          type="number"
          value={formData.reorderLevel}
          onChange={(e) => setFormData((s) => ({ ...s, reorderLevel: e.target.value }))}
          placeholder="10"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={id('tax-rate')}>Tax Rate (%)</Label>
        <Input
          id={id('tax-rate')}
          type="number"
          step="0.01"
          value={formData.taxRatePercent ?? ''}
          onChange={(e) => setFormData((s) => ({ ...s, taxRatePercent: e.target.value }))}
          placeholder="10.00"
        />
        <p className="text-xs text-muted-foreground">Set to 0 for tax-exempt products.</p>
      </div>

      <div className="space-y-2 md:col-span-2">
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id={id('is-active')}
            checked={formData.isActive}
            onChange={(e) => setFormData((s) => ({ ...s, isActive: e.target.checked }))}
            className="h-4 w-4"
            aria-label="Product is active"
          />
          <Label htmlFor={id('is-active')} className="cursor-pointer">
            Active (available for sale)
          </Label>
        </div>
      </div>
    </div>
  );
};

export default ProductForm;
