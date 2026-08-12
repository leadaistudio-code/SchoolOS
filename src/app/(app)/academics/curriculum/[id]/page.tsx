import { requireContext } from '@/server/context'
import { getCurriculum } from '@/server/modules/curriculum/service'
import { PageHeader } from '@/components/page-header'
import { SyllabusEditor } from './editor'

export const metadata = { title: 'Syllabus' }

export default async function CurriculumDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const ctx = await requireContext('curriculum.view')
  const curriculum = await getCurriculum(ctx, id)

  const chapters = curriculum.chapters.length
  const topics = curriculum.chapters.reduce((sum, c) => sum + c.topics.length, 0)

  return (
    <div>
      <PageHeader
        title={curriculum.title ?? curriculum.classSubject.subject.name}
        description={`${curriculum.classSubject.classLevel.name} · ${curriculum.classSubject.subject.name} · ${chapters} chapters, ${topics} topics`}
        breadcrumbs={[
          { label: 'Academics', href: '/academics/classes' },
          { label: 'Syllabus', href: '/academics/curriculum' },
          { label: curriculum.classSubject.subject.name },
        ]}
      />

      <SyllabusEditor
        curriculum={curriculum}
        canManage={ctx.can('curriculum.manage')}
      />
    </div>
  )
}
