import { prisma } from '@/server/db/prisma'
import { requireAcademyHost } from '@/server/modules/lms/academy'
import { Card, CardContent } from '@/components/ui/card'

export const metadata = { title: 'Terms and refunds' }

export default async function AcademyTermsPage() {
  const tenant = await requireAcademyHost()
  const school = await prisma.school.findUnique({ where: { tenantId: tenant.id }, select: { name: true, email: true, phone: true } })
  const name = school?.name ?? tenant.name
  const contact = [school?.email, school?.phone].filter(Boolean).join(' · ')

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-4">
      <h1 className="text-2xl font-semibold text-ink">Terms and refund policy</h1>
      <Card>
        <CardContent className="space-y-4 text-sm text-ink leading-relaxed">
          <section>
            <h2 className="font-semibold">Your account</h2>
            <p>
              Accounts are personal. Learners under 18 should join with a parent or guardian, who accepts these terms on
              their behalf. Keep your password private; you are responsible for activity on your account.
            </p>
          </section>
          <section>
            <h2 className="font-semibold">Buying a course</h2>
            <p>
              Prices are in Indian rupees and include applicable taxes. Payments are processed by Razorpay; {name} never
              sees or stores your card or bank details. A paid course stays in your account for as long as the course is
              offered, including live classes scheduled for it.
            </p>
          </section>
          <section>
            <h2 className="font-semibold">Refunds</h2>
            <p>
              If a course is not right for you, write to us within 7 days of buying it, before you have finished a quarter
              of its lessons, and we will refund the full amount to the original payment method. Refunds usually reach you
              within 5 to 7 working days. If a payment was taken but the course did not open, it is refunded in full
              whatever the timing.
            </p>
          </section>
          <section>
            <h2 className="font-semibold">Certificates</h2>
            <p>
              Certificates are issued when every lesson of a course is complete and can be checked online by anyone with
              the code. A certificate obtained by misuse can be withdrawn.
            </p>
          </section>
          <section>
            <h2 className="font-semibold">Contact</h2>
            <p>{contact ? `${name}: ${contact}` : name}</p>
          </section>
        </CardContent>
      </Card>
    </div>
  )
}
