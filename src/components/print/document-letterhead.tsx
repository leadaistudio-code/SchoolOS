import type { ReactNode } from 'react'
import { resolveBrandingAssetUrl } from '@/server/branding-assets'

/**
 * Shared print letterhead for receipts, certificates, admit cards and papers.
 *
 * When the school uploads header/footer letterhead images under Branding, every
 * document uses those images. Otherwise we fall back to the school logo + name
 * (and optional text footer) so documents still look branded.
 */
export function DocumentLetterhead({
  schoolName,
  schoolAddress,
  logoUrl,
  letterheadHeaderUrl,
  letterheadFooterUrl,
  footerText,
  signatureUrl,
  children,
  className,
}: {
  schoolName: string
  schoolAddress?: string | null
  logoUrl?: string | null
  letterheadHeaderUrl?: string | null
  letterheadFooterUrl?: string | null
  footerText?: string | null
  signatureUrl?: string | null
  children: ReactNode
  className?: string
}) {
  const headerUrl = resolveBrandingAssetUrl(letterheadHeaderUrl, 'letterheadHeader')
  const footerUrl = resolveBrandingAssetUrl(letterheadFooterUrl, 'letterheadFooter')
  const logo = resolveBrandingAssetUrl(logoUrl, 'logo')
  const signature = resolveBrandingAssetUrl(signatureUrl, 'signature')

  return (
    <article
      className={
        className ??
        'border border-line bg-surface overflow-hidden print:border-0 print:shadow-none'
      }
    >
      {headerUrl ? (
        <div className="letterhead-header w-full border-b border-line bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={headerUrl}
            alt=""
            className="block w-full h-auto max-h-[42mm] object-contain object-top"
          />
        </div>
      ) : (
        <header className="flex items-start gap-3 border-b border-line px-5 py-4 sm:px-8">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" className="size-12 rounded object-contain shrink-0" />
          ) : null}
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-ink leading-tight">{schoolName}</h1>
            {schoolAddress ? (
              <p className="mt-1 text-sm text-ink-muted whitespace-pre-line">{schoolAddress}</p>
            ) : null}
          </div>
        </header>
      )}

      <div className="px-5 py-5 sm:px-8 sm:py-6 print:px-6 print:py-4">{children}</div>

      {footerUrl ? (
        <div className="letterhead-footer w-full border-t border-line bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={footerUrl}
            alt=""
            className="block w-full h-auto max-h-[28mm] object-contain object-bottom"
          />
        </div>
      ) : (
        <footer className="border-t border-line px-5 py-3 sm:px-8 text-xs text-ink-subtle flex flex-wrap items-end justify-between gap-3">
          <p className="max-w-prose">
            {footerText ||
              'This is a computer-generated document and is valid without a physical signature.'}
          </p>
          {signature ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={signature} alt="" className="h-12 w-auto object-contain" />
          ) : null}
        </footer>
      )}
    </article>
  )
}
