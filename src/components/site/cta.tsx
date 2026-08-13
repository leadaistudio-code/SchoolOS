import * as React from 'react'
import { Container, Section } from './container'
import { ConnectionGrid } from './connection-grid'
import { Button } from './ui'

/**
 * The closing ask.
 *
 * Not a gradient rectangle with a button in the middle. The right-hand column
 * answers the two questions that stop a director from booking — how long is
 * this, and what will you want from me — because those cost more conversions
 * than the wording of the headline does.
 *
 * Set on navy so it reads as the end of the page rather than as one more
 * section; the footer continues the same ground beneath it.
 */
export function ClosingCta({
  eyebrow = 'Next step',
  title = 'Ready to run your school on one platform?',
  body = 'Tell us how your school runs today — what is on paper, what is in spreadsheets, what your current software does badly. The demonstration follows that rather than a script, and we will be straightforward about the modules that are not built yet.',
}: {
  eyebrow?: string
  title?: string
  body?: string
}) {
  return (
    <Section tone="navy" className="relative overflow-hidden">
      <ConnectionGrid variant="dark" />
      <Container wide className="relative">
        <div
          className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,21rem)] lg:gap-20"
          data-reveal
        >
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h2 className="display mt-3 max-w-2xl text-[clamp(2rem,4.2vw,3rem)]">{title}</h2>
            <p className="muted mt-6 max-w-xl text-[18px] leading-[1.6]">{body}</p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Button href="/book-demo" tone="onDark" size="lg">
                Book a demo
              </Button>
              <Button href="/contact" tone="onDarkGhost" size="lg">
                Talk to our team
              </Button>
            </div>
          </div>

          <div className="border-t border-[var(--navy-line)] pt-6 lg:border-l lg:border-t-0 lg:pl-12 lg:pt-0">
            <h3 className="text-[16px] font-semibold text-white">What a demonstration involves</h3>
            <ul className="mt-4 space-y-3">
              {[
                'Thirty to forty minutes, on a call, with your screen or ours',
                'Roughly how many students and staff you have',
                'What you use today for fees and attendance',
                'Whether you run one campus or several',
              ].map((item) => (
                <li key={item} className="muted text-[15px] leading-[1.55]">
                  {item}
                </li>
              ))}
            </ul>
            <p className="subtle mt-6 text-[14px] leading-[1.6]">
              No obligation, and no pricing pressure on the first call. If MyCampusView is the wrong fit
              for your school we would rather say so then.
            </p>
          </div>
        </div>
      </Container>
    </Section>
  )
}
