import * as React from 'react';
import { cn } from '@/lib/utils.ts';

export const Checkbox = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    type="checkbox"
    className={cn(
      'h-3.5 w-3.5 shrink-0 rounded-sm border border-border accent-text',
      className,
    )}
    {...props}
  />
));
Checkbox.displayName = 'Checkbox';
