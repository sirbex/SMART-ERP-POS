/**
 * CustomerGroupsPanel — Full CRUD management for customer groups
 *
 * Features:
 * - List all groups with stats (customer count, rule count, discount)
 * - Create / Edit / Delete groups
 * - View members of each group
 * - Assign / Unassign customers
 */

import { useState, useRef, useEffect } from 'react';
import {
  useCustomerGroupsList,
  useGroupCustomers,
  useCreateGroup,
  useUpdateGroup,
  useDeleteGroup,
  useUnassignCustomer,
  useAssignCustomer,
} from '../../hooks/useCustomerGroups';
import { useCustomers } from '../../hooks/useApi';
import { formatCurrency } from '../../utils/currency';
import { useCanAccess } from '../auth/ProtectedRoute';
import type { CustomerGroupData } from '../../api/customerGroups';

// ============================================================================
// Main Panel
// ============================================================================

export default function CustomerGroupsPanel() {
  const [search, setSearch] = useState('');
  const [editGroup, setEditGroup] = useState<CustomerGroupData | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const canManage = useCanAccess([], ['customers.create']);

  const { data: groups, isLoading, error } = useCustomerGroupsList(
    search ? { search } : undefined,
  );
  const deleteMutation = useDeleteGroup();

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id, {
      onSuccess: () => {
        setConfirmDelete(null);
        if (selectedGroupId === id) setSelectedGroupId(null);
      },
    });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Customer Groups</h3>
          <p className="text-sm text-gray-500">
            Manage pricing tiers and group-based discounts
          </p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <input
            type="text"
            placeholder="Search groups..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 sm:w-56 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {canManage && (
            <button
              onClick={() => { setEditGroup(null); setShowCreate(true); }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 whitespace-nowrap"
            >
              + New Group
            </button>
          )}
        </div>
      </div>

      {/* Loading / Error */}
      {isLoading && (
        <div className="text-center py-8 text-gray-500">Loading customer groups...</div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
          Failed to load customer groups
        </div>
      )}

      {/* Groups Grid */}
      {groups && groups.length === 0 && !isLoading && (
        <div className="bg-white rounded-lg shadow border border-gray-200 p-8 text-center text-gray-500">
          <p className="text-base mb-1">No customer groups yet</p>
          <p className="text-sm">Create your first group to start managing pricing tiers</p>
        </div>
      )}

      {groups && groups.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {groups.map((group) => (
            <div
              key={group.id}
              className={`bg-white rounded-lg shadow border p-4 cursor-pointer transition-all hover:shadow-md ${selectedGroupId === group.id
                  ? 'border-blue-500 ring-2 ring-blue-100'
                  : 'border-gray-200'
                }`}
              onClick={() => setSelectedGroupId(selectedGroupId === group.id ? null : group.id)}
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-gray-900 truncate">{group.name}</h4>
                    <span
                      className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${group.isActive
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                        }`}
                    >
                      {group.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  {group.description && (
                    <p className="text-sm text-gray-500 mt-1 line-clamp-2">{group.description}</p>
                  )}
                </div>
                {canManage && (
                  <div className="flex items-center gap-1 ml-2 shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditGroup(group); setShowCreate(true); }}
                      className="p-1.5 text-gray-400 hover:text-blue-600 rounded"
                      title="Edit group"
                    >
                      ✎
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmDelete(group.id); }}
                      className="p-1.5 text-gray-400 hover:text-red-600 rounded"
                      title="Delete group"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="bg-gray-50 rounded p-2">
                  <div className="text-lg font-bold text-gray-900">
                    {Math.round(group.discountPercentage * 100 * 100) / 100}%
                  </div>
                  <div className="text-xs text-gray-500">Discount</div>
                </div>
                <div className="bg-gray-50 rounded p-2">
                  <div className="text-lg font-bold text-blue-600">{group.customerCount}</div>
                  <div className="text-xs text-gray-500">Customers</div>
                </div>
                <div className="bg-gray-50 rounded p-2">
                  <div className="text-lg font-bold text-purple-600">{group.ruleCount}</div>
                  <div className="text-xs text-gray-500">Price Rules</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Selected Group Detail */}
      {selectedGroupId && (
        <GroupMembersPanel
          groupId={selectedGroupId}
          canManage={canManage}
        />
      )}

      {/* Create/Edit Modal */}
      {showCreate && (
        <GroupFormModal
          group={editGroup}
          onClose={() => { setShowCreate(false); setEditGroup(null); }}
        />
      )}

      {/* Delete Confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmDelete(null)} />
          <div className="relative bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4" role="dialog" aria-modal="true">
            <h3 className="text-lg font-semibold mb-2">Delete Group?</h3>
            <p className="text-sm text-gray-600 mb-4">
              This will remove the group and unassign all customers from it. Price rules linked to this group will remain but become ineffective.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Group Members Panel
// ============================================================================

function GroupMembersPanel({
  groupId,
  canManage,
}: {
  groupId: string;
  canManage: boolean;
}) {
  const { data: members, isLoading } = useGroupCustomers(groupId);
  const unassignMutation = useUnassignCustomer();
  const [showAssign, setShowAssign] = useState(false);

  return (
    <div className="bg-white rounded-lg shadow border border-gray-200">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <h4 className="font-semibold text-gray-900">Group Members</h4>
        {canManage && (
          <button
            onClick={() => setShowAssign(true)}
            className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
          >
            + Add Customer
          </button>
        )}
      </div>

      {isLoading && (
        <div className="p-4 text-center text-gray-500 text-sm">Loading members...</div>
      )}

      {members && members.length === 0 && (
        <div className="p-6 text-center text-gray-500 text-sm">
          No customers assigned to this group yet
        </div>
      )}

      {members && members.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
                {canManage && (
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {members.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <div className="font-medium text-gray-900">{m.name}</div>
                    <div className="text-xs text-gray-400">{m.customerNumber}</div>
                  </td>
                  <td className="px-4 py-2 text-gray-600">
                    {m.email || m.phone || '—'}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">
                    {formatCurrency(m.balance)}
                  </td>
                  {canManage && (
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() =>
                          unassignMutation.mutate({ groupId, customerId: m.id })
                        }
                        disabled={unassignMutation.isPending}
                        className="text-xs text-red-600 hover:text-red-800"
                      >
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAssign && (
        <AssignCustomerModal
          groupId={groupId}
          existingMemberIds={members?.map((m) => m.id) || []}
          onClose={() => setShowAssign(false)}
        />
      )}
    </div>
  );
}

// ============================================================================
// Create / Edit Modal
// ============================================================================

function GroupFormModal({
  group,
  onClose,
}: {
  group: CustomerGroupData | null;
  onClose: () => void;
}) {
  const isEdit = !!group;
  const createMutation = useCreateGroup();
  const updateMutation = useUpdateGroup();

  const [name, setName] = useState(group?.name ?? '');
  const [description, setDescription] = useState(group?.description ?? '');
  const [discount, setDiscount] = useState(
    group?.discountPercentage != null
      ? String(Math.round(group.discountPercentage * 100 * 100) / 100)
      : '0'
  );
  const [isActive, setIsActive] = useState(group?.isActive ?? true);
  const [formError, setFormError] = useState('');

  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = modalRef.current?.querySelector('input') as HTMLElement | null;
    el?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const discountNum = parseFloat(discount);
    if (isNaN(discountNum) || discountNum < 0 || discountNum > 100) {
      setFormError('Discount must be between 0 and 100');
      return;
    }
    if (!name.trim()) {
      setFormError('Name is required');
      return;
    }

    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      discountPercentage: discountNum,
      isActive,
    };

    if (isEdit && group) {
      updateMutation.mutate(
        { id: group.id, data: payload },
        { onSuccess: onClose, onError: (err: Error) => setFormError(err.message) },
      );
    } else {
      createMutation.mutate(payload, {
        onSuccess: onClose,
        onError: (err: Error) => setFormError(err.message),
      });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? 'Edit Customer Group' : 'Create Customer Group'}
        className="relative bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4"
      >
        <h3 className="text-lg font-semibold mb-4">
          {isEdit ? 'Edit Customer Group' : 'New Customer Group'}
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Group Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              placeholder="e.g. Wholesale, VIP, Government"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none"
              placeholder="Optional description"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Default Discount (%)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            <p className="text-xs text-gray-400 mt-1">
              Flat discount applied when no specific price rule matches
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="groupActive"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded border-gray-300"
            />
            <label htmlFor="groupActive" className="text-sm text-gray-700">
              Active
            </label>
          </div>

          {formError && (
            <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">
              {formError}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {isPending ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Group'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// Assign Customer Modal
// ============================================================================

function AssignCustomerModal({
  groupId,
  existingMemberIds,
  onClose,
}: {
  groupId: string;
  existingMemberIds: string[];
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const { data: customersResp } = useCustomers(1, 100);
  const assignMutation = useAssignCustomer();

  const customers = (customersResp?.data ?? []) as Array<{
    id: string;
    name: string;
    customerNumber?: string;
  }>;
  const available = customers.filter(
    (c) =>
      !existingMemberIds.includes(c.id) &&
      (c.name.toLowerCase().includes(search.toLowerCase()) ||
        (c.customerNumber || '').toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add Customer to Group"
        className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[80vh] flex flex-col"
      >
        <div className="p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold">Add Customer to Group</h3>
          <input
            type="text"
            placeholder="Search customers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            autoFocus
          />
        </div>
        <div className="overflow-y-auto flex-1 p-2">
          {available.length === 0 && (
            <div className="p-4 text-center text-gray-500 text-sm">
              No available customers found
            </div>
          )}
          {available.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                assignMutation.mutate(
                  { groupId, customerId: c.id },
                  { onSuccess: onClose },
                );
              }}
              disabled={assignMutation.isPending}
              className="w-full text-left px-3 py-2 rounded hover:bg-blue-50 flex items-center justify-between"
            >
              <div>
                <div className="font-medium text-sm text-gray-900">{c.name}</div>
                <div className="text-xs text-gray-400">{c.customerNumber}</div>
              </div>
              <span className="text-xs text-blue-600 font-medium">Add</span>
            </button>
          ))}
        </div>
        <div className="p-3 border-t border-gray-200">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
