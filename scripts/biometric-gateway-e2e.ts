/**
 * End-to-end Device Gateway proof without Windows Connect / physical RS9W.
 *
 * Flow:
 *  pairing → connector secret → register simulator device → ingest punches
 *  → unmapped → map to student → reprocess → StudentAttendance BIOMETRIC
 *  → duplicate batch → no new rows
 *
 * Usage (local DB with a tenant that has at least one enrolled student):
 *   npx tsx scripts/biometric-gateway-e2e.ts [--tenant=apni-pathshala]
 */
import { PrismaClient } from '@prisma/client'
import { createPairingCode, pairConnector } from '../src/server/modules/device-gateway/pairing'
import { upsertDeviceFromConnector } from '../src/server/modules/device-gateway/devices'
import { ingestEventBatch } from '../src/server/modules/device-gateway/events'
import { upsertMapping } from '../src/server/modules/device-gateway/mappings'
import { connectorForToken } from '../src/server/modules/device-gateway/auth'
import { tenantDb } from '../src/server/db/tenant-client'
import type { AppContext } from '../src/server/context'

const prisma = new PrismaClient()
const slug = process.argv.find((a) => a.startsWith('--tenant='))?.slice(9) ?? 'apni-pathshala'

function fakeCtx(tenantId: string, userId: string): AppContext {
  const db = tenantDb(tenantId)
  return {
    tenant: { id: tenantId, name: 'E2E', slug, timezone: 'Asia/Kolkata' } as AppContext['tenant'],
    user: {
      userId,
      firstName: 'E2E',
      lastName: 'Bot',
      email: 'e2e@mycampusview.local',
      permissions: new Set([
        'biometric.view',
        'biometric.manage',
        'biometric.mapping',
        'biometric.logs',
      ]),
    } as AppContext['user'],
    db,
    can: () => true,
    require: () => undefined,
  } as unknown as AppContext
}

async function main() {
  const tenant = await prisma.tenant.findFirst({ where: { slug } })
  if (!tenant) throw new Error(`Tenant ${slug} not found`)

  const admin = await prisma.user.findFirst({
    where: { tenantId: tenant.id, deletedAt: null },
    select: { id: true },
  })
  if (!admin) throw new Error('No user in tenant')

  const student = await prisma.enrollment.findFirst({
    where: { tenantId: tenant.id, isCurrent: true, student: { deletedAt: null } },
    select: { studentId: true, student: { select: { admissionNo: true, firstName: true } } },
  })
  if (!student) throw new Error('No enrolled student')

  const ctx = fakeCtx(tenant.id, admin.id)
  console.log('Tenant', tenant.slug, 'student', student.student.firstName, student.student.admissionNo)

  const pairing = await createPairingCode(ctx, { connectorName: 'E2E Simulator Connector' })
  console.log('Pairing code', pairing.codeDisplay)

  const paired = await pairConnector({
    code: pairing.codeDisplay,
    hostname: 'E2E-HOST',
    osInfo: 'script',
    connectorVersion: '0.0.0-e2e',
  })
  console.log('Paired connector', paired.connectorKey)

  const auth = await connectorForToken(paired.connectorSecret)
  if (!auth) throw new Error('connectorForToken failed')

  const device = await upsertDeviceFromConnector(auth, {
    localDeviceId: 'sim-main-gate',
    name: 'Main Gate Simulator',
    brand: 'Simulator',
    model: 'RS9W',
    locationLabel: 'Main Gate',
    purpose: 'STUDENT',
    status: 'ONLINE',
    serialNumber: 'SIM-001',
  })
  console.log('Device', device.id)

  const externalUserId = '1028'
  const morning = new Date()
  morning.setHours(8, 12, 31, 0)

  const batch1 = await ingestEventBatch(auth, {
    events: [
      {
        localDeviceId: 'sim-main-gate',
        externalUserId,
        deviceLocalAt: morning.toISOString(),
        verificationMethod: 'FINGERPRINT',
        direction: 'IN',
        deviceEventId: 'sim-1',
      },
      {
        localDeviceId: 'sim-main-gate',
        externalUserId,
        deviceLocalAt: new Date(morning.getTime() + 4000).toISOString(),
        verificationMethod: 'FINGERPRINT',
        direction: 'IN',
        deviceEventId: 'sim-2',
      },
      {
        localDeviceId: 'sim-main-gate',
        externalUserId: '9999',
        deviceLocalAt: new Date(morning.getTime() + 60000).toISOString(),
        verificationMethod: 'FINGERPRINT',
        direction: 'IN',
        deviceEventId: 'sim-unmapped',
      },
    ],
  })
  console.log('Batch1', batch1)

  const map = await upsertMapping(ctx, {
    externalUserId,
    subjectType: 'STUDENT',
    studentId: student.studentId,
    displayName: student.student.firstName,
  })
  console.log('Mapped + reprocessed', map.reprocessed)

  const attendance = await prisma.studentAttendance.findFirst({
    where: { tenantId: tenant.id, studentId: student.studentId },
    orderBy: { onDate: 'desc' },
  })
  console.log('Attendance', {
    status: attendance?.status,
    source: attendance?.source,
    firstPunchAt: attendance?.firstPunchAt,
    lastPunchAt: attendance?.lastPunchAt,
  })

  const batch2 = await ingestEventBatch(auth, {
    events: [
      {
        localDeviceId: 'sim-main-gate',
        externalUserId,
        deviceLocalAt: morning.toISOString(),
        verificationMethod: 'FINGERPRINT',
        direction: 'IN',
        deviceEventId: 'sim-1',
      },
    ],
  })
  console.log('Duplicate batch', batch2)

  const rawCount = await prisma.deviceRawEvent.count({
    where: { tenantId: tenant.id, deviceEventId: 'sim-1' },
  })
  console.log('Raw rows for sim-1 (expect 1):', rawCount)

  if (attendance?.source !== 'BIOMETRIC') {
    throw new Error('Expected BIOMETRIC attendance source')
  }
  if (rawCount !== 1) throw new Error('Dedupe failed')
  if (batch2.duplicate < 1) throw new Error('Expected duplicate outcome')

  console.log('\nE2E OK')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
