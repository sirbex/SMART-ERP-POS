import { Columns3 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Button } from '../ui/button';
import type { InventoryColumnDef } from '@shared/inventory/inventoryWorklistColumnsSsot';

export type InventoryColumnPickerPresentation = 'button' | 'menu';

type InventoryColumnPickerProps = {
  catalog: InventoryColumnDef[];
  visibleIds: string[];
  visibleCount: number;
  totalCount: number;
  onToggle: (columnId: string) => void;
  onResetDefaults: () => void;
  className?: string;
  /**
   * `button` — standalone toolbar control (reports-style).
   * `menu` — inline checklist for AdaptiveToolbar More overflow (inventory SSOT).
   */
  presentation?: InventoryColumnPickerPresentation;
};

function ColumnChecklist({
  catalog,
  visibleIds,
  onToggle,
  onResetDefaults,
}: {
  catalog: InventoryColumnDef[];
  visibleIds: string[];
  onToggle: (columnId: string) => void;
  onResetDefaults: () => void;
}) {
  return (
    <>
      <div className="max-h-64 space-y-0.5 overflow-auto">
        {catalog.map((c) => {
          const checked = visibleIds.includes(c.id);
          return (
            <label
              key={c.id}
              className={`flex items-center gap-2 rounded px-2 py-1.5 text-sm ${
                c.required
                  ? 'cursor-default text-slate-500'
                  : 'cursor-pointer hover:bg-slate-50'
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={c.required}
                onChange={() => onToggle(c.id)}
                className="rounded border-slate-300"
              />
              <span>
                {c.label}
                {c.required ? (
                  <span className="ml-1 text-[10px] uppercase text-slate-400">Required</span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
      <button
        type="button"
        className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-sm font-medium text-stone-700 hover:bg-stone-100"
        onClick={onResetDefaults}
        data-inventory-column-reset="true"
      >
        Reset defaults
      </button>
    </>
  );
}

/**
 * Columns control for inventory worklists — tick which columns to show.
 * Prefs owned by useInventoryColumnPrefs.
 */
export function InventoryColumnPicker({
  catalog,
  visibleIds,
  visibleCount,
  totalCount,
  onToggle,
  onResetDefaults,
  className = '',
  presentation = 'button',
}: InventoryColumnPickerProps) {
  if (presentation === 'menu') {
    return (
      <div
        className={`border-t border-stone-100 pt-1.5 mt-1 ${className}`.trim()}
        data-inventory-column-picker="true"
        data-inventory-column-picker-presentation="menu"
        // Keep More open while ticking columns (More closes only on button/menuitem).
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Columns ({visibleCount}/{totalCount})
        </div>
        <ColumnChecklist
          catalog={catalog}
          visibleIds={visibleIds}
          onToggle={onToggle}
          onResetDefaults={onResetDefaults}
        />
      </div>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={`min-h-[var(--layout-touch-target)] ${className}`.trim()}
          data-inventory-column-picker="true"
          data-inventory-column-picker-presentation="button"
          aria-label={`Columns ${visibleCount} of ${totalCount} visible`}
        >
          <Columns3 className="mr-1.5 h-4 w-4" aria-hidden />
          Columns ({visibleCount}/{totalCount})
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3" data-inventory-column-picker-panel="true">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Choose columns to show
        </div>
        <ColumnChecklist
          catalog={catalog}
          visibleIds={visibleIds}
          onToggle={onToggle}
          onResetDefaults={onResetDefaults}
        />
      </PopoverContent>
    </Popover>
  );
}
