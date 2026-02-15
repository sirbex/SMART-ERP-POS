// Switch component for Banking module
import React from 'react';

interface SwitchProps {
    id?: string;
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    className?: string;
    disabled?: boolean;
}

export const Switch: React.FC<SwitchProps> = ({
    id,
    checked,
    onCheckedChange,
    className = '',
    disabled = false
}) => (
    <button
        id={id}
        type="button"
        role="switch"
        aria-label={id ? undefined : 'Toggle switch'}
        aria-checked={checked ? 'true' : 'false'}
        disabled={disabled}
        onClick={() => !disabled && onCheckedChange(!checked)}
        className={`
      relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full 
      border-2 border-transparent transition-colors duration-200 ease-in-out
      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background
      disabled:cursor-not-allowed disabled:opacity-50
      ${checked ? 'bg-primary' : 'bg-input'}
      ${className}
    `}
    >
        <span
            className={`
        pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow-lg ring-0 
        transition duration-200 ease-in-out
        ${checked ? 'translate-x-5' : 'translate-x-0'}
      `}
        />
    </button>
);
