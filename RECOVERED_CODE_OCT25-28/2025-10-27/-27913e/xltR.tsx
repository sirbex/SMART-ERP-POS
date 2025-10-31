/**
 * Held Sales Dialog Component
 * Shows list of held carts with restore/delete actions
 */

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { formatCurrency } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { Clock, User, Trash2, RotateCcw, Package, AlertCircle } from 'lucide-react';
import type { HeldSale } from '../services/heldSalesService';
import { getHeldSales, deleteHeldSale } from '../services/heldSalesService';
import { useToast } from './ui/toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';

interface HeldSalesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRestore: (heldSale: HeldSale) => void;
  onDeleted?: () => void;
}

export default function HeldSalesDialog({ 
  open, 
  onOpenChange, 
  onRestore,
  onDeleted 
}: HeldSalesDialogProps) {
  const [heldSales, setHeldSales] = useState<HeldSale[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedHold, setSelectedHold] = useState<HeldSale | null>(null);
  const { toast } = useToast();

  const loadHeldSales = async () => {
    setLoading(true);
    try {
      const sales = await getHeldSales(false);
      setHeldSales(sales);
    } catch (error) {
      console.error('Error loading held sales:', error);
      toast({
        title: 'Error',
        description: 'Failed to load held sales',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadHeldSales();
    }
  }, [open]);

  const handleRestore = (heldSale: HeldSale) => {
    onRestore(heldSale);
    onOpenChange(false);
    toast({
      title: 'Cart Restored',
      description: `Hold #${heldSale.holdNumber} restored to cart`,
    });
  };

  const handleDeleteClick = (heldSale: HeldSale) => {
    setSelectedHold(heldSale);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedHold) return;

    try {
      await deleteHeldSale(selectedHold.id);
      setHeldSales(prev => prev.filter(h => h.id !== selectedHold.id));
      setDeleteDialogOpen(false);
      setSelectedHold(null);
      
      toast({
        title: 'Hold Deleted',
        description: `Hold #${selectedHold.holdNumber} removed`,
      });

      if (onDeleted) {
        onDeleted();
      }
    } catch (error) {
      console.error('Error deleting held sale:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete held sale',
        variant: 'destructive',
      });
    }
  };

  const isExpiringSoon = (expiresAt: string) => {
    const expiryTime = new Date(expiresAt).getTime();
    const now = Date.now();
    const hoursRemaining = (expiryTime - now) / (1000 * 60 * 60);
    return hoursRemaining < 2; // Less than 2 hours
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Held Sales</DialogTitle>
            <DialogDescription>
              Restore or manage your held carts
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="h-[500px] pr-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : heldSales.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Package className="h-12 w-12 mb-3 opacity-50" />
                <p>No held sales</p>
                <p className="text-sm">Hold a cart to access it later</p>
              </div>
            ) : (
              <div className="space-y-3">
                {heldSales.map((hold) => {
                  const expiringSoon = isExpiringSoon(hold.expiresAt);
                  
                  return (
                    <div
                      key={hold.id}
                      className="border rounded-lg p-4 hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="font-mono">
                              {hold.holdNumber}
                            </Badge>
                            {expiringSoon && (
                              <Badge variant="destructive" className="text-xs">
                                <AlertCircle className="h-3 w-3 mr-1" />
                                Expiring Soon
                              </Badge>
                            )}
                          </div>
                          
                          {hold.customer && (
                            <p className="text-sm font-medium">{hold.customer.name}</p>
                          )}
                          
                          <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDistanceToNow(new Date(hold.heldAt), { addSuffix: true })}
                            </span>
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {hold.user.fullName}
                            </span>
                            <span className="flex items-center gap-1">
                              <Package className="h-3 w-3" />
                              {hold.items.length} item{hold.items.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                        </div>

                        <div className="text-right">
                          <p className="text-2xl font-bold">{formatCurrency(hold.total)}</p>
                        </div>
                      </div>

                      <Separator className="my-3" />

                      {/* Show first 3 items */}
                      <div className="space-y-1 mb-3">
                        {hold.items.slice(0, 3).map((item, idx) => (
                          <div key={idx} className="flex justify-between text-sm">
                            <span className="text-muted-foreground">
                              {item.quantity} × {item.name}
                            </span>
                            <span>{formatCurrency(item.total)}</span>
                          </div>
                        ))}
                        {hold.items.length > 3 && (
                          <p className="text-xs text-muted-foreground">
                            + {hold.items.length - 3} more item{hold.items.length - 3 !== 1 ? 's' : ''}
                          </p>
                        )}
                      </div>

                      {hold.notes && (
                        <p className="text-sm text-muted-foreground mb-3 italic">
                          Note: {hold.notes}
                        </p>
                      )}

                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="flex-1"
                          onClick={() => handleRestore(hold)}
                        >
                          <RotateCcw className="h-4 w-4 mr-2" />
                          Restore to Cart
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDeleteClick(hold)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Held Sale?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete hold #{selectedHold?.holdNumber}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
