import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes, ReactElement } from 'react';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide', {
  variants: {
    variant: {
      new: 'bg-secondary/15 text-secondary',
      success: 'bg-success/15 text-success',
      danger: 'bg-danger/10 text-danger',
      primary: 'bg-primary/10 text-primary',
      neutral: 'bg-slate-100 text-slate-600',
    },
  },
  defaultVariants: { variant: 'neutral' },
});

interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps): ReactElement {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
