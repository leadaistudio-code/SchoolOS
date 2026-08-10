import { requireContext } from '@/server/context'
import { getClassTree } from '@/server/modules/academics/service'
import { PageHeader } from '@/components/page-header'
import { NoticeForm } from './notice-form'

export const metadata = { title: 'Post a notice' }

export default async function NewNoticePage() {
  const ctx = await requireContext('notices.create')
  const classes = await getClassTree(ctx)

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Post a notice"
      />
      <NoticeForm
        classes={classes.map((c) => ({
          id: c.id,
          name: c.name,
          sections: c.sections.map((s) => ({ id: s.id, name: s.name })),
        }))}
      />
    </div>
  )
}
