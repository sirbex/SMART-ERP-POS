import React, { forwardRef } from 'react';

export interface POSButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  children: React.ReactNode;
  className?: string;
}

const POSButton = forwardRef<HTMLButtonElement, POSButtonProps>(
  ({ variant = 'primary', children, className = '', ...props }, ref) => {
    const base = 'px-4 py-2 rounded font-semibold focus:outline-none transition-colors';
    const variants = {
      primary: 'bg-blue-600 text-white hover:bg-blue-700',
      secondary: 'bg-gray-200 text-gray-800 hover:bg-gray-300',
      danger: 'bg-red-600 text-white hover:bg-red-700',
    };
    return (
      <button ref={ref} className={`${base} ${variants[variant]} ${className}`} {...props}>
        {children}
      </button>
    );
  }
);

POSButton.displayName = 'POSButton';

export default POSButton;
