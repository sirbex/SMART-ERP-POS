import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { StoreNetworkLayout } from '../../components/inventory/StoreNetworkLayout';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SortableTableHeader } from '../../components/ui/SortableTableHeader';
import { MobileSortSelect } from '../../components/ui/MobileSortSelect';
import { useColumnSort } from '../../hooks/useColumnSort';
import { applyTableSort } from '../../lib/tableSortUtils';
import {
  useAssortmentMatrix,
  useUpdateAssortmentMatrixCell,
  nextAssortmentCellStatus,
  assortmentStatusLabel,
  assortmentStatusClass,
} from '../../hooks/useAssortmentMatrix';
import type { AssortmentCellStatus, AssortmentMatrixRow } from '../../../../shared/types/assortmentMatrix';
import {
  formatMultiUomQuantity,
  formatUomSummary,
  productFromApiUoms,
} from '../../utils/formatQuantity';
import toast from 'react-hot-toast';

type AssortmentSortField = 'product' | 'category' | 'policy';

export default function StoreAssortmentMatrixPage() {
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching } = useAssortmentMatrix(search, filterCategory, page, true);
  const updateCell = useUpdateAssortmentMatrixCell();
  const { sortField, sortOrder, handleSort, setSortOrder } =
    useColumnSort<AssortmentSortField>('product', 'asc');

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const categories = data?.categories ?? [];

  const sortAccessors = useMemo(
    () => ({
      product: (row: AssortmentMatrixRow) => row.productName ?? '',
      category: (row: AssortmentMatrixRow) => row.category ?? '',
      policy: (row: AssortmentMatrixRow) => row.distributionPolicy ?? '',
    }),
    [],
  );

  const sortedRows = useMemo(() => {
    if (!data?.rows?.length) return [];
    return applyTableSort([...data.rows], sortField, sortOrder, sortAccessors);
  }, [data?.rows, sortField, sortOrder, sortAccessors]);

  const handleCellClick = async (
    productId: string,
    storeLocationId: string,
    current: AssortmentCellStatus,
    distributionPolicy: 'GLOBAL' | 'RESTRICTED',
  ) => {
    const next = nextAssortmentCellStatus(current, distributionPolicy);
    try {
      await updateCell.mutateAsync({
        productId,
        storeLocationId,
        status: next,
      });
    } catch {
      toast.error('Failed to update assortment');
    }
  };

  const handleColumnSort = (field: string) => {
    handleSort(field as AssortmentSortField, { defaultOrder: 'asc' });
  };

  const mobileSortOptions = [
    { value: 'product', label: 'Sort by Product' },
    { value: 'category', label: 'Sort by Category' },
    { value: 'policy', label: 'Sort by Policy' },
  ];

  return (
    <StoreNetworkLayout>
      <div className="p-6 max-w-[min(100%,1400px)]">
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900">Assortment Matrix</h3>
          <p className="text-sm text-gray-600 mt-1">
            Per-store availability and sellable stock across your network. Quantities use each
            product&apos;s MUoM ladder (base units converted to BOX, PCS, etc.). Click a cell to
            cycle{' '}
            <span className="font-medium">Active</span>, <span className="font-medium">Hidden</span>
            , or <span className="font-medium">Unassigned</span> (restricted products only).{' '}
            <Link to="/inventory/products" className="text-blue-600 hover:underline">
              Product detail
            </Link>{' '}
            still controls GLOBAL vs RESTRICTED policy and unit definitions.
          </p>
        </div>

        <div className="bg-white rounded-lg border shadow-sm p-4 mb-4 space-y-4">
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
              setSearch(searchInput.trim());
            }}
          >
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name, SKU, barcode, or category…"
              className="max-w-md"
            />
            <Button type="submit" variant="outline">
              Search
            </Button>
            {(search || filterCategory !== 'all') && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setSearchInput('');
                  setSearch('');
                  setFilterCategory('all');
                  setPage(1);
                }}
              >
                Clear filters
              </Button>
            )}
          </form>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
            <div>
              <label htmlFor="assortment-filter-category" className="block text-sm font-medium text-gray-700 mb-2">
                Category
              </label>
              <select
                id="assortment-filter-category"
                value={filterCategory}
                onChange={(e) => {
                  setFilterCategory(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All categories</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <MobileSortSelect
            sortField={sortField}
            sortOrder={sortOrder}
            options={mobileSortOptions}
            onFieldChange={handleColumnSort}
            onToggleOrder={() => setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}
          />
        </div>

        {isLoading ? (
          <p className="text-gray-500">Loading matrix…</p>
        ) : !data || sortedRows.length === 0 ? (
          <p className="text-gray-500">No products found.</p>
        ) : (
          <>
            <div className="overflow-x-auto border rounded-lg bg-white">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <SortableTableHeader
                      label="Product"
                      field="product"
                      activeField={sortField}
                      direction={sortOrder}
                      onSort={handleColumnSort}
                      className="sticky left-0 z-10 bg-gray-50 min-w-[200px]"
                    />
                    <SortableTableHeader
                      label="Category"
                      field="category"
                      activeField={sortField}
                      direction={sortOrder}
                      onSort={handleColumnSort}
                      filtered={filterCategory !== 'all'}
                      className="min-w-[120px]"
                    />
                    <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 min-w-[120px]">
                      Units (MUoM)
                    </th>
                    <SortableTableHeader
                      label="Policy"
                      field="policy"
                      activeField={sortField}
                      direction={sortOrder}
                      onSort={handleColumnSort}
                    />
                    {data.stores.map((store) => (
                      <th
                        key={store.storeLocationId}
                        className="px-2 py-3 text-center font-semibold text-gray-700 min-w-[88px]"
                        title={store.storeName}
                      >
                        <div className="text-xs truncate max-w-[80px]">{store.storeCode}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sortedRows.map((row) => (
                    <tr key={row.productId} className="hover:bg-slate-50/50">
                      <td className="sticky left-0 z-10 bg-white px-4 py-2 border-r">
                        <div className="font-medium text-gray-900">{row.productName}</div>
                        {row.sku && <div className="text-xs text-gray-500">{row.sku}</div>}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                            row.category
                              ? 'bg-blue-50 text-blue-700'
                              : 'text-gray-400'
                          }`}
                        >
                          {row.category || '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-600 max-w-[160px]">
                        <span title={formatUomSummary(row.uoms, 6)}>
                          {formatUomSummary(row.uoms)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500">
                        {row.distributionPolicy === 'RESTRICTED' ? 'Restricted' : 'Global'}
                      </td>
                      {row.cells.map((cell) => {
                        const qty = cell.availableQty ?? 0;
                        const uomProduct = productFromApiUoms(row.uoms);
                        const qtyLabel =
                          qty > 0 ? formatMultiUomQuantity(qty, uomProduct) : '—';
                        return (
                          <td key={cell.storeLocationId} className="px-2 py-2 text-center align-top">
                            <button
                              type="button"
                              disabled={updateCell.isPending}
                              title={`Click to change — ${assortmentStatusLabel(cell.status)}`}
                              onClick={() =>
                                void handleCellClick(
                                  row.productId,
                                  cell.storeLocationId,
                                  cell.status,
                                  row.distributionPolicy,
                                )
                              }
                              className={`inline-flex min-w-[72px] justify-center px-2 py-1 rounded-full text-xs font-semibold border transition-colors hover:opacity-80 ${assortmentStatusClass(cell.status)}`}
                            >
                              {assortmentStatusLabel(cell.status)}
                            </button>
                            <div
                              className="mt-1 text-[10px] leading-tight text-gray-600 tabular-nums"
                              title={`${qty.toFixed(2)} base units`}
                            >
                              {qtyLabel}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
              <span>
                {data.total} product{data.total === 1 ? '' : 's'}
                {isFetching ? ' · updating…' : ''}
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <span className="px-2 py-1">
                  Page {page} of {totalPages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </StoreNetworkLayout>
  );
}
