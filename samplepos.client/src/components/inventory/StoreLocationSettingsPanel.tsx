import { useEffect, useState } from 'react';
import type { StoreLocation, StoreType } from '../../../../shared/types/warehouseNetwork';
import { STORE_TYPES } from '../../../../shared/types/warehouseNetwork';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUpdateStoreLocation } from '../../hooks/useWarehouse';
import toast from 'react-hot-toast';

const STORE_TYPE_LABELS: Record<StoreType, string> = {
  MAIN: 'Main warehouse',
  SELLING: 'Shop / selling floor',
  TRANSIT: 'In-transit staging',
  DAMAGE: 'Damaged goods',
  EXPIRED: 'Expired quarantine',
  RETURN: 'Customer returns',
};

interface StoreLocationSettingsPanelProps {
  store: StoreLocation;
  posSellingStores: StoreLocation[];
}

export function StoreLocationSettingsPanel({
  store,
  posSellingStores,
}: StoreLocationSettingsPanelProps) {
  const updateStore = useUpdateStoreLocation();
  const [editForm, setEditForm] = useState({
    name: store.name,
    storeType: store.storeType,
    isDefaultReceiving: store.isDefaultReceiving,
    isPosSelling: store.isPosSelling,
    notes: store.notes ?? '',
  });

  useEffect(() => {
    setEditForm({
      name: store.name,
      storeType: store.storeType,
      isDefaultReceiving: store.isDefaultReceiving,
      isPosSelling: store.isPosSelling,
      notes: store.notes ?? '',
    });
  }, [store]);

  const handleSave = async () => {
    try {
      await updateStore.mutateAsync({
        id: store.id,
        name: editForm.name.trim(),
        storeType: editForm.storeType,
        isDefaultReceiving: editForm.isDefaultReceiving,
        isPosSelling: editForm.isPosSelling,
        notes: editForm.notes.trim() || null,
      });
      toast.success('Store updated');
    } catch {
      toast.error('Failed to update store');
    }
  };

  const [settingsTab, setSettingsTab] = useState('configuration');

  return (
    <Tabs value={settingsTab} onValueChange={setSettingsTab} className="w-full">
      <TabsList className="mb-4" aria-label="Store settings">
        <TabsTrigger value="configuration">Configuration</TabsTrigger>
        <TabsTrigger value="staff">Staff & POS</TabsTrigger>
      </TabsList>

      <TabsContent value="configuration" className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Display name</label>
          <Input
            value={editForm.name}
            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="edit-store-type">Classification</Label>
          <Select
            value={editForm.storeType}
            onValueChange={(value) =>
              setEditForm({ ...editForm, storeType: value as StoreType })
            }
          >
            <SelectTrigger id="edit-store-type" className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STORE_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t} — {STORE_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={editForm.isDefaultReceiving}
              onChange={(e) =>
                setEditForm({ ...editForm, isDefaultReceiving: e.target.checked })
              }
            />
            Default receiving location (GRN destination default)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={editForm.isPosSelling}
              onChange={(e) => setEditForm({ ...editForm, isPosSelling: e.target.checked })}
            />
            Active POS selling location
          </label>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            value={editForm.notes}
            onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
            rows={3}
            className="w-full px-3 py-2 border rounded-lg text-sm"
          />
        </div>
        <Button type="button" onClick={handleSave} disabled={updateStore.isPending}>
          Save changes
        </Button>
      </TabsContent>

      <TabsContent value="staff" className="space-y-4">
        <p className="text-sm text-gray-600">
          Cashiers are routed to POS selling stores automatically. Enable &quot;Active POS
          selling location&quot; on shop-classified stores to include them in the POS catalog.
        </p>
        <div className="rounded-lg border bg-slate-50 p-4">
          <h4 className="text-sm font-semibold text-gray-800 mb-2">This store — POS access</h4>
          {store.isPosSelling ? (
            <p className="text-sm text-green-700">
              Active selling store. Registers assigned to this location will show stock from this
              store only.
            </p>
          ) : (
            <p className="text-sm text-amber-700">
              Not a POS selling location. Warehouse and transit stores are hidden from cashiers.
            </p>
          )}
        </div>
        <div>
          <h4 className="text-sm font-semibold text-gray-800 mb-2">Network POS locations</h4>
          <ul className="text-sm divide-y border rounded-lg bg-white">
            {posSellingStores.length === 0 ? (
              <li className="px-3 py-2 text-gray-500">No POS selling stores configured.</li>
            ) : (
              posSellingStores.map((s) => (
                <li
                  key={s.id}
                  className={`px-3 py-2 flex justify-between ${s.id === store.id ? 'bg-blue-50' : ''}`}
                >
                  <span>{s.name}</span>
                  <span className="text-gray-400 font-mono text-xs">{s.code}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      </TabsContent>
    </Tabs>
  );
}
