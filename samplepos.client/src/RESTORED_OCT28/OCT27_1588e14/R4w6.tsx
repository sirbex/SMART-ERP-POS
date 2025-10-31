/**
 * QUICK START: Integrating UoM into POSScreenAPI.tsx
 * 
 * Copy these code snippets to add UoM support to your POS screen.
 * Replace the placeholders with your actual variable names.
 */

// ============================================================
// 1. ADD IMPORTS AT TOP OF FILE
// ============================================================

import UoMSelect from './UoMSelect';
import type { ProductWithUoMs } from '../types';
import { 
  calculatePriceForUoM, 
  getDefaultUoM, 
  hasUoMSystem 
} from '../utils/uomUtils';


// ============================================================
// 2. UPDATE PRODUCT FETCH TO INCLUDE UoMs
// ============================================================

// FIND: api.get('/products?limit=1000')
// REPLACE WITH:
api.get('/products?limit=1000&includeUoMs=true')

// FIND: const items: InventoryItem[] = productsData
// REPLACE WITH:
const items: ProductWithUoMs[] = productsData
  .filter((item: any) => item.isActive !== false)
  .map((item: any) => ({
    id: item.id.toString(),
    name: item.name,
    // ... existing fields ...
    productUoMs: item.productUoMs || []  // ADD THIS LINE
  }));


// ============================================================
// 3. UPDATE addToCart FUNCTION
// ============================================================

const addToCart = async (item: ProductWithUoMs) => {  // Change type here
  try {
    const stockCheck = await POSServiceAPI.checkStock(item.id?.toString() || '', 1);
    
    if (!stockCheck.success) {
      toast({
        title: "Insufficient Stock",
        description: stockCheck.message || `Only ${stockCheck.available} available.`,
        variant: "destructive",
      });
      return;
    }
    
    const existingItemIndex = cartItems.findIndex(cartItem => cartItem.productId === item.id);
    
    if (existingItemIndex >= 0) {
      // Item already in cart, increase quantity
      const updatedCart = [...cartItems];
      updatedCart[existingItemIndex].quantity += 1;
      setCartItems(updatedCart);
    } else {
      // ADD THIS BLOCK - Handle UoM for new items
      const hasUoM = hasUoMSystem(item);
      let defaultUomId: string | null = null;
      let unitPrice = item.basePrice || 0;
      let actualUnit = 'base';
      
      if (hasUoM) {
        defaultUomId = getDefaultUoM(item);
        if (defaultUomId) {
          const priceCalc = calculatePriceForUoM(
            item.basePrice || 0,
            1,
            defaultUomId,
            item
          );
          unitPrice = priceCalc.unitPrice;
          const uomData = item.productUoMs?.find(pu => pu.uomId === defaultUomId);
          actualUnit = uomData?.uom?.abbreviation?.toLowerCase() || 'base';
        }
      }
      
      // Create cart item
      const newItem: TransactionItem = {
        id: `${item.id}-${Date.now()}`,  // Unique ID for cart tracking
        productId: item.id,
        name: item.name || '',
        price: unitPrice,
        quantity: 1,
        unit: actualUnit,
        unitPrice: unitPrice,
        subtotal: unitPrice,
        uomId: defaultUomId || undefined  // ADD THIS FIELD
      };
      setCartItems([...cartItems, newItem]);
    }
    
    // Clear search after adding item
    setSearchTerm('');
    if (searchInputRef.current) {
      searchInputRef.current.value = '';
      searchInputRef.current.focus();
    }
  } catch (error) {
    console.error("Error adding item to cart:", error);
    toast({
      title: "Error",
      description: "Could not add item to cart. Please try again.",
      variant: "destructive",
    });
  }
};


// ============================================================
// 4. ADD handleUoMChange FUNCTION (Add after removeFromCart)
// ============================================================

const handleUoMChange = (cartItemIndex: number, newUomId: string) => {
  const cartItem = cartItems[cartItemIndex];
  const product = inventoryItems.find(p => p.id === cartItem.productId) as ProductWithUoMs;
  
  if (!product || !hasUoMSystem(product)) {
    return;
  }
  
  try {
    // Calculate new price based on selected UoM
    const priceCalc = calculatePriceForUoM(
      product.basePrice || 0,
      cartItem.quantity,
      newUomId,
      product
    );
    
    // Get UoM details
    const productUoM = product.productUoMs?.find(pu => pu.uomId === newUomId);
    const unitAbbr = productUoM?.uom?.abbreviation?.toLowerCase() || 'base';
    
    // Update cart item with new UoM pricing
    const updatedCart = [...cartItems];
    updatedCart[cartItemIndex] = {
      ...updatedCart[cartItemIndex],
      price: priceCalc.unitPrice,
      unitPrice: priceCalc.unitPrice,
      subtotal: priceCalc.total,
      unit: unitAbbr,
      uomId: newUomId
    };
    setCartItems(updatedCart);
    
    toast({
      title: "Unit Updated",
      description: `Price updated to ${formatCurrency(priceCalc.unitPrice)} per ${unitAbbr}`,
    });
  } catch (error) {
    console.error("Error changing UoM:", error);
    toast({
      title: "Error",
      description: "Could not change unit of measure.",
      variant: "destructive",
    });
  }
};


// ============================================================
// 5. UPDATE CART ITEM RENDERING
// ============================================================

// FIND: Your cart items map function
// REPLACE cartItems.map((item, index) => (
//   <div key={item.id} className="...">
// WITH:

{cartItems.map((item, index) => {
  // Get product for UoM options
  const product = inventoryItems.find(p => p.id === item.productId) as ProductWithUoMs;
  
  return (
    <div key={item.id} className="border border-gray-200 rounded-md hover:border-blue-300 transition-colors bg-white">
      {/* Main row with product info and controls */}
      <div className="flex items-center justify-between p-3">
        <div className="flex-1 mr-3">
          <p className="font-medium text-gray-900 text-sm">{item.name}</p>
          <p className="text-xs text-gray-500">
            {formatCurrency(item.price || 0)} per {item.unit}
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Quantity controls */}
          <div className="flex items-center gap-1">
            <Button 
              size="icon" 
              variant="outline" 
              className="h-7 w-7"
              onClick={() => updateQuantity(index, item.quantity - 1)}
            >
              <Minus className="h-3 w-3" />
            </Button>
            <Input
              className="w-14 h-8 text-center text-sm"
              value={item.quantity}
              onChange={(e) => updateQuantity(index, parseInt(e.target.value) || 1)}
            />
            <Button 
              size="icon" 
              variant="outline" 
              className="h-7 w-7"
              onClick={() => updateQuantity(index, item.quantity + 1)}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
          
          {/* Total */}
          <div className="w-20 text-right font-semibold text-sm">
            {formatCurrency((item.price || 0) * item.quantity)}
          </div>
          
          {/* Remove */}
          <Button 
            size="icon" 
            variant="ghost" 
            className="h-7 w-7 text-red-600"
            onClick={() => removeFromCart(index)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {/* UoM Selector (ADD THIS ENTIRE SECTION) */}
      {product && hasUoMSystem(product) && (
        <div className="px-3 pb-3 pt-0 border-t border-gray-100">
          <div className="flex items-center gap-2 mt-2">
            <Label className="text-xs text-gray-600 whitespace-nowrap min-w-[35px]">
              Unit:
            </Label>
            <UoMSelect
              product={product}
              value={item.uomId}
              onChange={(newUomId) => handleUoMChange(index, newUomId)}
              size="sm"
              className="flex-1"
            />
          </div>
        </div>
      )}
    </div>
  );
})}


// ============================================================
// 6. BACKEND INTEGRATION (Already Done!)
// ============================================================

// The backend /api/sales endpoint already handles uomId field.
// No changes needed - it will automatically:
// 1. Convert quantity to base units using the selected UoM
// 2. Apply correct pricing based on UoM
// 3. Deduct inventory in base units
// 4. Store transaction with UoM information

// Your existing processPayment function should work as-is!


// ============================================================
// THAT'S IT! 🎉
// ============================================================

// Your POS system now supports:
// ✅ Multiple units per product
// ✅ Automatic price calculation
// ✅ Dynamic unit switching
// ✅ Backward compatibility with non-UoM products
// ✅ Proper inventory tracking in base units

// Next steps:
// 1. Create test products with UoMs via API (see UoMSelect.md)
// 2. Test adding products to cart
// 3. Test changing units
// 4. Complete a sale and verify inventory deduction
