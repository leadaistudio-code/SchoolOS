/**
 * Feature keys.
 *
 * Pure data with no imports, and deliberately in `lib` rather than `server`:
 * the navigation tree names features, and the navigation tree is read by the
 * sidebar in the browser. When these constants lived beside the entitlement
 * service, importing one of them pulled that service — and through it the
 * Prisma client and the server environment — into the client bundle, where it
 * failed at hydration with a missing DATABASE_URL.
 *
 * Nothing in the product may hardcode a limit. Ask the entitlement service for
 * the value; use these keys to name it.
 */
export const FEATURE = {
  MODULE_TRANSPORT: 'module.transport',
  MODULE_LIBRARY: 'module.library',
  MODULE_INVENTORY: 'module.inventory',
  MODULE_SPORTS: 'module.sports',
  MODULE_EVENTS: 'module.events',
  MODULE_WEBSITE: 'module.website',
  MODULE_ADMISSIONS_CRM: 'module.admissions_crm',
  MODULE_CERTIFICATES: 'module.certificates',
  MODULE_FRONT_OFFICE: 'module.front_office',
  MODULE_ONLINE_PAYMENTS: 'module.online_payments',
  MODULE_CUSTOM_DOMAIN: 'module.custom_domain',
  MODULE_WHITE_LABEL_APP: 'module.white_label_app',
  MODULE_AI_ASSIST: 'module.ai_assist',
  MODULE_FEEDBACK: 'module.feedback',

  LIMIT_STUDENTS: 'limit.students',
  LIMIT_STAFF: 'limit.staff',
  LIMIT_ADMIN_USERS: 'limit.admin_users',
  LIMIT_STORAGE_MB: 'limit.storage_mb',
  LIMIT_SMS_PER_MONTH: 'limit.sms_per_month',
  LIMIT_WHATSAPP_PER_MONTH: 'limit.whatsapp_per_month',
  LIMIT_DOMAINS: 'limit.domains',
} as const

export type FeatureKey = (typeof FEATURE)[keyof typeof FEATURE]
