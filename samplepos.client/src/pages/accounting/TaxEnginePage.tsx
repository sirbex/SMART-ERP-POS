import { useEffect, useRef, useState } from 'react';
import { useTaxDefinitions } from '../../hooks/useAccountingModules';
import { api, getErrorMessage } from '../../utils/api';
import { Receipt, Calculator, Loader2, Link2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useHasPermission } from '../../authorization/useAuthorization';
import { refreshTaxSnapshot } from '../../services/offlineCatalogService';

interface TaxDef {
  id: string;
  code: string;
  name: string;
  type: string;
  rate: number;
  isInclusive: boolean;
  isCompound: boolean;
  sequence: number;
  scope: string;
}

interface TaxLineResult {
  taxCode: string;
  taxName: string;
  baseAmount?: number;
  taxAmount?: number;
  /** Legacy aliases — prefer baseAmount / taxAmount */
  base?: number;
  amount?: number;
  accountCode: string;
}

interface TaxResult {
  untaxedAmount?: number;
  totalTax?: number;
  totalAmount?: number;
  taxLines?: TaxLineResult[];
}

interface ProductHit {
  id: string;
  name: string;
  sku?: string;
  isTaxable?: boolean;
  taxRate?: number;
}

function fmt(n: number | undefined | null): string {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2 });
}

function normalizeTaxList(data: unknown): TaxDef[] {
  const rows = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { taxes?: unknown }).taxes)
      ? (data as { taxes: unknown[] }).taxes
      : [];
  return rows.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id ?? ''),
      code: String(r.code ?? ''),
      name: String(r.name ?? ''),
      type: String(r.type ?? ''),
      rate: Number(r.rate ?? 0),
      isInclusive: Boolean(r.isInclusive ?? r.is_inclusive),
      isCompound: Boolean(r.isCompound ?? r.is_compound),
      sequence: Number(r.sequence ?? 0),
      scope: String(r.scope ?? ''),
    };
  });
}

export default function TaxEnginePage() {
  const [tab, setTab] = useState<'definitions' | 'calculator' | 'mappings'>('definitions');
  const { data, isLoading } = useTaxDefinitions();
  const taxList = normalizeTaxList(data);
  /** DocumentTax SALE determination only applies SALE/BOTH mappings */
  const saleMappingTaxList = taxList.filter(
    (t) => t.scope === 'SALE' || t.scope === 'BOTH' || !t.scope,
  );
  const canManageMappings = useHasPermission('accounting.manage');

  // Calculator state
  const [unitPrice, setUnitPrice] = useState('1000');
  const [quantity, setQuantity] = useState('1');
  const [selectedTaxIds, setSelectedTaxIds] = useState<Set<string>>(new Set());
  const [computeResult, setComputeResult] = useState<TaxResult | null>(null);
  const [computing, setComputing] = useState(false);

  // Product mappings state
  const [productQuery, setProductQuery] = useState('');
  const [productHits, setProductHits] = useState<ProductHit[]>([]);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductHit | null>(null);
  const [mappingTaxIds, setMappingTaxIds] = useState<Set<string>>(new Set());
  const [loadingMappings, setLoadingMappings] = useState(false);
  const [savingMappings, setSavingMappings] = useState(false);
  const mappingLoadSeq = useRef(0);

  const toggleTax = (id: string) => {
    setSelectedTaxIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleMappingTax = (id: string) => {
    setMappingTaxIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    if (tab !== 'mappings' || productQuery.trim().length < 2) {
      setProductHits([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setSearchingProducts(true);
      try {
        const res = await api.products.list({ search: productQuery.trim(), limit: 15 });
        const raw = res.data?.data;
        const rows = Array.isArray(raw)
          ? raw
          : raw && typeof raw === 'object' && Array.isArray((raw as { products?: unknown }).products)
            ? (raw as { products: unknown[] }).products
            : [];
        if (!cancelled) {
          setProductHits(
            rows.map((row) => {
              const r = row as Record<string, unknown>;
              return {
                id: String(r.id ?? ''),
                name: String(r.name ?? r.productName ?? ''),
                sku: r.sku != null ? String(r.sku) : undefined,
                isTaxable: Boolean(r.isTaxable ?? r.is_taxable),
                taxRate: Number(r.taxRate ?? r.tax_rate ?? 0),
              };
            }),
          );
        }
      } catch (err) {
        if (!cancelled) toast.error(getErrorMessage(err));
      } finally {
        if (!cancelled) setSearchingProducts(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [productQuery, tab]);

  const selectProductForMappings = async (product: ProductHit) => {
    const seq = ++mappingLoadSeq.current;
    setSelectedProduct(product);
    setProductQuery(product.name);
    setProductHits([]);
    setLoadingMappings(true);
    try {
      const res = await api.enterprise.productTaxMappings(product.id);
      if (seq !== mappingLoadSeq.current) return;
      const taxes = normalizeTaxList(
        (res.data?.data as { taxes?: unknown })?.taxes ?? res.data?.data,
      );
      setMappingTaxIds(new Set(taxes.map((t) => t.id).filter(Boolean)));
    } catch (err) {
      if (seq !== mappingLoadSeq.current) return;
      toast.error(getErrorMessage(err));
      setMappingTaxIds(new Set());
    } finally {
      if (seq === mappingLoadSeq.current) setLoadingMappings(false);
    }
  };

  const handleSaveMappings = async () => {
    if (!selectedProduct) {
      toast.error('Select a product first');
      return;
    }
    if (!canManageMappings) {
      toast.error('Missing permission: accounting.manage');
      return;
    }
    setSavingMappings(true);
    try {
      const res = await api.enterprise.setProductTaxMappings(
        selectedProduct.id,
        Array.from(mappingTaxIds),
      );
      const payload = res.data?.data as
        | { taxes?: unknown; offlineSnapshotHint?: string }
        | undefined;
      if (payload?.taxes) {
        const taxes = normalizeTaxList(payload.taxes);
        setMappingTaxIds(new Set(taxes.map((t) => t.id).filter(Boolean)));
      }
      try {
        await refreshTaxSnapshot();
      } catch {
        /* non-fatal — toast already covers save success */
      }
      toast.success(
        'Product tax mappings saved. Offline tax snapshot refreshed for POS preview.',
      );
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSavingMappings(false);
    }
  };

  const handleCompute = async () => {
    if (selectedTaxIds.size === 0) {
      toast.error('Select at least one tax');
      return;
    }
    setComputing(true);
    try {
      const res = await api.enterprise.computeTaxes({
        unitPrice: parseFloat(unitPrice),
        quantity: parseFloat(quantity),
        taxIds: Array.from(selectedTaxIds),
      });
      setComputeResult((res.data?.data as TaxResult) ?? null);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setComputing(false);
    }
  };

  const taxLines = Array.isArray(computeResult?.taxLines) ? computeResult.taxLines : [];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Receipt className="h-6 w-6 text-blue-600" />
          Tax Engine
        </h1>
        <p className="text-gray-500 mt-1">
          Tax definitions, calculator, and product tax mappings (DocumentTax)
        </p>
      </div>

      <div className="border-b flex gap-1">
        {[
          { key: 'definitions' as const, label: 'Tax Definitions', icon: Receipt },
          { key: 'calculator' as const, label: 'Tax Calculator', icon: Calculator },
          { key: 'mappings' as const, label: 'Product Mappings', icon: Link2 },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === t.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
            data-tax-engine-tab={t.key}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'definitions' && (
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Rate</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Inclusive</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Compound</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Scope</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Seq</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-blue-500" />
                  </td>
                </tr>
              ) : taxList.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                    No tax definitions found. Run the migration to seed defaults.
                  </td>
                </tr>
              ) : (
                taxList.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-mono font-medium text-gray-900">{t.code}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{t.name}</td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          t.type === 'PERCENTAGE'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-purple-100 text-purple-800'
                        }`}
                      >
                        {t.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-right tabular-nums">{t.rate}%</td>
                    <td className="px-6 py-4 text-center">{t.isInclusive ? '✓' : ''}</td>
                    <td className="px-6 py-4 text-center">{t.isCompound ? '✓' : ''}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{t.scope}</td>
                    <td className="px-6 py-4 text-sm text-right text-gray-500">{t.sequence}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'calculator' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow p-6 space-y-4">
            <h3 className="font-semibold text-gray-900">Input</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit Price</label>
              <input
                type="number"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Applicable Taxes</label>
              <div className="space-y-2">
                {taxList.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedTaxIds.has(t.id)}
                      onChange={() => toggleTax(t.id)}
                      className="rounded border-gray-300"
                    />
                    {t.name} ({t.rate}%)
                    {t.isInclusive && <span className="text-xs text-gray-400">(incl.)</span>}
                  </label>
                ))}
              </div>
            </div>
            <button
              onClick={handleCompute}
              disabled={computing}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {computing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
              Compute Taxes
            </button>
          </div>

          <div className="bg-white rounded-lg shadow p-6 space-y-4">
            <h3 className="font-semibold text-gray-900">Result</h3>
            {computeResult ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3 bg-gray-50 rounded">
                    <p className="text-xs text-gray-500 uppercase">Untaxed Amount</p>
                    <p className="text-lg font-semibold">{fmt(computeResult.untaxedAmount)}</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded">
                    <p className="text-xs text-gray-500 uppercase">Total Tax</p>
                    <p className="text-lg font-semibold text-red-600">{fmt(computeResult.totalTax)}</p>
                  </div>
                  <div className="col-span-2 p-3 bg-blue-50 rounded">
                    <p className="text-xs text-blue-600 uppercase">Total Amount (incl. tax)</p>
                    <p className="text-2xl font-bold text-blue-900">{fmt(computeResult.totalAmount)}</p>
                  </div>
                </div>
                {taxLines.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">Tax Breakdown</p>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-gray-500 text-xs">
                          <th className="text-left py-1">Tax</th>
                          <th className="text-right py-1">Base</th>
                          <th className="text-right py-1">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {taxLines.map((tl, i) => (
                          <tr key={i} className="border-t">
                            <td className="py-1">
                              {tl.taxName} ({tl.taxCode})
                            </td>
                            <td className="py-1 text-right tabular-nums">
                              {fmt(tl.baseAmount ?? tl.base)}
                            </td>
                            <td className="py-1 text-right tabular-nums font-medium">
                              {fmt(tl.taxAmount ?? tl.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center text-gray-400 py-12">
                <Calculator className="h-10 w-10 mx-auto mb-2" />
                Select taxes and click Compute.
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'mappings' && (
        <div className="bg-white rounded-lg shadow p-6 space-y-4" data-tax-mappings-panel="true">
          <div>
            <h3 className="font-semibold text-gray-900">Product tax mappings</h3>
            <p className="text-sm text-gray-500 mt-1">
              Raw mappings for DocumentTax SALE determination (SALE/BOTH only). Mapped definitions
              win over product bridge (is_taxable / tax_rate). Empty mappings keep the bridge.
              This is not the final charged tax (customer exemption / overrides still apply).
            </p>
          </div>

          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">Search product</label>
            <input
              type="search"
              value={productQuery}
              onChange={(e) => {
                setProductQuery(e.target.value);
                if (selectedProduct && e.target.value !== selectedProduct.name) {
                  setSelectedProduct(null);
                  setMappingTaxIds(new Set());
                }
              }}
              placeholder="Type at least 2 characters…"
              className="w-full border rounded-md px-3 py-2 text-sm"
              data-tax-mappings-product-search="true"
            />
            {searchingProducts && (
              <Loader2 className="absolute right-3 top-9 h-4 w-4 animate-spin text-blue-500" />
            )}
            {productHits.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full bg-white border rounded-md shadow max-h-56 overflow-auto">
                {productHits.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                      onClick={() => selectProductForMappings(p)}
                    >
                      <span className="font-medium">{p.name}</span>
                      {p.sku ? <span className="text-gray-400 ml-2">{p.sku}</span> : null}
                      <span className="block text-xs text-gray-500">
                        Bridge: {p.isTaxable ? `${p.taxRate}%` : 'non-taxable'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {selectedProduct && (
            <>
              <div className="text-sm text-gray-700">
                Selected: <strong>{selectedProduct.name}</strong>
                {loadingMappings && (
                  <Loader2 className="inline h-4 w-4 animate-spin ml-2 text-blue-500" />
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Mapped taxes</label>
                <div className="space-y-2">
                  {saleMappingTaxList.map((t) => (
                    <label key={t.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={mappingTaxIds.has(t.id)}
                        onChange={() => toggleMappingTax(t.id)}
                        disabled={!canManageMappings || loadingMappings}
                        className="rounded border-gray-300"
                      />
                      {t.code} — {t.name} ({t.rate}%) · {t.scope}
                    </label>
                  ))}
                  {saleMappingTaxList.length === 0 && (
                    <p className="text-sm text-gray-400">No SALE/BOTH tax definitions available.</p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={handleSaveMappings}
                disabled={!canManageMappings || savingMappings || loadingMappings}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                data-tax-mappings-save="true"
              >
                {savingMappings ? 'Saving…' : 'Save mappings'}
              </button>
              {!canManageMappings && (
                <p className="text-sm text-amber-700">Requires accounting.manage to save.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
