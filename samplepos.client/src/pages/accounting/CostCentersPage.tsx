import { useState } from 'react';
import { useCostCenters, useCostCenterHierarchy, useCreateCostCenter, useUpdateCostCenter } from '../../hooks/useAccountingModules';
import { Building2, Plus, ChevronRight, ChevronDown, FolderTree, Edit2, X } from 'lucide-react';

interface CostCenter {
  id: string;
  code: string;
  name: string;
  description?: string;
  parentId?: string;
  managerId?: string;
  isActive: boolean;
  createdAt: string;
  children?: CostCenter[];
}

export default function CostCentersPage() {
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<CostCenter | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'hierarchy'>('list');
  const { data: costCenters, isLoading } = useCostCenters();
  const { data: hierarchy } = useCostCenterHierarchy();
  const createMutation = useCreateCostCenter();
  const updateMutation = useUpdateCostCenter();

  const [form, setForm] = useState({ code: '', name: '', description: '', parentId: '' });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createMutation.mutateAsync({
      code: form.code,
      name: form.name,
      description: form.description || undefined,
      parentId: form.parentId || undefined,
    });
    setForm({ code: '', name: '', description: '', parentId: '' });
    setShowForm(false);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editItem) return;
    await updateMutation.mutateAsync({
      id: editItem.id,
      data: { name: form.name, description: form.description || undefined },
    });
    setEditItem(null);
    setForm({ code: '', name: '', description: '', parentId: '' });
  };

  const startEdit = (cc: CostCenter) => {
    setEditItem(cc);
    setForm({ code: cc.code, name: cc.name, description: cc.description || '', parentId: cc.parentId || '' });
    setShowForm(false);
  };

  const items = (Array.isArray(costCenters) ? costCenters : []) as CostCenter[];
  const tree = (Array.isArray(hierarchy) ? hierarchy : []) as CostCenter[];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cost Centers</h1>
          <p className="text-sm text-gray-500 mt-1">Manage organizational cost centers for expense allocation</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode(viewMode === 'list' ? 'hierarchy' : 'list')}
            className="inline-flex items-center px-3 py-2 text-sm border rounded-lg hover:bg-gray-50"
          >
            <FolderTree className="h-4 w-4 mr-2" />
            {viewMode === 'list' ? 'Hierarchy' : 'List'} View
          </button>
          <button
            onClick={() => { setShowForm(true); setEditItem(null); setForm({ code: '', name: '', description: '', parentId: '' }); }}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
          >
            <Plus className="h-4 w-4 mr-2" /> Add Cost Center
          </button>
        </div>
      </div>

      {/* Create / Edit Form */}
      {(showForm || editItem) && (
        <div className="bg-white border rounded-lg p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">{editItem ? 'Edit Cost Center' : 'New Cost Center'}</h2>
            <button onClick={() => { setShowForm(false); setEditItem(null); }} className="text-gray-400 hover:text-gray-600">
              <X className="h-5 w-5" />
            </button>
          </div>
          <form onSubmit={editItem ? handleUpdate : handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Code</label>
              <input
                type="text"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                disabled={!!editItem}
                required
                className="w-full px-3 py-2 border rounded-lg text-sm disabled:bg-gray-100"
                placeholder="e.g., CC-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                className="w-full px-3 py-2 border rounded-lg text-sm"
                placeholder="e.g., Marketing Department"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-sm"
                placeholder="Optional description"
              />
            </div>
            {!editItem && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Parent Cost Center</label>
                <select
                  value={form.parentId}
                  onChange={(e) => setForm({ ...form, parentId: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                >
                  <option value="">None (Top Level)</option>
                  {items.map((cc) => (
                    <option key={cc.id} value={cc.id}>{cc.code} - {cc.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="md:col-span-2 flex justify-end gap-2">
              <button type="button" onClick={() => { setShowForm(false); setEditItem(null); }} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">
                Cancel
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {editItem ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Loading cost centers...</div>
      ) : viewMode === 'list' ? (
        <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">No cost centers found. Create your first one above.</td>
                </tr>
              ) : items.map((cc) => (
                <tr key={cc.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{cc.code}</td>
                  <td className="px-6 py-4 text-sm text-gray-700">{cc.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{cc.description || '—'}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${cc.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {cc.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => startEdit(cc)} className="text-blue-600 hover:text-blue-800">
                      <Edit2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white border rounded-lg shadow-sm p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-4 uppercase">Hierarchy</h3>
          {tree.length === 0 ? (
            <p className="text-gray-500 text-sm">No hierarchy data.</p>
          ) : (
            <HierarchyTree nodes={tree} />
          )}
        </div>
      )}
    </div>
  );
}

function HierarchyTree({ nodes, level = 0 }: { nodes: CostCenter[]; level?: number }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div style={{ paddingLeft: level * 20 }}>
      {nodes.map((node) => (
        <div key={node.id}>
          <div
            className="flex items-center py-2 px-3 rounded hover:bg-gray-50 cursor-pointer"
            onClick={() => node.children?.length && toggle(node.id)}
          >
            {node.children?.length ? (
              expanded.has(node.id) ? <ChevronDown className="h-4 w-4 text-gray-400 mr-2" /> : <ChevronRight className="h-4 w-4 text-gray-400 mr-2" />
            ) : (
              <Building2 className="h-4 w-4 text-gray-300 mr-2" />
            )}
            <span className="text-sm font-medium text-gray-800 mr-2">{node.code}</span>
            <span className="text-sm text-gray-600">{node.name}</span>
          </div>
          {expanded.has(node.id) && node.children?.length && (
            <HierarchyTree nodes={node.children} level={level + 1} />
          )}
        </div>
      ))}
    </div>
  );
}
