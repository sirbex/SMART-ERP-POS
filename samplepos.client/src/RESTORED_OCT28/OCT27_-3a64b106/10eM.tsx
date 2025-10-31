/**
 * Product Unit of Measure Management Component
 * 
 * Allows users to manage multiple units of measure for products with manual pricing
 * Features:
 * - Add/Remove UoMs
 * - Set conversion factors
 * - Manual price override per unit
 * - Set default unit
 * - Enable/disable for sales and purchases
 */

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Switch } from './ui/switch';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { ScrollArea } from './ui/scroll-area';
import { useToast } from './ui/toast';
import { Plus, Trash2, Save, Star, DollarSign, Package } from 'lucide-react';
import api from '@/config/api.config';

interface UnitOfMeasure {
  id: string;
  name: string;
  abbreviation: string;
  categoryId: string;
}

interface ProductUoM {
  id?: string;
  uomId: string;
  conversionFactor: number;
  priceMultiplier: number;
  unitPrice: number | null;
  isDefault: boolean;
  isSaleAllowed: boolean;
  isPurchaseAllowed: boolean;
  sortOrder: number;
  uom?: UnitOfMeasure;
}

interface Product {
  id: string;
  name: string;
  baseUnit: string;
  sellingPrice: number;
  productUoMs?: ProductUoM[];
}

interface ProductUoMManagementProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
  onSuccess?: () => void;
}

const ProductUoMManagement: React.FC<ProductUoMManagementProps> = ({
  open,
  onOpenChange,
  product,
  onSuccess,
}) => {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [availableUoMs, setAvailableUoMs] = useState<UnitOfMeasure[]>([]);
  const [productUoMs, setProductUoMs] = useState<ProductUoM[]>([]);
  const [newUoM, setNewUoM] = useState<Partial<ProductUoM>>({
    uomId: '',
    conversionFactor: 1,
    priceMultiplier: 1,
    unitPrice: null,
    isDefault: false,
    isSaleAllowed: true,
    isPurchaseAllowed: true,
    sortOrder: 0,
  });

  // Load available UoMs when dialog opens
  useEffect(() => {
    if (open && product) {
      loadAvailableUoMs();
      loadProductUoMs();
    }
  }, [open, product]);

  const loadAvailableUoMs = async () => {
    try {
      const response = await api.get('/uoms/units?includeInactive=false');
      // API returns array directly, not wrapped in data property
      setAvailableUoMs(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Error loading UoMs:', error);
      toast({
        title: 'Error',
        description: 'Failed to load available units of measure',
        variant: 'destructive',
      });
    }
  };

  const loadProductUoMs = async () => {
    if (!product?.id) return;

    try {
      const response = await api.get(`/uoms/products/${product.id}/uoms`);
      setProductUoMs(response.data || []);
    } catch (error) {
      console.error('Error loading product UoMs:', error);
      // If no UoMs exist yet, that's okay - start with empty array
      setProductUoMs([]);
    }
  };

  const handleAddUoM = () => {
    if (!newUoM.uomId) {
      toast({
        title: 'Validation Error',
        description: 'Please select a unit of measure',
        variant: 'destructive',
      });
      return;
    }

    if (newUoM.conversionFactor! <= 0) {
      toast({
        title: 'Validation Error',
        description: 'Conversion factor must be greater than zero',
        variant: 'destructive',
      });
      return;
    }

    if (newUoM.unitPrice !== null && newUoM.unitPrice! < 0) {
      toast({
        title: 'Validation Error',
        description: 'Unit price cannot be negative',
        variant: 'destructive',
      });
      return;
    }

    // Check if UoM already exists
    if (productUoMs.some(pu => pu.uomId === newUoM.uomId)) {
      toast({
        title: 'Validation Error',
        description: 'This unit of measure is already added',
        variant: 'destructive',
      });
      return;
    }

    const selectedUoM = availableUoMs.find(u => u.id === newUoM.uomId);
    const newProductUoM: ProductUoM = {
      uomId: newUoM.uomId!,
      conversionFactor: newUoM.conversionFactor!,
      priceMultiplier: newUoM.priceMultiplier!,
      unitPrice: newUoM.unitPrice!,
      isDefault: productUoMs.length === 0 ? true : newUoM.isDefault!, // First UoM is default
      isSaleAllowed: newUoM.isSaleAllowed!,
      isPurchaseAllowed: newUoM.isPurchaseAllowed!,
      sortOrder: productUoMs.length,
      uom: selectedUoM,
    };

    setProductUoMs([...productUoMs, newProductUoM]);

    // Reset form
    setNewUoM({
      uomId: '',
      conversionFactor: 1,
      priceMultiplier: 1,
      unitPrice: null,
      isDefault: false,
      isSaleAllowed: true,
      isPurchaseAllowed: true,
      sortOrder: 0,
    });

    toast({
      title: 'Success',
      description: 'Unit of measure added. Click Save to apply changes.',
    });
  };

  const handleRemoveUoM = (uomId: string) => {
    const filtered = productUoMs.filter(pu => pu.uomId !== uomId);
    
    // If we removed the default, make the first one default
    if (filtered.length > 0 && !filtered.some(pu => pu.isDefault)) {
      filtered[0].isDefault = true;
    }

    setProductUoMs(filtered);
  };

  const handleSetDefault = (uomId: string) => {
    setProductUoMs(productUoMs.map(pu => ({
      ...pu,
      isDefault: pu.uomId === uomId,
    })));
  };

  const handleUpdateUoM = (uomId: string, field: keyof ProductUoM, value: any) => {
    setProductUoMs(productUoMs.map(pu => 
      pu.uomId === uomId ? { ...pu, [field]: value } : pu
    ));
  };

  const handleSave = async () => {
    if (!product?.id) return;

    if (productUoMs.length === 0) {
      toast({
        title: 'Validation Error',
        description: 'Please add at least one unit of measure',
        variant: 'destructive',
      });
      return;
    }

    // Validate that exactly one is default
    const defaultCount = productUoMs.filter(pu => pu.isDefault).length;
    if (defaultCount !== 1) {
      toast({
        title: 'Validation Error',
        description: 'Exactly one unit of measure must be set as default',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSaving(true);

      // Use bulk assign endpoint to replace all UoMs
      await api.post(`/uoms/products/${product.id}/uoms/bulk`, {
        uoms: productUoMs.map(pu => ({
          uomId: pu.uomId,
          conversionFactor: pu.conversionFactor,
          priceMultiplier: pu.priceMultiplier,
          unitPrice: pu.unitPrice,
          isDefault: pu.isDefault,
          isSaleAllowed: pu.isSaleAllowed,
          isPurchaseAllowed: pu.isPurchaseAllowed,
          sortOrder: pu.sortOrder,
        })),
      });

      toast({
        title: 'Success',
        description: 'Units of measure updated successfully',
      });

      onSuccess?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error saving product UoMs:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to save units of measure',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (value: number | null) => {
    if (value === null) return 'Auto';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  };

  const calculateAutoPrice = (conversionFactor: number, priceMultiplier: number) => {
    if (!product?.sellingPrice) return 0;
    return product.sellingPrice * conversionFactor * priceMultiplier;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Manage Units of Measure</DialogTitle>
          <DialogDescription>
            Configure multiple units for <strong>{product?.name}</strong> with custom pricing
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Current Product Info */}
          <div className="bg-muted p-4 rounded-lg">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <Label className="text-muted-foreground">Base Unit</Label>
                <p className="font-medium">{product?.baseUnit || 'N/A'}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Base Price</Label>
                <p className="font-medium">{formatCurrency(product?.sellingPrice || 0)}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Total UoMs</Label>
                <p className="font-medium">{productUoMs.length}</p>
              </div>
            </div>
          </div>

          {/* Existing UoMs */}
          <div className="space-y-3">
            <Label className="text-lg font-semibold">Configured Units</Label>
            <ScrollArea className="h-[250px] w-full border rounded-lg p-4">
              {productUoMs.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  No units configured yet. Add one below.
                </div>
              ) : (
                <div className="space-y-3">
                  {productUoMs.map((pu, index) => (
                    <div key={pu.uomId || `uom-${index}`} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4 text-muted-foreground" />
                          <span className="font-semibold">{pu.uom?.name || 'Unknown'}</span>
                          <Badge variant="outline">{pu.uom?.abbreviation}</Badge>
                          {pu.isDefault && (
                            <Badge variant="default">
                              <Star className="h-3 w-3 mr-1" />
                              Default
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {!pu.isDefault && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleSetDefault(pu.uomId)}
                            >
                              <Star className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRemoveUoM(pu.uomId)}
                            disabled={productUoMs.length === 1}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">Conversion Factor</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={pu.conversionFactor}
                            onChange={(e) =>
                              handleUpdateUoM(pu.uomId, 'conversionFactor', parseFloat(e.target.value) || 1)
                            }
                            className="mt-1"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            1 {pu.uom?.abbreviation} = {pu.conversionFactor} {product?.baseUnit}
                          </p>
                        </div>

                        <div>
                          <Label className="text-xs">Price Multiplier</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={pu.priceMultiplier}
                            onChange={(e) =>
                              handleUpdateUoM(pu.uomId, 'priceMultiplier', parseFloat(e.target.value) || 1)
                            }
                            className="mt-1"
                          />
                        </div>

                        <div>
                          <Label className="text-xs flex items-center gap-1">
                            <DollarSign className="h-3 w-3" />
                            Unit Price (Manual Override)
                          </Label>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="Auto-calculate"
                            value={pu.unitPrice ?? ''}
                            onChange={(e) =>
                              handleUpdateUoM(
                                pu.uomId,
                                'unitPrice',
                                e.target.value === '' ? null : parseFloat(e.target.value)
                              )
                            }
                            className="mt-1"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            Auto: {formatCurrency(calculateAutoPrice(pu.conversionFactor, pu.priceMultiplier))}
                          </p>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs">Sale Allowed</Label>
                            <Switch
                              checked={pu.isSaleAllowed}
                              onCheckedChange={(checked) =>
                                handleUpdateUoM(pu.uomId, 'isSaleAllowed', checked)
                              }
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <Label className="text-xs">Purchase Allowed</Label>
                            <Switch
                              checked={pu.isPurchaseAllowed}
                              onCheckedChange={(checked) =>
                                handleUpdateUoM(pu.uomId, 'isPurchaseAllowed', checked)
                              }
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          <Separator />

          {/* Add New UoM */}
          <div className="space-y-3">
            <Label className="text-lg font-semibold">Add New Unit</Label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Unit of Measure</Label>
                <Select
                  value={newUoM.uomId}
                  onValueChange={(value) => setNewUoM({ ...newUoM, uomId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select unit..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableUoMs
                      .filter(uom => !productUoMs.some(pu => pu.uomId === uom.id))
                      .map((uom) => (
                        <SelectItem key={uom.id} value={uom.id}>
                          {uom.name} ({uom.abbreviation})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Conversion Factor</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={newUoM.conversionFactor}
                  onChange={(e) =>
                    setNewUoM({ ...newUoM, conversionFactor: parseFloat(e.target.value) || 1 })
                  }
                  placeholder="e.g., 24 for a carton of 24"
                />
              </div>

              <div>
                <Label>Price Multiplier</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={newUoM.priceMultiplier}
                  onChange={(e) =>
                    setNewUoM({ ...newUoM, priceMultiplier: parseFloat(e.target.value) || 1 })
                  }
                />
              </div>

              <div>
                <Label>Unit Price (Optional)</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Leave empty for auto-calculation"
                  value={newUoM.unitPrice ?? ''}
                  onChange={(e) =>
                    setNewUoM({
                      ...newUoM,
                      unitPrice: e.target.value === '' ? null : parseFloat(e.target.value),
                    })
                  }
                />
              </div>
            </div>

            <Button onClick={handleAddUoM} className="w-full" variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              Add Unit
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || productUoMs.length === 0}>
            {saving ? (
              <>Saving...</>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ProductUoMManagement;
