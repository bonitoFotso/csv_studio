import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils.ts';

const badgeVariants = cva('inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium leading-none', {
  variants: {
    variant: {
      neutral: 'bg-surface-alt text-text-muted',
      destructive: 'bg-destructive-bg text-destructive',
      validated: 'bg-validated-bg text-validated',
    },
  },
  defaultVariants: { variant: 'neutral' },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
