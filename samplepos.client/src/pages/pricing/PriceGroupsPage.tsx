/**
 * Price Groups — manage pricing modes (Standard retail vs At Cost)
 */

import { useState } from 'react';
import toast from 'react-hot-toast';
import Layout from '../../components/Layout';
import PricingTabs from '../../components/PricingTabs';
import {
  usePriceGroups,
  useCreatePriceGroup,
  useUpdatePriceGroup,
  useDeletePriceGroup,
} from '../../hooks/usePricing';
import { extractApiError } from '../../utils/extractApiError';
import type { PriceGroup, CreatePriceGroupInput, PricingMode } from '../../types/pricing';

function GroupFormModal({
  group,
  onClose,
}: {
  group: PriceGroup | null;
  onClose: () => void;
}) {
  const isEdit = !!group;
  const createMutation = useCreatePriceGroup();
  const updateMutation = useUpdatePriceGroup();

  const [name, setName] = useState(group?.name ?? '');
  const [description, setDescription] = useState(group?.description ?? '');
  const [pricingMode, setPricingMode] = useState<PricingMode>(group?.pricingMode ?? 'STANDARD');
  const [formError, setFormError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!name.trim()) {
      setFormError('Name is required');
      return;
    }

    const payload: CreatePriceGroupInput = {
      name: name.trim(),
      description: description.trim() || undefined,
      pricingMode,
    };

    if (isEdit && group) {
      updateMutation.mutate(
        { id: group.id, data: payload },
        {
          onSuccess: () => {
            toast.success('Price group updated');
            onClose();
          },
          onError: (err: Error) => setFormError(extractApiError(err)),
        },
      );
    } else {
      createMutation.mutate(payload, {
        onSuccess: () => {
          toast.success('Price group created');
          onClose();
        },
        onError: (err: Error) => setFormError(extractApiError(err)),
      });
    }
  };

  const pending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold mb-4">
          {isEdit ? 'Edit Price Group' : 'New Price Group'}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Pricing mode *</label>
            <select
              value={pricingMode}
              onChange={(e) => setPricingMode(e.target.value as PricingMode)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="STANDARD">Standard — retail / rules / discounts</option>
              <option value="AT_COST">At cost — inventory cost (0% margin)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none"
            />
          </div>
          {formError && (
            <p className="text-sm text-red-600">{formError}</p>
          )}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 border rounded-lg text-sm">
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {pending ? 'Saving…' : isEdit ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function PriceGroupsPage() {
  const { data: groups, isLoading, error } = usePriceGroups();
  const deleteMutation = useDeletePriceGroup();
  const [showForm, setShowForm] = useState(false);
  const [editGroup, setEditGroup] = useState<PriceGroup | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id, {
      onSuccess: () => {
        toast.success('Price group deactivated');
        setConfirmDelete(null);
      },
      onError: (err: Error) => toast.error(extractApiError(err)),
    });
  };

  return (
    <Layout>
      <PricingTabs />
      <div className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Price Groups</h1>
            <p className="text-sm text-gray-500 mt-1">
              Control whether customers sell at retail or at inventory cost. Assign on customers or via customer group defaults.
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setEditGroup(null); setShowForm(true); }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            + New Price Group
          </button>
        </div>

        {isLoading && <p className="text-gray-500">Loading…</p>}
        {error && (
          <p className="text-red-600 text-sm">Failed to load price groups</p>
        )}

        {groups && groups.length === 0 && !isLoading && (
          <div className="bg-white border rounded-lg p-8 text-center text-gray-500">
            No price groups found. Seed data usually includes Standard and At Cost.
          </div>
        )}

        {groups && groups.length > 0 && (
          <div className="bg-white border rounded-lg overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Mode</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Description</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {groups.map((g) => (
                  <tr key={g.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{g.name}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          g.pricingMode === 'AT_COST'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {g.pricingMode === 'AT_COST' ? 'At cost' : 'Standard'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{g.description || '—'}</td>
                    <td className="px-4 py-3">
                      {g.isActive ? (
                        <span className="text-green-700">Active</span>
                      ) : (
                        <span className="text-gray-400">Inactive</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => { setEditGroup(g); setShowForm(true); }}
                        className="text-blue-600 hover:text-blue-800 text-xs"
                      >
                        Edit
                      </button>
                      {g.isActive && (
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(g.id)}
                          className="text-red-600 hover:text-red-800 text-xs"
                        >
                          Deactivate
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {showForm && (
          <GroupFormModal
            group={editGroup}
            onClose={() => { setShowForm(false); setEditGroup(null); }}
          />
        )}

        {confirmDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmDelete(null)} />
            <div className="relative bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
              <h3 className="text-lg font-semibold mb-2">Deactivate price group?</h3>
              <p className="text-sm text-gray-600 mb-4">
                Existing customer links stay in place but the group will not be offered for new assignments.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(null)}
                  className="px-4 py-2 border rounded-lg text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(confirmDelete)}
                  disabled={deleteMutation.isPending}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50"
                >
                  Deactivate
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
