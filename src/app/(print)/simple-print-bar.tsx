'use client'

import Link from 'next/link'

export function SimplePrintBar({ backHref, backLabel }: { backHref: string; backLabel: string }) {
  return (
    <div className="no-print mb-6 flex flex-wrap items-center gap-2 border-b border-neutral-300 pb-4">
      <Link
        href={backHref}
        className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100"
      >
        ← {backLabel}
      </Link>
      <button
        type="button"
        onClick={() => window.print()}
        className="ml-auto rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
      >
        Print or save as PDF
      </button>
    </div>
  )
}
