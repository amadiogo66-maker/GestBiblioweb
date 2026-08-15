import { cva, type VariantProps } from 'class-variance-authority';
import Link from 'next/link';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactElement } from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98]',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-white shadow-sm hover:bg-primary/90',
        secondary: 'bg-secondary text-primary shadow-sm hover:bg-secondary/90',
        outline: 'border border-primary/30 text-primary hover:border-primary hover:bg-primary/5',
        ghost: 'text-primary hover:bg-primary/5',
      },
      size: {
        sm: 'px-4 py-2 text-sm',
        md: 'px-6 py-3 text-base',
        lg: 'px-8 py-4 text-base',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  }
);

type ButtonVariants = VariantProps<typeof buttonVariants>;

type ButtonAsButton = ButtonVariants &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    href?: undefined;
  };

type ButtonAsLink = ButtonVariants &
  AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
  };

export type ButtonProps = ButtonAsButton | ButtonAsLink;

export function Button({ className, variant, size, ...props }: ButtonProps): ReactElement {
  const classes = cn(buttonVariants({ variant, size }), className);

  if (typeof props.href === 'string') {
    const { href, ...anchorProps } = props;
    return <Link href={href} className={classes} {...anchorProps} />;
  }

  return <button type={props.type ?? 'button'} className={classes} {...props} />;
}
