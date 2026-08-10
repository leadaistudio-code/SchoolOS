'use client'

import * as React from 'react'

/**
 * Sends someone to their own school's sign-in page.
 *
 * The root domain has no school attached to it, so there is nothing to sign
 * into here. Rather than a dead end, the page asks for the one piece of
 * information that resolves it.
 */
export function SchoolFinder() {
  const [slug, setSlug] = React.useState('')
  const [root, setRoot] = React.useState('')

  React.useEffect(() => {
    // The address the visitor is already on, minus any www.
    setRoot(window.location.host.replace(/^www\./, ''))
  }, [])

  const cleaned = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '')

  const go = (event: React.FormEvent) => {
    event.preventDefault()
    if (!cleaned || !root) return
    window.location.href = `${window.location.protocol}//${cleaned}.${root}/login`
  }

  return (
    <form onSubmit={go}>
      <label htmlFor="school-slug" className="block text-[15px] font-medium text-[var(--text)]">
        Your school&rsquo;s short name
      </label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <div className="flex flex-1 items-center rounded-lg border border-[var(--rule-strong)] bg-white pr-3 focus-within:border-[var(--indigo)]">
          <input
            id="school-slug"
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            placeholder="stjohns"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-[16px] text-[var(--text)] outline-none"
          />
          <span className="shrink-0 text-[15px] text-[var(--text-subtle)]">
            .{root || 'schoolos.app'}
          </span>
        </div>
        <button
          type="submit"
          disabled={!cleaned}
          className="rounded-lg bg-[var(--ink)] px-5 py-3 text-[16px] font-medium text-white transition-colors hover:bg-[var(--navy)] disabled:opacity-50"
        >
          Continue
        </button>
      </div>
    </form>
  )
}
