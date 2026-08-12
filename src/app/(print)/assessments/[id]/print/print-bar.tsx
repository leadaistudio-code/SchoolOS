'use client'

import Link from 'next/link'

/**
 * The controls, which are the one part of this page that must never print.
 *
 * "Export to PDF" is the browser's own print dialogue rather than a server-side
 * renderer: the paper is already laid out for A4 here, every browser can write
 * that to PDF, and adding a headless-Chrome service to produce the same bytes
 * would be a deployment to maintain for no gain a teacher can see.
 */
export function PrintBar({
  assessmentId,
  mode,
}: {
  assessmentId: string
  mode: 'paper' | 'with-key' | 'key-only'
}) {
  const tabs = [
    { key: 'paper', label: 'Question paper', href: `/assessments/${assessmentId}/print` },
    { key: 'with-key', label: 'Paper + answer key', href: `/assessments/${assessmentId}/print?key=1` },
    { key: 'key-only', label: 'Answer key only', href: `/assessments/${assessmentId}/print?key=only` },
  ] as const

  return (
    <div className="no-print mb-6 flex flex-wrap items-center gap-2 border-b border-neutral-300 pb-4">
      <Link
        href={`/assessments/${assessmentId}`}
        className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100"
      >
        ← Back to the paper
      </Link>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={mode === tab.key ? 'page' : undefined}
            className={
              mode === tab.key
                ? 'rounded bg-neutral-900 px-3 py-1.5 text-sm text-white'
                : 'rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100'
            }
          >
            {tab.label}
          </Link>
        ))}

        <button
          type="button"
          onClick={() => window.print()}
          className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
        >
          Print or save as PDF
        </button>
      </div>
    </div>
  )
}
