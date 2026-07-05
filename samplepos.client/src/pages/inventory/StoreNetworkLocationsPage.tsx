import { useNavigate } from 'react-router-dom';
import { useMultistoreEnabled } from '../../hooks/useMultistore';
import { useStoreLocations } from '../../hooks/useWarehouse';
import { StoreNetworkLayout } from '../../components/inventory/StoreNetworkLayout';
import { DataTable } from '../../components/shared/DataTable';
import type { DataTableColumn } from '../../components/shared/DataTable';
import type { StoreLocation } from '../../../../shared/types/warehouseNetwork';

const TYPE_LABELS: Record<string, string> = {
  MAIN: 'Main warehouse',
  SELLING: 'Shop / selling',
  TRANSIT: 'In transit',
  DAMAGE: 'Damaged goods',
  EXPIRED: 'Expired quarantine',
  RETURN: 'Customer returns',
};

export default function StoreNetworkLocationsPage() {
  const navigate = useNavigate();
  const { isMultistoreEnabled } = useMultistoreEnabled();
  const { data: stores = [], isLoading } = useStoreLocations(isMultistoreEnabled);

  const columns: DataTableColumn<StoreLocation>[] = [
    {
      id: 'code',
      header: 'Code',
      cell: (row) => <span className="font-mono text-sm">{row.code}</span>,
    },
    {
      id: 'name',
      header: 'Name',
      cell: (row) => <span className="font-medium">{row.name}</span>,
    },
    {
      id: 'type',
      header: 'Type',
      cell: (row) => TYPE_LABELS[row.storeType] ?? row.storeType,
    },
    {
      id: 'flags',
      header: 'Flags',
      cell: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.isDefaultReceiving && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-100 text-teal-800">
              Receiving
            </span>
          )}
          {row.isPosSelling && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">POS</span>
          )}
          {!row.isActive && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
              Inactive
            </span>
          )}
        </div>
      ),
    },
    {
      id: 'action',
      header: '',
      align: 'right',
      cell: (row) => (
        <button
          type="button"
          onClick={() => navigate(`/inventory/stores/${row.id}`)}
          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          Open →
        </button>
      ),
    },
  ];

  return (
    <StoreNetworkLayout>
      <div className="p-6">
        <p className="text-sm text-gray-600 mb-4 max-w-2xl">
          All physical and logical inventory locations in your network. Select a row to open store
          details, stock, and transfer history.
        </p>
        <DataTable
          columns={columns}
          data={stores}
          getRowKey={(row) => row.id}
          isLoading={isLoading}
          emptyMessage="No locations yet. Add stores from the Stores tab."
        />
      </div>
    </StoreNetworkLayout>
  );
}
