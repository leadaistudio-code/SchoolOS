/**
 * Shared vocabulary for the lab module. Pure data: read by server code, the
 * lab pages and the print views alike.
 */

export const LAB_TYPES = [
  { value: 'COMPOSITE_SCIENCE', label: 'Composite Science Lab (Classes 6–10)' },
  { value: 'ROBOTICS_AI', label: 'Robotics & AI Lab (Classes 6–12)' },
  { value: 'PHYSICS', label: 'Physics Lab' },
  { value: 'CHEMISTRY', label: 'Chemistry Lab' },
  { value: 'BIOLOGY', label: 'Biology Lab' },
  { value: 'COMPUTER', label: 'Computer Lab' },
  { value: 'MATHEMATICS', label: 'Mathematics Lab' },
  { value: 'OTHER', label: 'Other lab' },
] as const
export type LabTypeValue = (typeof LAB_TYPES)[number]['value']

export const ITEM_CATEGORIES = [
  { value: 'APPARATUS', label: 'Apparatus' },
  { value: 'GLASSWARE', label: 'Glassware' },
  { value: 'INSTRUMENT', label: 'Instrument' },
  { value: 'CHEMICAL', label: 'Chemical' },
  { value: 'SPECIMEN', label: 'Specimen / model' },
  { value: 'SLIDE', label: 'Permanent slide' },
  { value: 'CHART', label: 'Chart / portrait' },
  { value: 'CONSUMABLE', label: 'Consumable' },
  { value: 'SAFETY', label: 'Safety equipment' },
  { value: 'EQUIPMENT', label: 'Equipment / IT' },
] as const
export type ItemCategoryValue = (typeof ITEM_CATEGORIES)[number]['value']

export const ITEM_KINDS = [
  { value: 'NON_CONSUMABLE', label: 'Non-consumable' },
  { value: 'CONSUMABLE', label: 'Consumable' },
] as const
export type ItemKindValue = (typeof ITEM_KINDS)[number]['value']

export const HAZARDS = [
  { value: 'FLAMMABLE', label: 'Flammable' },
  { value: 'CORROSIVE', label: 'Corrosive' },
  { value: 'TOXIC', label: 'Toxic' },
  { value: 'OXIDISER', label: 'Oxidiser' },
  { value: 'IRRITANT', label: 'Irritant' },
] as const
export type HazardValue = (typeof HAZARDS)[number]['value']

export const MOVEMENT_TYPES = [
  { value: 'OPENING', label: 'Opening stock', sign: 1 },
  { value: 'PURCHASE', label: 'Purchase', sign: 1 },
  { value: 'ADJUSTMENT', label: 'Adjustment', sign: 0 },
  { value: 'CONSUMPTION', label: 'Used in practical', sign: -1 },
  { value: 'BREAKAGE', label: 'Breakage', sign: -1 },
  { value: 'DISPOSAL', label: 'Disposal / write-off', sign: -1 },
] as const
export type MovementTypeValue = (typeof MOVEMENT_TYPES)[number]['value']

export const INSPECTION_TYPES = [
  { value: 'DAILY', label: 'Daily close-down check' },
  { value: 'MONTHLY', label: 'Monthly safety inspection' },
  { value: 'QUARTERLY', label: 'Quarterly gas & electrical audit' },
] as const
export type InspectionTypeValue = (typeof INSPECTION_TYPES)[number]['value']

export const INCIDENT_TYPES = [
  { value: 'INJURY', label: 'Injury' },
  { value: 'BURN', label: 'Burn' },
  { value: 'CHEMICAL_SPILL', label: 'Chemical spill' },
  { value: 'CHEMICAL_EXPOSURE', label: 'Chemical exposure' },
  { value: 'FIRE', label: 'Fire' },
  { value: 'GAS_LEAK', label: 'Gas leak' },
  { value: 'ELECTRICAL', label: 'Electrical' },
  { value: 'BREAKAGE', label: 'Breakage / equipment damage' },
  { value: 'OTHER', label: 'Other' },
] as const
export type IncidentTypeValue = (typeof INCIDENT_TYPES)[number]['value']

export const INCIDENT_SEVERITIES = [
  { value: 'MINOR', label: 'Minor', tone: 'neutral' },
  { value: 'MODERATE', label: 'Moderate', tone: 'warning' },
  { value: 'SERIOUS', label: 'Serious', tone: 'danger' },
] as const
export type IncidentSeverityValue = (typeof INCIDENT_SEVERITIES)[number]['value']

export const WASTE_CATEGORIES = [
  { value: 'BIODEGRADABLE', label: 'Biodegradable' },
  { value: 'NON_BIODEGRADABLE', label: 'Non-biodegradable' },
  { value: 'BROKEN_GLASS', label: 'Broken glass' },
  { value: 'CHEMICAL', label: 'Chemical waste' },
  { value: 'FLAMMABLE_BOTTLES', label: 'Flammable chemical bottles (packed separately)' },
  { value: 'EMPTY_CONTAINERS', label: 'Empty chemical containers' },
  { value: 'E_WASTE', label: 'E-waste (boards, sensors, cables)' },
  { value: 'BATTERIES', label: 'Used and damaged batteries' },
] as const
export type WasteCategoryValue = (typeof WASTE_CATEGORIES)[number]['value']

export function labelOf<T extends { value: string; label: string }>(
  list: readonly T[],
  value: string | null | undefined,
): string {
  return list.find((x) => x.value === value)?.label ?? value ?? ''
}

/* ----------------------------------------------------------- template shape */

/** Which part of the lab standard an item comes from, for the readiness report. */
export type SopList = 'NON_CONSUMABLE' | 'CONSUMABLE' | 'SPECIMEN' | 'SLIDE' | 'SAFETY'

export const PRACTICAL_SUBJECTS = ['Science', 'Physics', 'Chemistry', 'Biology', 'Robotics', 'Electronics', 'Coding', 'AI'] as const
export type PracticalSubject = (typeof PRACTICAL_SUBJECTS)[number]

export type TemplateItem = {
  code: string
  name: string
  category: ItemCategoryValue
  kind: ItemKindValue
  unit: string
  /** Quantity the standard requires for one batch of students. 0 = recommended, not mandated. */
  required: number
  sopList: SopList
  hazards?: HazardValue[]
  note?: string
}

export type InfraGroup = 'Room' | 'Storage' | 'Teaching' | 'Computing' | 'Display' | 'Utilities' | 'Safety' | 'Waste'

export type InfraCheck = {
  code: string
  group: InfraGroup
  label: string
  /** Numeric requirement (e.g. at least 8 sinks). Absent = a yes/no check. */
  min?: number
  unit?: string
}

export type ChecklistItem = { code: string; label: string }

export type InspectionTemplate = {
  type: InspectionTypeValue
  label: string
  /** Days until the next inspection of this kind falls due. */
  everyDays: number
  items: ChecklistItem[]
}

export type TemplateApparatus = {
  /** Template item code, matched against the lab register when a session completes. */
  itemCode: string
  /** Amount used per session (consumables are deducted, non-consumables only checked). */
  qty: number
}

export type TemplatePractical = {
  code: string
  classNumber: number
  subject: PracticalSubject
  title: string
  aim: string
  apparatus: TemplateApparatus[]
  safety?: string
}

export type LabTemplate = {
  code: string
  labType: LabTypeValue
  name: string
  source: string
  batchSize: number
  /** Readiness section names, where the science defaults don't fit. */
  sectionLabels?: { equipment?: string; consumables?: string }
  infrastructure: InfraCheck[]
  items: TemplateItem[]
  inspections: InspectionTemplate[]
  safetyProvisions: string[]
  studentRules: string[]
  dos: string[]
  donts: string[]
  practicals: TemplatePractical[]
}
