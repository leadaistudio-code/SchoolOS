import type { Metadata } from 'next'
import { Container } from '@/components/site/container'
import { DemoForm } from '@/components/site/demo-form'
import { MyCampusViewLogo } from '@/components/brand/logo'
import { breadcrumbJsonLd } from '@/components/site/seo'
import { MODULE_COUNTS } from '@/content/site/modules'
import { CONTACT } from '@/content/site/company'

export const metadata: Metadata = {
  title: 'Book a demo of MyCampusView',
  description:
    'See MyCampusView with your own workflows. Tell us how your school runs today — admissions, fees, attendance, communication — and we will shape the demonstration around it.',
  alternates: { canonical: '/book-demo' },
  robots: { index: true, follow: true },
}

/**
 * The conversion page.
 *
 * Two columns: the argument on the left, the form on the right, and nothing
 * else — no navigation-heavy sections underneath to wander off into, and no
 * closing CTA, because the CTA is the page.
 *
 * The left column answers the four things that stop a director from filling in
 * a form: how long it takes, who needs to be there, what happens afterwards,
 * and whether they are about to be pursued by a sales team. The submission
 * logic in `DemoForm` and its API route are untouched.
 */
export default function BookDemoPage() {
  return (
    <>
      {breadcrumbJsonLd([{ name: 'Book a demo', path: '/book-demo' }])}

      <div className="border-b border-[var(--rule)] bg-[var(--page)] pb-20 pt-14 sm:pt-20">
        <Container wide>
          <div className="grid gap-12 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-20">
            <div className="lg:sticky lg:top-28 lg:self-start">
              <p className="eyebrow">Book a demo</p>
              <h1 className="display mt-3 text-[clamp(2.1rem,4.4vw,3rem)]">
                See it running your school&rsquo;s workflows.
              </h1>
              <p className="muted mt-5 text-[18px] leading-[1.6]">
                No slide deck. Tell us what your office does on a Monday — what is on paper, what is
                in spreadsheets, what your current software does badly — and we will show you those
                screens with data shaped like yours.
              </p>

              <dl className="mt-10 space-y-6">
                {[
                  [
                    'How long it takes',
                    'Thirty to forty minutes, including your questions. One call is usually enough to know whether this is worth a second.',
                  ],
                  [
                    'Who should be there',
                    'Whoever runs admissions, fees or the front office. They will spot in ten minutes what a director cannot.',
                  ],
                  [
                    'What happens after',
                    'A written summary of what we showed you, and a straight note on anything MyCampusView does not do yet.',
                  ],
                  [
                    'What we will not do',
                    'Add you to a mailing list, chase you weekly, or claim a module exists when it does not.',
                  ],
                ].map(([term, detail]) => (
                  <div key={term} className="border-t border-[var(--rule-strong)] pt-4">
                    <dt className="text-[15px] font-semibold text-[var(--text)]">{term}</dt>
                    <dd className="muted mt-1.5 text-[15px] leading-[1.6]">{detail}</dd>
                  </div>
                ))}
              </dl>

              {/* Trust, stated as facts rather than as badges. */}
              <div className="mt-10 rounded-xl border border-[var(--rule)] bg-white p-5">
                <MyCampusViewLogo size="md" />
                <ul className="mt-4 space-y-2 text-[14px] leading-[1.55] text-[var(--text-muted)]">
                  <li>
                    {MODULE_COUNTS.available} modules available today, with the rest labelled on the
                    site
                  </li>
                  <li>One database — no nightly sync between an SIS and an ERP</li>
                  <li>Your own domain, your own branding, your own messaging accounts</li>
                  <li>Separation between schools enforced in the data layer and covered by tests</li>
                </ul>
                <p className="subtle mt-4 text-[13px]">
                  Prefer to write first? {CONTACT.sales}
                </p>
              </div>
            </div>

            <DemoForm />
          </div>
        </Container>
      </div>
    </>
  )
}
