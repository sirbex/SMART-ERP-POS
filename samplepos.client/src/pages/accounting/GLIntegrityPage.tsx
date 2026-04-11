import { useGLIntegrityAudit } from '../../hooks/useAccountingModules';
import { ShieldCheck, AlertCircle, AlertTriangle, Info, Loader2, RefreshCw } from 'lucide-react';

interface Finding {
  check: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  message: string;
  details?: Record<string, unknown>;
}

interface AuditReport {
  runDate: string;
  durationMs: number;
  passed: boolean;
  totalChecks: number;
  errors: number;
  warnings: number;
  findings: Finding[];
}

const severityConfig = {
  ERROR: { icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
  WARNING: { icon: AlertTriangle, color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-200' },
  INFO: { icon: Info, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
};

export default function GLIntegrityPage() {
  const { data, isLoading, isFetching, refetch } = useGLIntegrityAudit();
  const report = data as AuditReport | undefined;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-blue-600" />
            GL Integrity Audit
          </h1>
          <p className="text-gray-500 mt-1">Run a comprehensive system-wide accounting integrity check</p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Run Audit
        </button>
      </div>

      {isLoading || isFetching ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Loader2 className="h-10 w-10 animate-spin mx-auto text-blue-500" />
          <p className="mt-3 text-gray-500">Running 11 integrity checks...</p>
        </div>
      ) : report ? (
        <>
          {/* Summary Banner */}
          <div className={`rounded-lg p-6 ${report.passed ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
            <div className="flex items-center gap-4">
              {report.passed ? (
                <ShieldCheck className="h-10 w-10 text-green-600" />
              ) : (
                <AlertCircle className="h-10 w-10 text-red-600" />
              )}
              <div>
                <h2 className="text-xl font-bold">
                  {report.passed ? 'All Checks Passed' : `${report.errors} Error(s) Found`}
                </h2>
                <p className="text-sm text-gray-600">
                  {report.totalChecks} checks completed in {report.durationMs}ms
                  {report.warnings > 0 && ` • ${report.warnings} warning(s)`}
                </p>
                <p className="text-xs text-gray-400 mt-1">Run: {new Date(report.runDate).toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* Findings */}
          <div className="space-y-3">
            {report.findings.map((f, i) => {
              const cfg = severityConfig[f.severity];
              const Icon = cfg.icon;
              return (
                <div key={i} className={`${cfg.bg} ${cfg.border} border rounded-lg p-4`}>
                  <div className="flex items-start gap-3">
                    <Icon className={`h-5 w-5 mt-0.5 ${cfg.color} flex-shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium uppercase ${cfg.color}`}>{f.severity}</span>
                        <span className="text-xs text-gray-400 font-mono">{f.check}</span>
                      </div>
                      <p className="text-sm text-gray-800 mt-0.5">{f.message}</p>
                      {f.details && (
                        <details className="mt-2">
                          <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">Details</summary>
                          <pre className="mt-1 text-xs bg-white/50 rounded p-2 overflow-auto max-h-40">
                            {JSON.stringify(f.details, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">
          <ShieldCheck className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p>Click &quot;Run Audit&quot; to perform a comprehensive GL integrity check.</p>
          <p className="text-sm mt-1">Checks: unbalanced transactions, orphan entries, trial balance, AR/AP/inventory reconciliation, idempotency, locked periods, sequence gaps.</p>
        </div>
      )}
    </div>
  );
}
