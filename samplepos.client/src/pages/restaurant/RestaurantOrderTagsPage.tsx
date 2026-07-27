/**
 * Manage Samba-style order tag catalog (groups + tags).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import toast from 'react-hot-toast';
import Layout from '../../components/Layout';
import { api } from '../../utils/api';

type Tag = {
  id: string;
  label: string;
  prefix: string | null;
  price: string;
  sortOrder: number;
};

type Group = {
  id: string;
  name: string;
  sortOrder: number;
  minSelect: number;
  maxSelect: number | null;
  autoPrompt: boolean;
  tags: Tag[];
};

function apiErr(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const data = (err as { response?: { data?: { error?: string } } }).response?.data;
    if (data?.error) return data.error;
  }
  return err instanceof Error ? err.message : fallback;
}

export default function RestaurantOrderTagsPage() {
  const qc = useQueryClient();
  const [groupName, setGroupName] = useState('');
  const [tagDraft, setTagDraft] = useState<{
    groupId: string;
    label: string;
    prefix: string;
  } | null>(null);

  const catalogQuery = useQuery({
    queryKey: ['restaurant', 'order-tags'],
    queryFn: async () => {
      const res = await api.restaurant.listOrderTags();
      return (res.data.data || []) as Group[];
    },
  });

  const addGroup = useMutation({
    mutationFn: async () => {
      const created = await api.restaurant.upsertOrderTagGroup({
        name: groupName.trim(),
        autoPrompt: true,
      });
      const id = (created.data.data as { id?: string } | undefined)?.id;
      if (id) {
        await api.restaurant.mapOrderTagGroup({ groupId: id });
      }
    },
    onSuccess: async () => {
      setGroupName('');
      await qc.invalidateQueries({ queryKey: ['restaurant', 'order-tags'] });
      toast.success('Tag group saved (global mapping)');
    },
    onError: (e) => toast.error(apiErr(e, 'Failed to save group')),
  });

  const addTag = useMutation({
    mutationFn: async () => {
      if (!tagDraft) return;
      await api.restaurant.upsertOrderTag({
        groupId: tagDraft.groupId,
        label: tagDraft.label.trim(),
        prefix: tagDraft.prefix.trim() || null,
      });
    },
    onSuccess: async () => {
      setTagDraft(null);
      await qc.invalidateQueries({ queryKey: ['restaurant', 'order-tags'] });
      toast.success('Tag saved');
    },
    onError: (e) => toast.error(apiErr(e, 'Failed to save tag')),
  });

  const groups = catalogQuery.data || [];

  return (
    <Layout>
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <div>
          <h1 className="text-xl font-bold text-stone-900">Order tags</h1>
          <p className="text-sm text-stone-600">
            Samba-style modifiers for kitchen (Very hot, WITH ice, NO salt). Tags print on KOT via
            line notes.
          </p>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-3 space-y-2">
          <p className="text-xs font-semibold uppercase text-stone-500">New group</p>
          <div className="flex gap-2">
            <input
              className="flex-1 min-h-11 rounded-xl border border-stone-300 px-3 text-sm"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="e.g. Drink prep"
            />
            <button
              type="button"
              disabled={!groupName.trim() || addGroup.isPending}
              onClick={() => addGroup.mutate()}
              className="min-h-11 px-4 rounded-xl bg-stone-900 text-white text-sm font-semibold"
            >
              Add
            </button>
          </div>
        </div>

        {groups.map((g) => (
          <div key={g.id} className="rounded-xl border border-stone-200 bg-white p-3 space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-semibold text-stone-900">{g.name}</h2>
              <span className="text-[10px] uppercase text-stone-500">
                {g.autoPrompt ? 'auto-prompt' : 'manual'}
                {g.maxSelect != null ? ` · max ${g.maxSelect}` : ''}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {g.tags.map((t) => (
                <span
                  key={t.id}
                  className="inline-flex min-h-9 items-center px-3 rounded-lg bg-amber-50 border border-amber-200 text-sm font-medium text-amber-950"
                >
                  {t.prefix ? `${t.prefix} ` : ''}
                  {t.label}
                </span>
              ))}
            </div>
            {tagDraft?.groupId === g.id ? (
              <div className="flex flex-wrap gap-2 pt-1">
                <input
                  className="min-h-10 rounded-lg border px-2 text-sm"
                  placeholder="Prefix (NO/EXTRA)"
                  value={tagDraft.prefix}
                  onChange={(e) => setTagDraft({ ...tagDraft, prefix: e.target.value })}
                />
                <input
                  className="min-h-10 flex-1 rounded-lg border px-2 text-sm"
                  placeholder="Label"
                  value={tagDraft.label}
                  onChange={(e) => setTagDraft({ ...tagDraft, label: e.target.value })}
                />
                <button
                  type="button"
                  className="min-h-10 px-3 rounded-lg bg-emerald-600 text-white text-sm font-semibold"
                  disabled={!tagDraft.label.trim() || addTag.isPending}
                  onClick={() => addTag.mutate()}
                >
                  Save tag
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="text-sm font-semibold text-stone-700 underline"
                onClick={() => setTagDraft({ groupId: g.id, label: '', prefix: '' })}
              >
                + Add tag
              </button>
            )}
          </div>
        ))}
      </div>
    </Layout>
  );
}
