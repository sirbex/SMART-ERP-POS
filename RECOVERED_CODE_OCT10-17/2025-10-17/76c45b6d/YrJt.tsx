import { useState } from 'react';
import { 
  Search, 
  Plus, 
  Minus, 
  Trash2, 
  User, 
  CreditCard, 
  DollarSign,
  Printer,
  Save,
  X
} from 'lucide-react';
import { MainLayout } from '../layout/MainLayout';

interface CartItem {
  id: string;
  name: string;
  sku: string;
  price: number;
  quantity: number;
  unit: string;
}

export const SalesRegisterPage = () => {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);

  // Calculate totals
  const subtotal = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const tax = subtotal * 0.10; // 10% tax
  const total = subtotal + tax;

  const addToCart = (product: CartItem) => {
    const existing = cartItems.find(item => item.id === product.id);
    if (existing) {
      setCartItems(cartItems.map(item =>
        item.id === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      setCartItems([...cartItems, { ...product, quantity: 1 }]);
    }
  };

  const updateQuantity = (id: string, delta: number) => {
    setCartItems(cartItems.map(item =>
      item.id === id
        ? { ...item, quantity: Math.max(1, item.quantity + delta) }
        : item
    ).filter(item => item.quantity > 0));
  };

  const removeItem = (id: string) => {
    setCartItems(cartItems.filter(item => item.id !== id));
  };

  const clearCart = () => {
    setCartItems([]);
  };

  return (
    <MainLayout>
      <div className="space-y-4">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">Sales Register</h1>
            <p className="text-slate-600 mt-1">Scan or search for items to add to the sale</p>
          </div>
          <div className="flex space-x-3">
            <button className="flex items-center space-x-2 px-4 py-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
              <Save className="w-4 h-4" />
              <span className="font-medium">Hold Sale</span>
            </button>
            <button className="flex items-center space-x-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors">
              <X className="w-4 h-4" />
              <span className="font-medium">Clear</span>
            </button>
          </div>
        </div>

        {/* Main POS Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Item Selection & Cart */}
          <div className="lg:col-span-2 space-y-4">
            {/* Search & Customer */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Item Search */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                <label className="text-sm font-medium text-slate-700 mb-2 block">
                  Search Items
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Scan barcode or search by name, SKU..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Customer Selector */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                <label className="text-sm font-medium text-slate-700 mb-2 block">
                  Customer
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <select
                    value={selectedCustomer || ''}
                    onChange={(e) => setSelectedCustomer(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent appearance-none"
                  >
                    <option value="">Walk-in Customer</option>
                    <option value="1">John Doe</option>
                    <option value="2">Jane Smith</option>
                    <option value="3">Acme Corporation</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Cart Items */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200">
              <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 rounded-t-xl">
                <h2 className="text-lg font-semibold text-slate-800">Items in Cart</h2>
              </div>
              
              <div className="divide-y divide-slate-200">
                {cartItems.length === 0 ? (
                  <div className="px-6 py-12 text-center text-slate-500">
                    <p className="text-lg">No items in cart</p>
                    <p className="text-sm mt-2">Scan or search to add items</p>
                  </div>
                ) : (
                  <>
                    {/* Cart Header */}
                    <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3 bg-slate-50 text-sm font-medium text-slate-600">
                      <div className="col-span-5">Item</div>
                      <div className="col-span-2 text-center">Qty</div>
                      <div className="col-span-2 text-right">Price</div>
                      <div className="col-span-2 text-right">Subtotal</div>
                      <div className="col-span-1"></div>
                    </div>

                    {/* Cart Items */}
                    {cartItems.map((item) => (
                      <div
                        key={item.id}
                        className="grid grid-cols-1 md:grid-cols-12 gap-4 px-6 py-4 hover:bg-slate-50 transition-colors"
                      >
                        <div className="md:col-span-5">
                          <p className="font-medium text-slate-800">{item.name}</p>
                          <p className="text-sm text-slate-500">SKU: {item.sku}</p>
                        </div>
                        
                        <div className="md:col-span-2 flex items-center justify-center space-x-2">
                          <button
                            onClick={() => updateQuantity(item.id, -1)}
                            className="p-1 rounded bg-slate-100 hover:bg-slate-200 transition-colors"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <span className="w-12 text-center font-semibold">{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.id, 1)}
                            className="p-1 rounded bg-slate-100 hover:bg-slate-200 transition-colors"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                        
                        <div className="md:col-span-2 text-right font-medium">
                          ${item.price.toFixed(2)}
                          <span className="text-sm text-slate-500 ml-1">/ {item.unit}</span>
                        </div>
                        
                        <div className="md:col-span-2 text-right font-bold text-slate-800">
                          ${(item.price * item.quantity).toFixed(2)}
                        </div>
                        
                        <div className="md:col-span-1 flex items-center justify-end">
                          <button
                            onClick={() => removeItem(item.id)}
                            className="p-2 text-red-500 hover:bg-red-50 rounded transition-colors"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Right: Total Panel */}
          <div className="space-y-4">
            {/* Summary */}
            <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 bg-gradient-to-r from-teal-500 to-teal-600 text-white">
                <h2 className="text-lg font-semibold">Order Summary</h2>
              </div>

              <div className="px-6 py-4 space-y-4">
                {/* Subtotal */}
                <div className="flex justify-between text-slate-700">
                  <span>Subtotal</span>
                  <span className="font-semibold">${subtotal.toFixed(2)}</span>
                </div>

                {/* Tax */}
                <div className="flex justify-between text-slate-700">
                  <span>Tax (10%)</span>
                  <span className="font-semibold">${tax.toFixed(2)}</span>
                </div>

                {/* Divider */}
                <div className="border-t border-slate-200"></div>

                {/* Total */}
                <div className="flex justify-between items-center">
                  <span className="text-xl font-bold text-slate-800">Total</span>
                  <span className="text-3xl font-bold text-teal-600">${total.toFixed(2)}</span>
                </div>
              </div>

              {/* Payment Actions */}
              <div className="px-6 py-4 bg-slate-50 space-y-3 border-t border-slate-200">
                <button className="w-full flex items-center justify-center space-x-2 px-6 py-4 bg-gradient-to-r from-teal-500 to-teal-600 text-white rounded-lg hover:from-teal-600 hover:to-teal-700 shadow-md transition-all font-semibold">
                  <DollarSign className="w-5 h-5" />
                  <span>Pay Cash</span>
                </button>

                <button className="w-full flex items-center justify-center space-x-2 px-6 py-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 shadow-md transition-all font-semibold">
                  <CreditCard className="w-5 h-5" />
                  <span>Pay Card</span>
                </button>

                <button className="w-full flex items-center justify-center space-x-2 px-6 py-3 bg-white border-2 border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium">
                  <Printer className="w-5 h-5" />
                  <span>Print Receipt</span>
                </button>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <h3 className="font-semibold text-slate-800 mb-3">Quick Actions</h3>
              <div className="space-y-2">
                <button className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
                  Apply Discount
                </button>
                <button className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
                  Add Note
                </button>
                <button className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
                  View Held Sales
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};
