import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface HelpTriggerProps {
  title: string;
  children: ReactNode;
  className?: string;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** compact = small icon for section headings; default = touch-friendly */
  size?: 'default' | 'compact';
}

/**
 * Global help icon — detailed reading content in a dismissible popover only.
 */
export function HelpTrigger({
  title,
  children,
  className,
  align = 'start',
  side = 'bottom',
  size = 'default',
}: HelpTriggerProps) {
  const compact = size === 'compact';
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex shrink-0 items-center justify-center rounded-full text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 hover:border-blue-300 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1',
            compact ? 'w-6 h-6' : 'w-8 h-8',
            className,
          )}
          aria-label={`${title} — help`}
        >
          <Info className={cn('aria-hidden', compact ? 'w-3.5 h-3.5' : 'w-4 h-4')} aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        side={side}
        className="w-[min(22rem,calc(100vw-2rem))] max-h-[min(70vh,24rem)] overflow-y-auto p-0 border-blue-200 z-[3000]"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="bg-blue-50 px-4 py-3 border-b border-blue-200 sticky top-0">
          <h4 className="text-sm font-semibold text-blue-900">{title}</h4>
        </div>
        <div className="px-4 py-3 text-xs text-blue-800 space-y-2">{children}</div>
      </PopoverContent>
    </Popover>
  );
}
