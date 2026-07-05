/**

 * Store Network — create and browse stores (Phase 1).

 * Route: `/inventory/store-network/stores`

 */

import { useMemo, useState } from 'react';

import { useNavigate } from 'react-router-dom';

import {

  useStoreLocations,

  useEnsureDefaultStores,

  useCreateStoreLocation,

} from '../../hooks/useWarehouse';

import type { StoreLocation, StoreType } from '../../../../shared/types/warehouseNetwork';

import { STORE_TYPES } from '../../../../shared/types/warehouseNetwork';

import { buildStoreNetworkSections, filterSpecialStoresWithStock } from '../../components/inventory/warehouseNetworkUtils';
import { useStoreStockQtyMap } from '../../hooks/useWarehouseReports';

import { WarehouseNetworkTree } from '../../components/inventory/WarehouseNetworkTree';

import { WarehouseNetworkKpiBar } from '../../components/inventory/WarehouseNetworkKpiBar';

import { useWarehouseNetworkKpis } from '../../hooks/useWarehouseNetworkKpis';

import { StoreNetworkLayout } from '../../components/inventory/StoreNetworkLayout';

import {

  Dialog,

  DialogContent,

  DialogFooter,

  DialogHeader,

  DialogTitle,

} from '../../components/ui/dialog';

import {

  Select,

  SelectContent,

  SelectItem,

  SelectTrigger,

  SelectValue,

} from '@/components/ui/select';

import { Label } from '@/components/ui/label';

import { Button } from '@/components/ui/button';

import { Input } from '@/components/ui/input';

import toast from 'react-hot-toast';



const SPECIAL_TYPE_LABELS: Record<string, string> = {

  TRANSIT: 'In-transit staging',

  EXPIRED: 'Expired quarantine',

  DAMAGE: 'Damaged goods',

  RETURN: 'Customer returns',

};



const SPECIAL_ICONS: Record<string, string> = {

  TRANSIT: '🚚',

  EXPIRED: '⏳',

  DAMAGE: '⚠️',

  RETURN: '↩️',

};



function SpecialStoresPanel({

  stores,

  onSelect,

  loading,

}: {

  stores: StoreLocation[];

  onSelect: (store: StoreLocation) => void;

  loading?: boolean;

}) {

  if (loading) {

    return <p className="text-sm text-gray-500 p-4">Loading special store stock…</p>;

  }

  if (stores.length === 0) {

    return (

      <p className="text-sm text-gray-500 p-4">

        No quarantine or in-transit stock right now. RETURN, DAMAGE, EXPIRED, and TRANSIT

        locations appear here only when they hold quantity (e.g. after a customer refund).

      </p>

    );

  }



  return (

    <div className="divide-y">

      {stores.map((store) => (

        <button

          key={store.id}

          type="button"

          onClick={() => onSelect(store)}

          className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-3"

        >

          <span className="text-lg">{SPECIAL_ICONS[store.storeType] ?? '📍'}</span>

          <span className="min-w-0 flex-1">

            <span className="block font-medium text-sm text-gray-900">{store.name}</span>

            <span className="block text-xs text-gray-500">

              {store.code} · {SPECIAL_TYPE_LABELS[store.storeType] ?? store.storeType}

            </span>

          </span>

        </button>

      ))}

    </div>

  );

}



export default function StoreManagementPage() {

  const navigate = useNavigate();

  const { data: stores = [], isLoading, refetch } = useStoreLocations(true);

  const kpis = useWarehouseNetworkKpis(true);

  const ensureDefaults = useEnsureDefaultStores();

  const createStore = useCreateStoreLocation();



  const [showCreate, setShowCreate] = useState(false);

  const [form, setForm] = useState({

    code: '',

    name: '',

    storeType: 'SELLING' as StoreType,

    isDefaultReceiving: false,

    isPosSelling: true,

  });



  const { data: stockQtyMap, isLoading: stockQtyLoading } = useStoreStockQtyMap(true);

  const { warehouseRoots, specialStores } = useMemo(

    () => buildStoreNetworkSections(stores),

    [stores],

  );

  const visibleSpecialStores = useMemo(

    () => filterSpecialStoresWithStock(specialStores, stockQtyMap ?? new Map()),

    [specialStores, stockQtyMap],

  );



  const handleEnsureDefaults = async () => {

    try {

      await ensureDefaults.mutateAsync();

      toast.success('Default store network created');

      refetch();

    } catch {

      toast.error('Failed to create default stores');

    }

  };



  const handleCreate = async () => {

    if (!form.code.trim() || !form.name.trim()) {

      toast.error('Code and name are required');

      return;

    }

    try {

      await createStore.mutateAsync({

        code: form.code.trim().toUpperCase(),

        name: form.name.trim(),

        storeType: form.storeType,

        isDefaultReceiving: form.isDefaultReceiving,

        isPosSelling: form.isPosSelling,

      });

      toast.success('Store created');

      setShowCreate(false);

      setForm({

        code: '',

        name: '',

        storeType: 'SELLING',

        isDefaultReceiving: false,

        isPosSelling: true,

      });

    } catch {

      toast.error('Failed to create store');

    }

  };



  const openStore = (store: StoreLocation) => {

    navigate(`/inventory/stores/${store.id}`);

  };



  return (

    <StoreNetworkLayout>

      <div className="p-6">

        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-2">

          <div>

            <p className="text-sm text-gray-600 max-w-2xl">

              Warehouse network shows your main hub and shops. Customer refunds go to the

              RETURN quarantine store (not back to the selling shop). Transfer approved

              stock from RETURN → shop when ready to resell.

            </p>

          </div>

          <div className="flex gap-2 shrink-0">

            {stores.length === 0 && (

              <Button

                type="button"

                variant="outline"

                onClick={handleEnsureDefaults}

                disabled={ensureDefaults.isPending}

              >

                Initialize network

              </Button>

            )}

            <Button type="button" onClick={() => setShowCreate(true)}>

              + Add store

            </Button>

          </div>

        </div>



        <WarehouseNetworkKpiBar kpis={kpis} />



        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">

          <div className="bg-white rounded-xl shadow border flex flex-col min-h-[360px]">

            <div className="px-4 py-3 border-b bg-indigo-50 font-semibold text-sm text-indigo-900">

              Warehouse Network

            </div>

            <div className="flex-1 overflow-y-auto px-2">

              {isLoading ? (

                <p className="p-4 text-sm text-gray-500">Loading…</p>

              ) : (

                <WarehouseNetworkTree

                  nodes={warehouseRoots}

                  selectedId={null}

                  onSelect={openStore}

                />

              )}

            </div>

            <p className="px-4 py-2 text-xs text-gray-400 border-t">

              MAIN → selling shops. Click to open inventory overview.

            </p>

          </div>



          <div className="bg-white rounded-xl shadow border flex flex-col min-h-[360px]">

            <div className="px-4 py-3 border-b bg-amber-50 font-semibold text-sm text-amber-900">

              Special Stores

            </div>

            <SpecialStoresPanel
              stores={visibleSpecialStores}
              onSelect={openStore}
              loading={stockQtyLoading}
            />

            <p className="px-4 py-2 text-xs text-gray-400 border-t mt-auto">

              Shown only when on-hand qty &gt; 0. Full list under Locations.

            </p>

          </div>

        </div>

      </div>



      <Dialog open={showCreate} onOpenChange={setShowCreate}>

        <DialogContent className="max-w-md">

          <DialogHeader>

            <DialogTitle>Add store location</DialogTitle>

          </DialogHeader>

          <div className="space-y-4">

            <div>

              <Label htmlFor="create-store-code">Code</Label>

              <Input

                id="create-store-code"

                value={form.code}

                onChange={(e) => setForm({ ...form, code: e.target.value })}

                placeholder="KAMPALA"

                className="uppercase mt-1"

              />

            </div>

            <div>

              <Label htmlFor="create-store-name">Name</Label>

              <Input

                id="create-store-name"

                value={form.name}

                onChange={(e) => setForm({ ...form, name: e.target.value })}

                placeholder="Kampala Shop"

                className="mt-1"

              />

            </div>

            <div>

              <Label htmlFor="create-store-type">Type</Label>

              <Select

                value={form.storeType}

                onValueChange={(value) => setForm({ ...form, storeType: value as StoreType })}

              >

                <SelectTrigger id="create-store-type" className="mt-1">

                  <SelectValue />

                </SelectTrigger>

                <SelectContent>

                  {STORE_TYPES.filter((t) => t === 'SELLING' || t === 'MAIN').map((t) => (

                    <SelectItem key={t} value={t}>

                      {t}

                    </SelectItem>

                  ))}

                </SelectContent>

              </Select>

              <p className="text-xs text-gray-500 mt-1">

                Shops are added under MAIN. Special store types are provisioned by the system.

              </p>

            </div>

            <label className="flex items-center gap-2 text-sm">

              <input

                type="checkbox"

                checked={form.isPosSelling}

                onChange={(e) => setForm({ ...form, isPosSelling: e.target.checked })}

              />

              POS selling location

            </label>

          </div>

          <DialogFooter>

            <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>

              Cancel

            </Button>

            <Button type="button" onClick={handleCreate} disabled={createStore.isPending}>

              Create

            </Button>

          </DialogFooter>

        </DialogContent>

      </Dialog>

    </StoreNetworkLayout>

  );

}


