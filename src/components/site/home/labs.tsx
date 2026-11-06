import * as React from 'react'
import { Container, Section } from '../container'
import { SectionHeader, TextLink } from '../ui'
import { SitePhoto, type SiteImage } from '../page-parts'

/**
 * The labs add-on: one section, three pictures, each tied to a thing the
 * software does rather than to a mood.
 */

const CARDS: { title: string; body: string; image: SiteImage }[] = [
  {
    title: 'Composite science lab',
    body: 'The CBSE item list loaded with the quantity required for a batch of forty — glassware, chemicals, specimens and slides — with the shortfall worked out for you.',
    image: { src: '/images/site/r-lab-register.jpg', alt: 'Illustration of a shelf of glassware and reagent bottles beside an open register' },
  },
  {
    title: 'Robotics & AI lab',
    body: 'An Atal Tinkering Lab kit list for Classes 6 to 12 — boards, robot kits, sensors, 3D printer — and thirty practicals from a blinking LED to image classification.',
    image: { src: '/images/site/r-lab-robotics.jpg', alt: 'Illustration of a circuit board, a small robot and a robotic arm' },
  },
  {
    title: 'Ready for the inspector',
    body: 'A readiness score out of a hundred, inspections with photographs, an incident register that alerts the principal, and every register printable on letterhead.',
    image: { src: '/images/site/r-lab-readiness.jpg', alt: 'Illustration of a score gauge beside a ticked lab checklist' },
  },
]

export function Labs() {
  return (
    <Section tone="page">
      <Container wide>
        <SectionHeader
          split
          eyebrow="Science and Robotics & AI labs"
          title="Your labs, inspection-ready and on record."
          lead="Labs are where a school is most often caught short on the day of an inspection — an item missing from the list, a register not kept, an extinguisher past its refill date. The labs add-on keeps the stock, the practicals and the safety record in one place and tells you where you fall short."
          action={<TextLink href="/cbse-science-lab">Read about labs</TextLink>}
        />

        <div className="mt-14 grid gap-8 md:grid-cols-3" data-reveal>
          {CARDS.map((card) => (
            <article key={card.title}>
              <SitePhoto image={card.image} sizes="(min-width: 768px) 33vw, 100vw" />
              <h3 className="mt-5 text-[17px] font-semibold text-[var(--text)]">{card.title}</h3>
              <p className="muted mt-2 text-[15px] leading-[1.6]">{card.body}</p>
            </article>
          ))}
        </div>
      </Container>
    </Section>
  )
}
