import type { Metadata } from 'next'
import { lookupUnsubscribe } from '@/server/modules/platform/mail/campaigns'
import { UnsubscribeForm } from './unsubscribe-form'

export const metadata: Metadata = {
  title: 'Unsubscribe',
  robots: { index: false, follow: false },
}

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams
  const target = t ? await lookupUnsubscribe(t) : null

  return (
    <div className="grid min-h-dvh place-items-center bg-[#f4f5f8] px-4 py-10">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border-t-4 border-[#f45a1e] bg-white shadow-[0_10px_40px_rgba(0,32,70,0.10)]">
        <div className="border-b border-[#eceef3] px-8 py-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/mycampusview-lockup-dark.png" alt="MyCampusView" className="h-8 w-auto" />
        </div>
        <div className="px-8 py-8">
          {!target ? (
            <>
              <h1 className="text-xl font-semibold text-[#0a1024]">This link is not valid</h1>
              <p className="mt-2 text-[15px] leading-6 text-[#3d4759]">
                It may be incomplete. To stop receiving emails from MyCampusView, reply to any of our emails with
                “Unsubscribe”, or write to{' '}
                <a href="mailto:contact@mycampusview.com" className="font-medium text-[#002046] underline">
                  contact@mycampusview.com
                </a>
                .
              </p>
            </>
          ) : (
            <UnsubscribeForm
              token={t!}
              email={target.email}
              schoolName={target.schoolName}
              alreadyDone={!!target.unsubscribedAt}
            />
          )}
        </div>
      </div>
    </div>
  )
}
