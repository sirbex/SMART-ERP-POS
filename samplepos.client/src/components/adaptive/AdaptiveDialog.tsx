import type { ReactNode, CSSProperties } from 'react';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { useAdaptiveLayoutOptional } from './AdaptiveAppShell';
import {
  ADAPTIVE_DIALOG_SIZE_CLASS,
  resolveDialogPresentation,
  type AdaptiveDialogPresentation,
  type AdaptiveDialogSize,
} from '../../lib/adaptiveForms';

type AdaptiveDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Preferred width when presentation is modal. */
  size?: AdaptiveDialogSize;
  className?: string;
  /** Force presentation (tests). Default: from layout tier dialogMode. */
  presentationOverride?: AdaptiveDialogPresentation;
  /** Transaction-guard panel stacking (defaults to radix z-50). */
  zIndex?: number;
  /** Block Esc / outside click dismiss (draft/create workflows). */
  preventDismiss?: boolean;
};

function sizeClassFor(
  presentation: AdaptiveDialogPresentation,
  size: AdaptiveDialogSize,
): string {
  if (presentation === 'full') return '';
  if (presentation === 'near-full') {
    return size === 'sm' ? ADAPTIVE_DIALOG_SIZE_CLASS.sm : '';
  }
  return ADAPTIVE_DIALOG_SIZE_CLASS[size];
}

/**
 * Tier-driven dialog chrome:
 * mobile = full screen, compact = near-full, desktop/wide = centered modal.
 */
export function AdaptiveDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
  className = '',
  presentationOverride,
  zIndex,
  preventDismiss = false,
}: AdaptiveDialogProps) {
  const layout = useAdaptiveLayoutOptional();
  const presentation =
    presentationOverride
    ?? (layout ? resolveDialogPresentation(layout.tier) : 'modal');

  const surface =
    presentation === 'full'
      ? 'full'
      : presentation === 'near-full'
        ? 'near-full'
        : 'centered';

  const stackStyle = (zIndex != null ? { zIndex } : undefined) as CSSProperties | undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        surface={surface}
        className={`${sizeClassFor(presentation, size)} ${className}`.trim()}
        data-dialog-presentation={presentation}
        style={stackStyle}
        onEscapeKeyDown={(e) => {
          if (preventDismiss) e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          if (preventDismiss) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (preventDismiss) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description != null && (
            <DialogDescription>{description}</DialogDescription>
          )}
        </DialogHeader>
        <DialogBody>{children}</DialogBody>
        {footer != null && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}
