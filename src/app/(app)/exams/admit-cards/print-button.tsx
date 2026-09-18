'use client'

export function PrintAdmitCardButton({ disabled }: { disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      disabled={disabled}
      className="inline-flex h-8 items-center rounded-[var(--radius-sm)] border border-line bg-surface px-3 text-sm font-medium text-ink hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
    >
      Print
    </button>
  )
}
