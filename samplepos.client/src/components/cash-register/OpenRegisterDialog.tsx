/**
 * Open Register Dialog
 * 
 * Dialog for opening a new cash register session.
 * Shown when user needs to start a shift.
 */

import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../ui/select';
import { useRegisters, useOpenSession } from '../../hooks/useCashRegister';
import { Loader2, DollarSign } from 'lucide-react';

interface OpenRegisterDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess?: () => void;
}

export function OpenRegisterDialog({
    open,
    onOpenChange,
    onSuccess,
}: OpenRegisterDialogProps) {
    const [registerId, setRegisterId] = useState<string>('');
    const [openingFloat, setOpeningFloat] = useState<string>('');

    const { data: registers, isLoading: loadingRegisters } = useRegisters();
    const openSession = useOpenSession();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Only register is required - float can be 0 (empty field defaults to 0)
        if (!registerId) return;

        const floatAmount = openingFloat ? parseFloat(openingFloat) : 0;

        try {
            await openSession.mutateAsync({
                registerId,
                openingFloat: floatAmount,
            });
            onOpenChange(false);
            setRegisterId('');
            setOpeningFloat('');
            onSuccess?.();
        } catch (error) {
            console.error('Failed to open session:', error);
        }
    };

    const activeRegisters = registers?.filter((r) => r.isActive) || [];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <DollarSign className="h-5 w-5 text-green-600" />
                        Open Cash Register
                    </DialogTitle>
                    <DialogDescription>
                        Start your shift by selecting a register and entering the opening float amount.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                    <div className="space-y-2">
                        <Label htmlFor="register">Select Register</Label>
                        {loadingRegisters ? (
                            <div className="flex items-center gap-2 text-sm text-gray-500">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Loading registers...
                            </div>
                        ) : (
                            <Select value={registerId} onValueChange={setRegisterId}>
                                <SelectTrigger id="register">
                                    <SelectValue placeholder="Select a register" />
                                </SelectTrigger>
                                <SelectContent>
                                    {activeRegisters.map((register) => (
                                        <SelectItem key={register.id} value={register.id}>
                                            {register.name}
                                            {register.location && ` - ${register.location}`}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="openingFloat">Opening Float (UGX)</Label>
                        <Input
                            id="openingFloat"
                            type="number"
                            min="0"
                            step="100"
                            placeholder="Enter opening cash amount"
                            value={openingFloat}
                            onChange={(e) => setOpeningFloat(e.target.value)}
                            className="text-lg"
                        />
                        <p className="text-xs text-gray-500">
                            Count the cash in the drawer before starting. Leave empty or 0 if no float.
                        </p>
                    </div>

                    {openSession.error && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
                            {openSession.error instanceof Error
                                ? openSession.error.message
                                : 'Failed to open register'}
                        </div>
                    )}

                    <DialogFooter className="gap-2 mt-6">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={!registerId || openSession.isPending}
                            className="bg-green-600 hover:bg-green-700"
                        >
                            {openSession.isPending ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Opening...
                                </>
                            ) : (
                                'Open Register'
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
