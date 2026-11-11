import * as React from 'react'

/** Palette and drawing helpers shared by every Academy diagram (640 × 360 SVG). */

export const INK = '#0b0b0d'
export const PAPER = '#f4f3ef'
export const AMBER = '#f0a63c'
export const BLUE = '#dbe7f6'
export const BLUE_INK = '#2f5fb3'
export const GREEN = '#2e9e6a'
export const RED = '#d0473f'
export const MUTED = '#5b5f68'
export const MINT = '#cfe8da'

export type Part = { step: number }
export const show = (step: number, at: number) => ({ opacity: step >= at ? 1 : 0, transition: 'opacity 300ms' })

export function Label({
  x,
  y,
  children,
  size = 15,
  weight = 600,
  fill = INK,
  anchor = 'middle' as 'start' | 'middle' | 'end',
}: {
  x: number
  y: number
  children: React.ReactNode
  size?: number
  weight?: number
  fill?: string
  anchor?: 'start' | 'middle' | 'end'
}) {
  return (
    <text x={x} y={y} fontSize={size} fontWeight={weight} fill={fill} textAnchor={anchor} fontFamily="Manrope, Inter, system-ui, sans-serif">
      {children}
    </text>
  )
}

export function Arrow({ d, color = INK, width = 2.5, dashed }: { d: string; color?: string; width?: number; dashed?: boolean }) {
  const id = `ah-${color.replace('#', '')}`
  return (
    <>
      <defs>
        <marker id={id} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={color} />
        </marker>
      </defs>
      <path d={d} fill="none" stroke={color} strokeWidth={width} markerEnd={`url(#${id})`} strokeDasharray={dashed ? '6 6' : undefined} strokeLinecap="round" />
    </>
  )
}
