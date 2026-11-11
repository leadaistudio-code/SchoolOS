import { Bot, BrainCircuit, ListChecks, PlayCircle } from 'lucide-react'
import { requireContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'

export const metadata = { title: 'Robotics & AI courses' }

const POINTS = [
  { icon: Bot, title: 'Ready-made robotics and AI courses', text: 'A growing library built by MyCampusView, from first circuits to machine learning.' },
  { icon: PlayCircle, title: 'Self-paced video lessons', text: 'Students learn at their own pace with videos, notes, code and projects.' },
  { icon: ListChecks, title: 'Quizzes and progress', text: 'Auto-marked quizzes and a progress view for every class and student.' },
  { icon: BrainCircuit, title: 'Your own courses too', text: 'Teachers can build school-only courses alongside the library.' },
]

export default async function LmsUpgradePage() {
  await requireContext()
  return (
    <div className="space-y-4 max-w-3xl">
      <PageHeader title="Robotics & AI courses" description="An add-on for your school" />
      <Card>
        <CardContent className="space-y-5">
          <p className="text-base text-ink">
            Robotics &amp; AI courses are not switched on for your school yet. Contact your MyCampusView account manager to add them.
          </p>
          <ul className="grid gap-4 sm:grid-cols-2">
            {POINTS.map((p) => (
              <li key={p.title} className="flex gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--brand-50)] text-[var(--brand-600)]">
                  <p.icon className="size-5" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-semibold text-ink">{p.title}</p>
                  <p className="text-sm text-ink-muted">{p.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
