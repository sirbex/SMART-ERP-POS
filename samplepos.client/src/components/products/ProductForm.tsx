// Reusable Product Form used across ProductsPage and ManualGRModal

export interface ProductFormValues {
  name: string;
  sku: string;
  barcode: string;
  description: string;
  category: string;
  genericName: string;
  costPrice: string;
  sellingPrice: string;
  costingMethod: string; // 'FIFO' | 'AVCO' | 'STANDARD'
  isTaxable: boolean;
  taxRate: string;
  pricingFormula: string;
  autoUpdatePrice: boolean;
  reorderLevel: string;
  trackExpiry: boolean;
  minDaysBeforeExpirySale: string;
  isActive: boolean;
}

export type ProductFormField = keyof ProductFormValues;

export interface ProductFormProps {
  values: ProductFormValues;
  onChange: (field: ProductFormField, value: string | boolean) => void;
  validationErrors?: Partial<Record<ProductFormField, string>>;
  disabled?: boolean;
}

export default function ProductForm({ values, onChange, validationErrors = {}, disabled = false }: ProductFormProps) {
  return (
    <div className="space-y-4">
      {/* Basic Information */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label htmlFor="product-name" className="block text-sm font-medium text-gray-700 mb-1">
            Product Name <span className="text-red-500">*</span>
          </label>
          <input
            id="product-name"
            type="text"
            value={values.name}
            onChange={(e) => onChange("name", e.target.value)}
            disabled={disabled}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${validationErrors.name ? "border-red-500" : "border-gray-300"
              }`}
            placeholder="Enter product name"
          />
          {validationErrors.name && (
            <p className="text-sm text-red-600 mt-1">{validationErrors.name}</p>
          )}
        </div>

        <div>
          <label htmlFor="product-sku" className="block text-sm font-medium text-gray-700 mb-1">
            SKU <span className="text-red-500">*</span>
          </label>
          <input
            id="product-sku"
            type="text"
            value={values.sku}
            onChange={(e) => onChange("sku", e.target.value)}
            disabled={disabled}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${validationErrors.sku ? "border-red-500" : "border-gray-300"
              }`}
            placeholder="PRD-XXX"
          />
          {validationErrors.sku && (
            <p className="text-sm text-red-600 mt-1">{validationErrors.sku}</p>
          )}
        </div>

        <div>
          <label htmlFor="product-barcode" className="block text-sm font-medium text-gray-700 mb-1">
            Barcode
          </label>
          <input
            id="product-barcode"
            type="text"
            value={values.barcode}
            onChange={(e) => onChange("barcode", e.target.value)}
            disabled={disabled}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Optional barcode"
          />
        </div>

        <div>
          <label htmlFor="product-category" className="block text-sm font-medium text-gray-700 mb-1">
            Category
          </label>
          <input
            id="product-category"
            type="text"
            value={values.category}
            onChange={(e) => onChange("category", e.target.value)}
            disabled={disabled}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="e.g., Electronics, Beverages"
          />
        </div>

        <div>
          <label htmlFor="generic-name" className="block text-sm font-medium text-gray-700 mb-1">
            Generic Name
          </label>
          <input
            id="generic-name"
            type="text"
            value={values.genericName}
            onChange={(e) => onChange("genericName", e.target.value)}
            disabled={disabled}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="e.g., Amoxicillin, Paracetamol"
          />
          <p className="text-xs text-gray-500 mt-1">Common/generic drug name for search grouping</p>
        </div>

        <div className="md:col-span-2">
          <label htmlFor="product-description" className="block text-sm font-medium text-gray-700 mb-1">
            Description
          </label>
          <textarea
            id="product-description"
            value={values.description}
            onChange={(e) => onChange("description", e.target.value)}
            disabled={disabled}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Optional description"
          />
        </div>
      </div>

      {/* Pricing Information */}
      <div className="border-t pt-4">
        <h4 className="font-medium text-gray-900 mb-3">Pricing Information</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="cost-price" className="block text-sm font-medium text-gray-700 mb-1">
              Cost Price <span className="text-red-500">*</span>
            </label>
            <input
              id="cost-price"
              type="number"
              step="0.01"
              value={values.costPrice}
              onChange={(e) => onChange("costPrice", e.target.value)}
              disabled={disabled}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="0.00"
            />
          </div>

          <div>
            <label htmlFor="selling-price" className="block text-sm font-medium text-gray-700 mb-1">
              Selling Price <span className="text-red-500">*</span>
            </label>
            <input
              id="selling-price"
              type="number"
              step="0.01"
              value={values.sellingPrice}
              onChange={(e) => onChange("sellingPrice", e.target.value)}
              disabled={disabled}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${validationErrors.sellingPrice ? "border-red-500" : "border-gray-300"
                }`}
              placeholder="0.00"
            />
            {validationErrors.sellingPrice && (
              <p className="text-sm text-red-600 mt-1">{validationErrors.sellingPrice}</p>
            )}
          </div>

          <div>
            <label htmlFor="costing-method" className="block text-sm font-medium text-gray-700 mb-1">
              Costing Method
            </label>
            <select
              id="costing-method"
              value={values.costingMethod}
              onChange={(e) => onChange("costingMethod", e.target.value)}
              disabled={disabled}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="FIFO">FIFO (First In, First Out)</option>
              <option value="AVCO">AVCO (Average Cost)</option>
              <option value="STANDARD">Standard Cost</option>
            </select>
          </div>
        </div>

        {/* Tax Section */}
        <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <div className="flex items-start gap-3 mb-3">
            <input
              id="is-taxable"
              type="checkbox"
              checked={values.isTaxable}
              onChange={(e) => onChange("isTaxable", e.target.checked)}
              disabled={disabled}
              className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <div className="flex-1">
              <label htmlFor="is-taxable" className="text-sm font-medium text-gray-700 block">
                Taxable Product
              </label>
              <p className="text-xs text-gray-500 mt-0.5">
                When checked, tax will be calculated and applied to this product at the point of sale
              </p>
            </div>
          </div>

          {values.isTaxable && (
            <div>
              <label htmlFor="tax-rate" className="block text-sm font-medium text-gray-700 mb-1">
                Tax Rate (%) <span className="text-red-500">*</span>
              </label>
              <input
                id="tax-rate"
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={values.taxRate}
                onChange={(e) => onChange("taxRate", e.target.value)}
                disabled={disabled}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${validationErrors.taxRate ? "border-red-500" : "border-gray-300"
                  }`}
                placeholder="18"
              />
              {validationErrors.taxRate && (
                <p className="text-sm text-red-600 mt-1">{validationErrors.taxRate}</p>
              )}
              <p className="text-xs text-gray-500 mt-1">
                This tax rate will be applied to the selling price during sales
              </p>
            </div>
          )}
        </div>

        {/* Pricing Formula & Auto-Update */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div>
            <label htmlFor="pricing-formula" className="block text-sm font-medium text-gray-700 mb-1">
              Pricing Formula (optional)
            </label>
            <input
              id="pricing-formula"
              type="text"
              value={values.pricingFormula}
              onChange={(e) => onChange("pricingFormula", e.target.value)}
              disabled={disabled}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g., cost * 1.20"
            />
            <p className="text-xs text-gray-500 mt-1">Formula to auto-calculate selling price</p>
          </div>

          <div className="flex items-start gap-2 pt-6">
            <input
              id="auto-update-price"
              type="checkbox"
              checked={values.autoUpdatePrice}
              onChange={(e) => onChange("autoUpdatePrice", e.target.checked)}
              disabled={disabled}
              className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <div>
              <label htmlFor="auto-update-price" className="text-sm font-medium text-gray-700">
                Auto-Update Price
              </label>
              <p className="text-xs text-gray-500">Automatically update selling price when cost changes</p>
            </div>
          </div>
        </div>
      </div>

      {/* Stock Levels */}
      <div className="border-t pt-4">
        <h4 className="font-medium text-gray-900 mb-3">Stock Level Settings</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="reorder-level" className="block text-sm font-medium text-gray-700 mb-1">
              Reorder Level
            </label>
            <input
              id="reorder-level"
              type="number"
              step="0.01"
              value={values.reorderLevel}
              onChange={(e) => onChange("reorderLevel", e.target.value)}
              disabled={disabled}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="10"
            />
          </div>

          <div className="flex items-start gap-2 pt-6">
            <input
              id="track-expiry"
              type="checkbox"
              checked={values.trackExpiry}
              onChange={(e) => onChange("trackExpiry", e.target.checked)}
              disabled={disabled}
              className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <div>
              <label htmlFor="track-expiry" className="text-sm font-medium text-gray-700">
                Track Expiry Date (perishables)
              </label>
              <p className="text-xs text-gray-500">
                When enabled, this product will require expiry during receiving and FEFO will be used for allocations.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2 pt-6">
            <input
              id="is-active"
              type="checkbox"
              checked={values.isActive}
              onChange={(e) => onChange("isActive", e.target.checked)}
              disabled={disabled}
              className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <div>
              <label htmlFor="is-active" className="text-sm font-medium text-gray-700">
                Active Product
              </label>
              <p className="text-xs text-gray-500">Inactive products won't appear in sales or inventory operations</p>
            </div>
          </div>
        </div>

        {/* Expiry Enforcement (shown when Track Expiry is enabled) */}
        {values.trackExpiry && (
          <div className="mt-4 p-4 bg-amber-50 rounded-lg border border-amber-200">
            <label htmlFor="min-days-expiry" className="block text-sm font-medium text-gray-700 mb-1">
              Minimum Days Before Expiry to Allow Sale
            </label>
            <input
              id="min-days-expiry"
              type="number"
              min="0"
              step="1"
              value={values.minDaysBeforeExpirySale}
              onChange={(e) => onChange("minDaysBeforeExpirySale", e.target.value)}
              disabled={disabled}
              className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="90"
            />
            <p className="text-xs text-gray-500 mt-1">
              Batches expiring within this many days cannot be sold (NDA compliance). Set to 0 to disable.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
