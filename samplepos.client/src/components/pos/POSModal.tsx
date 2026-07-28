import React from 'react';
import { Dialog, DialogPortal, DialogContent, DialogOverlay, DialogTitle, DialogDescription } from '@radix-ui/react-dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { useAdaptiveLayoutOptional } from '../adaptive';
import { resolveDialogPresentation } from '../../lib/adaptiveForms';

interface POSModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  ariaLabel?: string;
  title?: string;
  description?: string;
  hideTitle?: boolean;
  preventOutsideClose?: boolean;
}

/**
 * POS portal modal — keeps DialogPortal invariant (nested-form safety)
 * and sizes the panel from layout dialogMode (Phase 3).
 */
export default function POSModal({
  open,
  onOpenChange,
  children,
  ariaLabel,
  title = 'Dialog',
  description,
  hideTitle = false,
  preventOutsideClose = false,
}: POSModalProps) {
  const layout = useAdaptiveLayoutOptional();
  const presentation = layout
    ? resolveDialogPresentation(layout.tier)
    : 'modal';

  const panelClass =
    presentation === 'full'
      ? 'bg-white shadow-xl p-4 w-full h-full max-w-none max-h-none rounded-none overflow-y-auto'
      : presentation === 'near-full'
        ? 'bg-white rounded-xl shadow-xl p-4 w-[min(96vw,36rem)] max-h-[min(92vh,40rem)] overflow-y-auto'
        : 'bg-white rounded-lg shadow-xl p-3 sm:p-4 md:p-6 min-w-[280px] sm:min-w-[320px] max-w-[95vw] sm:max-w-lg w-full mx-2 sm:mx-0 max-h-[95vh] overflow-y-auto';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay
          className="fixed inset-0 bg-black bg-opacity-40 z-50"
          onClick={() => !preventOutsideClose && onOpenChange(false)}
        />
        <DialogContent
          className={`fixed inset-0 flex items-center justify-center z-50 ${
            presentation === 'full' ? 'p-0' : 'p-2 sm:p-4'
          }`}
          aria-label={ariaLabel}
          data-dialog-presentation={presentation}
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
          <div className={panelClass} data-pos-modal-panel="true">
            {hideTitle ? (
              <VisuallyHidden>
                <DialogTitle>{title}</DialogTitle>
              </VisuallyHidden>
            ) : (
              title && <DialogTitle className="sr-only">{title}</DialogTitle>
            )}
            {description ? (
              <VisuallyHidden>
                <DialogDescription>{description}</DialogDescription>
              </VisuallyHidden>
            ) : (
              <VisuallyHidden>
                <DialogDescription>{title}</DialogDescription>
              </VisuallyHidden>
            )}
            {children}
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
