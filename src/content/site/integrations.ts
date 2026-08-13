/**
 * Integrations, stated as they actually are.
 *
 * MyCampusView talks to the outside world through provider interfaces in
 * `src/server/providers`. That design means a vendor can be swapped by
 * configuration — but it also means an interface existing is *not* the same as
 * a vendor being connected. This file keeps that distinction visible:
 *
 *   available  a driver is implemented and running in production
 *   ready      the interface exists and is exercised; the vendor is connected
 *              per school during setup, against that school's own account
 *   planned    neither of the above
 *
 * Do not promote an entry without opening `src/server/providers/index.ts` and
 * confirming a real driver is returned rather than the log driver.
 */

export type IntegrationStatus = 'available' | 'ready' | 'planned'

export type Integration = {
  name: string
  blurb: string
  status: IntegrationStatus
}

export const INTEGRATION_STATUS_LABEL: Record<IntegrationStatus, string> = {
  available: 'Live',
  ready: 'Connected at setup',
  planned: 'Planned',
}

export const INTEGRATION_STATUS_NOTE: Record<IntegrationStatus, string> = {
  available: 'Running in production today.',
  ready:
    'Built and metered inside MyCampusView. We connect your own vendor account during implementation.',
  planned: 'On the roadmap. Not available today, and we will say so on a call.',
}

export const INTEGRATION_GROUPS: { heading: string; lead: string; items: Integration[] }[] = [
  {
    heading: 'Reaching parents',
    lead: 'Every message is addressed from the records that hold the numbers, so a changed phone number is changed once.',
    items: [
      {
        name: 'Email',
        blurb: 'Transactional and bulk email from the school’s own address and domain.',
        status: 'available',
      },
      {
        name: 'SMS',
        blurb: 'Template-based SMS through the school’s gateway account, metered per school.',
        status: 'ready',
      },
      {
        name: 'WhatsApp',
        blurb: 'Template messages through a WhatsApp Business account the school owns.',
        status: 'ready',
      },
      {
        name: 'Mobile notifications',
        blurb: 'Push notifications to the parent and teacher experience on the phone.',
        status: 'ready',
      },
    ],
  },
  {
    heading: 'Money',
    lead: 'Payments reconcile against the invoice they were raised from, so collection and outstanding never disagree.',
    items: [
      {
        name: 'Payment gateway',
        blurb: 'Online fee payment with server-created orders and signature-verified callbacks.',
        status: 'ready',
      },
      {
        name: 'Tally',
        blurb: 'Export of collection and ledger data into Tally.',
        status: 'planned',
      },
    ],
  },
  {
    heading: 'On campus',
    lead: 'Hardware and location data land on the same records the office already works from.',
    items: [
      {
        name: 'Vehicle tracking',
        blurb: 'Live bus position on a map, per route, from the device on the vehicle.',
        status: 'available',
      },
      {
        name: 'Biometric attendance',
        blurb: 'Device-driven attendance for staff and students.',
        status: 'planned',
      },
      {
        name: 'ID card & barcode',
        blurb: 'Card printing and barcode identification for library and attendance.',
        status: 'planned',
      },
    ],
  },
  {
    heading: 'Identity & platform',
    lead: 'How your school’s own systems and domain meet MyCampusView.',
    items: [
      {
        name: 'Custom domain',
        blurb: 'The application and the school website on a domain the school owns.',
        status: 'available',
      },
      {
        name: 'Google Workspace / Microsoft 365 sign-in',
        blurb: 'Staff signing in with the account the school already issues them.',
        status: 'planned',
      },
      {
        name: 'API access',
        blurb: 'A versioned HTTP API for reading and writing school data.',
        status: 'ready',
      },
    ],
  },
]

export const ALL_INTEGRATIONS = INTEGRATION_GROUPS.flatMap((g) => g.items)
