import Link from 'next/link'
import { requireContext } from '@/server/context'
import {
  getSessionStructure,
  listPromotionSessions,
} from '@/server/modules/students/promotion'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { buttonVariants } from '@/components/ui/button-variants'
import { PromotionPlanner } from './promotion-planner'

export const metadata = { title: 'Promotions' }

export default async function PromotionsPage() {
  const ctx = await requireContext('students.promote')

  const sessions = await listPromotionSessions(ctx)

  // The class lists for every session are fetched up front. A school has a
  // handful of sessions and a few dozen classes between them, and loading it
  // in one pass means changing the class in the picker is instant rather than
  // a round trip in the middle of a decision.
  const structures = await Promise.all(
    sessions.map(async (session) => [session.id, await getSessionStructure(ctx, session.id)] as const),
  )

  const classesBySession = Object.fromEntries(
    structures.map(([sessionId, classes]) => [
      sessionId,
      classes.map((c) => ({
        id: c.id,
        name: c.name,
        numeric: c.numeric,
        sections: c.sections.map((s) => ({ id: s.id, name: s.name })),
      })),
    ]),
  )

  const current = sessions.find((s) => s.isCurrent) ?? null

  return (
    <div>
      <PageHeader
        title="Promotions"
        description={
          current
            ? `Current session ${current.name}. Promotion writes next year's placement and leaves this year's record untouched.`
            : 'No session is marked current yet.'
        }
        breadcrumbs={[{ label: 'Students', href: '/students' }, { label: 'Promotions' }]}
      />

      {sessions.length < 2 ? (
        <Card>
          <CardContent>
            <EmptyState
              title="There is only one academic session"
              description="Promotion moves students from one session into the next, so the session they are moving into has to exist — with its classes and sections — before anyone can be promoted."
              action={
                <Link
                  href="/settings/sessions"
                  className={buttonVariants({ size: 'sm' })}
                >
                  Set up the next session
                </Link>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <PromotionPlanner
          sessions={sessions}
          currentSessionId={current?.id ?? null}
          classesBySession={classesBySession}
          currency={ctx.tenant.currency}
        />
      )}
    </div>
  )
}
