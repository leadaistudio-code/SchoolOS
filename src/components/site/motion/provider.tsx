'use client'

import * as React from 'react'
import Lenis from 'lenis'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

/**
 * The one place scrolling is owned.
 *
 * Lenis drives the scroll position and GSAP's ticker drives Lenis, so there is
 * a single rAF loop for the page rather than two libraries each running their
 * own and fighting over the same frame. ScrollTrigger is told to read from
 * Lenis, which is what keeps pinned sections aligned with the smoothed
 * position instead of the native one.
 *
 * Everything here is inert under `prefers-reduced-motion`: no smoothing, no
 * ticker, native scrolling. Scroll-linked reveals elsewhere check the same
 * signal and render their finished state.
 */

let registered = false

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false)

  React.useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReduced(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  return reduced
}

export function SmoothScroll() {
  React.useEffect(() => {
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (!registered) {
      gsap.registerPlugin(ScrollTrigger)
      registered = true
    }

    if (reduced) {
      // Still refresh: sections use ScrollTrigger for arrival state even when
      // nothing is being smoothed or pinned.
      ScrollTrigger.refresh()
      return
    }

    const lenis = new Lenis({
      // Enough inertia to feel composed, not enough to feel like the page is
      // catching up with the reader. Past roughly 0.12 it reads as lag.
      lerp: 0.11,
      wheelMultiplier: 1,
      touchMultiplier: 1.6,
      // Touch devices already have a native inertia model that people know.
      smoothWheel: true,
      autoRaf: false,
    })

    lenis.on('scroll', ScrollTrigger.update)

    const tick = (time: number) => lenis.raf(time * 1000)
    gsap.ticker.add(tick)
    gsap.ticker.lagSmoothing(0)

    // Fonts landing after first paint change every measured offset.
    const refresh = () => ScrollTrigger.refresh()
    if (document.fonts?.ready) void document.fonts.ready.then(refresh)

    /*
     * The safety net.
     *
     * Every reveal starts its element at opacity 0 and relies on a trigger to
     * bring it back. If that trigger never fires — the page was opened at a
     * hash, the reader jumped past it, a pin recalculated and moved the start
     * behind the current position — the content stays invisible permanently.
     * That is a far worse failure than a missing animation, and it is not
     * hypothetical: it left entire sections of this page blank.
     *
     * A full refresh recomputes every start/end and fires anything already
     * behind the scroll position. Run after load, after the hash jump, and
     * once more when everything has settled.
     */
    const settle = () => {
      ScrollTrigger.refresh(true)
      if (window.location.hash) {
        const target = document.querySelector(window.location.hash)
        if (target) {
          target.scrollIntoView()
          ScrollTrigger.refresh(true)
        }
      }
    }
    if (document.readyState === 'complete') settle()
    else window.addEventListener('load', settle, { once: true })
    const settleTimer = setTimeout(settle, 1200)

    let resizeTimer: ReturnType<typeof setTimeout>
    const onResize = () => {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(refresh, 180)
    }
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('load', settle)
      clearTimeout(settleTimer)
      clearTimeout(resizeTimer)
      gsap.ticker.remove(tick)
      lenis.destroy()
      for (const trigger of ScrollTrigger.getAll()) trigger.kill()
    }
  }, [])

  return null
}

/** Registers the plugin for components that build their own triggers. */
export function useGsapReady(): boolean {
  const [ready, setReady] = React.useState(registered)

  React.useEffect(() => {
    if (!registered) {
      gsap.registerPlugin(ScrollTrigger)
      registered = true
    }
    setReady(true)
  }, [])

  return ready
}
