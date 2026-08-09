/**
 * Single invoice picker field used by all credit/debit create dialogs (AR + AP).
 */

import { useState } from 'react';
import { Button, Input, Label } from '../../ui/temp-ui-components';
import { formatCurrency } from '../../../utils/currency';
import type { LinkedInvoiceParty } from '@shared/utils/creditDebitNoteSsot';
import { searchLinkedInvoices, type LinkedInvoiceOption } from './linkedInvoiceSearch';

export interface LinkedInvoiceFieldProps {
    party: LinkedInvoiceParty;
    label: string;
    searchPlaceholder: string;
    selected: LinkedInvoiceOption | null;
    onSelect: (inv: LinkedInvoiceOption) => void;
    onClear: () => void;
    showOutstanding?: boolean;
}

export function LinkedInvoiceField({
    party,
    label,
    searchPlaceholder,
    selected,
    onSelect,
    onClear,
    showOutstanding = false,
}: LinkedInvoiceFieldProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<LinkedInvoiceOption[]>([]);
    const [searching, setSearching] = useState(false);

    const runSearch = async (q: string) => {
        setQuery(q);
        if (q.trim().length < 2) {
            setResults([]);
            return;
        }
        setSearching(true);
        try {
            setResults(await searchLinkedInvoices(party, q));
        } catch {
            setResults([]);
        } finally {
            setSearching(false);
        }
    };

    return (
        <div>
            <Label>{label}</Label>
            {selected ? (
                <div className="mt-1 flex flex-wrap items-center gap-2 p-2 bg-blue-50 rounded min-h-[var(--layout-touch-target)]">
                    <span className="font-medium">{selected.invoiceNumber}</span>
                    <span className="text-gray-500">—</span>
                    <span>{selected.partyName}</span>
                    <span className="text-gray-500">
                        ({formatCurrency(parseFloat(selected.totalAmount || '0'))})
                    </span>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            onClear();
                            setQuery('');
                            setResults([]);
                        }}
                        className="ml-auto min-h-[var(--layout-touch-target)]"
                    >
                        Change
                    </Button>
                </div>
            ) : (
                <div className="relative mt-1">
                    <Input
                        placeholder={searchPlaceholder}
                        value={query}
                        onChange={(e) => void runSearch(e.target.value)}
                        className="min-h-[var(--layout-touch-target)]"
                    />
                    {searching && <p className="text-xs text-gray-500 mt-1">Searching…</p>}
                    {results.length > 0 && (
                        <div className="absolute z-10 w-full bg-white border rounded-md shadow-lg mt-1 max-h-56 overflow-y-auto">
                            {results.map((inv) => (
                                <button
                                    key={inv.id}
                                    type="button"
                                    className="w-full text-left px-3 py-2.5 hover:bg-blue-50 text-sm border-b last:border-b-0 min-h-[var(--layout-touch-target)]"
                                    onClick={() => {
                                        onSelect(inv);
                                        setResults([]);
                                        setQuery('');
                                    }}
                                >
                                    <div className="font-medium">{inv.invoiceNumber}</div>
                                    <div className="text-gray-600">{inv.partyName}</div>
                                    <div className="text-xs text-gray-500 mt-0.5">
                                        Total {formatCurrency(parseFloat(inv.totalAmount || '0'))}
                                        {showOutstanding
                                            && inv.amountDue
                                            && parseFloat(inv.amountDue) > 0 && (
                                            <> · Outstanding {formatCurrency(parseFloat(inv.amountDue))}</>
                                        )}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                    {query.trim().length >= 2 && !searching && results.length === 0 && (
                        <p className="text-xs text-gray-500 mt-2">No matching invoices.</p>
                    )}
                </div>
            )}
        </div>
    );
}
