import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface WorkflowHelpTriggerProps {
  title: string;
  children: ReactNode;
  className?: string;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'right' | 'bottom' | 'left';
}

/**
 * Single info icon — opens workflow / reading content in a dismissible popover.
 * Closes on outside click or toggling the icon (Radix Popover SSOT).
 */
export function WorkflowHelpTrigger({
  title,
  children,
  className,
  align = 'start',
  side = 'bottom',
}: WorkflowHelpTriggerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex shrink-0 items-center justify-center w-8 h-8 rounded-full text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 hover:border-blue-300 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1',
            className,
          )}
          aria-label={`${title} — click for details`}
        >
          <Info className="w-4 h-4" aria-hidden />
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
        <div className="px-4 py-3 text-xs text-blue-800">{children}</div>
      </PopoverContent>
    </Popover>
  );
}
