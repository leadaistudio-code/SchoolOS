'use client'

import { useEffect } from 'react'

/**
 * Scroll reveals.
 *
 * The site already had a `.reveal` class, but it ran its animation on page
 * load, which means everything below the fold had finished animating before it
 * was ever seen. Scrolling the page therefore felt like reading a printout.
 * This observes `[data-reveal]` elements and marks them as they arrive.
 *
 * Mounted once in the site layout rather than wrapping each section in a
 * client component: the sections stay server-rendered and ship no JavaScript,
 * and the whole behaviour costs one observer for the document.
 *
 * The hidden state is gated behind `.js-reveal`, set here on mount. Without
 * that gate a reader with JavaScript disabled — or anyone served the HTML
 * before hydration — would get a page of invisible sections, which is a far
 * worse failure than no animation. The CSS therefore does nothing until this
 * component is alive to undo it.
 */
export function Reveal() {
  useEffect(() => {
    const root = document.documentElement

    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const targets = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'))
    if (!targets.length) return

    // No observer, or motion is unwelcome: show everything and stop.
    if (reduced || typeof IntersectionObserver === 'undefined') {
      for (const el of targets) el.classList.add('is-revealed')
      return
    }

    root.classList.add('js-reveal')

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.classList.add('is-revealed')
          // Reveals are one-way. A section that fades out again on the way
          // back up turns a scroll into a light show.
          observer.unobserve(entry.target)
        }
      },
      // Fires a little before the element is fully on screen, so the movement
      // has finished by the time it is being read rather than starting then.
      { rootMargin: '0px 0px -12% 0px', threshold: 0.05 },
    )

    for (const el of targets) observer.observe(el)

    return () => {
      observer.disconnect()
      root.classList.remove('js-reveal')
    }
  }, [])

  return null
}
