import type { Metadata } from 'next'
import { Container } from '@/components/site/container'
import { DemoForm } from '@/components/site/demo-form'

export const metadata: Metadata = {
  title: 'Book a demo',
  description:
    'See SchoolOS with your own workflows. Tell us how your school runs today and we will shape the demonstration around it.',
  alternates: { canonical: '/book-demo' },
  robots: { index: true, follow: true },
}

export default function BookDemoPage() {
  return (
    <div className="bg-[var(--page)] pb-20 pt-16 sm:pt-20">
      <Container>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-16">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <p className="eyebrow">Book a demo</p>
            <h1 className="display mt-3 text-[clamp(2rem,4.4vw,3rem)]">
              See it with your school&rsquo;s workflows.
            </h1>
            <p className="muted mt-5 text-[18px] leading-[1.55]">
              We will not run a slide deck. Tell us what your office does on a Monday and we will
              show you those screens, with data shaped like yours.
            </p>

            <dl className="mt-9 space-y-6">
              <div>
                <dt className="text-[15px] font-semibold text-[var(--text)]">How long it takes</dt>
                <dd className="muted mt-1 text-[15px]">
                  Thirty to forty minutes, including your questions.
                </dd>
              </div>
              <div>
                <dt className="text-[15px] font-semibold text-[var(--text)]">Who should be there</dt>
                <dd className="muted mt-1 text-[15px]">
                  Whoever runs admissions, fees or the front office. They will spot in ten minutes
                  what a director cannot.
                </dd>
              </div>
              <div>
                <dt className="text-[15px] font-semibold text-[var(--text)]">What happens after</dt>
                <dd className="muted mt-1 text-[15px]">
                  A written summary of what we saw and an honest note on anything SchoolOS does not
                  do yet.
                </dd>
              </div>
            </dl>
          </div>

          <DemoForm />
        </div>
      </Container>
    </div>
  )
}
