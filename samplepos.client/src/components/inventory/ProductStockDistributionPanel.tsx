import { useMemo } from 'react';
import { useProductStoreDistribution } from '../../hooks/useWarehouse';
import { DataTable } from '../shared/DataTable';
import type { DataTableColumn } from '../shared/DataTable';

interface DistributionRow {
  storeLocationId: string;
  storeCode: string;
  storeName: string;
  storeType: string;
  quantityOnHand: number;
  quantityReserved: number;
  quantityCommitted: number;
  availableQuantity: number;
}

/** Flattened row for instant table render — no per-cell aggregation. */
interface DistributionTableRow {
  id: string;
  storeName: string;
  storeCode: string;
  storeType: string;
  onHandDisplay: string;
  reservedDisplay: string;
  committedDisplay: string;
  availableDisplay: string;
  storeTypeBadgeClass: string;
}

interface ProductStockDistributionPanelProps {
  productId: string;
  enabled: boolean;
}

function storeTypeBadgeClass(storeType: string): string {
  switch (storeType) {
    case 'MAIN':
      return 'bg-indigo-100 text-indigo-800';
    case 'SELLING':
      return 'bg-green-100 text-green-800';
    case 'TRANSIT':
      return 'bg-amber-100 text-amber-800';
    case 'DAMAGE':
      return 'bg-red-100 text-red-800';
    case 'EXPIRED':
      return 'bg-gray-200 text-gray-700';
    case 'RETURN':
      return 'bg-purple-100 text-purple-800';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

export function ProductStockDistributionPanel({ productId, enabled }: ProductStockDistributionPanelProps) {
  const { data, isLoading, error } = useProductStoreDistribution(productId, enabled);

  const summary = useMemo(() => {
    const rows = (data ?? []) as DistributionRow[];
    return {
      locationCount: rows.length,
      totalOnHand: rows.reduce((sum, r) => sum + r.quantityOnHand, 0),
      totalAvailable: rows.reduce((sum, r) => sum + r.availableQuantity, 0),
      totalReserved: rows.reduce((sum, r) => sum + r.quantityReserved, 0),
    };
  }, [data]);

  const tableRows = useMemo((): DistributionTableRow[] => {
    return ((data ?? []) as DistributionRow[]).map((row) => ({
      id: row.storeLocationId,
      storeName: row.storeName,
      storeCode: row.storeCode,
      storeType: row.storeType,
      onHandDisplay: row.quantityOnHand.toFixed(2),
      reservedDisplay: row.quantityReserved.toFixed(2),
      committedDisplay: row.quantityCommitted.toFixed(2),
      availableDisplay: row.availableQuantity.toFixed(2),
      storeTypeBadgeClass: storeTypeBadgeClass(row.storeType),
    }));
  }, [data]);

  const columns = useMemo((): DataTableColumn<DistributionTableRow>[] => [
    {
      id: 'store',
      header: 'Store',
      cell: (row) => (
        <>
          <div className="font-medium text-gray-900">{row.storeName}</div>
          <div className="text-xs text-gray-500">{row.storeCode}</div>
        </>
      ),
    },
    {
      id: 'type',
      header: 'Type',
      cell: (row) => (
        <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${row.storeTypeBadgeClass}`}>
          {row.storeType}
        </span>
      ),
    },
    {
      id: 'onHand',
      header: 'On Hand',
      align: 'right',
      cell: (row) => <span className="font-medium">{row.onHandDisplay}</span>,
    },
    {
      id: 'reserved',
      header: 'Reserved',
      align: 'right',
      cellClassName: 'text-amber-700',
      cell: (row) => row.reservedDisplay,
    },
    {
      id: 'committed',
      header: 'Committed',
      align: 'right',
      cellClassName: 'text-gray-600',
      cell: (row) => row.committedDisplay,
    },
    {
      id: 'available',
      header: 'Available',
      align: 'right',
      cellClassName: 'font-semibold text-green-700',
      cell: (row) => row.availableDisplay,
    },
  ], []);

  if (isLoading) {
    return <div className="p-6 text-center text-gray-500 text-sm">Loading stock distribution…</div>;
  }

  if (error) {
    return (
      <div className="p-6 text-center text-red-600 text-sm">
        Failed to load stock distribution.
      </div>
    );
  }

  if (tableRows.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500 text-sm">
        No stock recorded across store locations for this product.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="px-6 py-4 bg-slate-50 border-b grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <div className="text-xs text-gray-500 font-medium">Locations</div>
          <div className="text-lg font-bold text-gray-900">{summary.locationCount}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 font-medium">Total On Hand</div>
          <div className="text-lg font-bold text-blue-700">{summary.totalOnHand.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 font-medium">Available</div>
          <div className="text-lg font-bold text-green-700">{summary.totalAvailable.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 font-medium">Reserved</div>
          <div className="text-lg font-bold text-amber-700">{summary.totalReserved.toFixed(2)}</div>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={tableRows}
        getRowKey={(row) => row.id}
        stickyHeader
        className="shadow-none rounded-none border-0"
      />
    </div>
  );
}
