import { describe, expect, it } from 'vitest'
import { renderTemplate, TEMPLATE_EVENTS } from '../src/lib/notification-templates'
import { cmsPageSchema } from '../src/server/modules/website/schema'
import { TENANT_SCOPED_MODELS } from '../src/server/db/tenant-models'

describe('Phase 9 white-label helpers', () => {
  it('renders notification template variables', () => {
    const body = '{{school_name}}: fee due for {{student_name}}. {{detail}}'
    expect(
      renderTemplate(body, {
        school_name: 'Greenwood',
        student_name: 'Asha',
        detail: '₹2,500 by Friday',
      }),
    ).toBe('Greenwood: fee due for Asha. ₹2,500 by Friday')
  })

  it('lists core template events', () => {
    expect(TEMPLATE_EVENTS.some((e) => e.key === 'fee.due')).toBe(true)
    expect(TEMPLATE_EVENTS.some((e) => e.key === 'result.published')).toBe(true)
  })

  it('validates CMS page slugs', () => {
    const page = cmsPageSchema.parse({
      title: 'Admissions',
      slug: 'admissions',
      showInNav: true,
      isPublished: true,
    })
    expect(page.slug).toBe('admissions')
    expect(() =>
      cmsPageSchema.parse({ title: 'Bad', slug: 'Bad Slug!', showInNav: true, isPublished: false }),
    ).toThrow()
  })

  it('registers PushSubscription as tenant-scoped', () => {
    expect(TENANT_SCOPED_MODELS).toContain('PushSubscription')
    expect(TENANT_SCOPED_MODELS).toContain('CmsPage')
  })
})
