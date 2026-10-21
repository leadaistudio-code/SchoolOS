'use client'

import * as React from 'react'
import { KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { issueStudentLoginAction } from './login-actions'

type Issued = { username: string; password: string; expiresAt: string; created: boolean }

export function StudentLoginButton({
  studentId,
  name,
  hasLogin,
}: {
  studentId: string
  name: string
  hasLogin: boolean
}) {
  const toast = useToast()
  const [pending, startTransition] = React.useTransition()
  const [confirming, setConfirming] = React.useState(false)
  const [issued, setIssued] = React.useState<Issued | null>(null)
  const [copied, setCopied] = React.useState(false)

  const issue = () =>
    startTransition(async () => {
      const result = await issueStudentLoginAction(studentId)
      setConfirming(false)
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not issue a login', description: result.message })
        return
      }
      // Held in component state only; the server kept a bcrypt digest.
      setIssued(result)
      setCopied(false)
    })

  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        loading={pending}
        onClick={() => (hasLogin ? setConfirming(true) : issue())}
        title="Create a sign-in for the student, using their admission number"
      >
        <KeyRound aria-hidden />
        {hasLogin ? 'Reset student login' : 'Issue student login'}
      </Button>

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Reset ${name}’s login?`}
        description="A new temporary password replaces the current one, and every device signed in to this account is signed out."
        footer={
          <>
            <Button onClick={issue} loading={pending}>Reset password</Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
          </>
        }
      >
        <p className="text-sm text-ink-muted">Their Tapasya history, XP and other records are not affected.</p>
      </Dialog>

      <Dialog
        open={!!issued}
        onClose={() => setIssued(null)}
        title={issued?.created ? `Student login created for ${name}` : `New password for ${name}`}
        description="Hand this over now. The password cannot be shown again."
        footer={<Button onClick={() => setIssued(null)}>Done</Button>}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-sm">
            <span className="text-ink-muted">Username</span>
            <code className="rounded-[var(--radius-sm)] bg-surface-2 border border-line px-3 py-2 font-semibold text-ink select-all">
              {issued?.username}
            </code>
            <span className="text-ink-muted">Password</span>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-[var(--radius-sm)] bg-surface-2 border border-line px-3 py-2 text-lg font-semibold tracking-wide text-ink select-all">
                {issued?.password}
              </code>
              <Button
                variant="secondary"
                onClick={() => {
                  if (!issued) return
                  void navigator.clipboard.writeText(`Username: ${issued.username}\nPassword: ${issued.password}`)
                  setCopied(true)
                }}
              >
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </div>
          <ul className="text-xs text-ink-muted space-y-1 list-disc pl-4">
            <li>
              Expires {issued ? new Date(issued.expiresAt).toLocaleString() : 'in 24 hours'} if not used.
            </li>
            <li>The student signs in on the web or the app with their admission number, then chooses their own password.</li>
          </ul>
        </div>
      </Dialog>
    </>
  )
}
