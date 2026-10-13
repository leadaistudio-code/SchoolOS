export type ReportCardDesignKey = 'heritage' | 'modern' | 'royal' | 'minimal' | 'vibrant' | 'scholar'

export type ReportCardDesign = {
  key: ReportCardDesignKey
  name: string
  description: string
  /** Colour the gallery suggests; the school's chosen accent always wins. */
  accent: string
  frame: 'double' | 'single' | 'thick' | 'stripe' | 'rounded'
  header: 'classic' | 'band' | 'centered'
  font: 'serif' | 'sans'
  section: 'solid' | 'outline' | 'underline' | 'pill'
  tableHead: 'tint' | 'solid'
  watermark: boolean
}

export const REPORT_CARD_DESIGNS: ReportCardDesign[] = [
  {
    key: 'heritage',
    name: 'Heritage',
    description: 'Double-ruled border, serif crest header — the traditional board look.',
    accent: '#0f5132',
    frame: 'double',
    header: 'classic',
    font: 'serif',
    section: 'solid',
    tableHead: 'tint',
    watermark: false,
  },
  {
    key: 'modern',
    name: 'Modern band',
    description: 'Full-width colour header with white type and clean sans-serif tables.',
    accent: '#1e3a8a',
    frame: 'stripe',
    header: 'band',
    font: 'sans',
    section: 'underline',
    tableHead: 'solid',
    watermark: false,
  },
  {
    key: 'royal',
    name: 'Royal crest',
    description: 'Heavy frame, centred crest and a faint logo watermark behind the marks.',
    accent: '#581c87',
    frame: 'thick',
    header: 'centered',
    font: 'serif',
    section: 'outline',
    tableHead: 'solid',
    watermark: true,
  },
  {
    key: 'minimal',
    name: 'Minimal',
    description: 'Thin rule, light headings and lots of white space. Prints well in greyscale.',
    accent: '#334155',
    frame: 'single',
    header: 'classic',
    font: 'sans',
    section: 'underline',
    tableHead: 'tint',
    watermark: false,
  },
  {
    key: 'vibrant',
    name: 'Bright junior',
    description: 'Rounded frame and pill headings — friendly for primary classes.',
    accent: '#0f766e',
    frame: 'rounded',
    header: 'band',
    font: 'sans',
    section: 'pill',
    tableHead: 'tint',
    watermark: false,
  },
  {
    key: 'scholar',
    name: 'Scholar',
    description: 'Centred letterhead, outlined sections and a subtle watermark.',
    accent: '#7f1d1d',
    frame: 'double',
    header: 'centered',
    font: 'serif',
    section: 'outline',
    tableHead: 'tint',
    watermark: true,
  },
]

export function reportCardDesign(key: string | null | undefined): ReportCardDesign {
  return REPORT_CARD_DESIGNS.find((d) => d.key === key) ?? REPORT_CARD_DESIGNS[0]!
}
