/**
 * SSOT entry for customer credit notes: pick linked invoice → AdjustCustomerInvoiceModal.
 */

import React, { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { CUSTOMER_CREDIT_NOTE_ENTRY } from '@shared/utils/creditDebitNoteSsot';
import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../../ui/temp-ui-components';
import { LinkedInvoiceField } from './LinkedInvoiceField';
import type { LinkedInvoiceOption } from './linkedInvoiceSearch';

export interface SelectCustomerInvoiceDialogProps {
    open: boolean;
    onClose: () => void;
    onInvoiceSelected: (invoice: {
        id: string;
        invoiceNumber: string;
        customerId?: string;
    }) => void;
}

export function SelectCustomerInvoiceDialog({
    open,
    onClose,
    onInvoiceSelected,
}: SelectCustomerInvoiceDialogProps) {
    const [selected, setSelected] = useState<LinkedInvoiceOption | null>(null);

    useEffect(() => {
        if (!open) setSelected(null);
    }, [open]);

    const continueWithInvoice = () => {
        if (!selected) {
            toast.error('Please select an invoice');
            return;
        }
        onInvoiceSelected({
            id: selected.id,
            invoiceNumber: selected.invoiceNumber,
            customerId: selected.partyId,
        });
    };

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{CUSTOMER_CREDIT_NOTE_ENTRY.title}</DialogTitle>
                    <DialogDescription>
                        {CUSTOMER_CREDIT_NOTE_ENTRY.description}
                    </DialogDescription>
                </DialogHeader>

                <LinkedInvoiceField
                    party="customer"
                    label={CUSTOMER_CREDIT_NOTE_ENTRY.invoiceLabel}
                    searchPlaceholder={CUSTOMER_CREDIT_NOTE_ENTRY.invoiceSearchPlaceholder}
                    selected={selected}
                    onSelect={setSelected}
                    onClear={() => setSelected(null)}
                    showOutstanding
                />

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={continueWithInvoice} disabled={!selected}>
                        Continue
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
