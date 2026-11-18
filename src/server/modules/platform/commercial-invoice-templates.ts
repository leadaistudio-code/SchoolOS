/** Seed bodies for the three sample commercial invoice templates. */

export type TemplateLayout = 'classic_white' | 'brand_header' | 'compact'

export type TemplateBody = {
  layout: TemplateLayout
  from: {
    brand: string
    legalName: string
    website: string
    email: string
  }
  labels: {
    documentTitle: string
    from: string
    billTo: string
    notes: string
    paymentReceived: string
  }
  colors: {
    ink: string
    inkSoft: string
    rule: string
    wash: string
    accent: string
  }
  footer: string
  defaultNotes: string[]
  showAdvance: boolean
}

export const DEFAULT_FROM = {
  brand: 'MyCampusView',
  legalName: 'Leadaistudio Private Limited',
  website: 'www.mycampusview.com',
  email: 'contact@mycampusview.com',
}

export const SAMPLE_TEMPLATES: {
  code: string
  name: string
  body: TemplateBody
}[] = [
  {
    code: 'classic_white',
    name: 'Classic white',
    body: {
      layout: 'classic_white',
      from: DEFAULT_FROM,
      labels: {
        documentTitle: 'Invoice',
        from: 'From',
        billTo: 'Bill to',
        notes: 'Notes',
        paymentReceived: 'Payment received',
      },
      colors: {
        ink: '#111827',
        inkSoft: '#4b5563',
        rule: '#e5e7eb',
        wash: '#f9fafb',
        accent: '#111827',
      },
      footer: 'www.mycampusview.com',
      defaultNotes: [
        'Amounts are in Indian Rupees as agreed.',
        'GST, if applicable, will be charged extra at the prevailing rate.',
        'Questions: contact@mycampusview.com',
      ],
      showAdvance: true,
    },
  },
  {
    code: 'brand_header',
    name: 'Brand header',
    body: {
      layout: 'brand_header',
      from: DEFAULT_FROM,
      labels: {
        documentTitle: 'Tax Invoice',
        from: 'From',
        billTo: 'Bill to',
        notes: 'Notes',
        paymentReceived: 'Payment received',
      },
      colors: {
        ink: '#0a1024',
        inkSoft: '#3a4254',
        rule: '#d8dce6',
        wash: '#f4f5f8',
        accent: '#5b3fd4',
      },
      footer: 'MyCampusView · Leadaistudio Private Limited',
      defaultNotes: [
        'Amounts are in Indian Rupees as agreed.',
        'GST, if applicable, will be charged extra at the prevailing rate.',
        'Questions: contact@mycampusview.com',
      ],
      showAdvance: true,
    },
  },
  {
    code: 'compact',
    name: 'Compact',
    body: {
      layout: 'compact',
      from: DEFAULT_FROM,
      labels: {
        documentTitle: 'Invoice',
        from: 'Issuer',
        billTo: 'Customer',
        notes: 'Terms',
        paymentReceived: 'Receipt',
      },
      colors: {
        ink: '#111827',
        inkSoft: '#6b7280',
        rule: '#e5e7eb',
        wash: '#ffffff',
        accent: '#0f766e',
      },
      footer: 'mycampusview.com',
      defaultNotes: ['GST extra if applicable.', 'Contact: contact@mycampusview.com'],
      showAdvance: true,
    },
  },
]

export function parseTemplateBody(raw: unknown): TemplateBody {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Partial<TemplateBody>
  const base = SAMPLE_TEMPLATES[0]!.body
  return {
    layout: (b.layout as TemplateLayout) || base.layout,
    from: { ...base.from, ...(b.from ?? {}) },
    labels: { ...base.labels, ...(b.labels ?? {}) },
    colors: { ...base.colors, ...(b.colors ?? {}) },
    footer: typeof b.footer === 'string' ? b.footer : base.footer,
    defaultNotes: Array.isArray(b.defaultNotes) ? b.defaultNotes.map(String) : base.defaultNotes,
    showAdvance: b.showAdvance !== false,
  }
}
