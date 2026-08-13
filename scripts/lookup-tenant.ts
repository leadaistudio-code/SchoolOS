/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const q = process.argv.slice(2).join(' ').trim() || 'pathshala'

  const tenants = await prisma.tenant.findMany({
    where: {
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { slug: { contains: q, mode: 'insensitive' } },
        { school: { name: { contains: q, mode: 'insensitive' } } },
      ],
    },
    include: {
      school: true,
      domains: { where: { isPrimary: true }, take: 3 },
      subscription: { include: { plan: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  if (tenants.length === 0) {
    console.log('NOT_FOUND')
    const recent = await prisma.tenant.findMany({
      select: { slug: true, name: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 8,
    })
    console.log('RECENT:', JSON.stringify(recent, null, 2))
    return
  }

  for (const t of tenants) {
    const admin = await prisma.user.findFirst({
      where: {
        tenantId: t.id,
        deletedAt: null,
        roles: { some: { role: { key: 'SCHOOL_ADMIN' } } },
      },
      orderBy: { createdAt: 'asc' },
      select: { email: true, firstName: true, lastName: true, status: true, createdAt: true },
    })
    console.log(
      JSON.stringify(
        {
          id: t.id,
          slug: t.slug,
          name: t.name,
          status: t.status,
          createdAt: t.createdAt,
          school: t.school,
          plan: t.subscription?.plan.name,
          domains: t.domains,
          admin,
        },
        null,
        2,
      ),
    )
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
