'use client'

import { useEffect, useRef } from 'react'

/**
 * Printable A4 area is 198 × 285 mm with the 6 mm @page margins. Keep in step
 * with the `.rc-sheet` height in the report card's print CSS.
 */
const PRINT_WIDTH = '198mm'
const PRINT_HEIGHT_MM = 280
const MM = 96 / 25.4

/**
 * Shrinks its report card just enough to fit one A4 page when printed. The card
 * is measured at the print width and the scale is handed to the print CSS as
 * `--rc-fit`. The print CSS scales with a transform, not `zoom`, because zoom
 * re-wraps text and the measured height would no longer hold.
 */
export function ReportCardFit() {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const card = ref.current?.closest<HTMLElement>('.report-card')
    if (!card) return
    const fit = () => {
      const saved = { width: card.style.width, minWidth: card.style.minWidth, maxWidth: card.style.maxWidth }
      card.style.width = PRINT_WIDTH
      card.style.minWidth = '0'
      card.style.maxWidth = 'none'
      const height = card.offsetHeight
      Object.assign(card.style, saved)
      const scale = height > 0 ? Math.min(1, (PRINT_HEIGHT_MM * MM) / height) : 1
      card.style.setProperty('--rc-fit', String(Math.floor(scale * 1000) / 1000))
    }
    fit()
    const images = [...card.querySelectorAll('img')].filter((img) => !img.complete)
    images.forEach((img) => img.addEventListener('load', fit, { once: true }))
    window.addEventListener('beforeprint', fit)
    window.addEventListener('load', fit)
    return () => {
      images.forEach((img) => img.removeEventListener('load', fit))
      window.removeEventListener('beforeprint', fit)
      window.removeEventListener('load', fit)
    }
  }, [])

  return <span ref={ref} hidden />
}
