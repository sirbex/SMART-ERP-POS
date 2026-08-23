/**
 * Day → customer breakdown for cash receipts into Undeposited Funds
 * (AR collections and/or customer deposits). Additive report panel.
 */

import type { ReactNode } from 'react';
import { formatCurrency } from '../../utils/currency';
import { ResponsiveTableWrapper } from '../ui/ResponsiveTableWrapper';

export interface CustomerReceiptLineView {
  businessDate: string;
  customerId: string;
  customerNumber: string;
  customerName: string;
  documentNumber: string;
  paymentMethod: string;
  amount: number;
}

export interface CustomerReceiptsDayGroupView {
  businessDate: string;
  totalAmount: number;
  receiptCount: number;
  lines: CustomerReceiptLineView[];
}

interface Props {
  title: string;
  description: string;
  accentClass?: string;
  icon?: ReactNode;
  summaryCards?: Array<{ label: string; value: string; sub?: string; tone?: string }>;
  byDay: CustomerReceiptsDayGroupView[];
  emptyMessage?: string;
}

export function CustomerReceiptsByDayPanel({
  title,
  description,
  accentClass = 'text-teal-600',
  icon,
  summaryCards,
  byDay,
  emptyMessage = 'No receipts in this period',
}: Props) {
  return (
    <div className="bg-white rounded-lg border shadow-sm">
      <div className="px-6 py-4 border-b">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className={`text-lg font-semibold text-gray-900 ${accentClass}`}>{title}</h2>
        </div>
        <p className="text-sm text-gray-500 mt-1">{description}</p>
      </div>

      {summaryCards && summaryCards.length > 0 && (
        <div className="p-4 sm:px-6 grid grid-cols-2 sm:grid-cols-4 gap-3 border-b">
          {summaryCards.map((card) => (
            <div
              key={card.label}
              className={`rounded-lg p-3 text-center ${card.tone || 'bg-slate-50'}`}
            >
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-1">
                {card.label}
              </p>
              <p className="text-lg font-bold text-slate-900">{card.value}</p>
              {card.sub ? <p className="text-xs text-slate-500 mt-1">{card.sub}</p> : null}
            </div>
          ))}
        </div>
      )}

      <div className="overflow-x-auto">
        {byDay.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">{emptyMessage}</div>
        ) : (
          <ResponsiveTableWrapper>
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                    Day
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                    Customer
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                    Document
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                    Method
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {byDay.map((day) => (
                  <DayBlock key={day.businessDate} day={day} />
                ))}
              </tbody>
            </table>
          </ResponsiveTableWrapper>
        )}
      </div>
    </div>
  );
}

function DayBlock({ day }: { day: CustomerReceiptsDayGroupView }) {
  return (
    <>
      <tr className="bg-slate-50/80">
        <td colSpan={4} className="px-4 py-2 text-sm font-semibold text-slate-800">
          {day.businessDate}
          <span className="ml-2 text-xs font-normal text-slate-500">
            {day.receiptCount} receipt{day.receiptCount === 1 ? '' : 's'}
          </span>
        </td>
        <td className="px-4 py-2 text-right text-sm font-semibold text-teal-700 tabular-nums">
          {formatCurrency(day.totalAmount)}
        </td>
      </tr>
      {day.lines.map((line) => (
        <tr key={`${line.documentNumber}-${line.customerId}`} className="hover:bg-gray-50">
          <td className="px-4 py-2 text-slate-400" />
          <td className="px-4 py-2 text-slate-800">
            <span className="font-medium">{line.customerName}</span>
            {line.customerNumber ? (
              <span className="ml-2 text-xs text-slate-500">{line.customerNumber}</span>
            ) : null}
          </td>
          <td className="px-4 py-2 font-mono text-xs text-slate-600">{line.documentNumber}</td>
          <td className="px-4 py-2 text-slate-600">{line.paymentMethod}</td>
          <td className="px-4 py-2 text-right tabular-nums text-slate-900">
            {formatCurrency(line.amount)}
          </td>
        </tr>
      ))}
    </>
  );
}
