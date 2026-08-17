'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * The floating pill.
 *
 * The reference puts navigation at the bottom of the viewport as a compact
 * dark capsule, which works because it is a single narrative page: the labels
 * are places within the story, not a site map. That is exactly what the
 * homepage is here, so the pill carries the section marks and the header keeps
 * the routes — the pill never becomes a second, competing sitemap.
 *
 * The moving indicator is a single element that measures and translates to the
 * active label, so the highlight slides between sections rather than each
 * label animating its own background.
 */
export type NavMark = { id: string; label: string }

export function FloatingNav({ marks }: { marks: NavMark[] }) {
  const [active, setActive] = React.useState(marks[0]?.id ?? '')
  const [visible, setVisible] = React.useState(false)
  const listRef = React.useRef<HTMLDivElement>(null)
  const [pill, setPill] = React.useState<{ left: number; width: number } | null>(null)

  // Which section owns the middle of the viewport.
  React.useEffect(() => {
    const sections = marks
      .map((mark) => document.getElementById(mark.id))
      .filter((node): node is HTMLElement => !!node)
    if (!sections.length) return

    const observer = new IntersectionObserver(
      (entries) => {
        const hit = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (hit) setActive(hit.target.id)
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: [0, 0.25, 0.5, 1] },
    )

    for (const section of sections) observer.observe(section)
    return () => observer.disconnect()
  }, [marks])

  // The pill earns its place only once the hero is behind you.
  React.useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > window.innerHeight * 0.55)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Measure the active label so the indicator can slide to it.
  React.useEffect(() => {
    const list = listRef.current
    if (!list) return

    const measure = () => {
      const node = list.querySelector<HTMLElement>(`[data-mark="${active}"]`)
      if (!node) return
      setPill({ left: node.offsetLeft, width: node.offsetWidth })
    }

    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [active])

  const go = (event: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    const target = document.getElementById(id)
    if (!target) return
    event.preventDefault()
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    // Move focus for keyboard and screen-reader users, which a scroll alone
    // does not do.
    target.setAttribute('tabindex', '-1')
    target.focus({ preventScroll: true })
  }

  return (
    <div
      className={cn(
        'pointer-events-none fixed inset-x-0 bottom-5 z-50 flex justify-center px-4 transition-[opacity,transform] duration-500',
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-6 opacity-0',
      )}
    >
      <nav
        aria-label="Sections"
        className={cn(
          'pointer-events-auto relative max-w-[calc(100vw-2rem)] overflow-x-auto rounded-full',
          'bg-[var(--ed-black)]/92 backdrop-blur-xl',
          'shadow-[0_8px_30px_-8px_rgba(0,0,0,0.5)]',
          visible ? '' : 'pointer-events-none',
        )}
      >
        <div ref={listRef} className="relative flex items-center gap-0.5 p-1.5">
          {pill ? (
            <span
              aria-hidden
              className="absolute top-1.5 bottom-1.5 rounded-full bg-white/10 transition-[transform,width] duration-[450ms]"
              style={{
                transform: `translateX(${pill.left - 6}px)`,
                width: pill.width,
                transitionTimingFunction: 'var(--ed-ease)',
              }}
            />
          ) : null}

          {marks.map((mark) => (
            <a
              key={mark.id}
              href={`#${mark.id}`}
              data-mark={mark.id}
              onClick={(event) => go(event, mark.id)}
              aria-current={active === mark.id ? 'true' : undefined}
              className={cn(
                'relative whitespace-nowrap rounded-full px-3.5 py-2 text-[13.5px] font-medium transition-colors duration-300 sm:px-4',
                active === mark.id
                  ? 'text-white'
                  : 'text-white/55 hover:text-white/85',
              )}
            >
              {mark.label}
            </a>
          ))}
        </div>
      </nav>
    </div>
  )
}
