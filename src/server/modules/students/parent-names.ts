import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { notFound } from '@/server/api/response'
import { assertStudentAccess } from '@/server/scope'
import { splitPersonName } from '@/lib/person-name'

type Link = {
  id: string
  relation: string
  isPrimary: boolean
  parent: { id: string; firstName: string; lastName: string }
}

const nameOf = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`.trim()

/**
 * The father's link, or failing that the guardian the school already recorded
 * (imports usually tag the father as a plain GUARDIAN). The mother is never
 * taken for the father.
 */
function fatherLink(links: Link[]): Link | undefined {
  const others = links.filter((l) => l.relation === 'GUARDIAN' || l.relation === 'OTHER')
  return links.find((l) => l.relation === 'FATHER') ?? others.find((l) => l.isPrimary) ?? others[0]
}

/** Names shown in the edit form: father defaults to the recorded guardian. */
export function parentNamesFor(links: Link[]) {
  const father = fatherLink(links)
  const mother = links.find((l) => l.relation === 'MOTHER')
  return {
    fatherName: father ? nameOf(father.parent) : '',
    motherName: mother ? nameOf(mother.parent) : '',
  }
}

/**
 * Saves the father's and mother's names from the student edit form.
 *
 * Names are written onto the existing parent records (so siblings sharing a
 * parent stay in step) and the guardian used for the father is re-tagged as
 * FATHER. A blank field leaves the existing parent untouched — unlinking a
 * parent is a separate, deliberate action.
 */
export async function saveStudentParentNames(
  ctx: AppContext,
  studentId: string,
  input: { fatherName?: string; motherName?: string },
) {
  ctx.require('students.edit')
  await assertStudentAccess(ctx, studentId)

  const student = await ctx.db.student.findFirst({
    where: { id: studentId, deletedAt: null },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      guardians: {
        select: { id: true, relation: true, isPrimary: true, parent: { select: { id: true, firstName: true, lastName: true } } },
      },
    },
  })
  if (!student) throw notFound('Student')

  const links = student.guardians as Link[]
  const before = parentNamesFor(links)
  const changes: string[] = []

  await ctx.db.$transaction(async (tx) => {
    const apply = async (relation: 'FATHER' | 'MOTHER', raw: string | undefined, target: Link | undefined) => {
      const full = (raw ?? '').trim().replace(/\s+/g, ' ').slice(0, 160)
      if (!full) return
      const { firstName, lastName } = splitPersonName(full)
      if (target) {
        if (nameOf(target.parent) !== full) {
          await tx.parent.update({ where: { id: target.parent.id }, data: { firstName, lastName } })
          changes.push(`${relation.toLowerCase()} name → ${full}`)
        }
        if (target.relation !== relation) {
          await tx.studentGuardian.update({ where: { id: target.id }, data: { relation } })
          changes.push(`${nameOf(target.parent)} tagged as ${relation.toLowerCase()}`)
        }
        return
      }
      const parent = await tx.parent.create({ data: { tenantId: ctx.tenant.id, firstName, lastName } })
      await tx.studentGuardian.create({
        data: { tenantId: ctx.tenant.id, studentId, parentId: parent.id, relation, isPrimary: links.length === 0 && relation === 'FATHER' },
      })
      changes.push(`added ${relation.toLowerCase()} ${full}`)
    }

    await apply('FATHER', input.fatherName, fatherLink(links))
    await apply('MOTHER', input.motherName, links.find((l) => l.relation === 'MOTHER'))
  })

  if (changes.length) {
    await audit({
      tenantId: ctx.tenant.id,
      actorId: ctx.user.userId,
      actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
      action: 'student.parents.update',
      module: 'students',
      entityType: 'Student',
      entityId: studentId,
      summary: `Updated parents of ${student.firstName} ${student.lastName}: ${changes.join('; ')}`.trim(),
      before,
      after: { fatherName: input.fatherName ?? before.fatherName, motherName: input.motherName ?? before.motherName },
    })
  }
}
