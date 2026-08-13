import type { Metadata } from 'next'
import { PageIntro, Prose, ProseSection } from '@/components/site/page-parts'
import { ClosingCta } from '@/components/site/cta'

export const metadata: Metadata = {
  title: 'Security and data separation',
  description:
    'How MyCampusView separates one school from another, controls what each role can reach, and records who did what.',
  alternates: { canonical: '/security' },
}

export default function SecurityPage() {
  return (
    <>
      <PageIntro
        eyebrow="Security"
        title="How your school's data is kept separate."
        lead="Written for the person at your school who has to ask the awkward questions. Everything here describes how the software is built; where we hold no certification, we say so."
      />

      <ProseSection>
        <Prose title="One school cannot reach another">
          <p>
            Every school is a separate tenant. Each query carries the school it belongs to, applied
            in the database layer rather than remembered by individual screens, so a request that
            guesses another school&rsquo;s record identifier returns nothing rather than data.
          </p>
          <p>
            This is covered by automated tests that fail the build if a query could cross the
            boundary — including by listing, counting, aggregating, or supplying a different
            school&rsquo;s identifier deliberately.
          </p>
        </Prose>

        <Prose title="Inside a school, access follows the role">
          <p>
            Twelve roles are defined, each a set of specific permissions rather than a rank.
            Beyond that, some roles are restricted by row: a parent reaches their own children, a
            teacher their own classes. Holding the permission to view students does not mean
            viewing all of them.
          </p>
        </Prose>

        <Prose title="A record of who did what">
          <p>
            Fee collection, refunds, result publication, permission changes and student record
            edits are written to an audit trail with the person, the time and the change. Sensitive
            values are redacted before they are stored.
          </p>
        </Prose>

        <Prose title="Accounts and sessions">
          <p>
            Passwords are hashed with bcrypt. Sessions are cookie-based, marked secure in
            production, and bound to the school they were issued for — a valid session from one
            school is worthless on another. Repeated failed sign-ins lock an account.
          </p>
          <p>
            Credentials a school gives us for its own mail server are encrypted at rest and are
            never returned to a browser.
          </p>
        </Prose>

        <Prose title="What we do not claim">
          <p>
            MyCampusView holds no ISO, SOC 2 or similar certification, and we will not imply otherwise.
            Postgres row-level security ships with the product as an optional hardening layer and
            is not enabled by default. If your IT team wants to review any of this in detail, we
            will walk them through it.
          </p>
        </Prose>
      </ProseSection>

      <ClosingCta
        eyebrow="Questions"
        title="Bring your IT lead to the demonstration."
        body="They will get straight answers about architecture, hosting, backups and data ownership, including where the answer is that something is not built yet."
      />
    </>
  )
}
