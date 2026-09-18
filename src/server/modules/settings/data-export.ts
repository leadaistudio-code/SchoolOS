import { zipSync, strToU8 } from 'fflate'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { toCsv } from '@/lib/csv'

type Sheet = { name: string; headers: string[]; rows: Array<Array<string | number | null | undefined>> }

function day(value: Date | string | null | undefined): string {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function stamp(value: Date | string | null | undefined): string {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString()
}

function money(minor: number | null | undefined): string {
  if (minor == null) return ''
  return (minor / 100).toFixed(2)
}

function sheetCsv(sheet: Sheet): string {
  return `\uFEFF${toCsv(sheet.headers, sheet.rows)}`
}

function addSheet(
  files: Record<string, Uint8Array>,
  counts: Record<string, number>,
  sheet: Sheet,
) {
  files[`${sheet.name}.csv`] = strToU8(sheetCsv(sheet))
  counts[sheet.name] = sheet.rows.length
}

/**
 * Builds a ZIP of CSV sheets for the current school.
 *
 * Entry requires `settings.export`. Individual sheets are still gated by the
 * matching module export/view rights so an accountant cannot pull staff PII
 * and an HR officer cannot pull the fee ledger.
 */
export async function buildSchoolDataExport(ctx: AppContext): Promise<{
  filename: string
  bytes: Uint8Array
  counts: Record<string, number>
  modules: string[]
}> {
  ctx.require('settings.export')

  const school = await ctx.db.school.findFirst({
    select: {
      id: true,
      name: true,
      code: true,
      legalName: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      state: true,
      postalCode: true,
      country: true,
      phone: true,
      email: true,
      website: true,
      taxNumber: true,
    },
  })

  const files: Record<string, Uint8Array> = {}
  const counts: Record<string, number> = {}
  const modules: string[] = []
  const generatedAt = new Date()

  addSheet(files, counts, {
    name: 'school',
    headers: [
      'id',
      'name',
      'legalName',
      'code',
      'addressLine1',
      'addressLine2',
      'city',
      'state',
      'postalCode',
      'country',
      'phone',
      'email',
      'website',
      'taxNumber',
      'timezone',
      'currency',
    ],
    rows: school
      ? [
          [
            school.id,
            school.name,
            school.legalName,
            school.code,
            school.addressLine1,
            school.addressLine2,
            school.city,
            school.state,
            school.postalCode,
            school.country,
            school.phone,
            school.email,
            school.website,
            school.taxNumber,
            ctx.tenant.timezone,
            ctx.tenant.currency,
          ],
        ]
      : [],
  })
  modules.push('school')

  if (ctx.can('academics.view') || ctx.can('students.export') || ctx.can('settings.export')) {
    const [sessions, classes, sections, subjects, classSubjects] = await Promise.all([
      ctx.db.academicSession.findMany({
        orderBy: [{ startsOn: 'desc' }],
        select: { id: true, name: true, startsOn: true, endsOn: true, isCurrent: true },
      }),
      ctx.db.classLevel.findMany({
        where: { deletedAt: null },
        orderBy: [{ session: { startsOn: 'desc' } }, { numeric: 'asc' }],
        select: {
          id: true,
          name: true,
          numeric: true,
          stream: true,
          session: { select: { name: true } },
        },
      }),
      ctx.db.section.findMany({
        where: { deletedAt: null },
        orderBy: [{ classLevel: { numeric: 'asc' } }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          capacity: true,
          roomName: true,
          classLevel: { select: { name: true, session: { select: { name: true } } } },
          classTeacher: { select: { employeeCode: true, firstName: true, lastName: true } },
        },
      }),
      ctx.db.subject.findMany({
        where: { deletedAt: null },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, code: true, isElective: true },
      }),
      ctx.db.classSubject.findMany({
        orderBy: [{ classLevel: { numeric: 'asc' } }, { subject: { name: 'asc' } }],
        select: {
          id: true,
          classLevel: { select: { name: true, session: { select: { name: true } } } },
          subject: { select: { name: true, code: true } },
          teacher: { select: { employeeCode: true, firstName: true, lastName: true } },
          sections: { select: { section: { select: { name: true } } } },
        },
      }),
    ])

    addSheet(files, counts, {
      name: 'sessions',
      headers: ['id', 'name', 'startsOn', 'endsOn', 'isCurrent'],
      rows: sessions.map((row) => [
        row.id,
        row.name,
        day(row.startsOn),
        day(row.endsOn),
        row.isCurrent ? 'YES' : 'NO',
      ]),
    })
    addSheet(files, counts, {
      name: 'classes',
      headers: ['id', 'session', 'name', 'numeric', 'stream'],
      rows: classes.map((row) => [row.id, row.session.name, row.name, row.numeric, row.stream]),
    })
    addSheet(files, counts, {
      name: 'sections',
      headers: [
        'id',
        'session',
        'class',
        'name',
        'capacity',
        'roomName',
        'classTeacherCode',
        'classTeacherName',
      ],
      rows: sections.map((row) => [
        row.id,
        row.classLevel.session.name,
        row.classLevel.name,
        row.name,
        row.capacity,
        row.roomName,
        row.classTeacher?.employeeCode ?? '',
        row.classTeacher
          ? `${row.classTeacher.firstName} ${row.classTeacher.lastName}`.trim()
          : '',
      ]),
    })
    addSheet(files, counts, {
      name: 'subjects',
      headers: ['id', 'name', 'code', 'isElective'],
      rows: subjects.map((row) => [
        row.id,
        row.name,
        row.code,
        row.isElective ? 'YES' : 'NO',
      ]),
    })
    addSheet(files, counts, {
      name: 'class_subjects',
      headers: [
        'id',
        'session',
        'class',
        'subject',
        'subjectCode',
        'teacherCode',
        'teacherName',
        'sections',
      ],
      rows: classSubjects.map((row) => [
        row.id,
        row.classLevel.session.name,
        row.classLevel.name,
        row.subject.name,
        row.subject.code,
        row.teacher?.employeeCode ?? '',
        row.teacher ? `${row.teacher.firstName} ${row.teacher.lastName}`.trim() : '',
        row.sections.length === 0
          ? 'ALL'
          : row.sections.map((item) => item.section.name).join('|'),
      ]),
    })
    modules.push('structure')
  }

  if (ctx.can('students.export') || ctx.can('students.view')) {
    const [students, enrollments] = await Promise.all([
      ctx.db.student.findMany({
        where: { deletedAt: null },
        orderBy: [{ admissionNo: 'asc' }],
        select: {
          id: true,
          admissionNo: true,
          firstName: true,
          lastName: true,
          dateOfBirth: true,
          gender: true,
          bloodGroup: true,
          nationality: true,
          religion: true,
          category: true,
          motherTongue: true,
          admissionDate: true,
          previousSchool: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          state: true,
          postalCode: true,
          emergencyContactName: true,
          emergencyContactPhone: true,
          medicalNotes: true,
          allergies: true,
          status: true,
          photoUrl: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      ctx.db.enrollment.findMany({
        orderBy: [{ session: { startsOn: 'desc' } }, { classLevel: { numeric: 'asc' } }],
        select: {
          id: true,
          isCurrent: true,
          rollNumber: true,
          joinedOn: true,
          leftOn: true,
          student: { select: { admissionNo: true, firstName: true, lastName: true } },
          session: { select: { name: true } },
          classLevel: { select: { name: true } },
          section: { select: { name: true } },
        },
      }),
    ])

    addSheet(files, counts, {
      name: 'students',
      headers: [
        'id',
        'admissionNo',
        'firstName',
        'lastName',
        'dateOfBirth',
        'gender',
        'bloodGroup',
        'nationality',
        'religion',
        'category',
        'motherTongue',
        'admissionDate',
        'previousSchool',
        'addressLine1',
        'addressLine2',
        'city',
        'state',
        'postalCode',
        'emergencyContactName',
        'emergencyContactPhone',
        'medicalNotes',
        'allergies',
        'status',
        'photoUrl',
        'createdAt',
        'updatedAt',
      ],
      rows: students.map((row) => [
        row.id,
        row.admissionNo,
        row.firstName,
        row.lastName,
        day(row.dateOfBirth),
        row.gender,
        row.bloodGroup,
        row.nationality,
        row.religion,
        row.category,
        row.motherTongue,
        day(row.admissionDate),
        row.previousSchool,
        row.addressLine1,
        row.addressLine2,
        row.city,
        row.state,
        row.postalCode,
        row.emergencyContactName,
        row.emergencyContactPhone,
        row.medicalNotes,
        row.allergies,
        row.status,
        row.photoUrl,
        stamp(row.createdAt),
        stamp(row.updatedAt),
      ]),
    })
    addSheet(files, counts, {
      name: 'enrollments',
      headers: [
        'id',
        'admissionNo',
        'studentName',
        'session',
        'class',
        'section',
        'rollNumber',
        'isCurrent',
        'joinedOn',
        'leftOn',
      ],
      rows: enrollments.map((row) => [
        row.id,
        row.student.admissionNo,
        `${row.student.firstName} ${row.student.lastName}`.trim(),
        row.session.name,
        row.classLevel.name,
        row.section.name,
        row.rollNumber,
        row.isCurrent ? 'YES' : 'NO',
        day(row.joinedOn),
        day(row.leftOn),
      ]),
    })
    modules.push('students')
  }

  if (ctx.can('parents.export') || ctx.can('parents.view')) {
    const [parents, guardians] = await Promise.all([
      ctx.db.parent.findMany({
        where: { deletedAt: null },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          email: true,
          occupation: true,
          annualIncome: true,
          addressLine1: true,
          city: true,
          state: true,
          postalCode: true,
          createdAt: true,
        },
      }),
      ctx.db.studentGuardian.findMany({
        select: {
          id: true,
          relation: true,
          isPrimary: true,
          canPickup: true,
          isEmergencyContact: true,
          student: { select: { admissionNo: true, firstName: true, lastName: true } },
          parent: { select: { firstName: true, lastName: true, phone: true, email: true } },
        },
      }),
    ])

    addSheet(files, counts, {
      name: 'parents',
      headers: [
        'id',
        'firstName',
        'lastName',
        'phone',
        'email',
        'occupation',
        'annualIncome',
        'addressLine1',
        'city',
        'state',
        'postalCode',
        'createdAt',
      ],
      rows: parents.map((row) => [
        row.id,
        row.firstName,
        row.lastName,
        row.phone,
        row.email,
        row.occupation,
        row.annualIncome,
        row.addressLine1,
        row.city,
        row.state,
        row.postalCode,
        stamp(row.createdAt),
      ]),
    })
    addSheet(files, counts, {
      name: 'guardians',
      headers: [
        'id',
        'admissionNo',
        'studentName',
        'parentName',
        'parentPhone',
        'parentEmail',
        'relation',
        'isPrimary',
        'canPickup',
        'isEmergencyContact',
      ],
      rows: guardians.map((row) => [
        row.id,
        row.student.admissionNo,
        `${row.student.firstName} ${row.student.lastName}`.trim(),
        `${row.parent.firstName} ${row.parent.lastName}`.trim(),
        row.parent.phone,
        row.parent.email,
        row.relation,
        row.isPrimary ? 'YES' : 'NO',
        row.canPickup ? 'YES' : 'NO',
        row.isEmergencyContact ? 'YES' : 'NO',
      ]),
    })
    modules.push('parents')
  }

  if (ctx.can('staff.export') || ctx.can('staff.view')) {
    const includePayroll = ctx.can('staff.payroll')
    const staff = await ctx.db.staff.findMany({
      where: { deletedAt: null },
      orderBy: [{ employeeCode: 'asc' }],
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        staffType: true,
        designation: true,
        department: true,
        qualification: true,
        experienceYears: true,
        dateOfBirth: true,
        gender: true,
        phone: true,
        email: true,
        joinedOn: true,
        leftOn: true,
        salaryMinor: true,
        bankAccount: true,
        addressLine1: true,
        city: true,
        state: true,
        postalCode: true,
        photoUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    addSheet(files, counts, {
      name: 'staff',
      headers: [
        'id',
        'employeeCode',
        'firstName',
        'lastName',
        'staffType',
        'designation',
        'department',
        'qualification',
        'experienceYears',
        'dateOfBirth',
        'gender',
        'phone',
        'email',
        'joinedOn',
        'leftOn',
        ...(includePayroll ? ['salaryAmount', 'bankAccount'] : []),
        'addressLine1',
        'city',
        'state',
        'postalCode',
        'photoUrl',
        'createdAt',
        'updatedAt',
      ],
      rows: staff.map((row) => [
        row.id,
        row.employeeCode,
        row.firstName,
        row.lastName,
        row.staffType,
        row.designation,
        row.department,
        row.qualification,
        row.experienceYears,
        day(row.dateOfBirth),
        row.gender,
        row.phone,
        row.email,
        day(row.joinedOn),
        day(row.leftOn),
        ...(includePayroll ? [money(row.salaryMinor), row.bankAccount] : []),
        row.addressLine1,
        row.city,
        row.state,
        row.postalCode,
        row.photoUrl,
        stamp(row.createdAt),
        stamp(row.updatedAt),
      ]),
    })
    modules.push('staff')
  }

  if (ctx.can('fees.export') || ctx.can('fees.view')) {
    const [
      feeHeads,
      structures,
      structureItems,
      assignments,
      concessions,
      invoices,
      invoiceLines,
      payments,
      allocations,
    ] = await Promise.all([
      ctx.db.feeHead.findMany({
        where: { deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          code: true,
          frequency: true,
          isRefundable: true,
          isDeposit: true,
          sortOrder: true,
        },
      }),
      ctx.db.feeStructure.findMany({
        where: { deletedAt: null },
        orderBy: [{ session: { startsOn: 'desc' } }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          description: true,
          status: true,
          isActive: true,
          publishedAt: true,
          session: { select: { name: true } },
          classLevel: { select: { name: true } },
        },
      }),
      ctx.db.feeStructureItem.findMany({
        orderBy: [{ structure: { name: 'asc' } }, { feeHead: { name: 'asc' } }],
        select: {
          id: true,
          amountMinor: true,
          unitAmountMinor: true,
          frequency: true,
          occurrenceCount: true,
          dueDayOfMonth: true,
          dueOn: true,
          isOptional: true,
          structure: { select: { name: true, session: { select: { name: true } } } },
          feeHead: { select: { name: true, code: true } },
        },
      }),
      ctx.db.studentFeeAssignment.findMany({
        orderBy: [{ student: { admissionNo: 'asc' } }],
        select: {
          id: true,
          status: true,
          assignedAt: true,
          endedAt: true,
          autoGenerateFrom: true,
          autoFeeHeadIds: true,
          notes: true,
          student: { select: { admissionNo: true, firstName: true, lastName: true } },
          session: { select: { name: true } },
          structure: { select: { name: true } },
        },
      }),
      ctx.db.feeConcession.findMany({
        orderBy: [{ student: { admissionNo: 'asc' } }],
        select: {
          id: true,
          name: true,
          kind: true,
          value: true,
          feeHeadId: true,
          reason: true,
          validFrom: true,
          validTo: true,
          createdAt: true,
          student: { select: { admissionNo: true, firstName: true, lastName: true } },
        },
      }),
      ctx.db.feeInvoice.findMany({
        orderBy: [{ issuedOn: 'desc' }, { number: 'asc' }],
        select: {
          id: true,
          number: true,
          title: true,
          status: true,
          issuedOn: true,
          dueOn: true,
          subtotalMinor: true,
          discountMinor: true,
          taxMinor: true,
          lateFeeMinor: true,
          totalMinor: true,
          paidMinor: true,
          balanceMinor: true,
          notes: true,
          sourceKey: true,
          cancelledAt: true,
          sessionId: true,
          student: { select: { admissionNo: true, firstName: true, lastName: true } },
          structure: { select: { name: true } },
        },
      }),
      ctx.db.feeInvoiceLine.findMany({
        orderBy: [{ invoice: { number: 'asc' } }],
        select: {
          id: true,
          label: true,
          amountMinor: true,
          discountMinor: true,
          taxPercent: true,
          invoice: { select: { number: true } },
          feeHead: { select: { name: true, code: true } },
        },
      }),
      ctx.db.feePayment.findMany({
        orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          amountMinor: true,
          currency: true,
          mode: true,
          status: true,
          provider: true,
          providerPaymentId: true,
          reference: true,
          billBookNo: true,
          paidAt: true,
          failedAt: true,
          failureReason: true,
          collectedById: true,
          notes: true,
          createdAt: true,
          student: { select: { admissionNo: true, firstName: true, lastName: true } },
          receipt: { select: { number: true } },
        },
      }),
      ctx.db.feePaymentAllocation.findMany({
        select: {
          id: true,
          amountMinor: true,
          payment: {
            select: {
              id: true,
              student: { select: { admissionNo: true } },
              receipt: { select: { number: true } },
            },
          },
          invoice: { select: { number: true } },
        },
      }),
    ])

    const feeHeadNames = new Map(
      (await ctx.db.feeHead.findMany({ select: { id: true, name: true, code: true } })).map(
        (row) => [row.id, row] as const,
      ),
    )
    const sessionNames = new Map(
      (
        await ctx.db.academicSession.findMany({
          where: { id: { in: [...new Set(invoices.map((row) => row.sessionId))] } },
          select: { id: true, name: true },
        })
      ).map((row) => [row.id, row.name] as const),
    )
    const collectorIds = [...new Set(payments.map((row) => row.collectedById).filter(Boolean))] as string[]
    const collectors = collectorIds.length
      ? await ctx.db.user.findMany({
          where: { id: { in: collectorIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : []
    const collectorById = new Map(collectors.map((row) => [row.id, row]))

    addSheet(files, counts, {
      name: 'fee_heads',
      headers: ['id', 'name', 'code', 'frequency', 'isRefundable', 'isDeposit', 'sortOrder'],
      rows: feeHeads.map((row) => [
        row.id,
        row.name,
        row.code,
        row.frequency,
        row.isRefundable ? 'YES' : 'NO',
        row.isDeposit ? 'YES' : 'NO',
        row.sortOrder,
      ]),
    })
    addSheet(files, counts, {
      name: 'fee_structures',
      headers: [
        'id',
        'session',
        'class',
        'name',
        'description',
        'status',
        'isActive',
        'publishedAt',
      ],
      rows: structures.map((row) => [
        row.id,
        row.session.name,
        row.classLevel?.name ?? '',
        row.name,
        row.description,
        row.status,
        row.isActive ? 'YES' : 'NO',
        stamp(row.publishedAt),
      ]),
    })
    addSheet(files, counts, {
      name: 'fee_structure_items',
      headers: [
        'id',
        'session',
        'structure',
        'feeHead',
        'feeHeadCode',
        'amount',
        'unitAmount',
        'frequency',
        'occurrenceCount',
        'dueDayOfMonth',
        'dueOn',
        'isOptional',
      ],
      rows: structureItems.map((row) => [
        row.id,
        row.structure.session.name,
        row.structure.name,
        row.feeHead.name,
        row.feeHead.code,
        money(row.amountMinor),
        money(row.unitAmountMinor),
        row.frequency,
        row.occurrenceCount,
        row.dueDayOfMonth,
        day(row.dueOn),
        row.isOptional ? 'YES' : 'NO',
      ]),
    })
    addSheet(files, counts, {
      name: 'fee_assignments',
      headers: [
        'id',
        'admissionNo',
        'studentName',
        'session',
        'structure',
        'status',
        'assignedAt',
        'endedAt',
        'autoGenerateFrom',
        'autoFeeHeadIds',
        'notes',
      ],
      rows: assignments.map((row) => [
        row.id,
        row.student.admissionNo,
        `${row.student.firstName} ${row.student.lastName}`.trim(),
        row.session.name,
        row.structure.name,
        row.status,
        stamp(row.assignedAt),
        stamp(row.endedAt),
        day(row.autoGenerateFrom),
        row.autoFeeHeadIds.join('|'),
        row.notes,
      ]),
    })
    addSheet(files, counts, {
      name: 'fee_concessions',
      headers: [
        'id',
        'admissionNo',
        'studentName',
        'name',
        'kind',
        'value',
        'feeHead',
        'feeHeadCode',
        'validFrom',
        'validTo',
        'reason',
        'createdAt',
      ],
      rows: concessions.map((row) => {
        const head = row.feeHeadId ? feeHeadNames.get(row.feeHeadId) : null
        return [
          row.id,
          row.student.admissionNo,
          `${row.student.firstName} ${row.student.lastName}`.trim(),
          row.name,
          row.kind,
          row.kind === 'PERCENT' ? row.value : money(row.value),
          head?.name ?? '',
          head?.code ?? '',
          day(row.validFrom),
          day(row.validTo),
          row.reason,
          stamp(row.createdAt),
        ]
      }),
    })
    addSheet(files, counts, {
      name: 'fee_invoices',
      headers: [
        'id',
        'number',
        'admissionNo',
        'studentName',
        'session',
        'structure',
        'title',
        'status',
        'issuedOn',
        'dueOn',
        'subtotal',
        'discount',
        'tax',
        'lateFee',
        'total',
        'paid',
        'balance',
        'notes',
        'sourceKey',
        'cancelledAt',
      ],
      rows: invoices.map((row) => [
        row.id,
        row.number,
        row.student.admissionNo,
        `${row.student.firstName} ${row.student.lastName}`.trim(),
        sessionNames.get(row.sessionId) ?? '',
        row.structure?.name ?? '',
        row.title,
        row.status,
        day(row.issuedOn),
        day(row.dueOn),
        money(row.subtotalMinor),
        money(row.discountMinor),
        money(row.taxMinor),
        money(row.lateFeeMinor),
        money(row.totalMinor),
        money(row.paidMinor),
        money(row.balanceMinor),
        row.notes,
        row.sourceKey,
        stamp(row.cancelledAt),
      ]),
    })
    addSheet(files, counts, {
      name: 'fee_invoice_lines',
      headers: [
        'id',
        'invoiceNumber',
        'feeHead',
        'feeHeadCode',
        'label',
        'amount',
        'discount',
        'taxPercent',
      ],
      rows: invoiceLines.map((row) => [
        row.id,
        row.invoice.number,
        row.feeHead?.name ?? '',
        row.feeHead?.code ?? '',
        row.label,
        money(row.amountMinor),
        money(row.discountMinor),
        row.taxPercent,
      ]),
    })
    addSheet(files, counts, {
      name: 'fee_payments',
      headers: [
        'id',
        'receiptNumber',
        'admissionNo',
        'studentName',
        'amount',
        'currency',
        'mode',
        'status',
        'provider',
        'providerPaymentId',
        'reference',
        'billBookNo',
        'paidAt',
        'failedAt',
        'failureReason',
        'collectedBy',
        'notes',
        'createdAt',
      ],
      rows: payments.map((row) => {
        const collector = row.collectedById ? collectorById.get(row.collectedById) : null
        return [
          row.id,
          row.receipt?.number ?? '',
          row.student.admissionNo,
          `${row.student.firstName} ${row.student.lastName}`.trim(),
          money(row.amountMinor),
          row.currency,
          row.mode,
          row.status,
          row.provider,
          row.providerPaymentId,
          row.reference,
          row.billBookNo,
          stamp(row.paidAt),
          stamp(row.failedAt),
          row.failureReason,
          collector ? `${collector.firstName} ${collector.lastName}`.trim() : '',
          row.notes,
          stamp(row.createdAt),
        ]
      }),
    })
    addSheet(files, counts, {
      name: 'fee_payment_allocations',
      headers: ['id', 'paymentId', 'receiptNumber', 'admissionNo', 'invoiceNumber', 'amount'],
      rows: allocations.map((row) => [
        row.id,
        row.payment.id,
        row.payment.receipt?.number ?? '',
        row.payment.student.admissionNo,
        row.invoice.number,
        money(row.amountMinor),
      ]),
    })
    modules.push('fees')
  }

  if (ctx.can('attendance.report') || ctx.can('attendance.view')) {
    const [attendance, sections] = await Promise.all([
      ctx.db.studentAttendance.findMany({
        orderBy: [{ onDate: 'desc' }, { student: { admissionNo: 'asc' } }],
        select: {
          id: true,
          onDate: true,
          status: true,
          minutesLate: true,
          remarks: true,
          source: true,
          sectionId: true,
          student: { select: { admissionNo: true, firstName: true, lastName: true } },
        },
      }),
      ctx.db.section.findMany({
        select: {
          id: true,
          name: true,
          classLevel: { select: { name: true } },
        },
      }),
    ])
    const sectionById = new Map(sections.map((row) => [row.id, row]))
    addSheet(files, counts, {
      name: 'student_attendance',
      headers: [
        'id',
        'date',
        'admissionNo',
        'studentName',
        'class',
        'section',
        'status',
        'minutesLate',
        'source',
        'remarks',
      ],
      rows: attendance.map((row) => {
        const section = sectionById.get(row.sectionId)
        return [
          row.id,
          day(row.onDate),
          row.student.admissionNo,
          `${row.student.firstName} ${row.student.lastName}`.trim(),
          section?.classLevel.name ?? '',
          section?.name ?? '',
          row.status,
          row.minutesLate,
          row.source,
          row.remarks,
        ]
      }),
    })
    modules.push('student_attendance')
  }

  if (ctx.can('staff_attendance.view') || ctx.can('staff.export')) {
    const attendance = await ctx.db.staffAttendance.findMany({
      orderBy: [{ onDate: 'desc' }, { staff: { employeeCode: 'asc' } }],
      select: {
        id: true,
        onDate: true,
        status: true,
        checkInAt: true,
        checkOutAt: true,
        source: true,
        remarks: true,
        staff: { select: { employeeCode: true, firstName: true, lastName: true } },
      },
    })
    addSheet(files, counts, {
      name: 'staff_attendance',
      headers: [
        'id',
        'date',
        'employeeCode',
        'staffName',
        'status',
        'checkInAt',
        'checkOutAt',
        'source',
        'remarks',
      ],
      rows: attendance.map((row) => [
        row.id,
        day(row.onDate),
        row.staff.employeeCode,
        `${row.staff.firstName} ${row.staff.lastName}`.trim(),
        row.status,
        stamp(row.checkInAt),
        stamp(row.checkOutAt),
        row.source,
        row.remarks,
      ]),
    })
    modules.push('staff_attendance')
  }

  if (ctx.can('results.export') || ctx.can('exams.view')) {
    const [exams, examSubjects, marks, results] = await Promise.all([
      ctx.db.exam.findMany({
        orderBy: [{ createdAt: 'desc' }],
        select: {
          id: true,
          name: true,
          kind: true,
          status: true,
          startsOn: true,
          endsOn: true,
          weightPercent: true,
          publishedAt: true,
          session: { select: { name: true } },
          classes: { select: { classLevel: { select: { name: true } } } },
        },
      }),
      ctx.db.examSubject.findMany({
        orderBy: [{ examDate: 'asc' }, { classSubject: { subject: { name: 'asc' } } }],
        select: {
          id: true,
          maxMarks: true,
          passMarks: true,
          examDate: true,
          startTime: true,
          endTime: true,
          roomName: true,
          exam: { select: { name: true, session: { select: { name: true } } } },
          classSubject: {
            select: {
              classLevel: { select: { name: true } },
              subject: { select: { name: true, code: true } },
            },
          },
        },
      }),
      ctx.db.mark.findMany({
        orderBy: [{ student: { admissionNo: 'asc' } }],
        select: {
          id: true,
          marksObtained: true,
          isAbsent: true,
          grade: true,
          remarks: true,
          student: { select: { admissionNo: true, firstName: true, lastName: true } },
          examSubject: {
            select: {
              exam: { select: { name: true } },
              classSubject: {
                select: {
                  classLevel: { select: { name: true } },
                  subject: { select: { name: true } },
                },
              },
            },
          },
        },
      }),
      ctx.db.result.findMany({
        orderBy: [{ student: { admissionNo: 'asc' } }],
        select: {
          id: true,
          totalMax: true,
          totalObtained: true,
          percentage: true,
          grade: true,
          rankInClass: true,
          isPass: true,
          teacherRemark: true,
          principalRemark: true,
          publishedAt: true,
          student: { select: { admissionNo: true, firstName: true, lastName: true } },
          exam: { select: { name: true, session: { select: { name: true } } } },
        },
      }),
    ])

    addSheet(files, counts, {
      name: 'exams',
      headers: [
        'id',
        'session',
        'name',
        'kind',
        'status',
        'classes',
        'startsOn',
        'endsOn',
        'weightPercent',
        'publishedAt',
      ],
      rows: exams.map((row) => [
        row.id,
        row.session.name,
        row.name,
        row.kind,
        row.status,
        row.classes.map((item) => item.classLevel.name).join('|'),
        day(row.startsOn),
        day(row.endsOn),
        row.weightPercent,
        stamp(row.publishedAt),
      ]),
    })
    addSheet(files, counts, {
      name: 'exam_subjects',
      headers: [
        'id',
        'session',
        'exam',
        'class',
        'subject',
        'subjectCode',
        'maxMarks',
        'passMarks',
        'examDate',
        'startTime',
        'endTime',
        'roomName',
      ],
      rows: examSubjects.map((row) => [
        row.id,
        row.exam.session.name,
        row.exam.name,
        row.classSubject.classLevel.name,
        row.classSubject.subject.name,
        row.classSubject.subject.code,
        row.maxMarks,
        row.passMarks,
        day(row.examDate),
        row.startTime,
        row.endTime,
        row.roomName,
      ]),
    })
    addSheet(files, counts, {
      name: 'marks',
      headers: [
        'id',
        'exam',
        'class',
        'subject',
        'admissionNo',
        'studentName',
        'marksObtained',
        'isAbsent',
        'grade',
        'remarks',
      ],
      rows: marks.map((row) => [
        row.id,
        row.examSubject.exam.name,
        row.examSubject.classSubject.classLevel.name,
        row.examSubject.classSubject.subject.name,
        row.student.admissionNo,
        `${row.student.firstName} ${row.student.lastName}`.trim(),
        row.marksObtained,
        row.isAbsent ? 'YES' : 'NO',
        row.grade,
        row.remarks,
      ]),
    })
    addSheet(files, counts, {
      name: 'results',
      headers: [
        'id',
        'session',
        'exam',
        'admissionNo',
        'studentName',
        'totalMax',
        'totalObtained',
        'percentage',
        'grade',
        'rankInClass',
        'isPass',
        'teacherRemark',
        'principalRemark',
        'publishedAt',
      ],
      rows: results.map((row) => [
        row.id,
        row.exam.session.name,
        row.exam.name,
        row.student.admissionNo,
        `${row.student.firstName} ${row.student.lastName}`.trim(),
        row.totalMax,
        row.totalObtained,
        row.percentage,
        row.grade,
        row.rankInClass,
        row.isPass ? 'YES' : 'NO',
        row.teacherRemark,
        row.principalRemark,
        stamp(row.publishedAt),
      ]),
    })
    modules.push('exams')
  }

  if (ctx.can('transport.view') || ctx.can('transport.manage')) {
    const [buses, routes, stops, assignments] = await Promise.all([
      ctx.db.bus.findMany({
        where: { deletedAt: null },
        orderBy: { code: 'asc' },
        select: {
          id: true,
          code: true,
          registrationNo: true,
          model: true,
          capacity: true,
          attendantName: true,
          isActive: true,
          driver: { select: { employeeCode: true, firstName: true, lastName: true } },
        },
      }),
      ctx.db.route.findMany({
        where: { deletedAt: null },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          code: true,
          distanceKm: true,
          isActive: true,
          bus: { select: { code: true, registrationNo: true } },
        },
      }),
      ctx.db.busStop.findMany({
        orderBy: [{ route: { name: 'asc' } }, { sortOrder: 'asc' }],
        select: {
          id: true,
          name: true,
          sortOrder: true,
          pickupTime: true,
          dropTime: true,
          fareMinor: true,
          route: { select: { name: true, code: true } },
        },
      }),
      ctx.db.transportAssignment.findMany({
        where: { isActive: true },
        orderBy: [{ student: { admissionNo: 'asc' } }],
        select: {
          id: true,
          direction: true,
          isActive: true,
          startedOn: true,
          endedOn: true,
          student: { select: { admissionNo: true, firstName: true, lastName: true } },
          route: { select: { name: true, code: true } },
          stop: { select: { name: true } },
          bus: { select: { code: true } },
        },
      }),
    ])

    addSheet(files, counts, {
      name: 'transport_buses',
      headers: [
        'id',
        'code',
        'registrationNo',
        'model',
        'capacity',
        'attendantName',
        'isActive',
        'driverCode',
        'driverName',
      ],
      rows: buses.map((row) => [
        row.id,
        row.code,
        row.registrationNo,
        row.model,
        row.capacity,
        row.attendantName,
        row.isActive ? 'YES' : 'NO',
        row.driver?.employeeCode ?? '',
        row.driver ? `${row.driver.firstName} ${row.driver.lastName}`.trim() : '',
      ]),
    })
    addSheet(files, counts, {
      name: 'transport_routes',
      headers: ['id', 'name', 'code', 'distanceKm', 'isActive', 'busCode', 'busRegistration'],
      rows: routes.map((row) => [
        row.id,
        row.name,
        row.code,
        row.distanceKm,
        row.isActive ? 'YES' : 'NO',
        row.bus?.code ?? '',
        row.bus?.registrationNo ?? '',
      ]),
    })
    addSheet(files, counts, {
      name: 'transport_stops',
      headers: [
        'id',
        'route',
        'routeCode',
        'name',
        'sortOrder',
        'pickupTime',
        'dropTime',
        'fare',
      ],
      rows: stops.map((row) => [
        row.id,
        row.route.name,
        row.route.code,
        row.name,
        row.sortOrder,
        row.pickupTime,
        row.dropTime,
        money(row.fareMinor),
      ]),
    })
    addSheet(files, counts, {
      name: 'transport_assignments',
      headers: [
        'id',
        'admissionNo',
        'studentName',
        'route',
        'routeCode',
        'stop',
        'busCode',
        'direction',
        'isActive',
        'startedOn',
        'endedOn',
      ],
      rows: assignments.map((row) => [
        row.id,
        row.student.admissionNo,
        `${row.student.firstName} ${row.student.lastName}`.trim(),
        row.route.name,
        row.route.code,
        row.stop.name,
        row.bus?.code ?? '',
        row.direction,
        row.isActive ? 'YES' : 'NO',
        day(row.startedOn),
        day(row.endedOn),
      ]),
    })
    modules.push('transport')
  }

  addSheet(files, counts, {
    name: 'manifest',
    headers: ['key', 'value'],
    rows: [
      ['tenantId', ctx.tenant.id],
      ['schoolName', school?.name ?? ctx.tenant.name],
      ['schoolCode', school?.code ?? ''],
      ['generatedAt', generatedAt.toISOString()],
      ['generatedBy', `${ctx.user.firstName} ${ctx.user.lastName}`.trim()],
      ['generatedByEmail', ctx.user.email ?? ''],
      ['modules', modules.join('|')],
      ...Object.entries(counts).map(([name, count]) => [`rows.${name}`, String(count)]),
    ],
  })

  const code = (school?.code || ctx.tenant.slug || 'school')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
  const filename = `${code}-full-export-${day(generatedAt).replaceAll('-', '')}.zip`
  const bytes = zipSync(files, { level: 6 })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'settings.data_export',
    module: 'settings',
    entityType: 'School',
    entityId: school?.id ?? ctx.tenant.id,
    summary: `Downloaded full school data export (${modules.join(', ')})`,
    after: { modules, counts, filename },
  })

  return { filename, bytes, counts, modules }
}

export function describeSchoolDataExport(ctx: AppContext) {
  ctx.require('settings.export')
  return {
    modules: [
      { key: 'structure', label: 'Sessions, classes, sections and subjects', included: true },
      {
        key: 'students',
        label: 'Students and enrollments',
        included: ctx.can('students.export') || ctx.can('students.view'),
      },
      {
        key: 'parents',
        label: 'Parents and guardian links',
        included: ctx.can('parents.export') || ctx.can('parents.view'),
      },
      {
        key: 'staff',
        label: 'Staff directory',
        included: ctx.can('staff.export') || ctx.can('staff.view'),
      },
      {
        key: 'fees',
        label: 'Fee heads, structures, invoices, payments and concessions',
        included: ctx.can('fees.export') || ctx.can('fees.view'),
      },
      {
        key: 'attendance',
        label: 'Student and staff attendance',
        included:
          ctx.can('attendance.report') ||
          ctx.can('attendance.view') ||
          ctx.can('staff_attendance.view'),
      },
      {
        key: 'exams',
        label: 'Exams, marks and results',
        included: ctx.can('results.export') || ctx.can('exams.view'),
      },
      {
        key: 'transport',
        label: 'Buses, routes, stops and assignments',
        included: ctx.can('transport.view') || ctx.can('transport.manage'),
      },
    ],
  }
}
