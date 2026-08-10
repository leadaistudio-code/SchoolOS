import * as React from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Container, Section } from './container'
import { cn } from '@/lib/utils'

/**
 * Interior page opening.
 *
 * Quieter than the homepage hero on purpose: a visitor arriving here has
 * already decided to read, so the page starts with the sentence rather than
 * with a picture.
 */
export function PageIntro({
  eyebrow,
  title,
  lead,
  children,
}: {
  eyebrow: string
  title: string
  lead: string
  children?: React.ReactNode
}) {
  return (
    <div className="border-b border-[var(--rule)] bg-[var(--paper)] pb-14 pt-16 sm:pb-20 sm:pt-24">
      <Container>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="display mt-3 max-w-3xl text-[clamp(2.25rem,5vw,3.6rem)]">{title}</h1>
        <p className="muted mt-5 max-w-2xl text-[19px] leading-[1.55]">{lead}</p>
        {children ? <div className="mt-8">{children}</div> : null}
      </Container>
    </div>
  )
}

/** A run of prose with a heading. The site's default way of saying something. */
export function Prose({
  title,
  children,
  aside,
}: {
  title: string
  children: React.ReactNode
  aside?: React.ReactNode
}) {
  return (
    <div className="grid gap-8 border-t border-[var(--rule)] py-12 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] md:gap-16">
      <h2 className="text-[24px] font-semibold leading-tight text-[var(--text)]">{title}</h2>
      <div className="max-w-[var(--measure)] space-y-4 text-[17px] leading-[1.65] text-[var(--text-muted)]">
        {children}
        {aside}
      </div>
    </div>
  )
}

/** A labelled list of capabilities. Text, not tiles. */
export function CapabilityList({
  groups,
}: {
  groups: { heading: string; items: string[] }[]
}) {
  return (
    <div className="grid gap-x-12 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
      {groups.map((group) => (
        <div key={group.heading} className="border-t border-[var(--rule-strong)] pt-5">
          <h3 className="text-[17px] font-semibold text-[var(--text)]">{group.heading}</h3>
          <ul className="mt-4 space-y-2">
            {group.items.map((item) => (
              <li key={item} className="text-[15px] text-[var(--text-muted)]">
                {item}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

/** Cards, used only where the content really is a set of discrete objects. */
export function LinkCard({
  href,
  title,
  body,
  meta,
}: {
  href: string
  title: string
  body: string
  meta?: string
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-xl border border-[var(--rule)] bg-white p-6 transition-colors hover:border-[var(--rule-strong)]"
    >
      {meta ? <p className="eyebrow">{meta}</p> : null}
      <h3 className="mt-2 text-[20px] font-semibold text-[var(--text)]">{title}</h3>
      <p className="muted mt-2 flex-1 text-[15px] leading-[1.6]">{body}</p>
      <span className="mt-5 inline-flex items-center gap-1.5 text-[15px] font-medium text-[var(--indigo)]">
        Read more
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </span>
    </Link>
  )
}

/** A statement pulled out of the flow. Used sparingly — twice per page at most. */
export function Pullquote({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        'display max-w-3xl text-[clamp(1.5rem,3vw,2.1rem)] leading-[1.25] text-[var(--text)]',
        className,
      )}
    >
      {children}
    </p>
  )
}

/** Wraps prose sections so every interior page has the same rhythm. */
export function ProseSection({ children }: { children: React.ReactNode }) {
  return (
    <Section>
      <Container>{children}</Container>
    </Section>
  )
}
