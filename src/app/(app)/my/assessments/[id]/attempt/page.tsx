import { requireContext } from '@/server/context'
import { startAttempt } from '@/server/modules/assessments/attempts'
import { AttemptRunner } from './runner'

export const metadata = { title: 'Test' }

/**
 * Opening the paper is a write, so it happens here rather than in the client.
 *
 * The attempt row — and with it the clock — starts the moment this page is
 * rendered, not when the browser finishes loading a script. A slow phone
 * therefore costs the student nothing.
 */
export default async function AttemptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireContext('assessments.attempt')
  const paper = await startAttempt(ctx, id)

  return <AttemptRunner paper={paper} />
}
