import { prisma } from '@/server/db/prisma'
import { requireAcademyHost } from '@/server/modules/lms/academy'

export const metadata = { title: 'Terms and refunds' }

export default async function AcademyTermsPage() {
  const tenant = await requireAcademyHost()
  const school = await prisma.school.findUnique({ where: { tenantId: tenant.id }, select: { name: true, email: true, phone: true } })
  const name = school?.name ?? tenant.name
  const contact = [school?.email, school?.phone].filter(Boolean).join(' · ')

  const sections = [
    {
      title: 'Your account',
      body: 'Accounts are personal. Learners under 18 should join with a parent or guardian, who accepts these terms on their behalf. Keep your password private; you are responsible for activity on your account.',
    },
    {
      title: 'Buying a course',
      body: `Prices are in Indian rupees and include applicable taxes. Payments are processed by Razorpay; ${name} never sees or stores your card or bank details. A paid course stays in your account for as long as the course is offered, including live classes scheduled for it.`,
    },
    {
      title: 'Refunds',
      body: 'If a course is not right for you, write to us within 7 days of buying it, before you have finished a quarter of its lessons, and we will refund the full amount to the original payment method. Refunds usually reach you within 5 to 7 working days. If a payment was taken but the course did not open, it is refunded in full whatever the timing.',
    },
    {
      title: 'Certificates',
      body: 'Certificates are issued when every lesson of a course is complete and can be checked online by anyone with the code. A certificate obtained by misuse can be withdrawn.',
    },
    { title: 'Contact', body: contact ? `${name}: ${contact}` : name },
  ]

  return (
    <section className="bg-white px-[var(--gutter)] py-14 sm:py-20">
      <div className="mx-auto max-w-[60rem]">
        <h1 className="ed-display reveal text-[clamp(2.4rem,5vw,4rem)]">
          Terms and <span className="ed-soft">refunds.</span>
        </h1>
        <div className="mt-14 border-b border-[var(--rule)]">
          {sections.map((s) => (
            <div key={s.title} className="grid gap-3 border-t border-[var(--rule)] py-8 md:grid-cols-[14rem_minmax(0,1fr)] md:gap-10">
              <h2 className="text-[17px] font-semibold">{s.title}</h2>
              <p className="max-w-[64ch] text-[16px] leading-[1.7] text-[var(--text-muted)]">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
