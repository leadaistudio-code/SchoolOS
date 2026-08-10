'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buttonVariants, type ButtonVariantProps } from './button-variants'

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    ButtonVariantProps {
  loading?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, block, loading, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, block }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {children}
    </button>
  ),
)
Button.displayName = 'Button'

/**
 * Icon-only control. The label is required, not optional — an unlabelled icon
 * button is unusable with a screen reader and ambiguous with one.
 */
export const IconButton = React.forwardRef<
  HTMLButtonElement,
  Omit<ButtonProps, 'size' | 'children'> & { label: string; children: React.ReactNode; small?: boolean }
>(({ className, variant = 'ghost', label, small, children, ...props }, ref) => (
  <Button
    ref={ref}
    variant={variant}
    size={small ? 'icon-sm' : 'icon'}
    aria-label={label}
    title={label}
    className={className}
    {...props}
  >
    {children}
  </Button>
))
IconButton.displayName = 'IconButton'
