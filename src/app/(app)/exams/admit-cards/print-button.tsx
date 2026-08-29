'use client'

export function PrintAdmitCardButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex h-8 items-center rounded-[var(--radius-sm)] border border-line bg-surface px-3 text-sm font-medium text-ink hover:bg-surface-2"
    >
      Print
    </button>
  )
}
