import * as React from 'react';
import { cn } from '../../lib/utils';

interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  onCheckedChange?: (checked: boolean) => void;
}

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, onCheckedChange, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onCheckedChange?.(e.target.checked);
    };

    return (
      <label className={cn('ui-switch', className)}>
        <input
          type='checkbox'
          className='peer sr-only'
          ref={ref}
          onChange={handleChange}
          {...props}
        />
        <span className='block h-6 w-11 rounded-full bg-gray-300 transition peer-checked:bg-blue-600'>
          <span className='block h-5 w-5 translate-x-0.5 translate-y-0.5 rounded-full bg-white transition-transform peer-checked:translate-x-[1.35rem]' />
        </span>
      </label>
    );
  }
);

Switch.displayName = 'Switch';

export { Switch };