import React, { useState, useEffect } from 'react';
import type { InventoryItem, SalesPricing } from '../types';
import { 
  createPurchaseUoM, 
  generateSalesUoMOptions, 
  calculateSellingPrice,
  PurchaseScenarios,
  formatCostBreakdown,
  validatePurchaseInfo
} from '../utils/purchaseCalculations';
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";

interface BulkPurchaseFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (inventoryItem: InventoryItem) => void;
  editingItem?: InventoryItem | null;
}

/**
 * Enhanced form for purchasing inventory in bulk with automatic cost calculations
 */
const BulkPurchaseForm: React.FC<BulkPurchaseFormProps> = ({
  isOpen,
  onClose,
  onSubmit,
  editingItem
}) => {
  // Basic product information
  const [productName, setProductName] = useState('');
  const [batch, setBatch] = useState('');
  const [category, setCategory] = useState('');
  const [supplier, setSupplier] = useState('');
  const [location, setLocation] = useState('');
  const [sku, setSku] = useState('');
  const [hasExpiry, setHasExpiry] = useState(false);
  const [expiry, setExpiry] = useState('');
  const [expiryAlertDays, setExpiryAlertDays] = useState(30);
  
  // Purchase information
  const [baseUnitId, setBaseUnitId] = useState('bottle');
  const [baseUnitName, setBaseUnitName] = useState('Bottle');
  const [purchaseUnitId, setPurchaseUnitId] = useState('box');
  const [purchaseUnitName, setPurchaseUnitName] = useState('Box');
  const [quantityPerPurchaseUnit, setQuantityPerPurchaseUnit] = useState(24);
  const [costPerPurchaseUnit, setCostPerPurchaseUnit] = useState(12.00);
  const [purchaseQuantity, setPurchaseQuantity] = useState(1);
  
  // Sales pricing
  const [markupPercentage, setMarkupPercentage] = useState(25);
  const [minimumSellingPrice, setMinimumSellingPrice] = useState<number | ''>('');
  
  // Calculated values
  const [costPerBaseUnit, setCostPerBaseUnit] = useState(0);
  const [totalBaseUnits, setTotalBaseUnits] = useState(0);
  const [totalCost, setTotalCost] = useState(0);
  const [sellingPricePerUnit, setSellingPricePerUnit] = useState(0);
  const [sellingPricePerBulk, setSellingPricePerBulk] = useState(0);
  
  // Error states
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  // Scenario presets
  const scenarios = Object.entries(PurchaseScenarios);

  // Load editing item data
  useEffect(() => {
    if (editingItem) {
      setProductName(editingItem.name);
      setBatch(editingItem.batch);
      setCategory(editingItem.category || '');
      setSupplier(editingItem.supplier || '');
      setLocation(editingItem.location || '');
      setSku(editingItem.sku || '');
      if (editingItem.hasExpiry !== undefined) setHasExpiry(editingItem.hasExpiry);
      setExpiry(editingItem.expiry || '');
      setExpiryAlertDays(editingItem.expiryAlertDays || 30);
      
      // Load purchase info if available
      if (editingItem.purchaseInfo) {
        if (editingItem.purchaseInfo.purchaseUnitId) setPurchaseUnitId(String(editingItem.purchaseInfo.purchaseUnitId));
        if (editingItem.purchaseInfo.purchaseUnitName) setPurchaseUnitName(editingItem.purchaseInfo.purchaseUnitName);
        if (editingItem.purchaseInfo.quantityPerPurchaseUnit) setQuantityPerPurchaseUnit(editingItem.purchaseInfo.quantityPerPurchaseUnit);
        if (editingItem.purchaseInfo.costPerPurchaseUnit) setCostPerPurchaseUnit(editingItem.purchaseInfo.costPerPurchaseUnit);
      }
      
      // Load sales pricing if available
      if (editingItem.salesPricing) {
        if (editingItem.salesPricing.markupPercentage) setMarkupPercentage(editingItem.salesPricing.markupPercentage);
        if (editingItem.salesPricing.minimumSellingPrice) setMinimumSellingPrice(String(editingItem.salesPricing.minimumSellingPrice));
      }
    }
  }, [editingItem]);

  // Calculate derived values when inputs change
  useEffect(() => {
    if (quantityPerPurchaseUnit > 0 && costPerPurchaseUnit >= 0) {
      const costPerBase = costPerPurchaseUnit / quantityPerPurchaseUnit;
      setCostPerBaseUnit(costPerBase);
      
      const totalUnits = purchaseQuantity * quantityPerPurchaseUnit;
      setTotalBaseUnits(totalUnits);
      
      const totalCostAmount = purchaseQuantity * costPerPurchaseUnit;
      setTotalCost(totalCostAmount);
      
      const sellingPerUnit = calculateSellingPrice(costPerBase, markupPercentage);
      setSellingPricePerUnit(sellingPerUnit);
      
      const sellingPerBulk = calculateSellingPrice(costPerPurchaseUnit, markupPercentage);
      setSellingPricePerBulk(sellingPerBulk);
    }
  }, [quantityPerPurchaseUnit, costPerPurchaseUnit, purchaseQuantity, markupPercentage]);

  const applyScenario = (scenarioKey: string) => {
    const scenario = PurchaseScenarios[scenarioKey as keyof typeof PurchaseScenarios];
    if (!scenario) return;
    
    setBaseUnitId(scenario.baseUnit.id);
    setBaseUnitName(scenario.baseUnit.name);
    setPurchaseUnitId(scenario.purchaseUnit.id);
    setPurchaseUnitName(scenario.purchaseUnit.name);
    setQuantityPerPurchaseUnit(scenario.purchaseUnit.quantity);
    setCostPerPurchaseUnit(scenario.exampleCost);
    setMarkupPercentage(scenario.suggestedMarkup);
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (!productName.trim()) newErrors.productName = 'Product name is required';
    if (!batch.trim()) newErrors.batch = 'Batch number is required';
    if (!baseUnitId.trim()) newErrors.baseUnitId = 'Base unit is required';
    if (!baseUnitName.trim()) newErrors.baseUnitName = 'Base unit name is required';
    if (!purchaseUnitId.trim()) newErrors.purchaseUnitId = 'Purchase unit is required';
    if (!purchaseUnitName.trim()) newErrors.purchaseUnitName = 'Purchase unit name is required';
    if (quantityPerPurchaseUnit <= 0) newErrors.quantityPerPurchaseUnit = 'Quantity per purchase unit must be greater than 0';
    if (costPerPurchaseUnit < 0) newErrors.costPerPurchaseUnit = 'Cost cannot be negative';
    if (purchaseQuantity <= 0) newErrors.purchaseQuantity = 'Purchase quantity must be greater than 0';
    if (markupPercentage < 0) newErrors.markupPercentage = 'Markup cannot be negative';
    if (hasExpiry && !expiry) newErrors.expiry = 'Expiry date is required when item has expiry';
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validateForm()) return;

    try {
      // Create purchase information
      const purchaseInfo = createPurchaseUoM(
        purchaseUnitId,
        purchaseUnitName,
        quantityPerPurchaseUnit,
        costPerPurchaseUnit,
        supplier
      );

      // Validate the purchase info
      validatePurchaseInfo(purchaseInfo);

      // Create sales pricing
      const salesPricing: SalesPricing = {
        markupPercentage,
        minimumSellingPrice: typeof minimumSellingPrice === 'number' ? minimumSellingPrice : undefined,
        maxDiscountPercentage: 10 // Default 10% max discount
      };

      // Generate UoM options for sales
      const uomOptions = generateSalesUoMOptions(purchaseInfo, salesPricing, baseUnitId);

      // Create the inventory item
      const inventoryItem: InventoryItem = {
        id: editingItem?.id || `${productName}-${batch}-${Date.now()}`,
        name: productName,
        batch,
        hasExpiry,
        expiry: hasExpiry ? expiry : undefined,
        expiryAlertDays: hasExpiry ? expiryAlertDays : undefined,
        quantity: totalBaseUnits,
        unit: baseUnitId,
        
        // Enhanced purchase & cost management
        purchaseInfo,
        salesPricing,
        lastPurchaseDate: new Date().toISOString(),
        lastPurchaseCost: costPerPurchaseUnit,
        
        // UoM options for sales
        uomOptions,
        baseUomId: baseUnitId,
        defaultUomId: baseUnitId,
        
        // Basic pricing (using base unit price)
        price: sellingPricePerUnit,
        costPrice: costPerBaseUnit,
        
        // Other fields
        category,
        supplier,
        location,
        sku,
        reorderLevel: Math.ceil(totalBaseUnits * 0.2), // Suggest 20% as reorder level
        
        // Metadata
        createdAt: editingItem?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      onSubmit(inventoryItem);
      handleClose();
    } catch (error) {
      setErrors({ 
        general: error instanceof Error ? error.message : 'An error occurred while processing the purchase'
      });
    }
  };

  const handleClose = () => {
    // Reset form
    setProductName('');
    setBatch('');
    setCategory('');
    setSupplier('');
    setLocation('');
    setSku('');
    setHasExpiry(false);
    setExpiry('');
    setExpiryAlertDays(30);
    setBaseUnitId('bottle');
    setBaseUnitName('Bottle');
    setPurchaseUnitId('box');
    setPurchaseUnitName('Box');
    setQuantityPerPurchaseUnit(24);
    setCostPerPurchaseUnit(12.00);
    setPurchaseQuantity(1);
    setMarkupPercentage(25);
    setMinimumSellingPrice('');
    setErrors({});
    
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">
            {editingItem ? 'Edit Bulk Purchase Item' : 'Add Bulk Purchase Item'}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* Error Display */}
          {errors.general && (
            <Card className="border-destructive">
              <CardContent className="pt-4">
                <div className="text-destructive text-sm">{errors.general}</div>
              </CardContent>
            </Card>
          )}
          
          {/* Quick Scenarios */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Quick Setup</CardTitle>
              <CardDescription>Choose a common bulk purchase scenario</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {scenarios.map(([key, scenario]) => (
                  <Button
                    key={key}
                    variant="outline"
                    size="sm"
                    onClick={() => applyScenario(key)}
                    className="text-left h-auto py-2"
                  >
                    <div>
                      <div className="font-medium text-sm">{scenario.purchaseUnit.name}s</div>
                      <div className="text-xs text-muted-foreground">
                        {scenario.purchaseUnit.quantity} {scenario.baseUnit.name}s
                      </div>
                    </div>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
          
          {/* Basic Product Information */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Product Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="product-name">Product Name *</Label>
                  <Input
                    id="product-name"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    className={errors.productName ? 'border-destructive' : ''}
                  />
                  {errors.productName && (
                    <div className="text-destructive text-sm">{errors.productName}</div>
                  )}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="batch">Batch Number *</Label>
                  <Input
                    id="batch"
                    value={batch}
                    onChange={(e) => setBatch(e.target.value)}
                    className={errors.batch ? 'border-destructive' : ''}
                  />
                  {errors.batch && (
                    <div className="text-destructive text-sm">{errors.batch}</div>
                  )}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Input
                    id="category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="supplier">Supplier</Label>
                  <Input
                    id="supplier"
                    value={supplier}
                    onChange={(e) => setSupplier(e.target.value)}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="location">Location</Label>
                  <Input
                    id="location"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="sku">SKU</Label>
                  <Input
                    id="sku"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                  />
                </div>
              </div>
              
              {/* Expiry Information */}
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="has-expiry"
                    checked={hasExpiry}
                    onChange={(e) => setHasExpiry(e.target.checked)}
                    title="Check if this item has an expiry date"
                  />
                  <Label htmlFor="has-expiry">This item has an expiry date</Label>
                </div>
                
                {hasExpiry && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="expiry">Expiry Date *</Label>
                      <Input
                        id="expiry"
                        type="date"
                        value={expiry}
                        onChange={(e) => setExpiry(e.target.value)}
                        className={errors.expiry ? 'border-destructive' : ''}
                      />
                      {errors.expiry && (
                        <div className="text-destructive text-sm">{errors.expiry}</div>
                      )}
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="expiry-alert">Alert Days Before Expiry</Label>
                      <Input
                        id="expiry-alert"
                        type="number"
                        min="1"
                        value={expiryAlertDays}
                        onChange={(e) => setExpiryAlertDays(Number(e.target.value))}
                      />
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
          
          {/* Purchase Configuration */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Bulk Purchase Configuration</CardTitle>
              <CardDescription>
                Configure how you purchase this item in bulk and the system will calculate individual unit costs
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Base Unit Configuration */}
                <div className="space-y-3">
                  <Label className="text-base font-medium">Individual Unit (What you sell)</Label>
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <Label htmlFor="base-unit-id" className="text-sm">Unit ID</Label>
                      <Input
                        id="base-unit-id"
                        value={baseUnitId}
                        onChange={(e) => setBaseUnitId(e.target.value)}
                        placeholder="e.g., bottle, tablet, piece"
                        className={errors.baseUnitId ? 'border-destructive' : ''}
                      />
                      {errors.baseUnitId && (
                        <div className="text-destructive text-sm">{errors.baseUnitId}</div>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="base-unit-name" className="text-sm">Display Name</Label>
                      <Input
                        id="base-unit-name"
                        value={baseUnitName}
                        onChange={(e) => setBaseUnitName(e.target.value)}
                        placeholder="e.g., Bottle, Tablet, Piece"
                        className={errors.baseUnitName ? 'border-destructive' : ''}
                      />
                      {errors.baseUnitName && (
                        <div className="text-destructive text-sm">{errors.baseUnitName}</div>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Purchase Unit Configuration */}
                <div className="space-y-3">
                  <Label className="text-base font-medium">Purchase Unit (How you buy)</Label>
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <Label htmlFor="purchase-unit-id" className="text-sm">Unit ID</Label>
                      <Input
                        id="purchase-unit-id"
                        value={purchaseUnitId}
                        onChange={(e) => setPurchaseUnitId(e.target.value)}
                        placeholder="e.g., box, carton, case"
                        className={errors.purchaseUnitId ? 'border-destructive' : ''}
                      />
                      {errors.purchaseUnitId && (
                        <div className="text-destructive text-sm">{errors.purchaseUnitId}</div>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="purchase-unit-name" className="text-sm">Display Name</Label>
                      <Input
                        id="purchase-unit-name"
                        value={purchaseUnitName}
                        onChange={(e) => setPurchaseUnitName(e.target.value)}
                        placeholder="e.g., Box, Carton, Case"
                        className={errors.purchaseUnitName ? 'border-destructive' : ''}
                      />
                      {errors.purchaseUnitName && (
                        <div className="text-destructive text-sm">{errors.purchaseUnitName}</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Purchase Details */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="quantity-per-unit">Units per {purchaseUnitName} *</Label>
                  <Input
                    id="quantity-per-unit"
                    type="number"
                    min="1"
                    value={quantityPerPurchaseUnit}
                    onChange={(e) => setQuantityPerPurchaseUnit(Number(e.target.value))}
                    className={errors.quantityPerPurchaseUnit ? 'border-destructive' : ''}
                  />
                  {errors.quantityPerPurchaseUnit && (
                    <div className="text-destructive text-sm">{errors.quantityPerPurchaseUnit}</div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    How many {baseUnitName.toLowerCase()}s in one {purchaseUnitName.toLowerCase()}
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="cost-per-unit">Cost per {purchaseUnitName} *</Label>
                  <Input
                    id="cost-per-unit"
                    type="number"
                    min="0"
                    step="0.01"
                    value={costPerPurchaseUnit}
                    onChange={(e) => setCostPerPurchaseUnit(Number(e.target.value))}
                    className={errors.costPerPurchaseUnit ? 'border-destructive' : ''}
                  />
                  {errors.costPerPurchaseUnit && (
                    <div className="text-destructive text-sm">{errors.costPerPurchaseUnit}</div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    What you pay for one {purchaseUnitName.toLowerCase()}
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="purchase-quantity">Quantity Purchased *</Label>
                  <Input
                    id="purchase-quantity"
                    type="number"
                    min="1"
                    value={purchaseQuantity}
                    onChange={(e) => setPurchaseQuantity(Number(e.target.value))}
                    className={errors.purchaseQuantity ? 'border-destructive' : ''}
                  />
                  {errors.purchaseQuantity && (
                    <div className="text-destructive text-sm">{errors.purchaseQuantity}</div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    How many {purchaseUnitName.toLowerCase()}s you're adding
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* Sales Pricing Configuration */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Sales Pricing</CardTitle>
              <CardDescription>
                Configure markup and pricing strategy for sales
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="markup">Markup Percentage *</Label>
                  <Input
                    id="markup"
                    type="number"
                    min="0"
                    step="0.1"
                    value={markupPercentage}
                    onChange={(e) => setMarkupPercentage(Number(e.target.value))}
                    className={errors.markupPercentage ? 'border-destructive' : ''}
                  />
                  {errors.markupPercentage && (
                    <div className="text-destructive text-sm">{errors.markupPercentage}</div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    Percentage markup over cost price
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="min-price">Minimum Selling Price (Optional)</Label>
                  <Input
                    id="min-price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={minimumSellingPrice === '' ? '' : minimumSellingPrice}
                    onChange={(e) => setMinimumSellingPrice(e.target.value === '' ? '' : Number(e.target.value))}
                  />
                  <div className="text-xs text-muted-foreground">
                    Minimum price per {baseUnitName.toLowerCase()} regardless of markup
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* Calculations Summary */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Cost & Price Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-base font-medium">Cost Analysis</Label>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>Cost per {baseUnitName}:</span>
                      <Badge variant="outline">{formatCurrency(costPerBaseUnit)}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>Total units received:</span>
                      <Badge variant="outline">{totalBaseUnits} {baseUnitName.toLowerCase()}s</Badge>
                    </div>
                    <div className="flex justify-between font-medium">
                      <span>Total purchase cost:</span>
                      <Badge>{formatCurrency(totalCost)}</Badge>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label className="text-base font-medium">Selling Prices</Label>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>Per {baseUnitName}:</span>
                      <Badge variant="secondary">{formatCurrency(sellingPricePerUnit)}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>Per {purchaseUnitName}:</span>
                      <Badge variant="secondary">{formatCurrency(sellingPricePerBulk)}</Badge>
                    </div>
                    <div className="flex justify-between font-medium text-green-700">
                      <span>Profit per {baseUnitName}:</span>
                      <Badge className="bg-green-100 text-green-800">
                        {formatCurrency(sellingPricePerUnit - costPerBaseUnit)}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
              
              <Separator />
              
              <div className="text-sm text-muted-foreground">
                <strong>Purchase Breakdown:</strong> {formatCostBreakdown({
                  purchaseUnitName,
                  costPerPurchaseUnit,
                  quantityPerPurchaseUnit,
                  costPerBaseUnit
                } as any)}
              </div>
            </CardContent>
          </Card>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>
            {editingItem ? 'Update Item' : 'Add to Inventory'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BulkPurchaseForm;

