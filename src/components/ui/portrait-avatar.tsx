import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Illustrated portrait avatars.
 *
 * Most staff records carry no photograph, and a wall of two-letter monograms
 * makes a directory hard to scan — the eye has nothing to latch onto. These
 * fill that gap without pretending to be photographs.
 *
 * Drawn rather than sourced, deliberately. A stock photograph would attach a
 * real stranger's face to a named member of staff, which is both a licensing
 * problem and a dishonest one: nobody should be able to mistake this for a
 * likeness. Being obviously illustrated is the point, and it also means the
 * directory works with no network and no broken-image squares.
 *
 * Every feature is chosen from a hash of the person's own name, so a given
 * member of staff draws the same face on every screen, every reload, and on
 * the server and the client alike — there is no randomness to disagree about.
 */

export type PortraitGender = 'MALE' | 'FEMALE' | 'OTHER' | null | undefined

/**
 * Skin tones.
 *
 * A warm mid-range spread rather than one default. Kept close enough together
 * that no single entry reads as a caricature, and wide enough that a wall of
 * eight portraits does not look like one person repeated.
 */
const SKIN = ['#f3d3b5', '#eabb95', '#e0b088', '#cf9769', '#b87d51', '#9c6640']

const HAIR = ['#1c1a1c', '#26201d', '#332722', '#4a3a2e']
const GREY = '#8b8b93'

const CLOTHES = [
  { body: '#4f46e5', trim: '#3730a3' }, // indigo
  { body: '#0f766e', trim: '#115e59' }, // teal
  { body: '#9f1239', trim: '#7f1d3a' }, // maroon
  { body: '#b45309', trim: '#92400e' }, // mustard
  { body: '#3f6212', trim: '#365314' }, // olive
  { body: '#6d28d9', trim: '#5b21b6' }, // plum
  { body: '#0369a1', trim: '#075985' }, // steel blue
  { body: '#be185d', trim: '#9d174d' }, // rose
]

const BACKDROP = [
  'var(--chart-students)',
  'var(--chart-staff)',
  'var(--chart-parents)',
  'var(--chart-fees)',
  'var(--chart-admissions)',
  'var(--chart-transport)',
]

/** A stable 32-bit hash, so the same name always yields the same face. */
function hash(seed: string): number {
  let value = 2166136261
  for (let i = 0; i < seed.length; i++) {
    value ^= seed.charCodeAt(i)
    value = Math.imul(value, 16777619)
  }
  return value >>> 0
}

/** Pulls an independent choice out of one hash by shifting to a fresh slice of bits. */
function pick<T>(seed: number, shift: number, options: readonly T[]): T {
  return options[(seed >>> shift) % options.length]!
}

function chance(seed: number, shift: number, percent: number): boolean {
  return ((seed >>> shift) % 100) < percent
}

export function PortraitAvatar({
  seed,
  gender,
  className,
}: {
  /** Usually the person's full name. Anything stable will do. */
  seed: string
  gender?: PortraitGender
  className?: string
}) {
  const h = hash(seed)

  const skin = pick(h, 3, SKIN)
  const clothes = pick(h, 7, CLOTHES)
  const backdrop = pick(h, 11, BACKDROP)
  const greying = chance(h, 15, 14)
  const hair = greying ? GREY : pick(h, 17, HAIR)
  const glasses = chance(h, 21, 26)

  const feminine = gender === 'FEMALE'
  const masculine = gender === 'MALE'

  // Where gender is not recorded, the portrait stays neutral: a short crop,
  // no beard, no bindi. Guessing from a name would be worse than saying
  // nothing, and this is the one attribute we should not invent.
  const hairStyle = masculine || feminine ? (h >>> 25) % 3 : 0
  const facialHair = masculine ? (h >>> 27) % 3 : 0
  const bindi = feminine && chance(h, 29, 45)

  return (
    <span
      className={cn('relative inline-block size-10 shrink-0 overflow-hidden rounded-full', className)}
      aria-hidden
    >
      <svg viewBox="0 0 80 80" className="block size-full">
        <rect width="80" height="80" fill={backdrop} opacity="0.16" />

        {/* Hair volume behind the head, so long styles sit under the face */}
        {feminine ? (
          <>
            {hairStyle === 0 ? <circle cx="40" cy="15" r="8" fill={hair} /> : null}
            {hairStyle === 1 ? (
              <path d="M20 34c0-14 9-22 20-22s20 8 20 22v30H20z" fill={hair} />
            ) : null}
            {hairStyle === 2 ? (
              <>
                <path d="M21 34c0-13 8-21 19-21s19 8 19 21v6H21z" fill={hair} />
                {/* Plait over one shoulder */}
                <path d="M55 40c6 6 7 16 6 24h-9c1-8 0-16-4-21z" fill={hair} />
                <g stroke={greying ? '#6f6f77' : '#0f0e10'} strokeWidth="0.9" opacity="0.5">
                  <path d="M52 48h7M52.5 53h7M53 58h6.5M53.5 63h6" fill="none" />
                </g>
              </>
            ) : null}
          </>
        ) : null}

        {/* Neck */}
        <path d="M34 44h12v13a6 6 0 0 1-12 0z" fill={skin} />
        <path d="M34 50c3 3 9 3 12 0v5H34z" fill="#000" opacity="0.08" />

        {/* Shoulders */}
        <path d="M12 80c0-13 12-22 28-22s28 9 28 22z" fill={clothes.body} />

        {/* Clothing detail: a kurta placket, or a dupatta across one shoulder */}
        {feminine ? (
          <>
            <path d="M40 58c7 4 12 12 14 22h14c0-11-8-19-19-22z" fill={clothes.trim} opacity="0.95" />
            <path d="M33 58c2 5 5 8 7 9 2-1 5-4 7-9-4-1-10-1-14 0z" fill={skin} />
          </>
        ) : (
          <>
            <path d="M34 58.5 40 68l6-9.5c-4-1-8-1-12 0z" fill={skin} />
            <path d="M39 66h2v14h-2z" fill={clothes.trim} />
            <circle cx="40" cy="73" r="1" fill="#fff" opacity="0.5" />
          </>
        )}

        {/* Ears */}
        <ellipse cx="25.4" cy="35" rx="2.7" ry="3.7" fill={skin} />
        <ellipse cx="54.6" cy="35" rx="2.7" ry="3.7" fill={skin} />

        {/* Head */}
        <ellipse cx="40" cy="33" rx="15" ry="17.2" fill={skin} />

        {/* Hair front */}
        {feminine ? (
          <path
            d="M23 34c0-13 7.6-20.5 17-20.5S57 21 57 34c0-8.4-5.6-11.6-13.4-11.6-4.6 4.6-11.4 4-15 6.4-1.4 1-2.6 2.8-3.6 5.2z"
            fill={hair}
          />
        ) : hairStyle === 0 ? (
          // Short crop
          <path
            d="M24.6 33c0-12.4 6.6-18 15.4-18s15.4 5.6 15.4 18c0-6.4-5.2-9.6-15.4-9.6S24.6 26.6 24.6 33z"
            fill={hair}
          />
        ) : hairStyle === 1 ? (
          // Side parting with a slight sweep
          <path
            d="M24.6 33c0-12.4 6.6-18 15.4-18s15.4 5.6 15.4 18c0-6-3.4-9.4-9.6-10.2-5 3.2-13 2.4-17 4.6-2.6 1.4-4 3.4-4.2 5.6z"
            fill={hair}
          />
        ) : (
          // Receding: a higher hairline with temple notches
          <path
            d="M26 31.5c.6-10.4 6.4-15.4 14-15.4s13.4 5 14 15.4c-1.6-5-5-7.6-8-7.4-1.4 2.6-2.6 3.8-6 3.8s-4.6-1.2-6-3.8c-3-.2-6.4 2.4-8 7.4z"
            fill={hair}
          />
        )}

        {/* Brows */}
        <g stroke={hair} strokeWidth="1.6" strokeLinecap="round" fill="none" opacity="0.9">
          <path d="M30.6 29.4c1.8-1.2 4-1.2 5.8-.2M43.6 29.2c1.8-1 4-1 5.8.2" />
        </g>

        {/* Eyes */}
        <g fill="#2b2118">
          <ellipse cx="33.6" cy="34.4" rx="1.85" ry="2.05" />
          <ellipse cx="46.4" cy="34.4" rx="1.85" ry="2.05" />
        </g>
        <g fill="#fff" opacity="0.75">
          <circle cx="34.2" cy="33.8" r="0.6" />
          <circle cx="47" cy="33.8" r="0.6" />
        </g>

        {/* Nose and mouth */}
        <path
          d="M40 35.5c1.2 3 1.4 4.4-.9 5"
          stroke="#000"
          strokeOpacity="0.16"
          strokeWidth="1.3"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M36.4 44.4c2.2 2 5 2 7.2 0"
          stroke="#93412f"
          strokeOpacity="0.75"
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
        />

        {/* Moustache, then beard */}
        {facialHair >= 1 ? (
          <path d="M35.6 42.2c1.6-1 2.8-1 4.4-.2 1.6-.8 2.8-.8 4.4.2-1.4 1.4-3 1.8-4.4 1.8s-3-.4-4.4-1.8z" fill={hair} />
        ) : null}
        {facialHair === 2 ? (
          <path
            d="M27.4 36c.4 8 5.6 14.4 12.6 14.4S52.2 44 52.6 36c1 6.6-1.4 12.6-5 15.6-2.4 2-4.8 2.8-7.6 2.8s-5.2-.8-7.6-2.8c-3.6-3-6-9-5-15.6z"
            fill={hair}
            opacity="0.95"
          />
        ) : null}

        {bindi ? <circle cx="40" cy="24.6" r="1.35" fill="#c2185b" /> : null}

        {glasses ? (
          <g stroke="#3b3b45" strokeWidth="1.3" fill="none" opacity="0.9">
            <rect x="28.6" y="30.8" width="10" height="7.4" rx="3.2" />
            <rect x="41.4" y="30.8" width="10" height="7.4" rx="3.2" />
            <path d="M38.6 34.2h2.8M28.6 33.4l-3.4-1M51.4 33.4l3.4-1" />
          </g>
        ) : null}
      </svg>
    </span>
  )
}
