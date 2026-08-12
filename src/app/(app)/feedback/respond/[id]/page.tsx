import { notFound } from 'next/navigation'
import { requireContext } from '@/server/context'
import { pendingForCurrentUser } from '@/server/modules/feedback/service'
import { FeedbackForm } from '../../feedback-form'
export const metadata = { title: 'Give feedback' }
export default async function RespondPage({ params }: { params: Promise<{ id: string }> }) { const ctx = await requireContext('feedback.submit'); const { id } = await params; const assignment = (await pendingForCurrentUser(ctx)).find((item) => item.id === id); if (!assignment) notFound(); return <div className="mx-auto max-w-2xl"><FeedbackForm assignment={assignment} /></div> }
