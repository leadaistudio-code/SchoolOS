/**
 * ID card themes. Each is colours plus a layout style; the card component
 * draws every style for both orientations, so a new theme is data only.
 */

export type IdCardStyle =
  | 'band' // solid header band, photo left
  | 'wave' // curved colour wave behind the header
  | 'split' // coloured side panel carrying the photo
  | 'glass' // gradient backdrop with a frosted panel
  | 'ribbon' // tricolour ribbon (Indian)
  | 'minimal' // white card, thin rule, monochrome
  | 'chip' // smart-card look with a contact chip

export type IdCardCategory =
  | 'Smart Card'
  | 'Glassmorphism'
  | 'Modern'
  | 'Professional'
  | 'Nature'
  | 'Classic'
  | 'Elegant'
  | 'Vibrant'
  | 'Dark'
  | 'Fresh'
  | 'Indian'
  | 'Minimal'
  | 'Premium'

export type IdCardDesign = {
  key: string
  name: string
  category: IdCardCategory
  style: IdCardStyle
  primary: string
  secondary: string
  accent: string
  /** Card body background. */
  surface: string
  /** Body text colour. */
  ink: string
  /** Muted label colour. */
  muted: string
}

export const ID_CARD_DESIGNS: IdCardDesign[] = [
  { key: 'classic-navy', name: 'Classic Navy Blue', category: 'Classic', style: 'band', primary: '#1e3a8a', secondary: '#1e40af', accent: '#f59e0b', surface: '#ffffff', ink: '#0f172a', muted: '#64748b' },
  { key: 'royal-maroon', name: 'Royal Maroon', category: 'Elegant', style: 'band', primary: '#7f1d1d', secondary: '#991b1b', accent: '#d4a017', surface: '#fffbf5', ink: '#1c1917', muted: '#78716c' },
  { key: 'smart-chip', name: 'Smart Chip', category: 'Smart Card', style: 'chip', primary: '#0f766e', secondary: '#115e59', accent: '#fbbf24', surface: '#f8fafc', ink: '#0f172a', muted: '#64748b' },
  { key: 'glass-aqua', name: 'Aqua Glass', category: 'Glassmorphism', style: 'glass', primary: '#0891b2', secondary: '#6366f1', accent: '#ffffff', surface: '#ecfeff', ink: '#082f49', muted: '#155e75' },
  { key: 'modern-violet', name: 'Modern Violet', category: 'Modern', style: 'wave', primary: '#6d28d9', secondary: '#a855f7', accent: '#f472b6', surface: '#ffffff', ink: '#1e1b4b', muted: '#6b7280' },
  { key: 'corporate-slate', name: 'Corporate Slate', category: 'Professional', style: 'split', primary: '#334155', secondary: '#0f172a', accent: '#38bdf8', surface: '#ffffff', ink: '#0f172a', muted: '#64748b' },
  { key: 'forest', name: 'Forest Green', category: 'Nature', style: 'wave', primary: '#166534', secondary: '#4d7c0f', accent: '#facc15', surface: '#f7fee7', ink: '#14532d', muted: '#4b5563' },
  { key: 'sunset', name: 'Sunset Burst', category: 'Vibrant', style: 'glass', primary: '#f97316', secondary: '#db2777', accent: '#fde047', surface: '#fff7ed', ink: '#431407', muted: '#9a3412' },
  { key: 'midnight', name: 'Midnight', category: 'Dark', style: 'band', primary: '#020617', secondary: '#1e293b', accent: '#22d3ee', surface: '#0f172a', ink: '#f1f5f9', muted: '#94a3b8' },
  { key: 'mint', name: 'Fresh Mint', category: 'Fresh', style: 'split', primary: '#059669', secondary: '#10b981', accent: '#fef08a', surface: '#ffffff', ink: '#064e3b', muted: '#6b7280' },
  { key: 'tiranga', name: 'Tiranga', category: 'Indian', style: 'ribbon', primary: '#ff9933', secondary: '#138808', accent: '#000080', surface: '#ffffff', ink: '#1f2937', muted: '#6b7280' },
  { key: 'mono', name: 'Minimal Mono', category: 'Minimal', style: 'minimal', primary: '#111827', secondary: '#374151', accent: '#111827', surface: '#ffffff', ink: '#111827', muted: '#6b7280' },
  { key: 'gold', name: 'Gold Premium', category: 'Premium', style: 'chip', primary: '#1c1917', secondary: '#44403c', accent: '#d4af37', surface: '#fffdf7', ink: '#1c1917', muted: '#78716c' },
  { key: 'sky-modern', name: 'Sky Modern', category: 'Modern', style: 'band', primary: '#0284c7', secondary: '#0ea5e9', accent: '#fbbf24', surface: '#ffffff', ink: '#0c4a6e', muted: '#64748b' },
]

export const ID_CARD_CATEGORIES: IdCardCategory[] = [
  'Smart Card', 'Glassmorphism', 'Modern', 'Professional', 'Nature', 'Classic', 'Elegant',
  'Vibrant', 'Dark', 'Fresh', 'Indian', 'Minimal', 'Premium',
]

export function idCardDesign(key: string | null | undefined): IdCardDesign {
  return ID_CARD_DESIGNS.find((d) => d.key === key) ?? ID_CARD_DESIGNS[0]!
}

export type IdCardOrientation = 'horizontal' | 'vertical'

export const ID_CARD_FIELDS = {
  student: [
    { key: 'class', label: 'Class / section' },
    { key: 'roll', label: 'Roll no.' },
    { key: 'dob', label: 'Date of birth' },
    { key: 'blood', label: 'Blood group' },
    { key: 'guardian', label: 'Parent name' },
    { key: 'phone', label: 'Contact no.' },
    { key: 'address', label: 'Address' },
  ],
  staff: [
    { key: 'designation', label: 'Designation' },
    { key: 'department', label: 'Department' },
    { key: 'phone', label: 'Phone' },
    { key: 'email', label: 'Email' },
    { key: 'dob', label: 'Date of birth' },
    { key: 'joined', label: 'Joined on' },
    { key: 'address', label: 'Address' },
  ],
} as const

export function idCardRows(kind: 'student' | 'staff', fields: string[], values: Record<string, string>) {
  return ID_CARD_FIELDS[kind]
    .filter((f) => fields.includes(f.key))
    .map((f) => ({ label: f.label, value: values[f.key] ?? '' }))
}

export type IdCardSettings = {
  design: string
  orientation: IdCardOrientation
  showBack: boolean
  showQr: boolean
  fields: string[]
  rules: string
  signatureLabel: string
}

export const DEFAULT_RULES = {
  student: [
    'This card must be carried at all times on school premises.',
    'The card is not transferable.',
    'Loss of the card must be reported to the school office immediately.',
    'If found, please return to the address below.',
  ].join('\n'),
  staff: [
    'This card is the property of the school and must be worn on duty.',
    'Not transferable. Return on leaving the school.',
    'Report loss to the administration office immediately.',
  ].join('\n'),
}

export function defaultIdCardSettings(kind: 'student' | 'staff'): IdCardSettings {
  return {
    design: 'classic-navy',
    orientation: 'horizontal',
    showBack: true,
    showQr: true,
    fields: kind === 'student'
      ? ['class', 'roll', 'dob', 'blood', 'guardian', 'phone']
      : ['designation', 'department', 'phone', 'dob'],
    rules: DEFAULT_RULES[kind],
    signatureLabel: 'Principal',
  }
}
