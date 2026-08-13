import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * The connection grid.
 *
 * The argument the whole site makes is that one database beats four systems
 * wired together, and this is that argument drawn rather than written: nodes
 * on a lattice, joined by orthogonal runs, with a pulse travelling the paths
 * between them. It is decoration that happens to be on-message, which is the
 * only kind worth adding.
 *
 * Three rules keep it from becoming the mistake we already made once:
 *
 *   - It never goes behind body copy. Every placement is either a band edge or
 *     a panel the text sits clear of, and the opacity ceiling is low enough
 *     that it reads as paper texture rather than as an image.
 *   - It is inert SVG plus CSS keyframes. No canvas, no frame sequence, no
 *     scroll listener, nothing to decode. It costs one element and no network.
 *   - It stops entirely under `prefers-reduced-motion`, leaving the static
 *     lattice, which still carries the idea.
 *
 * `variant` picks the density. `light` is for pale grounds, `dark` for navy.
 */
export function ConnectionGrid({
  className,
  variant = 'light',
  density = 'default',
}: {
  className?: string
  variant?: 'light' | 'dark'
  density?: 'default' | 'sparse'
}) {
  const stroke = variant === 'dark' ? '#ffffff' : 'var(--blue)'
  const cell = density === 'sparse' ? 88 : 64

  // SVG ids are document-global, and `url(#…)` resolves to the first match in
  // the document rather than to the one in this subtree. Two grids that shared
  // an id would therefore share a pattern — a dark grid rendered further down
  // the page would silently pick up the light grid's blue stroke. Scoping the
  // id to the pair that actually determines the pattern keeps each distinct
  // while still letting identical grids share one definition.
  const uid = `cg-${variant}-${cell}`

  return (
    <div
      aria-hidden
      className={cn(
        'connection-grid pointer-events-none absolute inset-0 overflow-hidden',
        variant === 'dark' ? 'connection-grid-dark' : 'connection-grid-light',
        className,
      )}
    >
      <svg className="size-full" aria-hidden focusable="false">
        <defs>
          {/* The lattice itself. A pattern rather than drawn paths, so the
              cost does not scale with the size of the band it fills. */}
          <pattern
            id={`${uid}-cell`}
            width={cell}
            height={cell}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M ${cell} 0 L 0 0 0 ${cell}`}
              fill="none"
              stroke={stroke}
              strokeWidth="1"
            />
          </pattern>

          {/* Fades the lattice out before it reaches the edges, so the band
              has no hard seam against the section above or below it. */}
          <radialGradient id={`${uid}-fade`} cx="50%" cy="50%" r="75%">
            <stop offset="0%" stopColor="#fff" stopOpacity="1" />
            <stop offset="65%" stopColor="#fff" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <mask id={`${uid}-mask`}>
            <rect width="100%" height="100%" fill={`url(#${uid}-fade)`} />
          </mask>
        </defs>

        <g mask={`url(#${uid}-mask)`}>
          <rect width="100%" height="100%" fill={`url(#${uid}-cell)`} />

          {/* The runs. Four paths on their own timings, so the motion never
              resolves into a loop the eye can count. */}
          <g className="cg-runs" fill="none" stroke={stroke} strokeWidth="1.5">
            <path className="cg-run cg-run-1" d="M -40 128 H 300 V 320 H 720" />
            <path className="cg-run cg-run-2" d="M 1480 96 H 1100 V 256 H 820" />
            <path className="cg-run cg-run-3" d="M 160 -40 V 192 H 560 V 440" />
            <path className="cg-run cg-run-4" d="M 1320 440 V 288 H 940 V 64" />
          </g>

          {/* The nodes. Placed on lattice intersections at both densities. */}
          <g className="cg-nodes" fill={stroke}>
            {NODES.map(([x, y], i) => (
              <circle key={`${x}-${y}`} className={`cg-node cg-node-${(i % 4) + 1}`} cx={x} cy={y} r="3" />
            ))}
          </g>
        </g>
      </svg>
    </div>
  )
}

/** Intersections, chosen to sit on the runs above rather than at random. */
const NODES: [number, number][] = [
  [300, 128],
  [300, 320],
  [1100, 96],
  [1100, 256],
  [160, 192],
  [560, 192],
  [560, 440],
  [1320, 288],
  [940, 288],
  [940, 64],
  [720, 320],
  [820, 256],
]
