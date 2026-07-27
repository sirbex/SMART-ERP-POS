/**
 * Samba-style order tag pad — toggle buttons by group, optional free-text note.
 */
import { formatOrderTagLabel, toggleOrderTagSelection } from '@shared/utils/restaurantOrderTags';
import type { RestaurantOrderTagSelection } from '@shared/utils/restaurantOrderTags';

export type OrderTagOption = {
  id: string;
  label: string;
  prefix?: string | null;
  price?: number | string;
  sortOrder?: number;
};

export type OrderTagGroupOption = {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number | null;
  autoPrompt: boolean;
  tags: OrderTagOption[];
};

type Props = {
  productName: string;
  groups: OrderTagGroupOption[];
  selected: RestaurantOrderTagSelection[];
  freeText: string;
  busy?: boolean;
  onChangeSelected: (next: RestaurantOrderTagSelection[]) => void;
  onChangeFreeText: (next: string) => void;
  onSave: () => void;
  onSkip: () => void;
};

export function RestaurantOrderTagPad({
  productName,
  groups,
  selected,
  freeText,
  busy,
  onChangeSelected,
  onChangeFreeText,
  onSave,
  onSkip,
}: Props) {
  const isOn = (tag: OrderTagOption) =>
    selected.some(
      (s) =>
        (s.id && s.id === tag.id) ||
        (!s.id &&
          s.label.toLowerCase() === tag.label.toLowerCase() &&
          String(s.prefix || '') === String(tag.prefix || '')),
    );

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-3 sm:items-center">
      <div
        role="dialog"
        aria-label={`Order tags for ${productName}`}
        className="w-full max-w-lg rounded-2xl bg-white shadow-xl border border-stone-200 overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-stone-100 bg-stone-50">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">
            Order tags
          </p>
          <h2 className="text-base font-bold text-stone-900 truncate">{productName}</h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Tap tags for kitchen — same vocabulary every ticket
          </p>
        </div>

        <div className="max-h-[55vh] overflow-y-auto px-4 py-3 space-y-4">
          {groups.map((g) => (
            <div key={g.id}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500 mb-2">
                {g.name}
                {g.maxSelect === 1 ? ' · pick one' : ''}
              </p>
              <div className="flex flex-wrap gap-2">
                {g.tags.map((tag) => {
                  const on = isOn(tag);
                  const display = formatOrderTagLabel({
                    label: tag.label,
                    prefix: tag.prefix,
                  });
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        const next = toggleOrderTagSelection(
                          selected,
                          {
                            id: tag.id,
                            label: tag.label,
                            prefix: tag.prefix ?? null,
                            price: Number(tag.price) || 0,
                          },
                          { maxSelect: g.maxSelect },
                        );
                        onChangeSelected(next);
                      }}
                      className={`min-h-11 px-3 rounded-xl text-sm font-semibold border-2 touch-manipulation ${
                        on
                          ? 'bg-amber-600 border-amber-700 text-white'
                          : 'bg-white border-stone-200 text-stone-800 active:bg-stone-50'
                      }`}
                    >
                      {display}
                      {Number(tag.price) > 0 ? (
                        <span className="ml-1 opacity-80 text-[10px]">+{tag.price}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
              Special note (optional)
            </label>
            <input
              type="text"
              value={freeText}
              maxLength={200}
              disabled={busy}
              onChange={(e) => onChangeFreeText(e.target.value)}
              placeholder="Only if no tag fits…"
              className="mt-1 w-full min-h-11 rounded-xl border border-stone-300 px-3 text-sm"
            />
          </div>
        </div>

        <div className="flex gap-2 p-3 border-t border-stone-100 bg-stone-50">
          <button
            type="button"
            disabled={busy}
            onClick={onSkip}
            className="flex-1 min-h-12 rounded-xl border border-stone-300 text-sm font-semibold text-stone-700 touch-manipulation"
          >
            Skip
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onSave}
            className="flex-[1.4] min-h-12 rounded-xl bg-emerald-600 text-white text-sm font-bold touch-manipulation active:bg-emerald-700"
          >
            Apply tags
          </button>
        </div>
      </div>
    </div>
  );
}
