import { requireContext } from '@/server/context'
import { getTeacherRefreshConfig } from '@/server/modules/teacher-refresh/config.service'
import { PageHeader } from '@/components/page-header'
import { TeacherRefreshSettingsForm } from './settings-form'

export const metadata = { title: 'Teacher knowledge refresh' }

/**
 * The school's knowledge-refresh policy.
 *
 * Framed throughout as professional development, not assessment: the copy here
 * and on every screen it drives avoids pass/fail language on purpose, because a
 * teacher who reads this as surveillance will disengage from the thing meant to
 * help them. The settings are a light touch — how often, how many questions,
 * where the "ready" line sits — and nothing here feeds an employment decision.
 */
export default async function TeacherRefreshSettingsPage() {
  const ctx = await requireContext('teacher_refresh.configure')
  const config = await getTeacherRefreshConfig(ctx)

  return (
    <div>
      <PageHeader
        title="Teacher knowledge refresh"
        description="Continuous professional development for teaching staff — private to each teacher and their school"
        breadcrumbs={[{ label: 'Settings', href: '/settings' }, { label: 'Teacher knowledge refresh' }]}
      />

      <TeacherRefreshSettingsForm
        initial={{
          enabled: config.enabled,
          frequency: config.frequency,
          weeklyQuestionCount: config.weeklyQuestionCount,
          monthlyQuestionCount: config.monthlyQuestionCount,
          passingThreshold: config.passingThreshold,
          maxAttempts: config.maxAttempts,
          preLectureEnabled: config.preLectureEnabled,
          preLectureCount: config.preLectureCount,
          completionWindowHours: config.completionWindowHours,
        }}
      />
    </div>
  )
}
