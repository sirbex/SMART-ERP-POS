// Admins Management Page — List, Create, Edit, Delete Super Admins
import { useEffect, useState, useCallback } from 'react';
import { platformApi } from '../../services/platformApi';
import type { PlatformAdmin } from '../../services/platformApi';
import { usePlatformAuth } from '../../contexts/PlatformAuthContext';
import {
  ShieldCheck,
  Plus,
  X,
  RefreshCw,
  AlertCircle,
  Pencil,
  Trash2,
} from 'lucide-react';

// --- Create / Edit Admin Modal ---
interface AdminFormProps {
  open: boolean;
  admin: PlatformAdmin | null; // null = create, non-null = edit
  onClose: () => void;
  onSaved: () => void;
}

function AdminFormModal({ open, admin, onClose, onSaved }: AdminFormProps) {
  const isEdit = !!admin;
  const [form, setForm] = useState({ email: '', fullName: '', password: '', isActive: true });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (admin) {
      setForm({ email: admin.email, fullName: admin.fullName, password: '', isActive: admin.isActive });
    } else {
      setForm({ email: '', fullName: '', password: '', isActive: true });
    }
    setError('');
  }, [admin, open]);

  const handleChange = <K extends keyof typeof form>(field: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (isEdit && admin) {
        const payload: { email?: string; fullName?: string; isActive?: boolean; password?: string } = {
          email: form.email,
          fullName: form.fullName,
          isActive: form.isActive,
        };
        if (form.password) payload.password = form.password;
        const res = await platformApi.admins.update(admin.id, payload);
        if (!res.data.success) { setError(res.data.error || 'Update failed'); return; }
      } else {
        if (!form.password) { setError('Password is required'); return; }
        const res = await platformApi.admins.create({ email: form.email, password: form.password, fullName: form.fullName });
        if (!res.data.success) { setError(res.data.error || 'Creation failed'); return; }
      }
      onSaved();
      onClose();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setError(axiosErr.response?.data?.error || 'Operation failed');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-xl shadow-xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">{isEdit ? 'Edit Admin' : 'Create Admin'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
            <input value={form.fullName} onChange={(e) => handleChange('fullName', e.target.value)} required className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Jane Admin" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input type="email" value={form.email} onChange={(e) => handleChange('email', e.target.value)} required className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="admin@smarterp.com" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Password {isEdit && <span className="text-slate-400 font-normal">(leave blank to keep current)</span>}
            </label>
            <input type="password" value={form.password} onChange={(e) => handleChange('password', e.target.value)} {...(!isEdit ? { required: true } : {})} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder={isEdit ? '••••••••' : 'Strong password'} />
          </div>
          {isEdit && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="admin-active"
                checked={form.isActive}
                onChange={(e) => handleChange('isActive', e.target.checked)}
                className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
              />
              <label htmlFor="admin-active" className="text-sm text-slate-700">Active</label>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
              {saving ? 'Saving...' : isEdit ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// --- Main Admins Page ---
export default function AdminsPage() {
  const { admin: currentAdmin } = usePlatformAuth();
  const [admins, setAdmins] = useState<PlatformAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<PlatformAdmin | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchAdmins = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await platformApi.admins.list();
      if (res.data.success && res.data.data) {
        setAdmins(res.data.data);
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setError(axiosErr.response?.data?.error || 'Failed to load admins');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAdmins(); }, [fetchAdmins]);

  const handleEdit = (admin: PlatformAdmin) => {
    setEditingAdmin(admin);
    setFormOpen(true);
  };

  const handleCreate = () => {
    setEditingAdmin(null);
    setFormOpen(true);
  };

  const handleDelete = async (admin: PlatformAdmin) => {
    if (admin.id === currentAdmin?.id) {
      alert('You cannot delete your own admin account.');
      return;
    }
    if (!window.confirm(`Delete admin "${admin.fullName}" (${admin.email})? This cannot be undone.`)) return;
    setDeleting(admin.id);
    try {
      await platformApi.admins.delete(admin.id);
      fetchAdmins();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      alert(axiosErr.response?.data?.error || 'Delete failed');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Super Admins</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage platform administrator accounts</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchAdmins}
            className="inline-flex items-center gap-2 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
          <button
            onClick={handleCreate}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> New Admin
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3 text-red-700 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <th className="text-left px-4 py-3 font-medium">Name</th>
                  <th className="text-left px-4 py-3 font-medium">Email</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Last Login</th>
                  <th className="text-left px-4 py-3 font-medium">Created</th>
                  <th className="text-right px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {admins.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-slate-400">
                      <ShieldCheck className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      No admin accounts
                    </td>
                  </tr>
                ) : (
                  admins.map((a) => (
                    <tr key={a.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {a.fullName}
                        {a.id === currentAdmin?.id && (
                          <span className="ml-2 text-[10px] text-indigo-500 font-medium bg-indigo-50 px-1.5 py-0.5 rounded">YOU</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{a.email}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          a.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {a.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {a.lastLoginAt ? new Date(a.lastLoginAt).toLocaleDateString() : 'Never'}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{new Date(a.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleEdit(a)}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                            title="Edit admin"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(a)}
                            disabled={deleting === a.id || a.id === currentAdmin?.id}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title={a.id === currentAdmin?.id ? 'Cannot delete yourself' : 'Delete admin'}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal */}
      <AdminFormModal
        open={formOpen}
        admin={editingAdmin}
        onClose={() => { setFormOpen(false); setEditingAdmin(null); }}
        onSaved={fetchAdmins}
      />
    </div>
  );
}
