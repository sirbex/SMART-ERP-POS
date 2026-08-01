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
  startPrinterServiceHeartbeat,
  subscribePrinterServiceHealth,
  type PrinterServiceHealth,
} from '../../lib/printAgentHealth';
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

export default function RestaurantPrinterDiagnosticsPage() {
  const { data: restaurantEnabled, isLoading: flagLoading } = useRestaurantEnabled();
  const canManage = useCanAccess(undefined, ['restaurant.manage']);
  const [health, setHealth] = useState<PrinterServiceHealth | null>(null);
  const [printers, setPrinters] = useState<string[]>([]);
  const [logs, setLogs] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');

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
      const [h, list] = await Promise.all([
        fetchPrinterServiceHealth({ timeoutMs: 2000 }),
        listLocalPrintBridgePrinters({ timeoutMs: 2000 }),
      ]);
      setHealth(h);
      setPrinters(list.printers);
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
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <dt className="text-stone-500">Version</dt>
              <dd className="font-medium text-stone-900">{health?.version || '—'}</dd>
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
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              Printer Service is not running on this PC. An administrator should install it once (Start
              Menu → SMART Print Service, or run the Print Service installer). It then starts with
              Windows — no terminal.
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
