/**
 * Shared document workspace shell — full-width SlideDrawer for inventory forms.
 * Used in: Purchase Orders create/edit, Manual Goods Receipt, procurement modals.
 */
import type { ReactNode } from 'react';
import SlideDrawer from '../../ui/SlideDrawer';

interface ModalContainerProps {
  children: ReactNode;
  onClose: () => void;
  title: string;
  subtitle?: string;
  footer?: ReactNode;
  width?: 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | 'full';
  transactional?: boolean;
  cancellable?: boolean;
  guardLabel?: string;
  /** @deprecated Use width="full" */
  maxWidth?: '2xl' | '4xl' | '6xl';
  className?: string;
  /** @deprecated Guard z-index handled by SlideDrawer */
  zIndex?: number;
}

const legacyWidthMap: Record<NonNullable<ModalContainerProps['maxWidth']>, ModalContainerProps['width']> = {
  '2xl': '2xl',
  '4xl': '4xl',
  '6xl': 'full',
};

export function ModalContainer({
  children,
  onClose,
  title,
  subtitle,
  footer,
  width,
  transactional = true,
  cancellable = true,
  guardLabel,
  maxWidth,
}: ModalContainerProps) {
  const drawerWidth = width ?? (maxWidth ? legacyWidthMap[maxWidth] : 'full');

  return (
    <SlideDrawer
      open
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      width={drawerWidth}
      transactional={transactional}
      cancellable={cancellable}
      guardLabel={guardLabel ?? title}
      footer={footer}
    >
      {children}
    </SlideDrawer>
  );
}
