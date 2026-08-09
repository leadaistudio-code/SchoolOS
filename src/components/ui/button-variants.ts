import { cva, type VariantProps } from 'class-variance-authority'

/**
 * Button styling, kept in a module with no 'use client' directive.
 *
 * Server components style links as buttons by calling this directly; a
 * client-only module cannot be invoked from the server, only rendered.
 */
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-all disabled:pointer-events-none disabled:opacity-55 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'bg-[var(--brand-500)] text-[var(--brand-contrast)] hover:bg-[var(--brand-600)] shadow-[var(--shadow-card)]',
        secondary:
          'bg-surface text-ink border border-line-strong hover:bg-surface-2 hover:border-[var(--brand-500)] hover:text-[var(--brand-500)]',
        ghost: 'text-ink-muted hover:bg-surface-2 hover:text-ink',
        danger: 'bg-[var(--danger)] text-white hover:brightness-95 shadow-[var(--shadow-card)]',
        subtle:
          'bg-[var(--brand-50)] text-[var(--brand-500)] hover:bg-[var(--brand-500)] hover:text-[var(--brand-contrast)]',
        dark: 'bg-ink text-bg hover:opacity-90',
        link: 'text-[var(--brand-500)] underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3 text-[12.5px] rounded-[var(--radius-sm)] [&_svg]:size-4',
        md: 'h-9.5 px-4 text-[13.5px] rounded-[var(--radius-sm)] [&_svg]:size-4',
        lg: 'h-11 px-5 text-[14.5px] rounded-[var(--radius)] [&_svg]:size-5',
        icon: 'h-9.5 w-9.5 rounded-[var(--radius-sm)] [&_svg]:size-4',
      },
      block: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'primary', size: 'md', block: false },
  },
)

export type ButtonVariantProps = VariantProps<typeof buttonVariants>
