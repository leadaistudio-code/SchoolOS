'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MyCampusViewLogo } from '@/components/brand/logo'
import { cn } from '@/lib/utils'

/**
 * The Academy's header.
 *
 * On the home page it starts transparent over the black fold and turns into
 * the white bar once the fold has scrolled away; everywhere else it is the
 * white bar from the start. One element either way, so nothing jumps.
 */
export function AcademyHeader({ signedIn, firstName }: { signedIn: boolean; firstName?: string }) {
  const pathname = usePathname()
  const overFold = pathname === '/academy'
  const [solid, setSolid] = React.useState(!overFold)

  React.useEffect(() => {
    if (!overFold) {
      setSolid(true)
      return
    }
    const sync = () => setSolid(window.scrollY > window.innerHeight * 0.82)
    sync()
    window.addEventListener('scroll', sync, { passive: true })
    return () => window.removeEventListener('scroll', sync)
  }, [overFold])

  const dark = !solid

  return (
    <header
      className={cn(
        'inset-x-0 top-0 z-40 transition-[background-color,border-color] duration-300',
        overFold ? 'fixed' : 'sticky',
        // `!`: globals.css sets `* { border-color }` unlayered, which beats a plain utility.
        solid ? 'border-b border-[var(--rule)] bg-white/95 backdrop-blur-sm' : 'border-b !border-transparent bg-transparent',
      )}
    >
      <div className="mx-auto flex h-16 max-w-[78rem] items-center gap-6 px-[var(--gutter)] sm:h-[4.5rem]">
        <Link href="/academy" className="flex shrink-0 items-center gap-2.5" aria-label="MyCampusView Academy home">
          <MyCampusViewLogo size="sm" onDark={dark} priority />
          <span aria-hidden className={cn('hidden h-4 w-px sm:block', dark ? 'bg-white/30' : 'bg-[var(--rule-strong)]')} />
          <span
            className={cn(
              'hidden text-[15px] font-semibold tracking-[-0.01em] sm:inline',
              dark ? 'text-white' : 'text-[var(--ed-ink)]',
            )}
          >
            Academy
          </span>
        </Link>

        <nav className="ml-auto flex items-center gap-1 text-[14.5px]">
          <Link
            href="/academy#courses"
            className={cn(
              'hidden rounded-full px-3.5 py-2 transition-colors sm:block',
              dark ? 'text-white/70 hover:text-white' : 'text-[var(--ed-ink-soft)] hover:text-[var(--ed-ink)]',
            )}
          >
            Courses
          </Link>
          {signedIn ? (
            <Link
              href="/my/learning"
              className={cn(
                'rounded-full px-4 py-2 font-medium transition-transform duration-300 hover:scale-[1.03]',
                dark ? 'bg-white text-[var(--ed-black)]' : 'bg-[var(--ed-ink)] text-white',
              )}
            >
              {firstName ? `${firstName}’s learning` : 'My learning'}
            </Link>
          ) : (
            <>
              <Link
                href="/login?next=/my/learning"
                className={cn(
                  'rounded-full px-3.5 py-2 transition-colors',
                  dark ? 'text-white/70 hover:text-white' : 'text-[var(--ed-ink-soft)] hover:text-[var(--ed-ink)]',
                )}
              >
                Sign in
              </Link>
              <Link
                href="/academy/join"
                className={cn(
                  'rounded-full px-4 py-2 font-medium transition-transform duration-300 hover:scale-[1.03]',
                  dark ? 'bg-white text-[var(--ed-black)]' : 'bg-[var(--ed-ink)] text-white',
                )}
              >
                Join free
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
