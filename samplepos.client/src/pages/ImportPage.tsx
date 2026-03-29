/**
 * ImportPage — CSV Bulk Import for Products, Customers, Suppliers
 *
 * Internal sections:
 *   UploadSection  – file picker + entity/strategy selectors
 *   JobsTable      – paginated job list with status badges, progress bars, conditional polling
 *   ErrorModal     – paginated error rows + "Download Failed Rows CSV" button
 */

import { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Layout from '../components/Layout';
import { queryKeys } from '../hooks/useApi';
import importApi from '../api/import';
import type {
  ImportEntityType,
  DuplicateStrategy,
  ImportJob,
  ImportJobError,
  ImportJobStatus,
} from '../api/import';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Badge,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/temp-ui-components';

// ── Helpers ───────────────────────────────────────────────

const ENTITY_LABELS: Record<ImportEntityType, string> = {
  PRODUCT: 'Products',
  CUSTOMER: 'Customers',
  SUPPLIER: 'Suppliers',
};

const STRATEGY_LABELS: Record<DuplicateStrategy, string> = {
  SKIP: 'Skip duplicates',
  UPDATE: 'Update duplicates',
  FAIL: 'Fail on duplicates',
};

const STATUS_STYLES: Record<ImportJobStatus, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  PROCESSING: 'bg-blue-100 text-blue-800',
  COMPLETED: 'bg-green-100 text-green-800',
  FAILED: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-gray-100 text-gray-800',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function progressPercent(job: ImportJob): number {
  if (job.rowsTotal === 0) return 0;
  return Math.round((job.rowsProcessed / job.rowsTotal) * 100);
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

// ── UploadSection ─────────────────────────────────────────

interface UploadSectionProps {
  onUploadSuccess: () => void;
}

function UploadSection({ onUploadSuccess }: UploadSectionProps) {
  const [entityType, setEntityType] = useState<ImportEntityType>('PRODUCT');
  const [strategy, setStrategy] = useState<DuplicateStrategy>('SKIP');
  const [dragActive, setDragActive] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = useMutation({
    mutationFn: (file: File) => importApi.uploadCsv(file, entityType, strategy),
    onSuccess: (data) => {
      toast.success(`Import job ${data.jobNumber} queued`);
      onUploadSuccess();
      if (fileRef.current) fileRef.current.value = '';
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      const message =
        axiosErr?.response?.data?.error
        || (err instanceof Error ? err.message : 'Upload failed');
      toast.error(message);
    },
  });

  const handleFile = useCallback(
    (file: File | undefined) => {
      if (!file) return;
      const ext = file.name.toLowerCase();
      if (!ext.endsWith('.csv') && !ext.endsWith('.xlsx') && !ext.endsWith('.xls')) {
        toast.error('Only .csv, .xlsx, and .xls files are accepted');
        return;
      }
      upload.mutate(file);
    },
    [upload],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      handleFile(e.dataTransfer.files[0]);
    },
    [handleFile],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload CSV</CardTitle>
        <CardDescription>
          Import products, customers, or suppliers from a CSV file
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Selectors */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Entity Type
            </label>
            <Select
              value={entityType}
              onValueChange={(v) => setEntityType(v as ImportEntityType)}
              title="Select entity type"
            >
              <SelectTrigger><SelectValue placeholder="Entity" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PRODUCT">Products</SelectItem>
                <SelectItem value="CUSTOMER">Customers</SelectItem>
                <SelectItem value="SUPPLIER">Suppliers</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Duplicate Strategy
            </label>
            <Select
              value={strategy}
              onValueChange={(v) => setStrategy(v as DuplicateStrategy)}
              title="Select duplicate strategy"
            >
              <SelectTrigger><SelectValue placeholder="Strategy" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="SKIP">Skip duplicates</SelectItem>
                <SelectItem value="UPDATE">Update duplicates</SelectItem>
                <SelectItem value="FAIL">Fail on duplicates</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Template download */}
        <div className="mb-4">
          <p className="text-sm text-gray-500 mb-1">Download a CSV template:</p>
          <div className="flex gap-2">
            {(['PRODUCT', 'CUSTOMER', 'SUPPLIER'] as ImportEntityType[]).map((et) => (
              <button
                key={et}
                className="text-sm text-blue-600 hover:text-blue-800 underline"
                onClick={async () => {
                  try {
                    const blob = await importApi.downloadTemplate(et);
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${et.toLowerCase()}-template.csv`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(url);
                  } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : String(err);
                    toast.error(`Failed to download template: ${msg}`);
                  }
                }}
              >
                {ENTITY_LABELS[et]}
              </button>
            ))}
          </div>
        </div>

        {/* Drop zone */}
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${dragActive
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-300 hover:border-gray-400'
            }`}
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
        >
          <p className="text-gray-600 mb-2">
            Drag &amp; drop a CSV file here, or
          </p>
          <Button
            onClick={() => fileRef.current?.click()}
            disabled={upload.isPending}
          >
            {upload.isPending ? 'Uploading…' : 'Choose File'}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            aria-label="Choose CSV file"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ── JobsTable ─────────────────────────────────────────────

interface JobsTableProps {
  onViewErrors: (job: ImportJob) => void;
}

function JobsTable({ onViewErrors }: JobsTableProps) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [entityFilter, setEntityFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const limit = 15;

  const cancelMutation = useMutation({
    mutationFn: (id: string) => importApi.cancelJob(id),
    onSuccess: () => {
      toast.success('Job cancelled');
      queryClient.invalidateQueries({ queryKey: queryKeys.import.all });
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      toast.error(axiosErr?.response?.data?.error || 'Failed to cancel job');
    },
  });

  const retryMutation = useMutation({
    mutationFn: (id: string) => importApi.retryJob(id),
    onSuccess: () => {
      toast.success('Job re-queued for retry');
      queryClient.invalidateQueries({ queryKey: queryKeys.import.all });
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      toast.error(axiosErr?.response?.data?.error || 'Failed to retry job');
    },
  });

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.import.jobs(
      page,
      limit,
      entityFilter !== 'ALL' ? entityFilter : undefined,
      statusFilter !== 'ALL' ? statusFilter : undefined,
    ),
    queryFn: () =>
      importApi.listJobs({
        page,
        limit,
        entityType: entityFilter !== 'ALL' ? (entityFilter as ImportEntityType) : undefined,
        status: statusFilter !== 'ALL' ? (statusFilter as ImportJobStatus) : undefined,
      }),
    // Auto-poll while any visible job is still processing
    refetchInterval: (query) => {
      const jobs = query.state.data?.rows;
      return jobs?.some((j) => j.status === 'PROCESSING' || j.status === 'PENDING')
        ? 5000
        : false;
    },
  });

  const rows = data?.rows ?? [];
  const totalPages = data?.totalPages ?? 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import Jobs</CardTitle>
        <CardDescription>
          Track and review CSV import operations
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-4">
          <Select
            value={entityFilter}
            onValueChange={(v) => { setEntityFilter(v); setPage(1); }}
            title="Filter by entity type"
          >
            <SelectTrigger><SelectValue placeholder="Entity" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Entities</SelectItem>
              <SelectItem value="PRODUCT">Products</SelectItem>
              <SelectItem value="CUSTOMER">Customers</SelectItem>
              <SelectItem value="SUPPLIER">Suppliers</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={statusFilter}
            onValueChange={(v) => { setStatusFilter(v); setPage(1); }}
            title="Filter by status"
          >
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Statuses</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="PROCESSING">Processing</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="FAILED">Failed</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Loading / Error */}
        {isLoading && (
          <p className="text-gray-500 py-6 text-center">Loading jobs…</p>
        )}
        {error && (
          <p className="text-red-600 py-6 text-center">
            Failed to load jobs: {error instanceof Error ? error.message : 'Unknown error'}
          </p>
        )}

        {/* Table */}
        {!isLoading && !error && (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Job #</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Entity</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">File</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Strategy</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Progress</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-500">Imported</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-500">Skipped</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-500">Failed</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Created</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="px-4 py-8 text-center text-gray-500">
                        No import jobs found
                      </td>
                    </tr>
                  ) : (
                    rows.map((job) => {
                      const pct = progressPercent(job);
                      return (
                        <tr key={job.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-mono text-xs">{job.jobNumber}</td>
                          <td className="px-4 py-3">{ENTITY_LABELS[job.entityType] ?? job.entityType}</td>
                          <td className="px-4 py-3 max-w-[180px]" title={job.fileName}>
                            <div className="truncate">{job.fileName}</div>
                            <div className="text-xs text-gray-400">{formatFileSize(job.fileSizeBytes)}</div>
                          </td>
                          <td className="px-4 py-3 text-xs">{STRATEGY_LABELS[job.duplicateStrategy] ?? job.duplicateStrategy}</td>
                          <td className="px-4 py-3">
                            <Badge className={STATUS_STYLES[job.status]}>{job.status}</Badge>
                          </td>
                          <td className="px-4 py-3 w-36">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-blue-500 rounded-full transition-all"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="text-xs text-gray-500 w-10 text-right">{pct}%</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">{job.rowsImported}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{job.rowsSkipped}</td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {job.rowsFailed > 0 ? (
                              <span className="text-red-600 font-medium">{job.rowsFailed}</span>
                            ) : (
                              job.rowsFailed
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">{formatDate(job.createdAt)}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-1">
                              {job.rowsFailed > 0 && (
                                <button
                                  className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                                  onClick={() => onViewErrors(job)}
                                >
                                  View Errors
                                </button>
                              )}
                              {job.status === 'PENDING' && (
                                <button
                                  className="text-red-600 hover:text-red-800 text-sm font-medium"
                                  onClick={() => cancelMutation.mutate(job.jobNumber)}
                                  disabled={cancelMutation.isPending}
                                >
                                  Cancel
                                </button>
                              )}
                              {job.status === 'FAILED' && (
                                <button
                                  className="text-orange-600 hover:text-orange-800 text-sm font-medium"
                                  onClick={() => retryMutation.mutate(job.jobNumber)}
                                  disabled={retryMutation.isPending}
                                >
                                  Retry
                                </button>
                              )}
                              {job.status === 'FAILED' && job.errorSummary && (
                                <span className="text-xs text-red-500 max-w-[200px] truncate" title={job.errorSummary}>
                                  {job.errorSummary}
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <span className="text-sm text-gray-600">
                  Page {page} of {totalPages} ({data?.total ?? 0} total)
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── ErrorModal ────────────────────────────────────────────

interface ErrorModalProps {
  job: ImportJob;
  onClose: () => void;
}

function ErrorModal({ job, onClose }: ErrorModalProps) {
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.import.errors(job.id, page, limit),
    queryFn: () => importApi.getJobErrors(job.id, { page, limit }),
  });

  const rows: ImportJobError[] = data?.rows ?? [];
  const totalPages = data?.totalPages ?? 1;

  const handleDownloadCsv = async () => {
    try {
      const blob = await importApi.downloadErrorsCsv(job.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${job.jobNumber}-errors.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to download error CSV: ${msg}`);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-[95vw] sm:max-w-4xl w-full max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Errors for ${job.jobNumber}`}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">
              Errors — {job.jobNumber}
            </h2>
            <p className="text-sm text-gray-500">
              {job.rowsFailed} failed row{job.rowsFailed !== 1 ? 's' : ''} out of{' '}
              {job.rowsTotal} total
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={handleDownloadCsv}>
              Download CSV
            </Button>
            <button
              className="text-gray-400 hover:text-gray-600"
              onClick={onClose}
              aria-label="Close dialog"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {isLoading ? (
            <p className="text-gray-500 text-center py-8">Loading errors…</p>
          ) : rows.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No errors found</p>
          ) : (
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Row</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Type</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Message</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Raw Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {rows.map((err) => (
                  <tr key={err.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 tabular-nums">{err.rowNumber}</td>
                    <td className="px-4 py-2">
                      <Badge
                        className={
                          err.errorType === 'VALIDATION'
                            ? 'bg-orange-100 text-orange-800'
                            : err.errorType === 'DUPLICATE'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                        }
                      >
                        {err.errorType}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 max-w-sm break-words">{err.errorMessage}</td>
                    <td className="px-4 py-2 max-w-xs">
                      {err.rawData ? (
                        <details className="cursor-pointer">
                          <summary className="text-blue-600 text-xs">Show data</summary>
                          <pre className="mt-1 text-xs bg-gray-100 p-2 rounded overflow-auto max-h-32 whitespace-pre-wrap">
                            {JSON.stringify(err.rawData, null, 2)}
                          </pre>
                        </details>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer / Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-3 border-t flex items-center justify-between">
            <span className="text-sm text-gray-600">
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────

export default function ImportPage() {
  const queryClient = useQueryClient();
  const [errorJob, setErrorJob] = useState<ImportJob | null>(null);

  const handleUploadSuccess = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.import.all });
  };

  return (
    <Layout>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        {/* Page header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">CSV Import</h1>
          <p className="text-gray-600 mt-1">
            Bulk import products, customers, and suppliers from CSV files
          </p>
        </div>

        {/* Upload */}
        <UploadSection onUploadSuccess={handleUploadSuccess} />

        {/* Jobs list */}
        <JobsTable onViewErrors={(job) => setErrorJob(job)} />

        {/* Error modal */}
        {errorJob && (
          <ErrorModal job={errorJob} onClose={() => setErrorJob(null)} />
        )}
      </div>
    </Layout>
  );
}
