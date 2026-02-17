// Tenants Management Page — List, Create, Edit, Suspend/Activate, View Details
import { useEffect, useState, useCallback } from 'react';
import { platformApi } from '../../services/platformApi';
import type { Tenant, TenantUsage, BillingInfo, AuditLogEntry, LimitCheck, BillingEvent } from '../../services/platformApi';
import {
  Building2,
  Plus,
  Search,
  X,
  RefreshCw,
  AlertCircle,
  Eye,
  Pause,
  Play,
  ChevronDown,
  Edit,
  DollarSign,
  Clock,
  Shield,
  AlertTriangle,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownRight,
  Trash2,
  FileText,
} from 'lucide-react';

// ============================================================
// Plan constants
// ============================================================
const PLAN_ORDER = ['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'] as const;
const PLAN_FEATURES: Record<string, string[]> = {
  FREE: ['POS', 'Basic Reports'],
  STARTER: ['POS', 'Inventory', 'Customers', 'Reports', 'Invoices'],
  PROFESSIONAL: ['POS', 'Inventory', 'Customers', 'Reports', 'Invoices', 'Accounting', 'Purchase Orders', 'Edge Sync'],
  ENTERPRISE: ['All Features', 'API Access', 'Custom Domain', 'Priority Support'],
};
const PLAN_PRICING: Record<string, number> = { FREE: 0, STARTER: 29, PROFESSIONAL: 99, ENTERPRISE: 299 };

// ============================================================
// Usage Progress Bar
// ============================================================
function UsageBar({ label, current, max, unit }: { label: string; current: number; max: number; unit?: string }) {
  const pct = max > 0 ? Math.min((current / max) * 100, 100) : 0;
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500';
  const textColor = pct >= 90 ? 'text-red-600' : pct >= 70 ? 'text-amber-600' : 'text-slate-600';
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-500">{label}</span>
        <span className={`text-xs font-medium ${textColor}`}>
          {current.toLocaleString()}{unit ? ` ${unit}` : ''} / {max.toLocaleString()}{unit ? ` ${unit}` : ''}
        </span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ============================================================
// Create Tenant Modal — fields match CreateTenantSchema
// ============================================================
function CreateTenantModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const initialForm = {
    name: '', slug: '', plan: 'FREE',
    billingEmail: '', ownerEmail: '', ownerPassword: '', ownerFullName: '',
    country: 'UG', currency: 'UGX', timezone: 'Africa/Kampala',
  };
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setForm(initialForm); setError(''); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = <K extends keyof typeof form>(field: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handleNameChange = (value: string) => {
    const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    setForm((f) => ({ ...f, name: value, slug }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.ownerPassword.length < 8) { setError('Admin password must be at least 8 characters'); return; }
    setSaving(true);
    try {
      const res = await platformApi.tenants.create(form);
      if (res.data.success) { onCreated(); onClose(); }
      else setError(res.data.error || 'Failed to create tenant');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setError(axiosErr.response?.data?.error || 'Failed to create tenant');
    } finally { setSaving(false); }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white w-full max-w-xl rounded-xl shadow-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Provision New Tenant</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Organization */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-slate-700 border-b border-slate-200 pb-1 w-full">Organization</legend>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Name <span className="text-red-400">*</span></label>
                <input value={form.name} onChange={(e) => handleNameChange(e.target.value)} required className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Acme Corp" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Slug <span className="text-red-400">*</span></label>
                <input value={form.slug} onChange={(e) => handleChange('slug', e.target.value)} required className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="acme-corp" />
                <p className="text-xs text-slate-400 mt-0.5">Lowercase + hyphens only. Used in URLs.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Plan</label>
                <select value={form.plan} onChange={(e) => handleChange('plan', e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="FREE">Free — $0/mo</option>
                  <option value="STARTER">Starter — $29/mo</option>
                  <option value="PROFESSIONAL">Professional — $99/mo</option>
                  <option value="ENTERPRISE">Enterprise — $299/mo</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Billing Email <span className="text-red-400">*</span></label>
                <input type="email" value={form.billingEmail} onChange={(e) => handleChange('billingEmail', e.target.value)} required className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="billing@acme.com" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Country</label>
                <input value={form.country} onChange={(e) => handleChange('country', e.target.value)} maxLength={2} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="UG" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Currency</label>
                <input value={form.currency} onChange={(e) => handleChange('currency', e.target.value)} maxLength={3} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="UGX" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Timezone</label>
                <input value={form.timezone} onChange={(e) => handleChange('timezone', e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Africa/Kampala" />
              </div>
            </div>
          </fieldset>
          {/* Initial Admin */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-slate-700 border-b border-slate-200 pb-1 w-full">Initial Admin Account</legend>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Full Name <span className="text-red-400">*</span></label>
                <input value={form.ownerFullName} onChange={(e) => handleChange('ownerFullName', e.target.value)} required className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="John Doe" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email <span className="text-red-400">*</span></label>
                <input type="email" value={form.ownerEmail} onChange={(e) => handleChange('ownerEmail', e.target.value)} required className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="admin@acme.com" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password <span className="text-red-400">*</span></label>
              <input type="password" value={form.ownerPassword} onChange={(e) => handleChange('ownerPassword', e.target.value)} required minLength={8} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Min 8 characters" />
            </div>
          </fieldset>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
              {saving ? 'Provisioning...' : 'Provision Tenant'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// Edit Tenant Modal
// ============================================================
function EditTenantModal({ tenant, open, onClose, onSaved }: { tenant: Tenant; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: tenant.name,
    billingEmail: tenant.billingEmail || '',
    country: tenant.country || 'UG',
    currency: tenant.currency || 'UGX',
    timezone: tenant.timezone || 'Africa/Kampala',
    customDomain: tenant.customDomain || '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        name: tenant.name, billingEmail: tenant.billingEmail || '',
        country: tenant.country || 'UG', currency: tenant.currency || 'UGX',
        timezone: tenant.timezone || 'Africa/Kampala', customDomain: tenant.customDomain || '',
      });
      setError('');
    }
  }, [open, tenant]);

  const handleChange = <K extends keyof typeof form>(field: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const res = await platformApi.tenants.update(tenant.id, form);
      if (res.data.success) { onSaved(); onClose(); }
      else setError(res.data.error || 'Failed to update tenant');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setError(axiosErr.response?.data?.error || 'Failed to update tenant');
    } finally { setSaving(false); }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white w-full max-w-lg rounded-xl shadow-xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Edit — {tenant.slug}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Organization Name</label>
            <input value={form.name} onChange={(e) => handleChange('name', e.target.value)} required className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Billing Email</label>
            <input type="email" value={form.billingEmail} onChange={(e) => handleChange('billingEmail', e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Country</label>
              <input value={form.country} onChange={(e) => handleChange('country', e.target.value)} maxLength={2} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Currency</label>
              <input value={form.currency} onChange={(e) => handleChange('currency', e.target.value)} maxLength={3} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Timezone</label>
              <input value={form.timezone} onChange={(e) => handleChange('timezone', e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Custom Domain</label>
            <input value={form.customDomain} onChange={(e) => handleChange('customDomain', e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="pos.acme.com" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// Plan Change Modal
// ============================================================
function PlanChangeModal({ tenant, open, onClose, onChanged }: { tenant: Tenant; open: boolean; onClose: () => void; onChanged: () => void }) {
  const [selectedPlan, setSelectedPlan] = useState(tenant.plan);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (open) { setSelectedPlan(tenant.plan); setError(''); } }, [open, tenant.plan]);

  const handleSubmit = async () => {
    if (selectedPlan === tenant.plan) { onClose(); return; }
    setError('');
    setSaving(true);
    try {
      const res = await platformApi.tenants.changePlan(tenant.id, selectedPlan);
      if (res.data.success) { onChanged(); onClose(); }
      else setError(res.data.error || 'Failed to change plan');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setError(axiosErr.response?.data?.error || 'Failed to change plan');
    } finally { setSaving(false); }
  };

  if (!open) return null;

  const isUpgrade = PLAN_ORDER.indexOf(selectedPlan) > PLAN_ORDER.indexOf(tenant.plan);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-xl shadow-xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Change Plan</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-sm text-slate-500">Current: <strong className="text-slate-800">{tenant.plan}</strong> (${PLAN_PRICING[tenant.plan]}/mo)</p>
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>}
        <div className="space-y-2">
          {PLAN_ORDER.map((plan) => (
            <label key={plan} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${selectedPlan === plan ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'}`}>
              <input type="radio" name="plan" value={plan} checked={selectedPlan === plan} onChange={() => setSelectedPlan(plan)} className="accent-indigo-600" />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-900">{plan}</span>
                  <span className="text-sm text-slate-500">${PLAN_PRICING[plan]}/mo</span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">{PLAN_FEATURES[plan]?.join(', ')}</p>
              </div>
            </label>
          ))}
        </div>
        {selectedPlan !== tenant.plan && (
          <div className={`flex items-center gap-2 text-sm p-2 rounded-lg ${isUpgrade ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
            {isUpgrade ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
            {isUpgrade ? 'Upgrade' : 'Downgrade'}: {tenant.plan} → {selectedPlan} (${PLAN_PRICING[selectedPlan]}/mo)
          </div>
        )}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50">Cancel</button>
          <button onClick={handleSubmit} disabled={saving || selectedPlan === tenant.plan} className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
            {saving ? 'Changing...' : 'Confirm Change'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Tenant Detail Drawer — Tabs: Overview | Usage | Billing | Audit
// ============================================================
type DrawerTab = 'overview' | 'usage' | 'billing' | 'audit';

function TenantDetailDrawer({ tenant, onClose, onRefresh }: { tenant: Tenant; onClose: () => void; onRefresh: () => void }) {
  const [tab, setTab] = useState<DrawerTab>('overview');
  const [usage, setUsage] = useState<TenantUsage | null>(null);
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [limits, setLimits] = useState<LimitCheck | null>(null);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [billingEvents, setBillingEvents] = useState<BillingEvent[]>([]);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [editOpen, setEditOpen] = useState(false);
  const [planChangeOpen, setPlanChangeOpen] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [deactivateConfirm, setDeactivateConfirm] = useState('');
  const [deactivateError, setDeactivateError] = useState('');

  const handleDeactivate = async () => {
    if (deactivateConfirm !== tenant.slug) {
      setDeactivateError(`Type "${tenant.slug}" to confirm`);
      return;
    }
    setDeactivating(true);
    setDeactivateError('');
    try {
      await platformApi.tenants.updateStatus(tenant.id, 'DEACTIVATED', 'Deactivated by super admin');
      onRefresh();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setDeactivateError(axiosErr.response?.data?.error || 'Failed to deactivate tenant');
    } finally {
      setDeactivating(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    if (tab === 'usage' || tab === 'overview') {
      setLoading((l) => ({ ...l, usage: true }));
      Promise.all([platformApi.tenants.getUsage(tenant.id), platformApi.tenants.checkLimits(tenant.id)])
        .then(([uRes, lRes]) => {
          if (cancelled) return;
          if (uRes.data.success && uRes.data.data) setUsage(uRes.data.data);
          if (lRes.data.success && lRes.data.data) setLimits(lRes.data.data);
        })
        .catch(() => {})
        .finally(() => { if (!cancelled) setLoading((l) => ({ ...l, usage: false })); });
    }
    if (tab === 'billing') {
      setLoading((l) => ({ ...l, billing: true }));
      Promise.all([
        platformApi.tenants.getBilling(tenant.id),
        platformApi.tenants.getBillingEvents(tenant.id),
      ])
        .then(([billingRes, eventsRes]) => {
          if (cancelled) return;
          if (billingRes.data.success && billingRes.data.data) setBilling(billingRes.data.data);
          if (eventsRes.data.success && eventsRes.data.data) setBillingEvents(eventsRes.data.data);
        })
        .catch(() => {})
        .finally(() => { if (!cancelled) setLoading((l) => ({ ...l, billing: false })); });
    }
    if (tab === 'audit') {
      setLoading((l) => ({ ...l, audit: true }));
      platformApi.tenants.getAuditLog(tenant.id, 100)
        .then((res) => { if (!cancelled && res.data.success && res.data.data) setAuditLog(res.data.data); })
        .catch(() => {})
        .finally(() => { if (!cancelled) setLoading((l) => ({ ...l, audit: false })); });
    }
    return () => { cancelled = true; };
  }, [tab, tenant.id]);

  const statusColor: Record<string, string> = {
    ACTIVE: 'bg-emerald-100 text-emerald-700', SUSPENDED: 'bg-red-100 text-red-700',
    PENDING: 'bg-amber-100 text-amber-700', PROVISIONING: 'bg-blue-100 text-blue-700',
    DEACTIVATED: 'bg-slate-100 text-slate-500',
  };

  const drawerTabs: { key: DrawerTab; label: string; icon: React.ElementType }[] = [
    { key: 'overview', label: 'Overview', icon: Building2 },
    { key: 'usage',    label: 'Usage',    icon: Shield },
    { key: 'billing',  label: 'Billing',  icon: DollarSign },
    { key: 'audit',    label: 'Audit',    icon: Clock },
  ];

  return (
    <>
      <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
        <div className="w-full max-w-lg bg-white h-full shadow-xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-slate-200">
            <div>
              <h3 className="font-semibold text-slate-900">{tenant.name}</h3>
              <p className="text-xs text-slate-400 font-mono">{tenant.slug}</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setEditOpen(true)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg" title="Edit tenant"><Edit className="w-4 h-4" /></button>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-slate-200">
            {drawerTabs.map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => setTab(key)} className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors ${tab === key ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>
                <Icon className="w-3.5 h-3.5" />{label}
              </button>
            ))}
          </div>

          <div className="p-5 space-y-5">
            {/* ── Overview ── */}
            {tab === 'overview' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Status</p>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[tenant.status] || ''}`}>{tenant.status}</span>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Plan</p>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-700">{tenant.plan}</span>
                      <button onClick={() => setPlanChangeOpen(true)} className="text-xs text-indigo-600 hover:underline">Change</button>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Country / Currency</p>
                    <p className="text-sm text-slate-700">{tenant.country} / {tenant.currency}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Timezone</p>
                    <p className="text-sm text-slate-700">{tenant.timezone}</p>
                  </div>
                </div>
                {tenant.billingEmail && (
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Billing Email</p>
                    <p className="text-sm text-slate-700">{tenant.billingEmail}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Database</p>
                  <p className="font-mono text-xs text-slate-600">{tenant.databaseName} @ {tenant.databaseHost}:{tenant.databasePort}</p>
                </div>
                {tenant.customDomain && (
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Custom Domain</p>
                    <p className="text-sm text-slate-700">{tenant.customDomain}</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Created</p>
                    <p className="text-sm text-slate-700">{new Date(tenant.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Edge Sync</p>
                    <p className="text-sm text-slate-700">{tenant.edgeEnabled ? 'Enabled' : 'Disabled'}</p>
                  </div>
                </div>
                <hr className="border-slate-200" />
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Plan Features</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(PLAN_FEATURES[tenant.plan] || []).map((f) => (
                      <span key={f} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs">{f}</span>
                    ))}
                  </div>
                </div>
                {usage && (
                  <>
                    <hr className="border-slate-200" />
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Quick Usage</p>
                      <div className="space-y-2">
                        <UsageBar label="Users" current={usage.userCount} max={tenant.maxUsers} />
                        <UsageBar label="Products" current={usage.productCount} max={tenant.maxProducts} />
                        <UsageBar label="Sales (this month)" current={usage.salesThisMonth} max={tenant.maxTransactionsPerMonth} />
                      </div>
                    </div>
                  </>
                )}

                {/* Danger Zone — Deactivate */}
                {tenant.status !== 'DEACTIVATED' && (
                  <>
                    <hr className="border-slate-200" />
                    <div className="border border-red-200 bg-red-50/50 rounded-lg p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Trash2 className="w-4 h-4 text-red-500" />
                        <p className="text-sm font-semibold text-red-700">Danger Zone</p>
                      </div>
                      <p className="text-xs text-red-600">
                        Deactivating a tenant removes database access and marks it inactive. Data is preserved but the tenant cannot log in.
                        This action is reversible by reactivating.
                      </p>
                      <div>
                        <label className="block text-xs text-red-600 mb-1">
                          Type <strong>{tenant.slug}</strong> to confirm:
                        </label>
                        <input
                          value={deactivateConfirm}
                          onChange={(e) => { setDeactivateConfirm(e.target.value); setDeactivateError(''); }}
                          placeholder={tenant.slug}
                          className="w-full border border-red-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                        />
                      </div>
                      {deactivateError && (
                        <p className="text-xs text-red-600">{deactivateError}</p>
                      )}
                      <button
                        onClick={handleDeactivate}
                        disabled={deactivating || deactivateConfirm !== tenant.slug}
                        className="w-full px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {deactivating ? 'Deactivating...' : 'Deactivate Tenant'}
                      </button>
                    </div>
                  </>
                )}
                {tenant.status === 'DEACTIVATED' && (
                  <>
                    <hr className="border-slate-200" />
                    <div className="border border-slate-200 bg-slate-50 rounded-lg p-4 text-center">
                      <p className="text-sm text-slate-500 mb-2">This tenant is deactivated.</p>
                      <p className="text-xs text-slate-400">Deactivated on {tenant.deactivatedAt ? new Date(tenant.deactivatedAt).toLocaleDateString() : 'Unknown'}</p>
                    </div>
                  </>
                )}
              </>
            )}

            {/* ── Usage ── */}
            {tab === 'usage' && (
              <>
                {loading.usage ? (
                  <div className="flex items-center gap-2 justify-center py-8 text-slate-400"><RefreshCw className="w-5 h-5 animate-spin" /> Loading usage data...</div>
                ) : usage ? (
                  <div className="space-y-5">
                    {limits && (
                      <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${limits.withinLimits ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                        {limits.withinLimits ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                        {limits.withinLimits ? 'All usage within plan limits' : 'One or more limits exceeded'}
                      </div>
                    )}
                    <div className="space-y-3">
                      <UsageBar label="Users" current={usage.userCount} max={tenant.maxUsers} />
                      <UsageBar label="Products" current={usage.productCount} max={tenant.maxProducts} />
                      <UsageBar label="Sales (this month)" current={usage.salesThisMonth} max={tenant.maxTransactionsPerMonth} />
                      <UsageBar label="Storage" current={usage.storageUsedMb} max={tenant.storageLimitMb || 100} unit="MB" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { val: usage.userCount, label: 'Active Users' },
                        { val: usage.productCount, label: 'Products' },
                        { val: usage.salesThisMonth, label: 'Sales This Month' },
                        { val: usage.storageUsedMb, label: 'Storage (MB)' },
                      ].map((item) => (
                        <div key={item.label} className="bg-slate-50 rounded-lg p-3 text-center">
                          <p className="text-2xl font-bold text-slate-900">{item.val}</p>
                          <p className="text-xs text-slate-500">{item.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 text-center py-8">Usage data unavailable</p>
                )}
              </>
            )}

            {/* ── Billing ── */}
            {tab === 'billing' && (
              <>
                {loading.billing ? (
                  <div className="flex items-center gap-2 justify-center py-8 text-slate-400"><RefreshCw className="w-5 h-5 animate-spin" /> Loading billing...</div>
                ) : billing ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Plan</p>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-slate-900">{billing.plan}</p>
                          <button onClick={() => setPlanChangeOpen(true)} className="text-xs text-indigo-600 hover:underline">Change</button>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Status</p>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          billing.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' :
                          billing.status === 'TRIALING' ? 'bg-blue-100 text-blue-700' :
                          billing.status === 'PAST_DUE' ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-700'
                        }`}>{billing.status}</span>
                      </div>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-4">
                      <p className="text-3xl font-bold text-slate-900">${billing.amount}<span className="text-base font-normal text-slate-400">/{billing.currency}/mo</span></p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Current Period</p>
                        <p className="text-sm text-slate-700">{billing.currentPeriodStart} — {billing.currentPeriodEnd}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Next Billing</p>
                        <p className="text-sm text-slate-700">{billing.nextBillingDate}</p>
                      </div>
                    </div>
                    {billing.cancelAtPeriodEnd && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">Subscription set to cancel at end of period</div>
                    )}

                    {/* Billing Events */}
                    <hr className="border-slate-200" />
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <FileText className="w-4 h-4 text-slate-400" />
                        <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">Billing Events</p>
                      </div>
                      {billingEvents.length === 0 ? (
                        <p className="text-sm text-slate-400 text-center py-4">No billing events this period</p>
                      ) : (
                        <div className="space-y-2">
                          {billingEvents.map((event) => (
                            <div key={event.eventType} className="flex items-center justify-between py-2 px-3 bg-slate-50 rounded-lg">
                              <span className="text-sm text-slate-700">{event.eventType.replace(/_/g, ' ')}</span>
                              <span className="text-sm font-semibold text-slate-900">{event.totalQuantity}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 text-center py-8">Billing data unavailable</p>
                )}
              </>
            )}

            {/* ── Audit Log ── */}
            {tab === 'audit' && (
              <>
                {loading.audit ? (
                  <div className="flex items-center gap-2 justify-center py-8 text-slate-400"><RefreshCw className="w-5 h-5 animate-spin" /> Loading audit log...</div>
                ) : auditLog.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-8">No audit entries yet</p>
                ) : (
                  <div className="space-y-2">
                    {auditLog.map((entry) => (
                      <div key={entry.id} className="border border-slate-100 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-slate-800">{entry.action}</span>
                          <span className="text-xs text-slate-400">{new Date(entry.createdAt).toLocaleString()}</span>
                        </div>
                        <p className="text-xs text-slate-500">by {entry.actor}</p>
                        {entry.details && Object.keys(entry.details).length > 0 && (
                          <pre className="text-xs text-slate-400 bg-slate-50 rounded p-2 mt-1 overflow-x-auto">{JSON.stringify(entry.details, null, 2)}</pre>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Sub-modals */}
      {editOpen && <EditTenantModal tenant={tenant} open={editOpen} onClose={() => setEditOpen(false)} onSaved={onRefresh} />}
      {planChangeOpen && <PlanChangeModal tenant={tenant} open={planChangeOpen} onClose={() => setPlanChangeOpen(false)} onChanged={onRefresh} />}
    </>
  );
}

// ============================================================
// Main Tenants Page
// ============================================================
export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [planFilter, setPlanFilter] = useState<string>('');
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchTenants = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: { status?: string; plan?: string; search?: string } = {};
      if (statusFilter) params.status = statusFilter;
      if (planFilter) params.plan = planFilter;
      if (search) params.search = search;
      const res = await platformApi.tenants.list(params);
      if (res.data.success && res.data.data) setTenants(res.data.data);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setError(axiosErr.response?.data?.error || 'Failed to load tenants');
    } finally { setLoading(false); }
  }, [statusFilter, planFilter, search]);

  useEffect(() => { fetchTenants(); }, [fetchTenants]);

  const toggleStatus = async (tenant: Tenant) => {
    if (tenant.status !== 'ACTIVE' && tenant.status !== 'SUSPENDED') {
      setError(`Cannot toggle status for ${tenant.status} tenant`);
      return;
    }
    const newStatus = tenant.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    const reason = newStatus === 'SUSPENDED' ? window.prompt('Suspension reason (optional):') ?? '' : undefined;
    setActionLoading(tenant.id);
    try {
      await platformApi.tenants.updateStatus(tenant.id, newStatus as 'ACTIVE' | 'SUSPENDED', reason);
      fetchTenants();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setError(axiosErr.response?.data?.error || `Failed to ${newStatus === 'SUSPENDED' ? 'suspend' : 'activate'} tenant`);
    } finally { setActionLoading(null); }
  };

  const deactivateTenant = async (tenant: Tenant) => {
    const confirmed = window.confirm(
      `DEACTIVATE "${tenant.name}" (${tenant.slug})?\n\nThis will:\n- Remove database access\n- Prevent all logins\n- Mark tenant as DEACTIVATED\n\nData is preserved. You can reactivate later.`
    );
    if (!confirmed) return;
    setActionLoading(tenant.id);
    try {
      await platformApi.tenants.updateStatus(tenant.id, 'DEACTIVATED', 'Deactivated from admin panel');
      fetchTenants();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setError(axiosErr.response?.data?.error || 'Failed to deactivate tenant');
    } finally { setActionLoading(null); }
  };

  const statusBadge: Record<string, string> = {
    ACTIVE: 'bg-emerald-100 text-emerald-700', SUSPENDED: 'bg-red-100 text-red-700',
    PENDING: 'bg-amber-100 text-amber-700', PROVISIONING: 'bg-blue-100 text-blue-700',
    DEACTIVATED: 'bg-slate-100 text-slate-500',
  };
  const planBadge: Record<string, string> = {
    FREE: 'text-slate-600', STARTER: 'text-blue-600',
    PROFESSIONAL: 'text-indigo-600', ENTERPRISE: 'text-purple-600',
  };

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tenants</h1>
          <p className="text-sm text-slate-500 mt-0.5">Provision and manage organizations on the platform</p>
        </div>
        <button onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors">
          <Plus className="w-4 h-4" /> New Tenant
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or slug..." className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div className="relative">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="appearance-none pl-3 pr-8 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="PROVISIONING">Provisioning</option>
            <option value="DEACTIVATED">Deactivated</option>
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
        <div className="relative">
          <select value={planFilter} onChange={(e) => setPlanFilter(e.target.value)} className="appearance-none pl-3 pr-8 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">All plans</option>
            <option value="FREE">Free</option>
            <option value="STARTER">Starter</option>
            <option value="PROFESSIONAL">Professional</option>
            <option value="ENTERPRISE">Enterprise</option>
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
        <button onClick={fetchTenants} className="inline-flex items-center gap-2 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3 text-red-700 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12"><RefreshCw className="w-6 h-6 animate-spin text-indigo-500" /></div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <th className="text-left px-4 py-3 font-medium">Name</th>
                  <th className="text-left px-4 py-3 font-medium">Slug</th>
                  <th className="text-left px-4 py-3 font-medium">Plan</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Region</th>
                  <th className="text-left px-4 py-3 font-medium">Created</th>
                  <th className="text-right px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tenants.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-slate-400"><Building2 className="w-8 h-8 mx-auto mb-2 opacity-40" />No tenants found</td></tr>
                ) : (
                  tenants.map((t) => (
                    <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">{t.name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{t.slug}</td>
                      <td className="px-4 py-3"><span className={`text-sm font-medium ${planBadge[t.plan] || 'text-slate-600'}`}>{t.plan}</span></td>
                      <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge[t.status] || ''}`}>{t.status}</span></td>
                      <td className="px-4 py-3 text-slate-500">{t.country} / {t.currency}</td>
                      <td className="px-4 py-3 text-slate-500">{new Date(t.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setSelectedTenant(t)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="View details"><Eye className="w-4 h-4" /></button>
                          {(t.status === 'ACTIVE' || t.status === 'SUSPENDED') && (
                            <button
                              onClick={() => toggleStatus(t)}
                              disabled={actionLoading === t.id}
                              className={`p-1.5 rounded-lg transition-colors ${t.status === 'ACTIVE' ? 'text-slate-400 hover:text-amber-600 hover:bg-amber-50' : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'} disabled:opacity-50`}
                              title={t.status === 'ACTIVE' ? 'Suspend tenant' : 'Activate tenant'}
                            >
                              {actionLoading === t.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : t.status === 'ACTIVE' ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                            </button>
                          )}
                          {t.status !== 'DEACTIVATED' && (
                            <button
                              onClick={() => deactivateTenant(t)}
                              disabled={actionLoading === t.id}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                              title="Deactivate tenant"
                            >
                              {actionLoading === t.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                            </button>
                          )}
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

      {/* Modals */}
      <CreateTenantModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={fetchTenants} />
      {selectedTenant && (
        <TenantDetailDrawer
          tenant={selectedTenant}
          onClose={() => setSelectedTenant(null)}
          onRefresh={() => { fetchTenants(); setSelectedTenant(null); }}
        />
      )}
    </div>
  );
}
