import type { ReactNode } from 'react'
import { requireContext } from '@/server/context'
import { ensureExamDefaults } from '@/server/modules/exams/defaults'

/** Every examination route gets grading scales, certificate templates and report card defaults. */
export default async function ExamsLayout({ children }: { children: ReactNode }) {
  const ctx = await requireContext()
  await ensureExamDefaults(ctx.db, ctx.tenant.id)
  return children
}
