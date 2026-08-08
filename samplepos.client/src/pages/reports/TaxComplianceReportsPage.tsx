import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../../components/Layout';
import {
  useTaxComplianceSummary,
  useWhtRegisterReport,
  useTaxLiabilityReport,
} from '../../hooks/useAccountingModules';
import { getBusinessDate } from '../../utils/businessDate';
import { DatePicker } from '../../components/ui/date-picker';
import {
  FileBarChart2,
  Loader2,
  Landmark,
  Receipt,
  Scale,
  ShieldCheck,
} from 'lucide-react';

const tabs = [
  { key: 'summary', label: 'Tax Summary', icon: Scale },
  { key: 'register', label: 'WHT Register', icon: Receipt },
  { key: 'liability', label: 'Tax Liability', icon: Landmark },
] as const;

type TabKey = (typeof tabs)[number]['key'];

function fmt(n: number | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export default function TaxComplianceReportsPage() {
  const today = getBusinessDate();
  const [activeTab, setActiveTab] = useState<TabKey>('summary');
  const [startDate, setStartDate] = useState(() => monthStart(today));
  const [endDate, setEndDate] = useState(today);
  const [side, setSide] = useState<'ALL' | 'SUPPLIER' | 'CUSTOMER'>('ALL');

  const summaryQ = useTaxComplianceSummary(startDate, endDate, activeTab === 'summary');
  const registerQ = useWhtRegisterReport(
    startDate,
    endDate,
    side === 'ALL' ? undefined : side,
    activeTab === 'register',
  );
  const liabilityQ = useTaxLiabilityReport(startDate, endDate, activeTab === 'liability');

  const loading =
    (activeTab === 'summary' && summaryQ.isLoading) ||
    (activeTab === 'register' && registerQ.isLoading) ||
    (activeTab === 'liability' && liabilityQ.isLoading);

  const summary = summaryQ.data as
    | {
        vat: {
          outputTax: number;
          outputReversed: number;
          netOutputTax: number;
          inputTax: number;
          inputReversed: number;
          netInputTax: number;
          netVatPayable: number;
          byRate: Array<{ taxRate: number; netSalesTax: number; netPurchaseTax: number }>;
        };
        wht: {
          payableClosing: number;
          receivableClosing: number;
          certificatesIssued: number;
          withheldInPeriod: number;
          remittedInPeriod: number;
          recoveredInPeriod: number;
        };
        standards?: { notes?: string[] };
      }
    | undefined;

  const register = registerQ.data as
    | {
        rows: Array<{
          id: string;
          certificateNumber: string;
          side: string;
          partyName: string | null;
          paymentNumber: string | null;
          paymentDate: string | null;
          rate: number | null;
          baseAmount: number;
          whtAmount: number;
          netAmount: number;
          status: string;
        }>;
        totals: { baseAmount: number; whtAmount: number; netAmount: number; count: number };
      }
    | undefined;

  const liability = liabilityQ.data as
    | {
        consistent: boolean;
        movements: Array<{
          accountCode: string;
          accountName: string;
          kind: string;
          opening: number;
          accrued: number;
          settled: number;
          closing: number;
          reconcilingDifference: number;
        }>;
      }
    | undefined;

  const periodLabel = useMemo(() => `${startDate} → ${endDate}`, [startDate, endDate]);

  return (
    <Layout>
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileBarChart2 className="h-6 w-6 text-blue-600" />
            Tax Compliance Reports
          </h1>
          <p className="text-gray-500 mt-1">
            Period tax package — VAT summary, WHT register, and liability rollforward (accounting SSOT).{' '}
            <Link to="/accounting/vat-remittance" className="text-blue-600 hover:underline">
              Remit VAT
            </Link>
          </p>
          <div className="flex flex-wrap gap-3 mt-2 text-sm">
            <Link to="/reports" className="text-blue-600 hover:text-blue-800">
              All reports
            </Link>
            <Link to="/accounting/withholding-tax" className="text-blue-600 hover:text-blue-800">
              WHT operations
            </Link>
            <Link to="/accounting/tax-engine" className="text-blue-600 hover:text-blue-800">
              Tax engine
            </Link>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-xs text-gray-500 mb-1">From</label>
            <DatePicker
              value={startDate}
              onChange={setStartDate}
              placeholder="From"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">To</label>
            <DatePicker
              value={endDate}
              onChange={setEndDate}
              placeholder="To"
            />
          </div>
        </div>
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === t.key ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-gray-400">Period {periodLabel}</p>

      {loading ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-500" />
        </div>
      ) : null}

      {!loading && activeTab === 'summary' && summary ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Net Output VAT', value: summary.vat.netOutputTax, tone: 'text-blue-700' },
              { label: 'Net Input VAT', value: summary.vat.netInputTax, tone: 'text-sky-700' },
              {
                label: 'Net VAT Payable',
                value: summary.vat.netVatPayable,
                tone: summary.vat.netVatPayable >= 0 ? 'text-orange-700' : 'text-green-700',
              },
              { label: 'WHT Payable (close)', value: summary.wht.payableClosing, tone: 'text-orange-600' },
            ].map((c) => (
              <div key={c.label} className="bg-white rounded-lg shadow p-4">
                <p className="text-xs text-gray-500 uppercase">{c.label}</p>
                <p className={`text-xl font-semibold mt-1 ${c.tone}`}>{fmt(c.value)}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="px-4 py-3 border-b font-medium text-gray-900">VAT boxes</div>
              <table className="min-w-full text-sm">
                <tbody className="divide-y">
                  <tr>
                    <td className="px-4 py-2 text-gray-600">Output tax</td>
                    <td className="px-4 py-2 text-right">{fmt(summary.vat.outputTax)}</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 text-gray-600">Output reversed (CN)</td>
                    <td className="px-4 py-2 text-right">({fmt(summary.vat.outputReversed)})</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 text-gray-600">Input tax</td>
                    <td className="px-4 py-2 text-right">{fmt(summary.vat.inputTax)}</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 text-gray-600">Input reversed (SCN)</td>
                    <td className="px-4 py-2 text-right">({fmt(summary.vat.inputReversed)})</td>
                  </tr>
                  <tr className="bg-gray-50 font-semibold">
                    <td className="px-4 py-2">Net VAT payable</td>
                    <td className="px-4 py-2 text-right">{fmt(summary.vat.netVatPayable)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="px-4 py-3 border-b font-medium text-gray-900">Withholding tax</div>
              <table className="min-w-full text-sm">
                <tbody className="divide-y">
                  <tr>
                    <td className="px-4 py-2 text-gray-600">Certificates issued</td>
                    <td className="px-4 py-2 text-right">{summary.wht.certificatesIssued}</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 text-gray-600">Withheld in period</td>
                    <td className="px-4 py-2 text-right">{fmt(summary.wht.withheldInPeriod)}</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 text-gray-600">Remitted to URA</td>
                    <td className="px-4 py-2 text-right">{fmt(summary.wht.remittedInPeriod)}</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 text-gray-600">Receivable recovered</td>
                    <td className="px-4 py-2 text-right">{fmt(summary.wht.recoveredInPeriod)}</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 text-gray-600">Tax Receivable closing</td>
                    <td className="px-4 py-2 text-right">{fmt(summary.wht.receivableClosing)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {summary.vat.byRate.length > 0 ? (
            <div className="bg-white rounded-lg shadow overflow-x-auto">
              <div className="px-4 py-3 border-b font-medium text-gray-900">VAT by rate</div>
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Rate</th>
                    <th className="px-4 py-2 text-right">Net output</th>
                    <th className="px-4 py-2 text-right">Net input</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {summary.vat.byRate.map((r) => (
                    <tr key={r.taxRate}>
                      <td className="px-4 py-2">{r.taxRate}%</td>
                      <td className="px-4 py-2 text-right">{fmt(r.netSalesTax)}</td>
                      <td className="px-4 py-2 text-right">{fmt(r.netPurchaseTax)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {summary.standards?.notes?.length ? (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm text-slate-700 space-y-1">
              <div className="flex items-center gap-2 font-medium text-slate-900">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                How this report is calculated
              </div>
              {summary.standards.notes.map((n) => (
                <p key={n}>• {n}</p>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {!loading && activeTab === 'register' ? (
        <div className="space-y-3">
          <div className="flex gap-2">
            {(['ALL', 'SUPPLIER', 'CUSTOMER'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSide(s)}
                className={`px-3 py-1.5 rounded-md text-sm border ${
                  side === s ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-200'
                }`}
              >
                {s === 'ALL' ? 'All' : s === 'SUPPLIER' ? 'Supplier WHT' : 'Customer WHT'}
              </button>
            ))}
          </div>
          <div className="bg-white rounded-lg shadow overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left">Certificate</th>
                  <th className="px-4 py-2 text-left">Side</th>
                  <th className="px-4 py-2 text-left">Party</th>
                  <th className="px-4 py-2 text-left">Payment</th>
                  <th className="px-4 py-2 text-right">Rate</th>
                  <th className="px-4 py-2 text-right">Base</th>
                  <th className="px-4 py-2 text-right">WHT</th>
                  <th className="px-4 py-2 text-right">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {!register?.rows.length ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                      No WHT certificates in this period.
                    </td>
                  </tr>
                ) : (
                  register.rows.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-medium">{r.certificateNumber}</td>
                      <td className="px-4 py-2">{r.side}</td>
                      <td className="px-4 py-2">{r.partyName || '—'}</td>
                      <td className="px-4 py-2">
                        {r.paymentNumber || '—'}
                        {r.paymentDate ? (
                          <span className="block text-xs text-gray-400">
                            {String(r.paymentDate).slice(0, 10)}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {r.rate != null ? `${(r.rate * 100).toFixed(1)}%` : '—'}
                      </td>
                      <td className="px-4 py-2 text-right">{fmt(r.baseAmount)}</td>
                      <td className="px-4 py-2 text-right font-medium">{fmt(r.whtAmount)}</td>
                      <td className="px-4 py-2 text-right">{fmt(r.netAmount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {register && register.totals.count > 0 ? (
                <tfoot className="bg-gray-50 font-semibold">
                  <tr>
                    <td className="px-4 py-2" colSpan={5}>
                      Totals ({register.totals.count})
                    </td>
                    <td className="px-4 py-2 text-right">{fmt(register.totals.baseAmount)}</td>
                    <td className="px-4 py-2 text-right">{fmt(register.totals.whtAmount)}</td>
                    <td className="px-4 py-2 text-right">{fmt(register.totals.netAmount)}</td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        </div>
      ) : null}

      {!loading && activeTab === 'liability' && liability ? (
        <div className="space-y-3">
          <div
            className={`rounded-lg border px-4 py-3 text-sm ${
              liability.consistent
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-amber-200 bg-amber-50 text-amber-900'
            }`}
          >
            {liability.consistent
              ? 'Rollforward consistent — opening + accrued − settled matches closing GL.'
              : 'Rollforward difference detected — review remittance timing vs GL postings.'}
          </div>
          <div className="bg-white rounded-lg shadow overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left">Account</th>
                  <th className="px-4 py-2 text-right">Opening</th>
                  <th className="px-4 py-2 text-right">Accrued</th>
                  <th className="px-4 py-2 text-right">Settled</th>
                  <th className="px-4 py-2 text-right">Closing</th>
                  <th className="px-4 py-2 text-right">Δ Recon</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {liability.movements.map((m) => (
                  <tr key={m.accountCode}>
                    <td className="px-4 py-2">
                      <span className="font-medium">{m.accountCode}</span>
                      <span className="block text-xs text-gray-500">{m.accountName}</span>
                    </td>
                    <td className="px-4 py-2 text-right">{fmt(m.opening)}</td>
                    <td className="px-4 py-2 text-right">{fmt(m.accrued)}</td>
                    <td className="px-4 py-2 text-right">{fmt(m.settled)}</td>
                    <td className="px-4 py-2 text-right font-semibold">{fmt(m.closing)}</td>
                    <td
                      className={`px-4 py-2 text-right ${
                        Math.abs(m.reconcilingDifference) > 0.05 ? 'text-amber-700' : 'text-gray-500'
                      }`}
                    >
                      {fmt(m.reconcilingDifference)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
    </Layout>
  );
}
