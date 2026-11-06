import type { LabTemplate, LabTypeValue } from '../types'
import { compositeScience } from './composite-science'
import { roboticsAi } from './robotics-ai'

/**
 * Lab requirement templates. Each is a board or government specification: what
 * the room must have, what the register must hold and which practicals it runs.
 * Adding a lab type is adding a file here; the engine reads only this shape.
 */
export const LAB_TEMPLATES: LabTemplate[] = [compositeScience, roboticsAi]

export function labTemplate(code: string | null | undefined): LabTemplate | null {
  if (!code) return null
  return LAB_TEMPLATES.find((t) => t.code === code) ?? null
}

export function templateForType(type: LabTypeValue): LabTemplate | null {
  return LAB_TEMPLATES.find((t) => t.labType === type) ?? null
}

export { compositeScience, roboticsAi }
