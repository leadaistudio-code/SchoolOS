/* eslint-disable no-console */
import { PrismaClient, type Prisma } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { addDays, subDays, subYears } from 'date-fns'
import { attendanceDate } from '../src/lib/dates'
import { PERMISSIONS } from '../src/lib/rbac/permissions'
import { SYSTEM_ROLES, ROLE } from '../src/lib/rbac/roles'
import { FEATURE } from '../src/server/entitlements'
import { ensureExamDefaults } from '../src/server/modules/exams/defaults'
import {
  ASSET_ITEMS,
  BLOOD_GROUPS,
  BOOK_TITLES,
  CITIES,
  CLASSWORK_SEEDS,
  DEPARTMENTS,
  DESIGNATIONS,
  FIRST_NAMES_F,
  FIRST_NAMES_M,
  HOMEWORK_SEEDS,
  LAST_NAMES,
  NOTICE_SEEDS,
  SUBJECTS,
  chance,
  intBetween,
  makeRandom,
  pick,
  type Random,
} from './seed-data'

const prisma = new PrismaClient()

const DEMO_PASSWORD = 'Password@123'

/** System role ids, resolved once and reused for every user we create. */
const roleIds = { teacher: '', student: '', parent: '' }

/* ------------------------------------------------------------------ plans */

async function seedPermissionsAndRoles() {
  console.log('  permissions and system roles')

  await prisma.$transaction(
    PERMISSIONS.map((p) =>
      prisma.permission.upsert({
        where: { key: p.key },
        create: p,
        update: { module: p.module, action: p.action, label: p.label },
      }),
    ),
  )

  const permissionIds = new Map(
    (await prisma.permission.findMany({ select: { id: true, key: true } })).map((p) => [
      p.key,
      p.id,
    ]),
  )

  for (const def of SYSTEM_ROLES) {
    // A compound unique containing a nullable column cannot be matched with
    // null in Prisma, so system roles are resolved by findFirst.
    const existing = await prisma.role.findFirst({
      where: { tenantId: null, key: def.key },
    })
    const role = existing
      ? await prisma.role.update({
          where: { id: existing.id },
          data: { name: def.name, description: def.description },
        })
      : await prisma.role.create({
          data: {
            tenantId: null,
            key: def.key,
            name: def.name,
            description: def.description,
            isSystem: true,
          },
        })

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } })
    await prisma.rolePermission.createMany({
      data: def.permissions
        .map((key) => permissionIds.get(key))
        .filter((id): id is string => !!id)
        .map((permissionId) => ({ roleId: role.id, permissionId })),
      skipDuplicates: true,
    })
  }

  roleIds.teacher = (await prisma.role.findFirstOrThrow({
    where: { tenantId: null, key: ROLE.TEACHER },
  })).id
  roleIds.student = (await prisma.role.findFirstOrThrow({
    where: { tenantId: null, key: ROLE.STUDENT },
  })).id
  roleIds.parent = (await prisma.role.findFirstOrThrow({
    where: { tenantId: null, key: ROLE.PARENT },
  })).id
}

const PLAN_DEFS = [
  {
    code: 'STARTER',
    name: 'Starter',
    tier: 'STARTER' as const,
    priceMinor: 2499900,
    trialDays: 21,
    sortOrder: 1,
    description: 'For small schools getting their records online.',
    entitlements: {
      [FEATURE.LIMIT_STUDENTS]: 500,
      [FEATURE.LIMIT_STAFF]: 60,
      [FEATURE.LIMIT_ADMIN_USERS]: 5,
      [FEATURE.LIMIT_STORAGE_MB]: 5120,
      [FEATURE.LIMIT_SMS_PER_MONTH]: 2000,
      [FEATURE.LIMIT_DOMAINS]: 1,
    },
    modules: [
      FEATURE.MODULE_LIBRARY,
      FEATURE.MODULE_EVENTS,
      FEATURE.MODULE_CERTIFICATES,
      FEATURE.MODULE_ONLINE_PAYMENTS,
    ],
  },
  {
    code: 'PRO',
    name: 'Pro',
    tier: 'PRO' as const,
    priceMinor: 5999900,
    trialDays: 14,
    sortOrder: 2,
    description: 'Everything a growing school needs, including transport and CRM.',
    entitlements: {
      [FEATURE.LIMIT_STUDENTS]: 2000,
      [FEATURE.LIMIT_STAFF]: 250,
      [FEATURE.LIMIT_ADMIN_USERS]: 20,
      [FEATURE.LIMIT_STORAGE_MB]: 51200,
      [FEATURE.LIMIT_SMS_PER_MONTH]: 20000,
      [FEATURE.LIMIT_WHATSAPP_PER_MONTH]: 10000,
      [FEATURE.LIMIT_DOMAINS]: 2,
    },
    modules: [
      FEATURE.MODULE_LIBRARY,
      FEATURE.MODULE_INVENTORY,
      FEATURE.MODULE_EVENTS,
      FEATURE.MODULE_SPORTS,
      FEATURE.MODULE_TRANSPORT,
      FEATURE.MODULE_ADMISSIONS_CRM,
      FEATURE.MODULE_FRONT_OFFICE,
      FEATURE.MODULE_CERTIFICATES,
      FEATURE.MODULE_ONLINE_PAYMENTS,
      FEATURE.MODULE_WEBSITE,
      FEATURE.MODULE_CUSTOM_DOMAIN,
    ],
  },
  {
    code: 'ENTERPRISE',
    name: 'Enterprise',
    tier: 'ENTERPRISE' as const,
    priceMinor: 14999900,
    trialDays: 14,
    sortOrder: 3,
    description: 'Unlimited scale with custom domains and white-labelled apps.',
    entitlements: {
      [FEATURE.LIMIT_ADMIN_USERS]: 100,
      [FEATURE.LIMIT_STORAGE_MB]: 512000,
      [FEATURE.LIMIT_SMS_PER_MONTH]: 200000,
      [FEATURE.LIMIT_WHATSAPP_PER_MONTH]: 200000,
      [FEATURE.LIMIT_DOMAINS]: 10,
    },
    modules: Object.values(FEATURE).filter((f) => f.startsWith('module.')),
  },
]

async function seedPlans() {
  console.log('  subscription plans and entitlements')
  const plans = new Map<string, string>()

  for (const def of PLAN_DEFS) {
    const plan = await prisma.plan.upsert({
      where: { code: def.code },
      create: {
        code: def.code,
        name: def.name,
        tier: def.tier,
        description: def.description,
        priceMinor: def.priceMinor,
        trialDays: def.trialDays,
        sortOrder: def.sortOrder,
      },
      update: { name: def.name, priceMinor: def.priceMinor, description: def.description },
    })
    plans.set(def.code, plan.id)

    await prisma.planEntitlement.deleteMany({ where: { planId: plan.id } })
    await prisma.planEntitlement.createMany({
      data: [
        ...def.modules.map((featureKey) => ({ planId: plan.id, featureKey, enabled: true })),
        ...Object.entries(def.entitlements).map(([featureKey, limitValue]) => ({
          planId: plan.id,
          featureKey,
          enabled: true,
          limitValue,
        })),
      ],
    })
  }
  return plans
}

/* ---------------------------------------------------------------- tenants */

type TenantSpec = {
  slug: string
  name: string
  schoolName: string
  code: string
  planCode: string
  primaryHex: string
  accentHex: string
  studentCount: number
  classCount: number
  emailDomain: string
  seed: number
}

async function seedTenant(spec: TenantSpec, planId: string, passwordHash: string) {
  console.log(`\n  tenant: ${spec.schoolName}`)
  const rand = makeRandom(spec.seed)

  const tenant = await prisma.tenant.upsert({
    where: { slug: spec.slug },
    create: { slug: spec.slug, name: spec.name, status: 'ACTIVE' },
    update: { name: spec.name, status: 'ACTIVE' },
  })

  await prisma.tenantDomain.upsert({
    where: { host: `${spec.slug}.lvh.me` },
    create: { tenantId: tenant.id, host: `${spec.slug}.lvh.me`, isPrimary: true, verified: true },
    update: { verified: true },
  })

  const now = new Date()
  await prisma.subscription.upsert({
    where: { tenantId: tenant.id },
    create: {
      tenantId: tenant.id,
      planId,
      status: 'ACTIVE',
      currentStart: now,
      currentEnd: addDays(now, 365),
    },
    update: { planId, status: 'ACTIVE', currentEnd: addDays(now, 365) },
  })

  const location = pick(rand, CITIES)
  const school = await prisma.school.upsert({
    where: { tenantId: tenant.id },
    create: {
      tenantId: tenant.id,
      code: spec.code,
      name: spec.schoolName,
      legalName: `${spec.schoolName} Educational Society`,
      email: `office@${spec.emailDomain}`,
      phone: '+91 124 400 0000',
      website: `https://www.${spec.emailDomain}`,
      addressLine1: 'Sector 45, Institutional Area',
      city: location.city,
      state: location.state,
      postalCode: location.postalCode,
      // Geofence anchor for staff attendance.
      latitude: 28.4595,
      longitude: 77.0266,
      geofenceRadiusM: 200,
      taxNumber: '06AABCU9603R1ZM',
    },
    update: { name: spec.schoolName },
  })

  await prisma.branding.upsert({
    where: { schoolId: school.id },
    create: {
      tenantId: tenant.id,
      schoolId: school.id,
      primaryHex: spec.primaryHex,
      accentHex: spec.accentHex,
      secondaryHex: '#101828',
      radius: '12px',
      loginHeadline: `Welcome to ${spec.schoolName}`,
      loginSubtext: 'Sign in to view attendance, homework, fees and results.',
      footerText: `${spec.schoolName} · ${location.city}, ${location.state}`,
      pwaName: spec.schoolName,
      pwaShortName: spec.code,
    },
    update: { primaryHex: spec.primaryHex, accentHex: spec.accentHex, radius: '12px' },
  })

  const session = await prisma.academicSession.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: '2025-26' } },
    create: {
      tenantId: tenant.id,
      name: '2025-26',
      startsOn: new Date('2025-04-01'),
      endsOn: new Date('2026-03-31'),
      isCurrent: true,
    },
    update: { isCurrent: true },
  })

  await seedAcademicStructure(tenant.id, session.id, spec, rand)
  await ensureExamDefaults(prisma, tenant.id)
  const staff = await seedStaff(tenant.id, spec, rand, passwordHash)
  await assignTeachers(tenant.id, staff)
  const students = await seedStudents(tenant.id, session.id, spec, rand, passwordHash)
  await seedAttendance(tenant.id, session.id, students, staff, rand)
  await seedTeaching(tenant.id, staff, rand)
  await seedFinance(tenant.id, session.id, students, rand)
  await seedExams(tenant.id, session.id, students, rand)
  await seedOperations(tenant.id, students, staff, rand)
  await seedLeave(tenant.id, students, staff, rand)
  await seedSubmissions(tenant.id, rand)
  await seedDemoAccounts(tenant.id, spec, passwordHash, students)

  return tenant
}

/* ------------------------------------------------------- academic structure */

async function seedAcademicStructure(
  tenantId: string,
  sessionId: string,
  spec: TenantSpec,
  rand: Random,
) {
  console.log('    classes, sections and subjects')

  for (const s of SUBJECTS) {
    await prisma.subject.upsert({
      where: { tenantId_code: { tenantId, code: s.code } },
      create: { tenantId, code: s.code, name: s.name },
      update: {},
    })
  }

  for (let n = 1; n <= spec.classCount; n++) {
    const cls = await prisma.classLevel.upsert({
      where: { tenantId_sessionId_name: { tenantId, sessionId, name: `Class ${n}` } },
      create: { tenantId, sessionId, name: `Class ${n}`, numeric: n },
      update: {},
    })

    const sectionNames = n <= 5 ? ['A', 'B'] : ['A']
    for (const name of sectionNames) {
      await prisma.section.upsert({
        where: { tenantId_classLevelId_name: { tenantId, classLevelId: cls.id, name } },
        create: { tenantId, classLevelId: cls.id, name, capacity: 40, roomName: `R-${n}${name}` },
        update: {},
      })
    }

    const subjects = await prisma.subject.findMany({ where: { tenantId } })
    for (const subject of subjects) {
      await prisma.classSubject.upsert({
        where: {
          tenantId_classLevelId_subjectId: {
            tenantId,
            classLevelId: cls.id,
            subjectId: subject.id,
          },
        },
        create: { tenantId, classLevelId: cls.id, subjectId: subject.id },
        update: {},
      })
    }
  }

  const periods = [
    ['Period 1', '08:00', '08:45'],
    ['Period 2', '08:45', '09:30'],
    ['Break', '09:30', '09:50'],
    ['Period 3', '09:50', '10:35'],
    ['Period 4', '10:35', '11:20'],
    ['Period 5', '11:20', '12:05'],
  ]
  for (const [i, [name, startTime, endTime]] of periods.entries()) {
    await prisma.timetablePeriod.upsert({
      where: { tenantId_name: { tenantId, name: name! } },
      create: {
        tenantId,
        name: name!,
        startTime: startTime!,
        endTime: endTime!,
        sortOrder: i,
        isBreak: name === 'Break',
      },
      update: {},
    })
  }

  const scale = await prisma.gradingScale.upsert({
    where: { tenantId_name: { tenantId, name: 'CBSE Standard' } },
    create: { tenantId, name: 'CBSE Standard', isDefault: true },
    update: {},
  })
  const bands = [
    ['A+', 91, 100, 10, true],
    ['A', 81, 90.99, 9, true],
    ['B+', 71, 80.99, 8, true],
    ['B', 61, 70.99, 7, true],
    ['C', 51, 60.99, 6, true],
    ['D', 33, 50.99, 5, true],
    ['E', 0, 32.99, 0, false],
  ] as const
  for (const [grade, min, max, points, isPass] of bands) {
    await prisma.gradeBand.upsert({
      where: { tenantId_scaleId_grade: { tenantId, scaleId: scale.id, grade } },
      create: {
        tenantId,
        scaleId: scale.id,
        grade,
        minPercent: min,
        maxPercent: max,
        points,
        isPass,
      },
      update: {},
    })
  }

  for (const [name, appliesTo] of [
    ['Sick Leave', 'STUDENT'],
    ['Casual Leave', 'STUDENT'],
    ['Sick Leave', 'STAFF'],
    ['Earned Leave', 'STAFF'],
  ] as const) {
    await prisma.leaveType.upsert({
      where: { tenantId_name_appliesTo: { tenantId, name, appliesTo } },
      create: { tenantId, name, appliesTo, maxPerYear: 12 },
      update: {},
    })
  }
}

/* ------------------------------------------------------------------ staff */

async function seedStaff(
  tenantId: string,
  spec: TenantSpec,
  rand: Random,
  passwordHash: string,
) {
  console.log('    teachers and staff')
  const existing = await prisma.staff.count({ where: { tenantId } })
  if (existing > 0) return prisma.staff.findMany({ where: { tenantId } })

  const teacherCount = Math.max(10, Math.round(spec.studentCount / 14))
  const created: { id: string }[] = []

  for (let i = 0; i < teacherCount; i++) {
    const female = chance(rand, 0.6)
    const firstName = pick(rand, female ? FIRST_NAMES_F : FIRST_NAMES_M)
    const lastName = pick(rand, LAST_NAMES)
    const code = `EMP${String(i + 1).padStart(3, '0')}`
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@${spec.emailDomain}`

    const user = await prisma.user.create({
      data: {
        tenantId,
        email,
        phone: `+9198${String(intBetween(rand, 10000000, 99999999))}`,
        passwordHash,
        firstName,
        lastName,
        status: 'ACTIVE',
        roles: { create: { roleId: roleIds.teacher } },
      },
    })

    const joinedOn = subDays(new Date(), intBetween(rand, 120, 2600))

    const staff = await prisma.staff.create({
      data: {
        tenantId,
        userId: user.id,
        employeeCode: code,
        firstName,
        lastName,
        staffType: 'TEACHING',
        designation: pick(rand, DESIGNATIONS),
        department: pick(rand, DEPARTMENTS),
        qualification: pick(rand, ['B.Ed, M.A.', 'M.Sc, B.Ed', 'B.Ed, B.Sc', 'M.A., NET']),
        experienceYears: intBetween(rand, 1, 22),
        gender: female ? 'FEMALE' : 'MALE',
        phone: user.phone,
        email,
        joinedOn,
        createdAt: joinedOn,
        salaryMinor: intBetween(rand, 32000, 88000) * 100,
      },
    })
    created.push(staff)
  }

  return prisma.staff.findMany({ where: { tenantId } })
}

async function assignTeachers(tenantId: string, staff: { id: string }[]) {
  const classSubjects = await prisma.classSubject.findMany({
    where: { tenantId, teacherId: null },
    select: { id: true },
  })
  for (const [i, cs] of classSubjects.entries()) {
    await prisma.classSubject.update({
      where: { id: cs.id },
      data: { teacherId: staff[i % staff.length]!.id },
    })
  }

  const sections = await prisma.section.findMany({
    where: { tenantId, classTeacherId: null },
    select: { id: true },
  })
  for (const [i, section] of sections.entries()) {
    await prisma.section.update({
      where: { id: section.id },
      data: { classTeacherId: staff[i % staff.length]!.id },
    })
  }
}

/* --------------------------------------------------------------- students */

type SeededStudent = { id: string; sectionId: string; classLevelId: string; userId: string }

async function seedStudents(
  tenantId: string,
  sessionId: string,
  spec: TenantSpec,
  rand: Random,
  passwordHash: string,
): Promise<SeededStudent[]> {
  const existing = await prisma.enrollment.findMany({
    where: { tenantId, isCurrent: true },
    select: { studentId: true, sectionId: true, classLevelId: true, student: { select: { userId: true } } },
  })
  if (existing.length > 0) {
    return existing.map((e) => ({
      id: e.studentId,
      sectionId: e.sectionId,
      classLevelId: e.classLevelId,
      userId: e.student.userId ?? '',
    }))
  }

  console.log(`    ${spec.studentCount} students with guardians`)
  const sections = await prisma.section.findMany({
    where: { tenantId },
    select: { id: true, classLevelId: true, name: true },
    orderBy: { name: 'asc' },
  })

  const out: SeededStudent[] = []
  const rollCounters = new Map<string, number>()

  for (let i = 0; i < spec.studentCount; i++) {
    const section = sections[i % sections.length]!
    const female = chance(rand, 0.48)
    const firstName = pick(rand, female ? FIRST_NAMES_F : FIRST_NAMES_M)
    const lastName = pick(rand, LAST_NAMES)
    const admissionNo = `${spec.code}/2025/${String(i + 1).padStart(4, '0')}`
    const location = pick(rand, CITIES)
    const roll = (rollCounters.get(section.id) ?? 0) + 1
    rollCounters.set(section.id, roll)

    const studentEmail = `student${i + 1}@${spec.emailDomain}`
    const studentUser = await prisma.user.create({
      data: {
        tenantId,
        email: studentEmail,
        passwordHash,
        firstName,
        lastName,
        roles: { create: { roleId: roleIds.student } },
      },
    })

    const admissionDate = subDays(new Date(), intBetween(rand, 30, 900))

    const student = await prisma.student.create({
      data: {
        tenantId,
        userId: studentUser.id,
        admissionNo,
        firstName,
        lastName,
        gender: female ? 'FEMALE' : 'MALE',
        dateOfBirth: subYears(subDays(new Date(), intBetween(rand, 0, 360)), intBetween(rand, 6, 16)),
        bloodGroup: pick(rand, BLOOD_GROUPS),
        category: pick(rand, ['General', 'OBC', 'SC', 'ST', 'EWS']),
        admissionDate,
        // Records are stamped with the day the child was actually admitted.
        // Seeding them all at "now" would leave the dashboard with a single
        // vertical step instead of a year of growth to chart.
        createdAt: admissionDate,
        addressLine1: `House ${intBetween(rand, 1, 400)}, Sector ${intBetween(rand, 1, 60)}`,
        city: location.city,
        state: location.state,
        postalCode: location.postalCode,
        allergies: chance(rand, 0.08) ? pick(rand, ['Peanuts', 'Dust', 'Pollen']) : null,
      },
    })

    await prisma.enrollment.create({
      data: {
        tenantId,
        studentId: student.id,
        sessionId,
        classLevelId: section.classLevelId,
        sectionId: section.id,
        rollNumber: roll,
        isCurrent: true,
      },
    })

    // Roughly one in six families has a second child at the school, which is
    // what makes the parent child-switcher worth testing.
    const reuseParent = i > 0 && chance(rand, 0.16)
    if (reuseParent) {
      const sibling = await prisma.studentGuardian.findFirst({
        where: { tenantId, isPrimary: true },
        orderBy: { id: 'desc' },
        select: { parentId: true },
      })
      if (sibling) {
        await prisma.studentGuardian.create({
          data: {
            tenantId,
            studentId: student.id,
            parentId: sibling.parentId,
            relation: 'FATHER',
            isPrimary: true,
            isEmergencyContact: true,
          },
        })
        out.push({
          id: student.id,
          sectionId: section.id,
          classLevelId: section.classLevelId,
          userId: studentUser.id,
        })
        continue
      }
    }

    const parentFirst = pick(rand, chance(rand, 0.5) ? FIRST_NAMES_M : FIRST_NAMES_F)
    const parentEmail = `parent${i + 1}@${spec.emailDomain}`
    const parentUser = await prisma.user.create({
      data: {
        tenantId,
        email: parentEmail,
        phone: `+9199${String(intBetween(rand, 10000000, 99999999))}`,
        passwordHash,
        firstName: parentFirst,
        lastName,
        roles: { create: { roleId: roleIds.parent } },
      },
    })

    const parent = await prisma.parent.create({
      data: {
        tenantId,
        userId: parentUser.id,
        createdAt: admissionDate,
        firstName: parentFirst,
        lastName,
        phone: parentUser.phone,
        email: parentEmail,
        occupation: pick(rand, ['Engineer', 'Business', 'Doctor', 'Teacher', 'Government Service']),
        city: location.city,
        state: location.state,
      },
    })

    await prisma.studentGuardian.create({
      data: {
        tenantId,
        studentId: student.id,
        parentId: parent.id,
        relation: chance(rand, 0.6) ? 'FATHER' : 'MOTHER',
        isPrimary: true,
        isEmergencyContact: true,
      },
    })

    out.push({
      id: student.id,
      sectionId: section.id,
      classLevelId: section.classLevelId,
      userId: studentUser.id,
    })
  }

  return out
}

/* ------------------------------------------------------------- attendance */

async function seedAttendance(
  tenantId: string,
  sessionId: string,
  students: SeededStudent[],
  staff: { id: string }[],
  rand: Random,
) {
  console.log('    30 days of attendance')
  const rows: Prisma.StudentAttendanceCreateManyInput[] = []
  const staffRows: Prisma.StaffAttendanceCreateManyInput[] = []

  for (let d = 29; d >= 0; d--) {
    const date = attendanceDate(subDays(new Date(), d))
    if (date.getDay() === 0) continue // Sunday

    for (const s of students) {
      const roll = rand()
      const status = roll > 0.94 ? 'ABSENT' : roll > 0.9 ? 'LATE' : 'PRESENT'
      rows.push({
        tenantId,
        studentId: s.id,
        sectionId: s.sectionId,
        sessionId,
        onDate: date,
        status,
        markedById: staff[0]?.id,
        minutesLate: status === 'LATE' ? intBetween(rand, 5, 25) : null,
      })
    }

    for (const t of staff) {
      const roll = rand()
      staffRows.push({
        tenantId,
        staffId: t.id,
        onDate: date,
        status: roll > 0.96 ? 'ABSENT' : 'PRESENT',
        source: 'GEOFENCE',
        checkInAt: new Date(date.getTime() + 8 * 3600_000 + intBetween(rand, 0, 25) * 60_000),
        checkOutAt: new Date(date.getTime() + 15 * 3600_000),
        latitude: 28.4595 + (rand() - 0.5) * 0.002,
        longitude: 77.0266 + (rand() - 0.5) * 0.002,
        accuracyM: intBetween(rand, 5, 30),
        distanceM: intBetween(rand, 10, 180),
        insideGeofence: true,
      })
    }
  }

  for (let i = 0; i < rows.length; i += 2000) {
    await prisma.studentAttendance.createMany({
      data: rows.slice(i, i + 2000),
      skipDuplicates: true,
    })
  }
  await prisma.staffAttendance.createMany({ data: staffRows, skipDuplicates: true })
}

/* --------------------------------------------------------------- teaching */

async function seedTeaching(tenantId: string, staff: { id: string }[], rand: Random) {
  console.log('    homework, classwork, timetable, notices and events')

  const classSubjects = await prisma.classSubject.findMany({
    where: { tenantId, teacherId: { not: null } },
    include: { classLevel: { include: { sections: true } } },
    take: 40,
  })

  for (const [i, cs] of classSubjects.entries()) {
    const section = cs.classLevel.sections[0]
    if (!section) continue

    const [title, instructions] = HOMEWORK_SEEDS[i % HOMEWORK_SEEDS.length]!
    await prisma.homework.create({
      data: {
        tenantId,
        classLevelId: cs.classLevelId,
        sectionId: section.id,
        classSubjectId: cs.id,
        teacherId: cs.teacherId!,
        title: title!,
        instructions: instructions!,
        assignedOn: subDays(new Date(), intBetween(rand, 0, 5)),
        dueOn: addDays(new Date(), intBetween(rand, 1, 6)),
        maxScore: 20,
      },
    })

    const [topic, notes] = CLASSWORK_SEEDS[i % CLASSWORK_SEEDS.length]!
    await prisma.classwork.create({
      data: {
        tenantId,
        classLevelId: cs.classLevelId,
        sectionId: section.id,
        classSubjectId: cs.id,
        teacherId: cs.teacherId!,
        onDate: subDays(new Date(), intBetween(rand, 0, 7)),
        topic: topic!,
        notes: notes!,
      },
    })
  }

  const periods = await prisma.timetablePeriod.findMany({
    where: { tenantId, isBreak: false },
    orderBy: { sortOrder: 'asc' },
  })
  const sections = await prisma.section.findMany({ where: { tenantId }, take: 12 })

  for (const section of sections) {
    const subjectsForClass = await prisma.classSubject.findMany({
      where: { tenantId, classLevelId: section.classLevelId, teacherId: { not: null } },
    })
    for (let day = 1; day <= 5; day++) {
      for (const [pi, period] of periods.entries()) {
        const cs = subjectsForClass[(day + pi) % subjectsForClass.length]
        if (!cs) continue
        await prisma.timetableSlot
          .create({
            data: {
              tenantId,
              classLevelId: section.classLevelId,
              sectionId: section.id,
              periodId: period.id,
              classSubjectId: cs.id,
              teacherId: cs.teacherId,
              dayOfWeek: day,
              roomName: section.roomName,
            },
          })
          // A teacher clash is expected while filling a demo grid; the unique
          // constraint is doing its job, so skip and move on.
          .catch(() => undefined)
      }
    }
  }

  for (const [title, body, priority] of NOTICE_SEEDS) {
    const notice = await prisma.notice.create({
      data: {
        tenantId,
        title: title!,
        body: body!,
        priority: priority as 'LOW' | 'NORMAL' | 'HIGH',
        publishOn: subDays(new Date(), intBetween(rand, 0, 20)),
        pinned: priority === 'HIGH',
      },
    })
    await prisma.noticeTarget.create({ data: { tenantId, noticeId: notice.id, kind: 'ALL' } })
  }

  const events = [
    ['Annual Sports Day', 'SPORTS', 14],
    ['Science Exhibition', 'ACADEMIC', 21],
    ['Parent-Teacher Meeting', 'PTM', 7],
    ['Annual Day Function', 'CULTURAL', 40],
  ] as const
  for (const [title, category, inDays] of events) {
    await prisma.schoolEvent.create({
      data: {
        tenantId,
        title,
        category,
        venue: 'School Auditorium',
        startsAt: addDays(new Date(), inDays),
        endsAt: addDays(new Date(), inDays),
        registrationOpen: true,
      },
    })
    await prisma.calendarEvent.create({
      data: {
        tenantId,
        title,
        kind: category === 'PTM' ? 'PTM' : 'EVENT',
        startsAt: addDays(new Date(), inDays),
        endsAt: addDays(new Date(), inDays),
      },
    })
  }
}

/* ---------------------------------------------------------------- finance */

async function seedFinance(
  tenantId: string,
  sessionId: string,
  students: SeededStudent[],
  rand: Random,
) {
  console.log('    fee structures, invoices and payments')

  const heads = [
    ['TUI', 'Tuition Fee', 'QUARTERLY', 1200000],
    ['ADM', 'Admission Fee', 'ONE_TIME', 500000],
    ['EXM', 'Examination Fee', 'HALF_YEARLY', 150000],
    ['LIB', 'Library Fee', 'ANNUAL', 80000],
    ['ACT', 'Activity Fee', 'ANNUAL', 120000],
    ['TRN', 'Transport Fee', 'QUARTERLY', 600000],
  ] as const

  const headIds = new Map<string, string>()
  for (const [code, name, frequency] of heads) {
    const head = await prisma.feeHead.upsert({
      where: { tenantId_code: { tenantId, code } },
      create: { tenantId, code, name, frequency },
      update: {},
    })
    headIds.set(code, head.id)
  }

  const structure = await prisma.feeStructure.upsert({
    where: { tenantId_sessionId_name: { tenantId, sessionId, name: 'Standard 2025-26' } },
    create: { tenantId, sessionId, name: 'Standard 2025-26', isActive: true },
    update: {},
  })

  for (const [code, , , amountMinor] of heads) {
    if (code === 'TRN') continue
    await prisma.feeStructureItem.upsert({
      where: {
        tenantId_structureId_feeHeadId: {
          tenantId,
          structureId: structure.id,
          feeHeadId: headIds.get(code)!,
        },
      },
      create: {
        tenantId,
        structureId: structure.id,
        feeHeadId: headIds.get(code)!,
        amountMinor,
      },
      update: {},
    })
  }

  const existing = await prisma.feeInvoice.count({ where: { tenantId } })
  if (existing > 0) return

  const items = await prisma.feeStructureItem.findMany({
    where: { tenantId, structureId: structure.id },
    include: { feeHead: true },
  })
  const subtotal = items.reduce((sum, i) => sum + i.amountMinor, 0)

  for (const [i, student] of students.entries()) {
    const dueOn = attendanceDate(addDays(new Date(), intBetween(rand, -40, 40)))
    const invoice = await prisma.feeInvoice.create({
      data: {
        tenantId,
        number: `INV-2526-${String(i + 1).padStart(5, '0')}`,
        studentId: student.id,
        sessionId,
        structureId: structure.id,
        title: 'Term 1 - 2025-26',
        issuedOn: subDays(dueOn, 20),
        dueOn,
        status: 'ISSUED',
        subtotalMinor: subtotal,
        totalMinor: subtotal,
        balanceMinor: subtotal,
        lines: {
          create: items.map((it) => ({
            tenantId,
            feeHeadId: it.feeHeadId,
            label: it.feeHead.name,
            amountMinor: it.amountMinor,
          })),
        },
      },
    })

    // About two thirds of families have paid; a slice of those only partly.
    const roll = rand()
    if (roll > 0.34) {
      const partial = roll < 0.5
      const amount = partial ? Math.round(subtotal * 0.4) : subtotal
      const paidAt = subDays(new Date(), intBetween(rand, 0, 25))
      const mode = pick(rand, ['UPI', 'CASH', 'CARD', 'NET_BANKING'] as const)

      const payment = await prisma.feePayment.create({
        data: {
          tenantId,
          studentId: student.id,
          amountMinor: amount,
          mode,
          status: 'SUCCESS',
          provider: mode === 'CASH' ? 'manual' : 'mock',
          providerPaymentId: mode === 'CASH' ? null : `mock_pay_${tenantId.slice(-4)}_${i}`,
          paidAt,
          allocations: {
            create: { tenantId, invoiceId: invoice.id, amountMinor: amount },
          },
        },
      })

      await prisma.feeReceipt.create({
        data: {
          tenantId,
          number: `RCP-2526-${String(i + 1).padStart(5, '0')}`,
          paymentId: payment.id,
          issuedOn: paidAt,
        },
      })

      await prisma.feeInvoice.update({
        where: { id: invoice.id },
        data: {
          paidMinor: amount,
          balanceMinor: subtotal - amount,
          status: partial ? 'PARTIALLY_PAID' : 'PAID',
        },
      })
    } else if (dueOn < new Date()) {
      await prisma.feeInvoice.update({ where: { id: invoice.id }, data: { status: 'OVERDUE' } })
    }
  }
}

/* ------------------------------------------------------------------ exams */

async function seedExams(
  tenantId: string,
  sessionId: string,
  students: SeededStudent[],
  rand: Random,
) {
  console.log('    exams, marks and results')
  if ((await prisma.exam.count({ where: { tenantId } })) > 0) return

  const scale = await prisma.gradingScale.findFirst({ where: { tenantId, isDefault: true } })
  const exam = await prisma.exam.create({
    data: {
      tenantId,
      sessionId,
      name: 'Unit Test 1',
      kind: 'UNIT_TEST',
      status: 'PUBLISHED',
      startsOn: subDays(new Date(), 30),
      endsOn: subDays(new Date(), 25),
      gradingScaleId: scale?.id,
      publishedAt: subDays(new Date(), 20),
    },
  })

  const classLevels = await prisma.classLevel.findMany({ where: { tenantId, sessionId } })
  await prisma.examClass.createMany({
    data: classLevels.map((c) => ({ tenantId, examId: exam.id, classLevelId: c.id })),
    skipDuplicates: true,
  })

  const classSubjects = await prisma.classSubject.findMany({
    where: { tenantId, subject: { code: { in: ['ENG', 'MAT', 'SCI'] } } },
    include: { classLevel: true },
  })

  const examSubjects = new Map<string, string[]>()
  for (const cs of classSubjects) {
    const es = await prisma.examSubject.create({
      data: {
        tenantId,
        examId: exam.id,
        classSubjectId: cs.id,
        maxMarks: 50,
        passMarks: 17,
        examDate: subDays(new Date(), intBetween(rand, 25, 30)),
      },
    })
    const list = examSubjects.get(cs.classLevelId) ?? []
    list.push(es.id)
    examSubjects.set(cs.classLevelId, list)
  }

  const marks: Prisma.MarkCreateManyInput[] = []
  const results: Prisma.ResultCreateManyInput[] = []

  for (const student of students) {
    const subjectIds = examSubjects.get(student.classLevelId) ?? []
    if (subjectIds.length === 0) continue

    let obtained = 0
    for (const examSubjectId of subjectIds) {
      const score = intBetween(rand, 18, 50)
      obtained += score
      marks.push({ tenantId, examSubjectId, studentId: student.id, marksObtained: score })
    }

    const totalMax = subjectIds.length * 50
    const percentage = Math.round((obtained / totalMax) * 1000) / 10
    results.push({
      tenantId,
      examId: exam.id,
      studentId: student.id,
      totalMax,
      totalObtained: obtained,
      percentage,
      grade:
        percentage >= 91 ? 'A+' : percentage >= 81 ? 'A' : percentage >= 71 ? 'B+' : percentage >= 61 ? 'B' : percentage >= 51 ? 'C' : 'D',
      isPass: percentage >= 33,
      publishedAt: subDays(new Date(), 20),
    })
  }

  for (let i = 0; i < marks.length; i += 2000) {
    await prisma.mark.createMany({ data: marks.slice(i, i + 2000), skipDuplicates: true })
  }
  await prisma.result.createMany({ data: results, skipDuplicates: true })
}


/* ---------------------------------------------------------------- mailbox */

/**
 * A few internal threads, so the mailbox opens on something real.
 *
 * Staff-to-staff notes about the working day, plus one parent asking a
 * question, which is the pair of cases the folder rules have to get right:
 * a colleague thread anyone at the school could have started, and a parent
 * thread that may only involve staff.
 */
const MAIL_THREADS: { subject: string; body: string; reply?: string }[] = [
  {
    subject: 'Cover needed for period 3 tomorrow',
    body: 'I have a dental appointment at 11. Could someone take my Class 7 maths lesson? The worksheet is already photocopied and on my desk.',
    reply: 'I can take it. Leave the register out and I will mark it with them.',
  },
  {
    subject: 'Annual day rehearsal timings',
    body: 'Rehearsals will run 2pm to 4pm on Thursday and Friday in the main hall. Please release the children in your class ten minutes early on both days.',
  },
  {
    subject: 'Fee reminder letters for this term',
    body: 'The outstanding list has been generated. Twenty-two families are more than thirty days late. Shall I send the standard reminder or would you like to review the wording first?',
    reply: 'Send the standard one to everyone under sixty days. I will call the rest myself.',
  },
  {
    subject: 'Bus route 2 running late this week',
    body: 'Roadworks on the Sohna Road stretch are adding about fifteen minutes. I have told the driver to start ten minutes earlier from Monday.',
  },
  {
    subject: 'Science lab stock check',
    body: 'We are low on litmus paper and there are only four working thermometers. Could you raise a purchase request before the practicals start?',
    reply: 'Raised this morning. The order should arrive by the end of next week.',
  },
]

async function seedMailbox(tenantId: string, rand: Random) {
  if ((await prisma.conversation.count({ where: { tenantId } })) > 0) return

  const staffUsers = await prisma.staff.findMany({
    where: { tenantId, userId: { not: null } },
    select: { userId: true },
    take: 12,
  })
  const userIds = staffUsers.map((s) => s.userId).filter((id): id is string => !!id)
  if (userIds.length < 2) return

  for (const [index, thread] of MAIL_THREADS.entries()) {
    const sender = userIds[index % userIds.length]!
    const recipient = userIds[(index + 1 + intBetween(rand, 0, 2)) % userIds.length]!
    if (sender === recipient) continue

    const startedAt = subDays(new Date(), intBetween(rand, 0, 6))
    const repliedAt = addDays(startedAt, 0)

    const conversation = await prisma.conversation.create({
      data: {
        tenantId,
        subject: thread.subject,
        kind: 'DIRECT',
        createdById: sender,
        createdAt: startedAt,
        lastMessageAt: thread.reply ? repliedAt : startedAt,
        participants: {
          create: [
            { tenantId, userId: sender, lastReadAt: repliedAt },
            // The recipient has not opened it: an inbox that starts with
            // everything read exercises none of the unread styling.
            { tenantId, userId: recipient, lastReadAt: null },
          ],
        },
      },
    })

    await prisma.message.create({
      data: {
        tenantId,
        conversationId: conversation.id,
        senderId: sender,
        body: thread.body,
        createdAt: startedAt,
      },
    })

    if (thread.reply) {
      await prisma.message.create({
        data: {
          tenantId,
          conversationId: conversation.id,
          senderId: recipient,
          body: thread.reply,
          createdAt: repliedAt,
        },
      })
    }
  }
}

/* ------------------------------------------------------------- operations */

/** The school sits at these coordinates; routes are laid out around it. */
const SCHOOL_LAT = 28.4595
const SCHOOL_LNG = 77.0266

const STOP_NAMES = [
  'Green Park',
  'Rose Garden',
  'Metro Gate',
  'Civil Lines',
  'Market Square',
  'Ashoka Crossing',
  'Lake View',
  'Old Post Office',
]

/**
 * Trip history and a bus that is out on the road right now.
 *
 * Without this the live map opens on a fleet of parked buses and looks broken,
 * which is exactly the screen a demo should not start on. One bus is put
 * mid-route with a trail of pings behind it and the stops it has already made
 * marked in the boarding log; the rest get a completed morning run so the
 * trip history on each vehicle is not empty either.
 */
async function seedTransportTrips(tenantId: string, rand: Random) {
  if ((await prisma.busTrip.count({ where: { tenantId } })) > 0) return

  const routes = await prisma.route.findMany({
    where: { tenantId, deletedAt: null },
    include: { stops: { orderBy: { sortOrder: 'asc' } } },
  })

  const today = attendanceDate(new Date())
  const runnable = routes.filter((route) => route.busId && route.stops.length >= 3)
  if (runnable.length === 0) return

  for (const [index, route] of runnable.entries()) {
    const busId = route.busId!
    const live = index === 0

    const trip = await prisma.busTrip.create({
      data: {
        tenantId,
        busId,
        routeId: route.id,
        direction: 'PICKUP',
        onDate: today,
        status: live ? 'RUNNING' : 'COMPLETED',
        startedAt: new Date(Date.now() - (live ? 22 : 180) * 60_000),
        endedAt: live ? null : new Date(Date.now() - 120 * 60_000),
      },
    })

    const stops = [...route.stops].sort((a, b) => a.sortOrder - b.sortOrder)
    const plotted = stops.filter(
      (stop): stop is typeof stop & { latitude: number; longitude: number } =>
        stop.latitude !== null && stop.longitude !== null,
    )
    if (plotted.length < 2) continue

    // A running bus is two stops in; a finished one has served them all.
    const servedCount = live ? 2 : plotted.length
    const riders = await prisma.transportAssignment.findMany({
      where: { tenantId, routeId: route.id, isActive: true },
      select: { studentId: true, stopId: true },
    })
    const servedStopIds = new Set(plotted.slice(0, servedCount).map((stop) => stop.id))

    await prisma.transportBoardingLog.createMany({
      data: riders
        .filter((rider) => servedStopIds.has(rider.stopId))
        .map((rider) => ({
          tenantId,
          tripId: trip.id,
          studentId: rider.studentId,
          stopId: rider.stopId,
          event: chance(rand, 0.94) ? 'BOARDED' : 'ABSENT',
        })),
      skipDuplicates: true,
    })

    if (!live) continue

    // A trail of pings from the first stop to somewhere between the served
    // stop and the next one, so the marker sits on the road rather than on
    // top of a stop.
    const from = plotted[servedCount - 1]!
    const to = plotted[servedCount] ?? plotted[plotted.length - 1]!
    const pings = 14

    for (let p = 0; p < pings; p++) {
      const along = (p / (pings - 1)) * 0.45
      await prisma.busLocation.create({
        data: {
          tenantId,
          busId,
          tripId: trip.id,
          latitude: from.latitude + (to.latitude - from.latitude) * along,
          longitude: from.longitude + (to.longitude - from.longitude) * along,
          speedKph: intBetween(rand, 12, 38),
          headingDeg: intBetween(rand, 0, 359),
          accuracyM: intBetween(rand, 5, 18),
          recordedAt: new Date(Date.now() - (pings - 1 - p) * 45_000),
        },
      })
    }
  }
}

async function seedOperations(
  tenantId: string,
  students: SeededStudent[],
  staff: { id: string }[],
  rand: Random,
) {
  console.log('    library, assets, transport and admission leads')

  if ((await prisma.book.count({ where: { tenantId } })) === 0) {
    const category = await prisma.bookCategory.upsert({
      where: { tenantId_name: { tenantId, name: 'General' } },
      create: { tenantId, name: 'General' },
      update: {},
    })

    for (const [i, [title, author, publisher]] of BOOK_TITLES.entries()) {
      const copies = intBetween(rand, 2, 6)
      const book = await prisma.book.create({
        data: {
          tenantId,
          categoryId: category.id,
          title: title!,
          author: author!,
          publisher: publisher!,
          isbn: `978-93-${String(10000 + i)}-${intBetween(rand, 10, 99)}-${intBetween(rand, 0, 9)}`,
          totalCopies: copies,
          availableCopies: copies,
          shelfCode: `S${intBetween(rand, 1, 12)}`,
        },
      })

      if (chance(rand, 0.6) && students.length > 0) {
        const borrower = students[intBetween(rand, 0, students.length - 1)]!
        const dueOn = addDays(new Date(), intBetween(rand, -8, 14))
        await prisma.libraryLoan.create({
          data: {
            tenantId,
            bookId: book.id,
            studentId: borrower.id,
            dueOn,
            status: dueOn < new Date() ? 'OVERDUE' : 'ISSUED',
            fineMinor: dueOn < new Date() ? 2000 : 0,
          },
        })
        await prisma.book.update({
          where: { id: book.id },
          data: { availableCopies: copies - 1 },
        })
      }
    }
  }

  if ((await prisma.asset.count({ where: { tenantId } })) === 0) {
    for (const [i, [name, categoryName, price]] of ASSET_ITEMS.entries()) {
      const category = await prisma.assetCategory.upsert({
        where: { tenantId_name: { tenantId, name: categoryName as string } },
        create: { tenantId, name: categoryName as string },
        update: {},
      })
      await prisma.asset.create({
        data: {
          tenantId,
          categoryId: category.id,
          assetCode: `AST-${String(i + 1).padStart(4, '0')}`,
          name: name as string,
          quantity: intBetween(rand, 1, 30),
          purchasePriceMinor: (price as number) * 100,
          purchaseDate: subDays(new Date(), intBetween(rand, 60, 900)),
          vendorName: pick(rand, ['Kanha Enterprises', 'Sharma Traders', 'EduSupply India']),
          location: pick(rand, ['Block A', 'Block B', 'Lab 1', 'Library', 'Store Room']),
          condition: pick(rand, ['NEW', 'GOOD', 'GOOD', 'FAIR'] as const),
        },
      })
    }
  }

  if ((await prisma.bus.count({ where: { tenantId } })) === 0) {
    for (let i = 1; i <= 4; i++) {
      const driver = staff[(i * 3) % staff.length]
      const bus = await prisma.bus.create({
        data: {
          tenantId,
          code: `BUS-0${i}`,
          registrationNo: `HR26AB${1000 + i}`,
          model: pick(rand, ['Tata Starbus', 'Ashok Leyland Lynx', 'Force Traveller']),
          capacity: intBetween(rand, 30, 52),
          driverId: driver?.id,
          insuranceExpiresOn: addDays(new Date(), intBetween(rand, 30, 300)),
        },
      })

      const route = await prisma.route.create({
        data: {
          tenantId,
          name: `Route ${i} - ${pick(rand, ['Sector 45', 'Golf Course Road', 'Sohna Road', 'DLF Phase 3'])}`,
          code: `RT-0${i}`,
          busId: bus.id,
          distanceKm: intBetween(rand, 6, 24),
        },
      })

      // Stops walk in from a corner of the city towards the school, so the
      // live map draws a route that looks like a journey rather than a
      // diagonal line through a field.
      const stopCount = intBetween(rand, 4, 6)
      const originLat = SCHOOL_LAT + (i % 2 === 0 ? 1 : -1) * 0.035
      const originLng = SCHOOL_LNG + (i > 2 ? 1 : -1) * 0.038

      for (let s = 1; s <= stopCount; s++) {
        const along = (s - 1) / stopCount
        await prisma.busStop.create({
          data: {
            tenantId,
            routeId: route.id,
            name: `${pick(rand, STOP_NAMES)} ${i}-${s}`,
            sortOrder: s,
            pickupTime: `07:${String(10 + s * 5).padStart(2, '0')}`,
            dropTime: `15:${String(10 + s * 5).padStart(2, '0')}`,
            fareMinor: 600000,
            // A little jitter across the direct line keeps the drawn route
            // from looking like a ruler.
            latitude: originLat + (SCHOOL_LAT - originLat) * along + (rand() - 0.5) * 0.004,
            longitude: originLng + (SCHOOL_LNG - originLng) * along + (rand() - 0.5) * 0.004,
          },
        })
      }
    }

    const routes = await prisma.route.findMany({
      where: { tenantId },
      include: { stops: { orderBy: { sortOrder: 'asc' } } },
    })
    for (const student of students.filter(() => chance(rand, 0.3))) {
      const route = pick(rand, routes)
      // Spread riders across the whole route; everyone boarding at stop one
      // makes the boarding roster and the stop occupancy meaningless.
      const stop = route.stops.length > 0 ? pick(rand, route.stops) : null
      if (!stop) continue
      await prisma.transportAssignment
        .create({
          data: {
            tenantId,
            studentId: student.id,
            routeId: route.id,
            stopId: stop.id,
            busId: route.busId,
          },
        })
        .catch(() => undefined)
    }
  }

  await seedTransportTrips(tenantId, rand)

  await seedMailbox(tenantId, rand)

  if ((await prisma.admissionLead.count({ where: { tenantId } })) === 0) {
    const stages = [
      'NEW',
      'CONTACTED',
      'INTERESTED',
      'CAMPUS_VISIT',
      'APPLICATION',
      'DOCUMENT_VERIFICATION',
      'APPROVED',
      'ENROLLED',
      'LOST',
    ] as const

    for (let i = 0; i < 24; i++) {
      const childFirst = pick(rand, chance(rand, 0.5) ? FIRST_NAMES_M : FIRST_NAMES_F)
      const lastName = pick(rand, LAST_NAMES)
      const lead = await prisma.admissionLead.create({
        data: {
          tenantId,
          reference: `LEAD-${String(i + 1).padStart(4, '0')}`,
          studentName: `${childFirst} ${lastName}`,
          parentName: `${pick(rand, FIRST_NAMES_M)} ${lastName}`,
          phone: `+9197${String(intBetween(rand, 10000000, 99999999))}`,
          source: pick(rand, ['WEBSITE', 'WALK_IN', 'REFERRAL', 'CALL', 'ADS']),
          stage: pick(rand, stages),
          nextFollowUpOn: addDays(new Date(), intBetween(rand, -3, 12)),
          notes: 'Enquiry received for the coming session.',
        },
      })
      await prisma.leadActivity.create({
        data: {
          tenantId,
          leadId: lead.id,
          type: 'NOTE',
          summary: 'Enquiry captured at the front desk.',
        },
      })
    }
  }

  if ((await prisma.visitor.count({ where: { tenantId } })) === 0) {
    for (let i = 0; i < 8; i++) {
      await prisma.visitor.create({
        data: {
          tenantId,
          name: `${pick(rand, FIRST_NAMES_M)} ${pick(rand, LAST_NAMES)}`,
          phone: `+9196${String(intBetween(rand, 10000000, 99999999))}`,
          purpose: pick(rand, ['Admission enquiry', 'Meet class teacher', 'Fee payment', 'Document submission']),
          checkInAt: subDays(new Date(), intBetween(rand, 0, 6)),
          passNumber: `V-${String(i + 1).padStart(3, '0')}`,
        },
      })
    }
  }
}

/* ------------------------------------------------------------ submissions */

async function seedSubmissions(tenantId: string, rand: Random) {
  if ((await prisma.homeworkSubmission.count({ where: { tenantId } })) > 0) return
  console.log('    homework submissions')

  const homework = await prisma.homework.findMany({
    where: { tenantId, isPublished: true },
    select: { id: true, classLevelId: true, sectionId: true, maxScore: true },
    take: 20,
  })

  for (const hw of homework) {
    const enrollments = await prisma.enrollment.findMany({
      where: {
        tenantId,
        classLevelId: hw.classLevelId,
        ...(hw.sectionId ? { sectionId: hw.sectionId } : {}),
        isCurrent: true,
      },
      select: { studentId: true },
    })

    // Most of a class hands in; a few do not, and some of what is in has been
    // marked. That mix is what makes the review screen worth looking at.
    for (const e of enrollments) {
      const roll = rand()
      if (roll > 0.82) continue

      const reviewed = roll < 0.35
      await prisma.homeworkSubmission.create({
        data: {
          tenantId,
          homeworkId: hw.id,
          studentId: e.studentId,
          status: reviewed ? 'REVIEWED' : 'SUBMITTED',
          submittedAt: subDays(new Date(), intBetween(rand, 0, 3)),
          note: roll < 0.15 ? 'Completed in the notebook.' : null,
          score: reviewed && hw.maxScore ? intBetween(rand, 10, hw.maxScore) : null,
          teacherComment: reviewed ? pick(rand, ['Well done.', 'Good effort.', 'Neat work.']) : null,
        },
      })
    }
  }
}

/* ------------------------------------------------------------------ leave */

async function seedLeave(
  tenantId: string,
  students: SeededStudent[],
  staff: { id: string }[],
  rand: Random,
) {
  if ((await prisma.leaveRequest.count({ where: { tenantId } })) > 0) return
  console.log('    leave requests')

  const studentType = await prisma.leaveType.findFirst({
    where: { tenantId, appliesTo: 'STUDENT' },
  })
  const staffType = await prisma.leaveType.findFirst({ where: { tenantId, appliesTo: 'STAFF' } })

  const reasons = [
    'Fever, advised rest by the doctor',
    'Family function out of town',
    'Medical check-up scheduled',
    'Travelling for a wedding',
    'Not well since yesterday evening',
  ]

  // A mix of pending, approved and rejected so the queue and the history views
  // both have something real in them.
  const statuses = ['PENDING', 'PENDING', 'PENDING', 'APPROVED', 'REJECTED'] as const

  for (let i = 0; i < 9 && i < students.length; i++) {
    const student = students[i]!
    const from = addDays(new Date(), intBetween(rand, -12, 8))
    const to = addDays(from, intBetween(rand, 0, 2))
    const status = pick(rand, statuses)

    await prisma.leaveRequest.create({
      data: {
        tenantId,
        applicantType: 'STUDENT',
        studentId: student.id,
        leaveTypeId: studentType?.id,
        fromDate: attendanceDate(from),
        toDate: attendanceDate(to),
        reason: pick(rand, reasons),
        status,
        decidedAt: status === 'PENDING' ? null : subDays(new Date(), intBetween(rand, 1, 6)),
        decisionNote: status === 'REJECTED' ? 'Please submit a medical certificate.' : null,
      },
    })
  }

  for (let i = 0; i < 4 && i < staff.length; i++) {
    const from = addDays(new Date(), intBetween(rand, -8, 10))
    const status = pick(rand, statuses)
    await prisma.leaveRequest.create({
      data: {
        tenantId,
        applicantType: 'STAFF',
        staffId: staff[i]!.id,
        leaveTypeId: staffType?.id,
        fromDate: attendanceDate(from),
        toDate: attendanceDate(addDays(from, intBetween(rand, 0, 3))),
        reason: pick(rand, ['Personal work', 'Medical leave', 'Family emergency']),
        status,
        decidedAt: status === 'PENDING' ? null : subDays(new Date(), 2),
      },
    })
  }
}

/* ---------------------------------------------------------- demo accounts */

async function seedDemoAccounts(
  tenantId: string,
  spec: TenantSpec,
  passwordHash: string,
  students: SeededStudent[],
) {
  console.log('    demo role accounts')

  const accounts: { role: string; email: string; firstName: string; lastName: string }[] = [
    { role: ROLE.SCHOOL_ADMIN, email: `admin@${spec.emailDomain}`, firstName: 'Anita', lastName: 'Rao' },
    { role: ROLE.PRINCIPAL, email: `principal@${spec.emailDomain}`, firstName: 'Suresh', lastName: 'Menon' },
    { role: ROLE.TEACHER, email: `teacher@${spec.emailDomain}`, firstName: 'Kavita', lastName: 'Joshi' },
    { role: ROLE.ACCOUNTANT, email: `accounts@${spec.emailDomain}`, firstName: 'Rahul', lastName: 'Bhatt' },
    { role: ROLE.LIBRARIAN, email: `library@${spec.emailDomain}`, firstName: 'Neha', lastName: 'Das' },
    { role: ROLE.TRANSPORT_MANAGER, email: `transport@${spec.emailDomain}`, firstName: 'Vikram', lastName: 'Singh' },
    { role: ROLE.DRIVER, email: `driver@${spec.emailDomain}`, firstName: 'Ramesh', lastName: 'Yadav' },
    { role: ROLE.FRONT_DESK, email: `reception@${spec.emailDomain}`, firstName: 'Priya', lastName: 'Nair' },
    { role: ROLE.HR, email: `hr@${spec.emailDomain}`, firstName: 'Deepak', lastName: 'Sinha' },
  ]

  for (const acc of accounts) {
    const user = await prisma.user.upsert({
      where: { tenantId_email: { tenantId, email: acc.email } },
      create: {
        tenantId,
        email: acc.email,
        passwordHash,
        firstName: acc.firstName,
        lastName: acc.lastName,
        status: 'ACTIVE',
      },
      update: { passwordHash, status: 'ACTIVE' },
    })

    const role = await prisma.role.findFirst({ where: { tenantId: null, key: acc.role } })
    if (role) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        create: { userId: user.id, roleId: role.id },
        update: {},
      })
    }

    // Staff-facing roles need a Staff record for attendance and timetables.
    const staffTypes: Record<string, 'ADMIN' | 'TEACHING' | 'DRIVER' | 'LIBRARIAN' | 'ACCOUNTANT' | 'SUPPORT'> = {
      [ROLE.SCHOOL_ADMIN]: 'ADMIN',
      [ROLE.PRINCIPAL]: 'ADMIN',
      [ROLE.TEACHER]: 'TEACHING',
      [ROLE.ACCOUNTANT]: 'ACCOUNTANT',
      [ROLE.LIBRARIAN]: 'LIBRARIAN',
      [ROLE.DRIVER]: 'DRIVER',
      [ROLE.TRANSPORT_MANAGER]: 'ADMIN',
      [ROLE.FRONT_DESK]: 'SUPPORT',
      [ROLE.HR]: 'ADMIN',
    }

    const existingStaff = await prisma.staff.findFirst({ where: { userId: user.id } })
    if (!existingStaff) {
      await prisma.staff.create({
        data: {
          tenantId,
          userId: user.id,
          employeeCode: `DEMO-${acc.role.slice(0, 6)}`,
          firstName: acc.firstName,
          lastName: acc.lastName,
          staffType: staffTypes[acc.role] ?? 'SUPPORT',
          designation: acc.role.replace('_', ' ').toLowerCase(),
          email: acc.email,
          joinedOn: subDays(new Date(), 400),
        },
      })
    }
  }

  // A demo parent wired to two children, so the child switcher has something
  // real to switch between.
  const demoParentEmail = `parent@${spec.emailDomain}`
  const parentUser = await prisma.user.upsert({
    where: { tenantId_email: { tenantId, email: demoParentEmail } },
    create: {
      tenantId,
      email: demoParentEmail,
      passwordHash,
      firstName: 'Manoj',
      lastName: 'Chauhan',
      status: 'ACTIVE',
    },
    update: { passwordHash },
  })
  const parentRole = await prisma.role.findFirst({ where: { tenantId: null, key: ROLE.PARENT } })
  if (parentRole) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: parentUser.id, roleId: parentRole.id } },
      create: { userId: parentUser.id, roleId: parentRole.id },
      update: {},
    })
  }

  let demoParent = await prisma.parent.findFirst({ where: { userId: parentUser.id } })
  if (!demoParent) {
    demoParent = await prisma.parent.create({
      data: {
        tenantId,
        userId: parentUser.id,
        firstName: 'Manoj',
        lastName: 'Chauhan',
        email: demoParentEmail,
        phone: '+919810000001',
      },
    })
  }

  for (const child of students.slice(0, 2)) {
    await prisma.studentGuardian.upsert({
      where: {
        tenantId_studentId_parentId: {
          tenantId,
          studentId: child.id,
          parentId: demoParent.id,
        },
      },
      create: {
        tenantId,
        studentId: child.id,
        parentId: demoParent.id,
        relation: 'FATHER',
        isPrimary: false,
      },
      update: {},
    })
  }

  // A demo student login pointing at the first seeded student.
  const firstStudent = students[0]
  if (firstStudent?.userId) {
    await prisma.user.update({
      where: { id: firstStudent.userId },
      data: { email: `student@${spec.emailDomain}`, passwordHash },
    })
  }
}

/* ------------------------------------------------------------------- main */

async function main() {
  console.log('Seeding MyCampusView...\n')
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12)

  await seedPermissionsAndRoles()
  const plans = await seedPlans()

  const superAdminRole = await prisma.role.findFirst({
    where: { tenantId: null, key: ROLE.SUPER_ADMIN },
  })
  const existingOwner = await prisma.user.findFirst({
    where: { tenantId: null, email: 'owner@schoolos.dev' },
  })
  const superAdmin = existingOwner
    ? await prisma.user.update({
        where: { id: existingOwner.id },
        data: { passwordHash, isSuperAdmin: true, status: 'ACTIVE' },
      })
    : await prisma.user.create({
        data: {
          tenantId: null,
          email: 'owner@schoolos.dev',
          passwordHash,
          firstName: 'Platform',
          lastName: 'Owner',
          isSuperAdmin: true,
          status: 'ACTIVE',
        },
      })
  if (superAdminRole) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: superAdmin.id, roleId: superAdminRole.id } },
      create: { userId: superAdmin.id, roleId: superAdminRole.id },
      update: {},
    })
  }

  const specs: TenantSpec[] = [
    {
      slug: 'demo',
      name: 'Demo International School',
      schoolName: 'Demo International School',
      code: 'DIS',
      planCode: 'PRO',
      primaryHex: '#635BFF',
      accentHex: '#F59E0B',
      studentCount: 120,
      classCount: 8,
      emailDomain: 'demo.schoolos.dev',
      seed: 20250401,
    },
    {
      // A second, deliberately different tenant. Its only job is to make
      // cross-tenant isolation testable with real data on both sides.
      slug: 'greenwood',
      name: 'Greenwood Public School',
      schoolName: 'Greenwood Public School',
      code: 'GPS',
      planCode: 'STARTER',
      primaryHex: '#0D9488',
      accentHex: '#F59E0B',
      studentCount: 40,
      classCount: 5,
      emailDomain: 'greenwood.schoolos.dev',
      seed: 77001,
    },
  ]

  for (const spec of specs) {
    await seedTenant(spec, plans.get(spec.planCode)!, passwordHash)
  }

  const counts = {
    tenants: await prisma.tenant.count(),
    users: await prisma.user.count(),
    students: await prisma.student.count(),
    invoices: await prisma.feeInvoice.count(),
    attendance: await prisma.studentAttendance.count(),
  }

  console.log('\nSeed complete.')
  console.table(counts)
  console.log(`
Sign in at http://demo.lvh.me:3000  (password for every demo account: ${DEMO_PASSWORD})

  admin@demo.schoolos.dev        School Admin
  principal@demo.schoolos.dev    Principal
  teacher@demo.schoolos.dev      Teacher
  accounts@demo.schoolos.dev     Accountant
  library@demo.schoolos.dev      Librarian
  transport@demo.schoolos.dev    Transport Manager
  driver@demo.schoolos.dev       Driver
  reception@demo.schoolos.dev    Front Office
  hr@demo.schoolos.dev           HR
  parent@demo.schoolos.dev       Parent (two children)
  student@demo.schoolos.dev      Student

Second tenant: http://greenwood.lvh.me:3000  (admin@greenwood.schoolos.dev)
Platform console: http://lvh.me:3000/platform  (owner@schoolos.dev)
`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
