import type { Metadata } from 'next'
import { Hero } from '@/components/site/home/hero'
import { StudentThread } from '@/components/site/home/student-thread'
import { Operations } from '@/components/site/home/operations'
import { Transport } from '@/components/site/home/transport'
import { Parents } from '@/components/site/home/parents'
import { Modules } from '@/components/site/home/modules'
import { ClosingCta, TrustNote } from '@/components/site/cta'

export const metadata: Metadata = {
  title: 'SchoolOS — one system to run your school',
  description:
    'Student records, attendance, fees, examinations, communication and transport on one database. Built for private schools, international schools, preschools and multi-campus groups.',
  alternates: { canonical: '/' },
}

/**
 * The homepage.
 *
 * Seven sections, each with a different job and a different composition. The
 * order is an argument rather than a catalogue: here is the product, here is
 * why one database matters, here is a morning in the office, here is the part
 * nobody else has, here is what parents get, here is everything in it, and
 * here is what happens next.
 */
export default function HomePage() {
  return (
    <>
      <Hero />
      <StudentThread />
      <Operations />
      <Transport />
      <Parents />
      <Modules />
      <TrustNote />
      <ClosingCta />
    </>
  )
}
