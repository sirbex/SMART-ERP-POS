/**
 * Cashier-facing Printer Service status — no ports, npm, or "agent" jargon.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchPrinterServiceHealth,
  printerServiceStatusLabel,
  startPrinterServiceHeartbeat,
  subscribePrinterServiceHealth,
  type PrinterServiceHealth,
} from '../../lib/printAgentHealth';

export default function PrinterServiceStatusChip({
  compact = false,
  showDiagnosticsLink = true,
}: {
  compact?: boolean;
  showDiagnosticsLink?: boolean;
}) {
  const [health, setHealth] = useState<PrinterServiceHealth | null>(null);

  useEffect(() => {
    const stopHb = startPrinterServiceHeartbeat();
    const unsub = subscribePrinterServiceHealth(setHealth);
    void fetchPrinterServiceHealth();
    return () => {
      unsub();
      stopHb();
    };
  }, []);

  const status = health?.status || 'checking';
  const label = printerServiceStatusLabel(status);
  const dot =
    status === 'online'
      ? 'bg-emerald-500'
      : status === 'restarting' || status === 'checking'
        ? 'bg-amber-400'
        : 'bg-red-500';

  const chip = (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
        status === 'online'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
          : status === 'restarting' || status === 'checking'
            ? 'border-amber-200 bg-amber-50 text-amber-950'
            : 'border-red-200 bg-red-50 text-red-900'
      }`}
      data-printer-service-status={status}
      title={
        health?.version
          ? `${label} · v${health.version}${health.printers != null ? ` · ${health.printers} printers` : ''}`
          : label
      }
    >
      <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
      {compact ? (status === 'online' ? 'Printers OK' : status === 'offline' ? 'Printers off' : '…') : label}
    </span>
  );

  if (!showDiagnosticsLink) return chip;

  return (
    <Link
      to="/restaurant/printer-diagnostics"
      className="hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 rounded-full"
      aria-label={`${label}. Open printer diagnostics.`}
    >
      {chip}
    </Link>
  );
}
