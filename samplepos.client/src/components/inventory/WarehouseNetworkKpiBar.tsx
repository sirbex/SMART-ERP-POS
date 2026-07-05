import { formatCurrency } from '../../utils/currency';
import type { WarehouseNetworkKpis } from '../../hooks/useWarehouseNetworkKpis';
import { NetworkKpiCard } from './NetworkKpiCard';

interface WarehouseNetworkKpiBarProps {
  kpis: WarehouseNetworkKpis;
}

export function WarehouseNetworkKpiBar({ kpis }: WarehouseNetworkKpiBarProps) {
  if (kpis.isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3 mb-6">
        {Array.from({ length: 7 }).map((_, i) => (
          <NetworkKpiCard key={i} label="" value="" loading />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3 mb-6">
      <NetworkKpiCard
        label="Inventory value"
        value={kpis.inventoryValue != null ? formatCurrency(kpis.inventoryValue) : '—'}
        accent="text-blue-700"
      />
      <NetworkKpiCard
        label="Available units"
        value={kpis.availableUnits.toFixed(0)}
      />
      <NetworkKpiCard label="Products" value={String(kpis.productCount)} />
      <NetworkKpiCard
        label="Low stock"
        value={String(kpis.lowStockCount)}
        accent={kpis.lowStockCount > 0 ? 'text-red-700' : 'text-gray-900'}
      />
      <NetworkKpiCard label="Active stores" value={String(kpis.activeStores)} />
      <NetworkKpiCard
        label="Transfers today"
        value={String(kpis.transfersToday)}
        accent="text-indigo-700"
      />
      <NetworkKpiCard
        label="Pending transfers"
        value={String(kpis.pendingTransfers)}
        accent="text-amber-700"
      />
    </div>
  );
}
