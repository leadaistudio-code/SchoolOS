import { cva, type VariantProps } from 'class-variance-authority'

/**
 * Button styling, kept in a module with no 'use client' directive.
 *
 * Server components style links as buttons by calling this directly; a
 * client-only module cannot be invoked from the server, only rendered.
 *
 * No elevation and no colour on secondary actions: on a dense screen the one
 * filled button should be the only thing competing for the eye.
 */
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-medium rounded-[var(--radius-sm)] border border-transparent transition-colors duration-100 disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'bg-[var(--brand-500)] text-[var(--brand-contrast)] hover:bg-[var(--brand-600)]',
        secondary:
          'bg-surface text-ink border-line-strong hover:bg-surface-2',
        ghost: 'text-ink-muted hover:bg-surface-2 hover:text-ink',
        danger: 'bg-[var(--danger)] text-white hover:brightness-110',
        subtle: 'bg-[var(--brand-50)] text-[var(--brand-600)] hover:bg-[var(--brand-100)]',
        link: 'text-[var(--brand-600)] underline-offset-2 hover:underline px-0',
      },
      size: {
        sm: 'h-8 px-2.5 text-xs [&_svg]:size-3.5',
        md: 'h-9 px-3 text-base [&_svg]:size-4',
        lg: 'h-10 px-4 text-base [&_svg]:size-4',
        icon: 'size-9 [&_svg]:size-4',
        'icon-sm': 'size-8 [&_svg]:size-3.5',
      },
      block: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'primary', size: 'md', block: false },
  },
)

export type ButtonVariantProps = VariantProps<typeof buttonVariants>
