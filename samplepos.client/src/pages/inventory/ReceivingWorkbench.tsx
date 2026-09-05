/**
 * Receiving workbench — one desk for inwards GR and supplier returns.
 * Under inventory top nav “Goods Receipts” only (no separate top tab).
 *
 * Routes:
 *   /inventory/goods-receipts          → receipts list
 *   /inventory/goods-receipts/returns  → supplier return worklist
 *
 * Adaptive SSOT: title + section tabs share one header row on wide screens
 * (no blank band beside “Receiving”); nested AdaptivePage uses hideTitle when embedded.
 */
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useMemo } from 'react';
import { unwrapReturnGrnListPayload, useReturnGrns } from '../../hooks/useReturnGrn';
import {
  RECEIVING_RECEIPTS_ROUTE,
  SUPPLIER_RETURNS_ROUTE,
} from '@shared/domain/supplierReturnWorklist';

export type ReceivingWorkbenchContext = {
  embedded: true;
  area: 'receipts' | 'returns';
};

export default function ReceivingWorkbench() {
  const location = useLocation();
  const isReturns =
    location.pathname === SUPPLIER_RETURNS_ROUTE ||
    location.pathname.endsWith('/goods-receipts/returns');

  const { data: attentionData } = useReturnGrns({
    page: 1,
    limit: 1,
    needsAttention: true,
  });
  const openReturns = useMemo(() => {
    const { pagination } = unwrapReturnGrnListPayload(attentionData);
    return pagination?.total ?? null;
  }, [attentionData]);

  const area: 'receipts' | 'returns' = isReturns ? 'returns' : 'receipts';
  const outletCtx: ReceivingWorkbenchContext = { embedded: true, area };

  const tabBase =
    'relative flex items-center gap-1.5 sm:gap-2 px-3 py-2 sm:px-3.5 sm:py-2 text-sm font-medium border-b-2 -mb-px transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40 rounded-t-md min-h-[var(--layout-touch-target)] sm:min-h-0';
  const tabActive = 'border-teal-600 text-teal-900 bg-white';
  const tabIdle = 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300';

  return (
    <div className="flex flex-col min-h-0 flex-1" data-testid="receiving-workbench">
      <header
        className="border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white"
        data-receiving-workbench-chrome="true"
      >
        <div className="px-3 sm:px-6 pt-2.5 sm:pt-3 pb-0">
          <div
            className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-4"
            data-receiving-workbench-title-row="true"
          >
            <div className="min-w-0 shrink-0">
              <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-teal-800/80">
                Inventory · procurement
              </p>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight mt-0.5">
                Receiving
              </h1>
              <p className="hidden lg:block text-xs text-slate-600 mt-0.5 max-w-md leading-snug">
                Receive, bill, and clear returns from one desk.
              </p>
            </div>

            <nav
              className="flex min-w-0 flex-1 justify-start gap-1 overflow-x-auto sm:justify-end sm:gap-2"
              aria-label="Receiving sections"
              role="tablist"
              data-receiving-workbench-tabs="true"
            >
              <NavLink
                to={RECEIVING_RECEIPTS_ROUTE}
                end
                role="tab"
                aria-selected={!isReturns}
                className={({ isActive }) =>
                  `${tabBase} ${isActive || !isReturns ? tabActive : tabIdle}`
                }
                data-testid="receiving-tab-receipts"
              >
                Receipts
                <span className="text-[11px] font-normal text-slate-500 hidden sm:inline">
                  GR / bill
                </span>
              </NavLink>
              <NavLink
                to={SUPPLIER_RETURNS_ROUTE}
                role="tab"
                aria-selected={isReturns}
                className={({ isActive }) => `${tabBase} ${isActive ? tabActive : tabIdle}`}
                data-testid="receiving-tab-returns"
              >
                Returns
                <span className="text-[11px] font-normal text-slate-500 hidden sm:inline">
                  RGRN / credit note
                </span>
                {openReturns != null && openReturns > 0 && (
                  <span
                    className="inline-flex min-w-[1.25rem] h-5 items-center justify-center rounded-full bg-rose-600 text-white text-[11px] font-semibold px-1.5"
                    title={`${openReturns} return(s) waiting for credit note`}
                    aria-label={`${openReturns} open returns`}
                  >
                    {openReturns > 99 ? '99+' : openReturns}
                  </span>
                )}
              </NavLink>
            </nav>
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 bg-slate-50/40">
        <Outlet context={outletCtx} />
      </div>
    </div>
  );
}
