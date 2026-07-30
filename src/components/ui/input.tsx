import * as React from 'react';
import { cn } from '@/lib/utils.ts';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'h-8 w-full rounded-md border border-border bg-surface px-2.5 text-[13px] text-text outline-none placeholder:text-text-faint focus-visible:border-text-muted',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';
