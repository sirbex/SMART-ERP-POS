import React from 'react';
import { Dialog, DialogContent, DialogOverlay, DialogTitle, DialogDescription } from '@radix-ui/react-dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';

interface POSModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  ariaLabel?: string;
  title?: string;
  description?: string;
  hideTitle?: boolean;
  preventOutsideClose?: boolean; // For destructive/confirmation modals
}

export default function POSModal({
  open,
  onOpenChange,
  children,
  ariaLabel,
  title = 'Dialog',
  description,
  hideTitle = false,
  preventOutsideClose = false
}: POSModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogOverlay
        className="fixed inset-0 bg-black bg-opacity-40 z-50"
        onClick={() => !preventOutsideClose && onOpenChange(false)}
      />
      <DialogContent
        className="fixed inset-0 flex items-center justify-center z-50"
        aria-label={ariaLabel}
        onEscapeKeyDown={(e) => {
          if (!preventOutsideClose) {
            onOpenChange(false);
          } else {
            e.preventDefault();
          }
        }}
        onPointerDownOutside={(e) => {
          if (preventOutsideClose) {
            e.preventDefault();
          }
        }}
        onInteractOutside={(e) => {
          if (preventOutsideClose) {
            e.preventDefault();
          }
        }}
      >
        <div className="bg-white rounded-lg shadow-xl p-3 sm:p-4 md:p-6 min-w-[280px] sm:min-w-[320px] max-w-[95vw] sm:max-w-lg w-full mx-2 sm:mx-0 max-h-[95vh] overflow-y-auto">
          {hideTitle ? (
            <VisuallyHidden>
              <DialogTitle>{title}</DialogTitle>
            </VisuallyHidden>
          ) : (
            title && <DialogTitle className="sr-only">{title}</DialogTitle>
          )}
          {description && (
            <VisuallyHidden>
              <DialogDescription>{description}</DialogDescription>
            </VisuallyHidden>
          )}
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}
