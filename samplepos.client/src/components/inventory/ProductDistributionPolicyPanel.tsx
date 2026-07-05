import { useEffect, useMemo, useState } from 'react';
import type {
  ProductDistributionPolicy,
  ProductDistributionPolicyDto,
  UpdateProductDistributionPolicyDto,
} from '../../../../shared/types/productDistribution';
import type { AssortmentCellStatus } from '../../../../shared/types/assortmentMatrix';
import { Button } from '../ui/button';

type StoreAvailability = AssortmentCellStatus;

interface ProductDistributionPolicyPanelProps {
  productId: string;
  policy: ProductDistributionPolicyDto | undefined;
  isLoading?: boolean;
  isSaving?: boolean;
  onSave: (body: UpdateProductDistributionPolicyDto) => void;
  readOnly?: boolean;
}

function statusFromAssignment(
  distributionPolicy: ProductDistributionPolicy,
  isAssigned: boolean,
  isPosVisible: boolean,
): StoreAvailability {
  if (distributionPolicy === 'GLOBAL') {
    return isPosVisible ? 'ACTIVE' : 'HIDDEN';
  }
  if (!isAssigned) return 'UNASSIGNED';
  return isPosVisible ? 'ACTIVE' : 'HIDDEN';
}

function cycleStatus(
  current: StoreAvailability,
  distributionPolicy: ProductDistributionPolicy,
): StoreAvailability {
  if (distributionPolicy === 'GLOBAL') {
    return current === 'ACTIVE' ? 'HIDDEN' : 'ACTIVE';
  }
  if (current === 'UNASSIGNED') return 'ACTIVE';
  if (current === 'ACTIVE') return 'HIDDEN';
  return 'UNASSIGNED';
}

function statusLabel(status: StoreAvailability): string {
  if (status === 'ACTIVE') return 'Active';
  if (status === 'HIDDEN') return 'Hidden';
  return 'Unassigned';
}

function statusClass(status: StoreAvailability): string {
  if (status === 'ACTIVE') return 'text-green-700 bg-green-50';
  if (status === 'HIDDEN') return 'text-gray-500 bg-gray-100';
  return 'text-gray-400 bg-white border border-dashed border-gray-200';
}

/**
 * Store assortment policy — GLOBAL vs RESTRICTED with per-store Active/Hidden matrix.
 */
export function ProductDistributionPolicyPanel({
  productId,
  policy,
  isLoading,
  isSaving,
  onSave,
  readOnly = false,
}: ProductDistributionPolicyPanelProps) {
  const [distributionPolicy, setDistributionPolicy] =
    useState<ProductDistributionPolicy>('GLOBAL');
  const [storeAvailability, setStoreAvailability] = useState<Record<string, StoreAvailability>>(
    {},
  );

  useEffect(() => {
    if (!policy || policy.productId !== productId) return;
    setDistributionPolicy(policy.distributionPolicy);
    const next: Record<string, StoreAvailability> = {};
    for (const store of policy.stores) {
      next[store.storeLocationId] = statusFromAssignment(
        policy.distributionPolicy,
        store.isAssigned,
        store.isPosVisible,
      );
    }
    setStoreAvailability(next);
  }, [policy, productId]);

  const stores = policy?.stores ?? [];

  const matrixRows = useMemo(() => {
    return stores.map((store) => {
      const status = storeAvailability[store.storeLocationId] ?? 'UNASSIGNED';
      return { ...store, status };
    });
  }, [stores, storeAvailability]);

  const handleSave = () => {
    const assignments = stores.map((store) => {
      const status = storeAvailability[store.storeLocationId] ?? 'UNASSIGNED';
      if (distributionPolicy === 'RESTRICTED') {
        return {
          storeLocationId: store.storeLocationId,
          isAssigned: status !== 'UNASSIGNED',
          isPosVisible: status === 'ACTIVE',
        };
      }
      return {
        storeLocationId: store.storeLocationId,
        isAssigned: true,
        isPosVisible: status === 'ACTIVE',
      };
    });
    onSave({ distributionPolicy, assignments });
  };

  if (isLoading) {
    return <p className="text-sm text-gray-500">Loading distribution policy…</p>;
  }

  if (!policy) {
    return null;
  }

  return (
    <div className="border rounded-xl p-5 bg-slate-50/50 space-y-5">
      <div>
        <h4 className="font-semibold text-gray-900">Distribution</h4>
        <p className="text-sm text-gray-600 mt-1">
          Controls which stores can sell or see this product in POS search.
        </p>
      </div>

      <div className="space-y-3">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="radio"
            name={`dist-policy-${productId}`}
            checked={distributionPolicy === 'GLOBAL'}
            disabled={readOnly}
            onChange={() => setDistributionPolicy('GLOBAL')}
            className="mt-1"
          />
          <span>
            <span className="font-medium text-gray-900">Global product</span>
            <span className="block text-sm text-gray-500">
              Available in every selling store unless hidden below.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="radio"
            name={`dist-policy-${productId}`}
            checked={distributionPolicy === 'RESTRICTED'}
            disabled={readOnly}
            onChange={() => setDistributionPolicy('RESTRICTED')}
            className="mt-1"
          />
          <span>
            <span className="font-medium text-gray-900">Restricted product</span>
            <span className="block text-sm text-gray-500">
              Only assigned stores see this product — set Active, Hidden, or Unassigned per store.
            </span>
          </span>
        </label>
      </div>

      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="px-4 py-2 border-b bg-gray-50 text-xs font-semibold text-gray-600 uppercase">
          Store availability matrix
        </div>
        <div className="divide-y">
          {matrixRows.map((row) => (
            <div
              key={row.storeLocationId}
              className="px-4 py-2.5 flex items-center justify-between gap-4 text-sm"
            >
              <div>
                <div className="font-medium text-gray-900">{row.storeName}</div>
                <div className="text-xs text-gray-500">
                  {row.storeCode} · {row.storeType}
                </div>
              </div>
              {readOnly ? (
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusClass(row.status)}`}
                >
                  {statusLabel(row.status)}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    setStoreAvailability((prev) => ({
                      ...prev,
                      [row.storeLocationId]: cycleStatus(
                        prev[row.storeLocationId] ?? 'UNASSIGNED',
                        distributionPolicy,
                      ),
                    }))
                  }
                  className={`text-xs font-semibold px-3 py-1 rounded-full ${statusClass(row.status)} hover:opacity-80`}
                >
                  {statusLabel(row.status)}
                </button>
              )}
            </div>
          ))}
        </div>
        {!readOnly && (
          <p className="px-4 py-2 text-xs text-gray-500 border-t bg-gray-50">
            Click a status badge to cycle. Restricted products: Unassigned → Active → Hidden.
            Global products: Active ↔ Hidden.
          </p>
        )}
      </div>

      {!readOnly && (
        <div className="flex justify-end">
          <Button type="button" size="sm" disabled={isSaving} onClick={handleSave}>
            {isSaving ? 'Saving…' : 'Save distribution'}
          </Button>
        </div>
      )}
    </div>
  );
}
