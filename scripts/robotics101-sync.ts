/**
 * Upgrades the Robotics 101 catalogue course to the 15-lesson interactive
 * curriculum in src/lib/lms/robotics101. Idempotent and non-destructive:
 *
 * - the course row (id, title, description, price, URLs) is not touched;
 * - existing modules and lessons are reused, so ids and learner progress stay;
 * - lessons the new curriculum does not use are archived, never deleted;
 * - a lesson's contentVersion goes up only when its content actually changes;
 * - videos are marked ready only when the render manifest says they passed
 *   the ffprobe check (scripts/robotics101-videos.ts --render).
 *
 *   npx tsx scripts/robotics101-sync.ts            dry run: prints the plan
 *   npx tsx scripts/robotics101-sync.ts --apply    applies it to the local database
 *
 * A non-local database also needs --remote and R101_SYNC_CONFIRM=<course id>.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { Prisma, PrismaClient } from '@prisma/client'
import { COURSE_TITLE, MODULES } from '../src/lib/lms/robotics101'
import { lessonFields, planSync, type MediaManifest } from '../src/lib/lms/robotics101/plan'

const apply = process.argv.includes('--apply')
const remote = process.argv.includes('--remote')
const url = process.env.DATABASE_URL ?? ''
const local = /@(localhost|127\.0\.0\.1|host\.docker\.internal)[:/]/.test(url)

async function main() {
  if (!local && !remote) throw new Error('DATABASE_URL is not local. Pass --remote (and R101_SYNC_CONFIRM=<course id>) to run against it.')
  const prisma = new PrismaClient()
  try {
    const course = await prisma.lmsCourse.findFirst({ where: { tenantId: null, title: COURSE_TITLE, deletedAt: null }, select: { id: true, title: true } })
    if (!course) throw new Error(`Catalogue course "${COURSE_TITLE}" not found`)
    if (!local && process.env.R101_SYNC_CONFIRM !== course.id) throw new Error(`Remote database: set R101_SYNC_CONFIRM=${course.id} to confirm`)

    const manifestFile = path.join(__dirname, '../public/lms-media/robotics-101/video/manifest.json')
    const manifest: MediaManifest = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, 'utf8')) : { videos: {} }

    const modules = await prisma.lmsModule.findMany({ where: { courseId: course.id }, orderBy: { position: 'asc' }, select: { id: true, title: true, position: true } })
    const lessons = await prisma.lmsLesson.findMany({
      where: { courseId: course.id },
      orderBy: [{ moduleId: 'asc' }, { position: 'asc' }],
      select: { id: true, title: true, slug: true, moduleId: true, archivedAt: true, content: true, contentVersion: true },
    })
    const progress = await prisma.lmsLessonProgress.groupBy({ by: ['lessonId'], where: { lesson: { courseId: course.id } }, _count: { _all: true } })
    const learners = new Map(progress.map((p) => [p.lessonId, p._count._all]))

    const plan = planSync(modules, lessons, manifest)
    console.log(`Course ${course.id}: ${course.title}`)
    console.log(`Modules:`)
    for (const m of plan.moduleOps) console.log(`  ${m.position}. ${m.title}  ${m.existingId ? `(reuses ${m.existingId})` : '(new)'}`)
    console.log(`Lessons:`)
    for (const l of plan.lessonOps) {
      const from = l.existingId ? lessons.find((x) => x.id === l.existingId) : null
      const note = from ? `reuses "${from.title}" ${from.id}, ${learners.get(from.id) ?? 0} progress row(s)` : 'new'
      console.log(`  [${l.moduleKey}] ${l.def.title}  (${note})${l.contentChanged ? '' : ', unchanged'}  video: ${l.content.video?.status ?? 'none'}`)
    }
    for (const id of plan.archive) {
      const l = lessons.find((x) => x.id === id)!
      console.log(`  archive: "${l.title}" ${id}  (${learners.get(id) ?? 0} progress row(s) kept)`)
    }
    const ready = plan.lessonOps.filter((l) => l.content.video?.status === 'ready').length
    console.log(`Videos ready: ${ready} of ${plan.lessonOps.filter((l) => l.content.video).length}`)

    if (!apply) {
      console.log('\nDry run. Re-run with --apply to write these changes.')
      return
    }

    await prisma.$transaction(
      async (tx) => {
        const moduleIds = new Map<string, string>()
        for (const m of plan.moduleOps) {
          const data = { title: m.title, summary: m.summary, position: m.position }
          const id = m.existingId
            ? (await tx.lmsModule.update({ where: { id: m.existingId }, data, select: { id: true } })).id
            : (await tx.lmsModule.create({ data: { ...data, tenantId: null, courseId: course.id }, select: { id: true } })).id
          moduleIds.set(m.key, id)
        }
        for (const [i, id] of plan.unusedModules.entries()) {
          await tx.lmsModule.update({ where: { id }, data: { position: 100 + i } })
        }
        // Slugs are unique per course: clear them on rows being archived first.
        for (const [i, id] of plan.archive.entries()) {
          await tx.lmsLesson.update({ where: { id }, data: { archivedAt: new Date(), position: 1000 + i, slug: null } })
        }
        for (const l of plan.lessonOps) {
          const current = l.existingId ? lessons.find((x) => x.id === l.existingId) : null
          const data = {
            ...lessonFields(l.def),
            moduleId: moduleIds.get(l.moduleKey)!,
            position: l.position,
            archivedAt: null,
            quiz: l.def.quiz ? (l.def.quiz as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
            content: l.content as unknown as Prisma.InputJsonValue,
            ...(current && l.contentChanged ? { contentVersion: current.contentVersion + 1 } : {}),
          }
          if (current) await tx.lmsLesson.update({ where: { id: current.id }, data })
          else await tx.lmsLesson.create({ data: { ...data, tenantId: null, courseId: course.id } })
        }
      },
      { timeout: 60_000 },
    )
    const after = await prisma.lmsLesson.count({ where: { courseId: course.id, archivedAt: null } })
    const kept = await prisma.lmsLessonProgress.count({ where: { lesson: { courseId: course.id } } })
    console.log(`\nApplied. Active lessons: ${after} (expected ${MODULES.flatMap((m) => m.lessons).length}). Progress rows kept: ${kept}.`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
