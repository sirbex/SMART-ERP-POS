/**
 * Restaurant → Printer Diagnostics
 * Managers/admins only. Cashiers just see the FOH status chip.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../../components/Layout';
import { useRestaurantEnabled } from '../../hooks/useRestaurantEnabled';
import { useCanAccess } from '../../authorization/useAuthorization';
import {
  fetchPrinterServiceHealth,
  fetchPrinterServiceLogs,
  printerServiceStatusLabel,
  requestPrinterTestPrint,
  restartPrinterService,
  startPrinterService,
  startPrinterServiceHeartbeat,
  subscribePrinterServiceHealth,
  type PrinterServiceHealth,
} from '../../lib/printAgentHealth';
import {
  applyProductUpdate,
  checkProductUpdate,
  fetchServiceHelperHealth,
  type UpdateCheckResult,
} from '../../lib/serviceHelper';
import { listLocalPrintBridgePrinters } from '../../lib/localPrintBridge';
import { getCachedRestaurantStations } from '../../lib/restaurantOfflineCache';
import { readCachedGuestBillPrinter } from '../../lib/guestBillPrinter';
import { api } from '../../utils/api';

function formatUptime(sec: number | null): string {
  if (sec == null || sec < 0) return '—';
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}h ${rm}m` : `${h}h`;
}

function formatHeartbeatAgo(iso: string | null | undefined, checkedAt: number | null): string {
  const t = iso ? Date.parse(iso) : checkedAt;
  if (!t || !Number.isFinite(t)) return '—';
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 2) return 'just now';
  if (sec < 60) return `${sec} seconds ago`;
  return `${Math.floor(sec / 60)} min ago`;
}

export default function RestaurantPrinterDiagnosticsPage() {
  const { data: restaurantEnabled, isLoading: flagLoading } = useRestaurantEnabled();
  const canManage = useCanAccess(undefined, ['restaurant.manage']);
  const [health, setHealth] = useState<PrinterServiceHealth | null>(null);
  const [printers, setPrinters] = useState<string[]>([]);
  const [logs, setLogs] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);
  const [helperOnline, setHelperOnline] = useState(false);

  useEffect(() => {
    const stop = startPrinterServiceHeartbeat();
    const unsub = subscribePrinterServiceHealth(setHealth);
    void refreshAll();
    return () => {
      unsub();
      stop();
    };
  }, []);

  const refreshAll = async () => {
    setBusy('refresh');
    setMessage('');
    try {
      const [h, list, helper, update] = await Promise.all([
        fetchPrinterServiceHealth({ timeoutMs: 2000 }),
        listLocalPrintBridgePrinters({ timeoutMs: 2000 }),
        fetchServiceHelperHealth(),
        checkProductUpdate(),
      ]);
      setHealth(h);
      setPrinters(list.printers);
      setHelperOnline(helper.status === 'online');
      setUpdateInfo(update);
      if (h.status === 'online') {
        const log = await fetchPrinterServiceLogs(150);
        setLogs(log.text);
      }
    } finally {
      setBusy(null);
    }
  };

  const onRestart = async () => {
    setBusy('restart');
    setMessage('');
    const res = await restartPrinterService();
    setMessage(res.ok ? 'Restarting Printer Service…' : res.error || 'Restart failed');
    setBusy(null);
    setTimeout(() => void refreshAll(), 2000);
  };

  const onStart = async () => {
    setBusy('start');
    setMessage('');
    const res = await startPrinterService();
    setMessage(res.ok ? 'Starting Printer Service…' : res.error || 'Start failed');
    setBusy(null);
    setTimeout(() => void refreshAll(), 2500);
  };

  const onUpdate = async () => {
    setBusy('update');
    setMessage('');
    const res = await applyProductUpdate();
    setMessage(
      res.ok
        ? 'Update applied — Print Service restarted.'
        : res.error || 'Update failed',
    );
    setBusy(null);
    setTimeout(() => void refreshAll(), 3000);
  };

  const onTest = async (printerName?: string | null, label?: string) => {
    setBusy(label || 'test');
    setMessage('');
    const res = await requestPrinterTestPrint(printerName);
    setMessage(
      res.ok
        ? `Test print sent${printerName ? ` → ${printerName}` : ' (default printer)'}.`
        : res.error || 'Test print failed',
    );
    setBusy(null);
  };

  if (flagLoading) {
    return (
      <Layout>
        <div className="p-6 text-stone-600">Loading…</div>
      </Layout>
    );
  }

  if (!restaurantEnabled) {
    return (
      <Layout>
        <div className="p-6">Restaurant module is disabled — Printer Diagnostics is part of Restaurant.</div>
      </Layout>
    );
  }

  if (!canManage) {
    return (
      <Layout>
        <div className="p-6 max-w-lg">
          <h1 className="text-xl font-semibold text-stone-900">Printer Diagnostics</h1>
          <p className="mt-2 text-sm text-stone-600">
            Ask a manager to open diagnostics. Floor staff only need the Printer Service status on the
            POS screen.
          </p>
          <Link to="/restaurant" className="mt-4 inline-block text-sm text-blue-700 underline">
            Back to Restaurant
          </Link>
        </div>
      </Layout>
    );
  }

  const status = health?.status || 'checking';
  const stations = getCachedRestaurantStations().filter((s) => s.isActive);
  const guestBill = readCachedGuestBillPrinter();

  return (
    <Layout>
      <div className="p-4 sm:p-6 max-w-3xl space-y-6" data-page="printer-diagnostics">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-stone-900">Printer Diagnostics</h1>
            <p className="text-sm text-stone-600 mt-1">
              Printer Service runs on this PC in the background — cashiers never start it manually.
            </p>
          </div>
          <div className="flex gap-2 text-sm">
            <Link to="/restaurant" className="underline text-stone-700">
              Restaurant POS
            </Link>
            <Link to="/restaurant/stations" className="underline text-stone-700">
              Stations
            </Link>
          </div>
        </div>

        {message ? (
          <div
            className={`rounded-md border px-3 py-2 text-sm ${
              message.toLowerCase().includes('fail') || message.toLowerCase().includes('could not')
                ? 'border-red-200 bg-red-50 text-red-900'
                : 'border-emerald-200 bg-emerald-50 text-emerald-900'
            }`}
          >
            {message}
          </div>
        ) : null}

        <section className="rounded-lg border border-stone-200 bg-white p-4 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
            Printer Service
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${
                status === 'online'
                  ? 'bg-emerald-100 text-emerald-900'
                  : status === 'restarting' || status === 'checking'
                    ? 'bg-amber-100 text-amber-950'
                    : 'bg-red-100 text-red-900'
              }`}
              data-printer-service-status={status}
            >
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  status === 'online'
                    ? 'bg-emerald-500'
                    : status === 'offline'
                      ? 'bg-red-500'
                      : 'bg-amber-400'
                }`}
              />
              {printerServiceStatusLabel(status)}
            </span>
          </div>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-stone-500">Version</dt>
              <dd className="font-medium text-stone-900">{health?.version || '—'}</dd>
            </div>
            <div>
              <dt className="text-stone-500">Status</dt>
              <dd className="font-medium text-stone-900">{printerServiceStatusLabel(status)}</dd>
            </div>
            <div>
              <dt className="text-stone-500">Windows Service</dt>
              <dd className="font-medium text-stone-900">
                {health?.windowsService === 'installed'
                  ? status === 'online'
                    ? 'Running'
                    : 'Installed'
                  : health?.windowsService === 'not_applicable'
                    ? 'Dev / manual'
                    : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-stone-500">Auto Start</dt>
              <dd className="font-medium text-stone-900">
                {health?.autoStart === true ? 'Enabled' : health?.autoStart === false ? 'Off' : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-stone-500">Last Heartbeat</dt>
              <dd className="font-medium text-stone-900">
                {formatHeartbeatAgo(health?.heartbeatAt, health?.checkedAt ?? null)}
              </dd>
            </div>
            <div>
              <dt className="text-stone-500">Uptime</dt>
              <dd className="font-medium text-stone-900">{formatUptime(health?.uptime ?? null)}</dd>
            </div>
            <div>
              <dt className="text-stone-500">Printers</dt>
              <dd className="font-medium text-stone-900">
                {health?.printers != null ? health.printers : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-stone-500">Queue</dt>
              <dd className="font-medium text-stone-900">
                {health?.queueDepth != null ? health.queueDepth : '—'}
              </dd>
            </div>
          </dl>

          {status === 'offline' ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 space-y-2">
              <p>
                Printer Service is offline on this PC. Use <strong>Start Service</strong> (via Service
                Helper), or open <strong>Start Menu → SMART-ERP-POS → SMART Print Service</strong>.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-md bg-amber-900 text-white text-sm disabled:opacity-50"
                  disabled={!!busy}
                  onClick={() => void onStart()}
                >
                  {busy === 'start' ? 'Starting…' : 'Start Service'}
                </button>
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-md border border-amber-800 text-sm disabled:opacity-50"
                  disabled={!!busy}
                  onClick={() => void onRestart()}
                >
                  Restart Service
                </button>
                <a
                  className="px-3 py-1.5 rounded-md border border-amber-800 text-sm"
                  href="http://127.0.0.1:1811/setup"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open Diagnostics / Setup
                </a>
              </div>
              {!helperOnline ? (
                <p className="text-xs">
                  Service Helper is also offline — re-run <strong>SMART-ERP-POS-Setup.exe</strong>.
                </p>
              ) : null}
            </div>
          ) : null}

          {updateInfo?.updateAvailable && updateInfo.latest ? (
            <div className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-950 space-y-2">
              <p className="font-medium">Update Available</p>
              <p>
                {updateInfo.current.productVersion} → {updateInfo.latest.productVersion}
                {updateInfo.latest.notes ? ` — ${updateInfo.latest.notes}` : ''}
              </p>
              {updateInfo.channel?.channel || updateInfo.source ? (
                <p className="text-xs opacity-80">
                  Channel: {updateInfo.channel?.channel || '—'}
                  {updateInfo.source ? ` · ${updateInfo.source}` : ''}
                </p>
              ) : null}
              <button
                type="button"
                className="px-3 py-1.5 rounded-md bg-indigo-900 text-white text-sm disabled:opacity-50"
                disabled={!!busy || !helperOnline}
                onClick={() => void onUpdate()}
              >
                {busy === 'update' ? 'Updating…' : 'Update'}
              </button>
            </div>
          ) : null}

          {status === 'online' && health?.setupComplete === false ? (
            <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950">
              Printer Setup Wizard has not finished on this PC.{' '}
              <a className="underline font-medium" href="http://127.0.0.1:1811/setup" target="_blank" rel="noreferrer">
                Open wizard
              </a>
            </div>
          ) : null}

          {status === 'online' && (health?.uptime == null || health?.version === '1.0.0') ? (
            <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950">
              An older Printer Service build is running (missing uptime/printer counts). Click{' '}
              <strong>Restart Service</strong> so this PC loads v1.1+ — Stations and Diagnostics will
              then stay in sync.
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              className="px-3 py-2 rounded-md bg-stone-900 text-white text-sm disabled:opacity-50"
              disabled={!!busy}
              onClick={() => void refreshAll()}
            >
              {busy === 'refresh' ? 'Refreshing…' : 'Refresh'}
            </button>
            <button
              type="button"
              className="px-3 py-2 rounded-md border border-stone-300 text-sm disabled:opacity-50"
              disabled={!!busy || status === 'offline' || !health?.printerRoles?.kitchen}
              onClick={() => void onTest(health?.printerRoles?.kitchen, 'test-kitchen')}
            >
              Test Kitchen
            </button>
            <button
              type="button"
              className="px-3 py-2 rounded-md border border-stone-300 text-sm disabled:opacity-50"
              disabled={!!busy || status === 'offline' || !health?.printerRoles?.bar}
              onClick={() => void onTest(health?.printerRoles?.bar, 'test-bar')}
            >
              Test Bar
            </button>
            <button
              type="button"
              className="px-3 py-2 rounded-md border border-stone-300 text-sm disabled:opacity-50"
              disabled={!!busy || status === 'offline'}
              onClick={() =>
                void onTest(health?.printerRoles?.receipt || null, 'test-receipt')
              }
            >
              Test Receipt
            </button>
            <button
              type="button"
              className="px-3 py-2 rounded-md border border-stone-300 text-sm disabled:opacity-50"
              disabled={!!busy}
              onClick={() => void onStart()}
            >
              {busy === 'start' ? 'Starting…' : 'Start Service'}
            </button>
            <button
              type="button"
              className="px-3 py-2 rounded-md border border-stone-300 text-sm disabled:opacity-50"
              disabled={!!busy || status === 'offline'}
              onClick={() => void onRestart()}
            >
              {busy === 'restart' ? 'Restarting…' : 'Restart Service'}
            </button>
            <button
              type="button"
              className="px-3 py-2 rounded-md border border-stone-300 text-sm disabled:opacity-50"
              disabled={!!busy || status === 'offline'}
              onClick={() => void onTest(null, 'test-default')}
            >
              Test Print
            </button>
          </div>
          <p className="text-xs text-stone-500">
            Service Helper: {helperOnline ? 'Online (:1812)' : 'Offline'}. Updates: drop a package +{' '}
            <code className="text-[11px]">updates/manifest.json</code> or set{' '}
            <code className="text-[11px]">SMART_UPDATE_MANIFEST_URL</code>. View logs below.
          </p>
        </section>

        <section className="rounded-lg border border-stone-200 bg-white p-4 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
            Station printers
          </h2>
          <p className="text-xs text-stone-500">
            Names must match Windows exactly. Map them under{' '}
            <Link to="/restaurant/stations" className="underline">
              Stations
            </Link>
            .
          </p>
          <ul className="space-y-2">
            {stations.map((s) => (
              <li
                key={s.id || s.code}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-stone-100 px-3 py-2 text-sm"
              >
                <div>
                  <div className="font-medium text-stone-900">{s.name || s.code}</div>
                  <div className="text-xs text-stone-500">{s.printerName || 'Not mapped'}</div>
                </div>
                <button
                  type="button"
                  className="px-2.5 py-1.5 rounded border border-stone-300 text-xs disabled:opacity-40"
                  disabled={!s.printerName || !!busy || status === 'offline'}
                  onClick={() => void onTest(s.printerName, `test-${s.code}`)}
                >
                  Test {s.code}
                </button>
              </li>
            ))}
            <li className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-stone-100 px-3 py-2 text-sm">
              <div>
                <div className="font-medium text-stone-900">Guest bill</div>
                <div className="text-xs text-stone-500">{guestBill || 'Default printer'}</div>
              </div>
              <button
                type="button"
                className="px-2.5 py-1.5 rounded border border-stone-300 text-xs disabled:opacity-40"
                disabled={!!busy || status === 'offline'}
                onClick={() => void onTest(guestBill, 'test-bill')}
              >
                Test bill
              </button>
            </li>
          </ul>
          {stations.length === 0 ? (
            <p className="text-sm text-stone-500">
              No stations cached yet — open{' '}
              <button
                type="button"
                className="underline"
                onClick={() => void api.restaurant.listStations().then(() => refreshAll())}
              >
                Stations
              </button>{' '}
              once to sync.
            </p>
          ) : null}
        </section>

        <section className="rounded-lg border border-stone-200 bg-white p-4 space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
            Installed printers (this PC)
          </h2>
          {printers.length === 0 ? (
            <p className="text-sm text-stone-500">None discovered — service offline or no printers.</p>
          ) : (
            <ul className="text-sm text-stone-800 list-disc pl-5 space-y-0.5">
              {printers.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-stone-200 bg-white p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Service logs</h2>
            <button
              type="button"
              className="text-xs underline text-stone-600 disabled:opacity-40"
              disabled={status === 'offline' || !!busy}
              onClick={async () => {
                const log = await fetchPrinterServiceLogs(200);
                setLogs(log.text);
              }}
            >
              Reload logs
            </button>
          </div>
          <pre className="max-h-64 overflow-auto rounded bg-stone-950 text-stone-100 text-[11px] p-3 whitespace-pre-wrap">
            {logs || '(no logs)'}
          </pre>
        </section>
      </div>
    </Layout>
  );
}
