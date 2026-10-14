import { describe, expect, it } from 'vitest'
import { NAVIGATION, flattenNavigation, visibleNavigation, type NavPredicate } from '../src/lib/navigation'

const NEW_PAGES = [
  '/accounts/day-book',
  '/accounts/vendors',
  '/accounts/fixed-assets',
  '/accounts/expense-approvals',
  '/accounts/analytics',
  '/accounts/whatsapp-receipts',
]

const EXISTING_ACCOUNTS_PAGES = [
  '/accounts',
  '/accounts/chart',
  '/accounts/journals',
  '/accounts/ledger',
  '/accounts/trial-balance',
  '/accounts/profit-loss',
  '/accounts/balance-sheet',
  '/accounts/settings',
]

function hrefs(p: Partial<NavPredicate>, held = ['accounts.view']) {
  const set = new Set(held)
  const visible = visibleNavigation(NAVIGATION, { can: (k) => set.has(k), hasFeature: () => true, ...p })
  return new Set(flattenNavigation(visible).map((i) => i.href))
}

describe('accounting pages in the navigation', () => {
  it('shows none of the new pages while the module is off, or when the switches are unknown', () => {
    for (const shown of [hrefs({}), hrefs({ accounting: { module: false, whatsapp: false } })]) {
      for (const href of NEW_PAGES) expect(shown.has(href)).toBe(false)
      for (const href of EXISTING_ACCOUNTS_PAGES) expect(shown.has(href)).toBe(true)
    }
  })

  it('shows the new pages with the module on, and WhatsApp only where the deployment allows it', () => {
    const on = hrefs({ accounting: { module: true, whatsapp: false } })
    for (const href of NEW_PAGES.filter((h) => h !== '/accounts/whatsapp-receipts')) expect(on.has(href)).toBe(true)
    expect(on.has('/accounts/whatsapp-receipts')).toBe(false)
    expect(hrefs({ accounting: { module: true, whatsapp: true } }).has('/accounts/whatsapp-receipts')).toBe(true)
  })

  it('still needs accounts.view', () => {
    const noAccess = hrefs({ accounting: { module: true, whatsapp: true } }, ['fees.view'])
    for (const href of NEW_PAGES) expect(noAccess.has(href)).toBe(false)
  })
})
