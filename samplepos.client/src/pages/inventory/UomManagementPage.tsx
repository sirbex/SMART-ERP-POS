import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

function authHeaders() {
  const token = localStorage.getItem('auth_token');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token || ''}`,
  } as HeadersInit;
}

async function fetchMasterUoms() {
  const res = await fetch('/api/products/uoms/master', { headers: authHeaders() });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Failed to load UoMs');
  return json.data as Array<{ id: string; name: string; symbol: string | null; type: string }>;
}

async function createMasterUom(payload: { name: string; symbol?: string; type: 'QUANTITY' | 'WEIGHT' | 'VOLUME' | 'LENGTH' | 'AREA' | 'TIME' }) {
  const res = await fetch('/api/products/uoms/master', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Failed to create UoM');
  return json.data;
}

async function updateMasterUom(id: string, payload: { name?: string; symbol?: string; type?: 'QUANTITY' | 'WEIGHT' | 'VOLUME' | 'LENGTH' | 'AREA' | 'TIME' }) {
  const res = await fetch(`/api/products/uoms/master/${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Failed to update UoM');
  return json.data;
}

async function deleteMasterUom(id: string) {
  const res = await fetch(`/api/products/uoms/master/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Failed to delete UoM');
  return json.data;
}

async function fetchProductUoms(productId: string) {
  const res = await fetch(`/api/products/${productId}/uoms`, { headers: authHeaders() });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Failed to load product UoMs');
  return json.data as Array<{
    id: string; productId: string; uomId: string; uomName: string; uomSymbol: string | null; conversionFactor: string; isDefault: boolean; priceOverride: string | null; costOverride: string | null; barcode: string | null;
  }>;
}

async function addProductUom(productId: string, payload: { uomId: string; conversionFactor: number; isDefault?: boolean; priceOverride?: number | null; costOverride?: number | null; barcode?: string | null; }) {
  const res = await fetch(`/api/products/${productId}/uoms`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Failed to add product UoM');
  return json.data;
}

export default function UomManagementPage() {
  const qc = useQueryClient();
  const { data: masterUoms, isLoading, error } = useQuery({ queryKey: ['uoms', 'master'], queryFn: fetchMasterUoms });

  const [newUom, setNewUom] = useState<{ name: string; symbol?: string; type: 'QUANTITY' | 'WEIGHT' | 'VOLUME' | 'LENGTH' | 'AREA' | 'TIME' }>({ name: '', symbol: '', type: 'QUANTITY' });
  const [editingUom, setEditingUom] = useState<{ id: string; name: string; symbol?: string; type: 'QUANTITY' | 'WEIGHT' | 'VOLUME' | 'LENGTH' | 'AREA' | 'TIME' } | null>(null);

  const createMutation = useMutation({
    mutationFn: () => createMasterUom({ name: newUom.name.trim(), symbol: newUom.symbol?.trim() || undefined, type: newUom.type }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['uoms', 'master'] });
      setNewUom({ name: '', symbol: '', type: 'QUANTITY' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: { id: string; name: string; symbol?: string; type: 'QUANTITY' | 'WEIGHT' | 'VOLUME' | 'LENGTH' | 'AREA' | 'TIME' }) =>
      updateMasterUom(data.id, { name: data.name.trim(), symbol: data.symbol?.trim() || undefined, type: data.type }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['uoms', 'master'] });
      setEditingUom(null);
    },
  });

  const [deleteError, setDeleteError] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteMasterUom(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['uoms', 'master'] });
      setDeleteError(null);
    },
    onError: (err: Error) => {
      setDeleteError(err.message);
    },
  });

  const [productId, setProductId] = useState('');
  const { data: productUoms, refetch: refetchProductUoms, isFetching: productUomsLoading } = useQuery({
    queryKey: ['uoms', 'product', productId],
    enabled: false,
    queryFn: () => fetchProductUoms(productId),
  });

  const [newProductUom, setNewProductUom] = useState<{ uomId: string; conversionFactor: string; isDefault: boolean; priceOverride?: string; costOverride?: string; barcode?: string }>({ uomId: '', conversionFactor: '1', isDefault: false, priceOverride: '', costOverride: '', barcode: '' });
  const addProductUomMutation = useMutation({
    mutationFn: () => addProductUom(productId, {
      uomId: newProductUom.uomId,
      conversionFactor: Number(newProductUom.conversionFactor || '1'),
      isDefault: newProductUom.isDefault,
      priceOverride: newProductUom.priceOverride ? Number(newProductUom.priceOverride) : null,
      costOverride: newProductUom.costOverride ? Number(newProductUom.costOverride) : null,
      barcode: newProductUom.barcode || null,
    }),
    onSuccess: () => {
      setNewProductUom({ uomId: '', conversionFactor: '1', isDefault: false, priceOverride: '', costOverride: '', barcode: '' });
      refetchProductUoms();
    },
  });

  // no-op memo reserved for future: map master UoMs by id if needed

  return (
    <div className="p-6 space-y-8">
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Units of Measure</h2>
        <p className="text-gray-600 mb-4">Manage master UoMs and per-product conversions.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow-sm border p-4">
            <h3 className="font-semibold text-gray-900 mb-3">Master UoMs</h3>
            {isLoading ? (
              <div className="text-sm text-gray-500">Loading…</div>
            ) : error ? (
              <div className="text-sm text-red-600">Failed to load master UoMs</div>
            ) : (
              <>
                {deleteError && (
                  <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                    {deleteError}
                    <button onClick={() => setDeleteError(null)} className="ml-2 text-red-500 hover:text-red-700 font-bold">&times;</button>
                  </div>
                )}
                <ul className="divide-y">
                  {(masterUoms || []).map(u => (
                    <li key={u.id} className="py-2">
                      {editingUom?.id === u.id ? (
                        <div className="flex flex-col gap-2">
                          <input
                            className="border rounded px-2 py-1"
                            placeholder="Name"
                            value={editingUom.name}
                            onChange={e => setEditingUom(s => s ? ({ ...s, name: e.target.value }) : null)}
                          />
                          <input
                            className="border rounded px-2 py-1"
                            placeholder="Symbol"
                            value={editingUom.symbol || ''}
                            onChange={e => setEditingUom(s => s ? ({ ...s, symbol: e.target.value }) : null)}
                          />
                          <select
                            className="border rounded px-2 py-1"
                            aria-label="UoM type"
                            title="UoM type"
                            value={editingUom.type}
                            onChange={e => setEditingUom(s => s ? ({ ...s, type: e.target.value as 'QUANTITY' | 'WEIGHT' | 'VOLUME' | 'LENGTH' | 'AREA' | 'TIME' }) : null)}
                          >
                            <option value="QUANTITY">QUANTITY</option>
                            <option value="WEIGHT">WEIGHT</option>
                            <option value="VOLUME">VOLUME</option>
                            <option value="LENGTH">LENGTH</option>
                            <option value="AREA">AREA</option>
                            <option value="TIME">TIME</option>
                          </select>
                          <div className="flex gap-2">
                            <button
                              onClick={() => updateMutation.mutate(editingUom)}
                              disabled={!editingUom.name.trim() || updateMutation.isPending}
                              className="px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                            >
                              {updateMutation.isPending ? 'Saving…' : 'Save'}
                            </button>
                            <button
                              onClick={() => setEditingUom(null)}
                              className="px-3 py-1.5 border rounded hover:bg-gray-50"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{u.name} {u.symbol ? <span className="text-gray-500">({u.symbol})</span> : null}</div>
                            <div className="text-xs text-gray-500">Type: {u.type}</div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setEditingUom({ id: u.id, name: u.name, symbol: u.symbol || '', type: u.type as 'QUANTITY' | 'WEIGHT' | 'VOLUME' | 'LENGTH' | 'AREA' | 'TIME' })}
                              className="text-sm text-blue-600 hover:text-blue-800"
                              title="Edit UoM"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => {
                                setDeleteError(null);
                                if (confirm(`Delete UoM "${u.name}"? This will remove all product mappings. (Cannot delete if used in historical transactions.)`)) {
                                  deleteMutation.mutate(u.id);
                                }
                              }}
                              disabled={deleteMutation.isPending}
                              className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
                              title="Delete UoM"
                            >
                              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                  {masterUoms && masterUoms.length === 0 && (
                    <li className="py-3 text-sm text-gray-500">No UoMs yet</li>
                  )}
                </ul>
              </>
            )}

            <div className="mt-4 border-t pt-4">
              <div className="text-sm font-medium text-gray-900 mb-2">Add UoM</div>
              <div className="flex flex-col gap-2">
                <input className="border rounded px-2 py-1" placeholder="Name (e.g., Carton)" value={newUom.name} onChange={e => setNewUom(s => ({ ...s, name: e.target.value }))} />
                <input className="border rounded px-2 py-1" placeholder="Symbol (e.g., CTN)" value={newUom.symbol} onChange={e => setNewUom(s => ({ ...s, symbol: e.target.value }))} />
                <select className="border rounded px-2 py-1" aria-label="UoM type" title="UoM type" value={newUom.type} onChange={e => setNewUom(s => ({ ...s, type: e.target.value as 'QUANTITY' | 'WEIGHT' | 'VOLUME' | 'LENGTH' | 'AREA' | 'TIME' }))}>
                  <option value="QUANTITY">QUANTITY</option>
                  <option value="WEIGHT">WEIGHT</option>
                  <option value="VOLUME">VOLUME</option>
                  <option value="LENGTH">LENGTH</option>
                  <option value="AREA">AREA</option>
                  <option value="TIME">TIME</option>
                </select>
                <button
                  onClick={() => createMutation.mutate()}
                  disabled={!newUom.name.trim() || createMutation.isPending}
                  className="self-start px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Adding…' : 'Add UoM'}
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border p-4">
            <h3 className="font-semibold text-gray-900 mb-3">Product UoMs</h3>
            <div className="flex gap-2 mb-3">
              <input className="border rounded px-2 py-1 flex-1" placeholder="Product ID (UUID)" value={productId} onChange={e => setProductId(e.target.value)} />
              <button onClick={() => productId && refetchProductUoms()} disabled={!productId} className="px-3 py-1.5 border rounded hover:bg-gray-50">Load</button>
            </div>
            {productUomsLoading ? (
              <div className="text-sm text-gray-500">Loading…</div>
            ) : productUoms ? (
              <ul className="divide-y">
                {productUoms.map(pu => (
                  <li key={pu.id} className="py-2">
                    <div className="text-sm text-gray-900">
                      {pu.uomName}{pu.uomSymbol ? ` (${pu.uomSymbol})` : ''} × {pu.conversionFactor} {pu.isDefault ? <span className="ml-2 text-xs px-2 py-0.5 bg-gray-100 rounded">default</span> : null}
                    </div>
                    {(pu.priceOverride || pu.costOverride || pu.barcode) && (
                      <div className="text-xs text-gray-500 mt-1">Overrides: {pu.costOverride ? `Cost ${pu.costOverride}` : ''} {pu.priceOverride ? `Price ${pu.priceOverride}` : ''} {pu.barcode ? `Barcode ${pu.barcode}` : ''}</div>
                    )}
                  </li>
                ))}
                {productUoms.length === 0 && <li className="py-3 text-sm text-gray-500">No mappings</li>}
              </ul>
            ) : null}

            <div className="mt-4 border-t pt-4">
              <div className="text-sm font-medium text-gray-900 mb-2">Add mapping</div>
              <div className="grid grid-cols-2 gap-2">
                <select className="border rounded px-2 py-1" aria-label="Select UoM" title="Select UoM" value={newProductUom.uomId} onChange={e => setNewProductUom(s => ({ ...s, uomId: e.target.value }))}>
                  <option value="">Select UoM…</option>
                  {(masterUoms || []).map(u => (
                    <option key={u.id} value={u.id}>{u.name}{u.symbol ? ` (${u.symbol})` : ''}</option>
                  ))}
                </select>
                <input className="border rounded px-2 py-1" type="number" min={0} step={1} placeholder="Conversion factor" value={newProductUom.conversionFactor} onChange={e => setNewProductUom(s => ({ ...s, conversionFactor: e.target.value }))} />
                <label className="col-span-2 inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={newProductUom.isDefault} onChange={e => setNewProductUom(s => ({ ...s, isDefault: e.target.checked }))} /> Default for product
                </label>
                <input className="border rounded px-2 py-1" placeholder="Price override (optional)" value={newProductUom.priceOverride} onChange={e => setNewProductUom(s => ({ ...s, priceOverride: e.target.value }))} />
                <input className="border rounded px-2 py-1" placeholder="Cost override (optional)" value={newProductUom.costOverride} onChange={e => setNewProductUom(s => ({ ...s, costOverride: e.target.value }))} />
                <input className="border rounded px-2 py-1 col-span-2" placeholder="Barcode (optional)" value={newProductUom.barcode} onChange={e => setNewProductUom(s => ({ ...s, barcode: e.target.value }))} />
                <div className="col-span-2">
                  <button
                    onClick={() => addProductUomMutation.mutate()}
                    disabled={!productId || !newProductUom.uomId || !Number(newProductUom.conversionFactor) || addProductUomMutation.isPending}
                    className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    {addProductUomMutation.isPending ? 'Adding…' : 'Add mapping'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
