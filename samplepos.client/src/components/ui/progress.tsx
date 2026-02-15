// Progress component for Banking module
import React from 'react';

interface ProgressProps {
    value?: number;
    className?: string;
    max?: number;
    label?: string;
}

export const Progress: React.FC<ProgressProps> = ({
    value = 0,
    className = '',
    max = 100,
    label = 'Progress'
}) => {
    const percentage = Math.min(Math.max(0, (value / max) * 100), 100);

    return (
        <div
            className={`relative h-4 w-full overflow-hidden rounded-full bg-secondary ${className}`}
            role="progressbar"
            aria-label={label}
            aria-valuenow={value}
            aria-valuemin={0}
            aria-valuemax={max}
        >
            <div
                className="h-full bg-primary transition-all duration-300 ease-in-out"
                style={{ width: `${percentage}%` }}
            />
        </div>
    );
};
