import { RefreshCw } from 'lucide-react';

interface Props {
    label?: string;
}

/** Inline section loader — never blocks the whole page. */
export function WorkspaceSectionLoading({ label = 'Loading financial data…' }: Props) {
    return (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-8 flex flex-col items-center justify-center gap-3 text-slate-500">
            <RefreshCw className="h-6 w-6 animate-spin text-slate-400" />
            <p className="text-sm">{label}</p>
        </div>
    );
}
