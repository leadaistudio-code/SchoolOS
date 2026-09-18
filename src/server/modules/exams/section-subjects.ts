/**
 * Whether a class-subject (or exam paper attached to one) applies to a
 * student's section.
 *
 * ClassSubject alone means the class studies the subject. SectionSubject rows
 * narrow that to specific sections (streams / electives). When there are no
 * SectionSubject rows, every section of the class takes the subject — that
 * keeps class-wide core papers working without extra mapping.
 */
export function classSubjectAppliesToSection(
  mappedSectionIds: readonly string[],
  sectionId: string | null | undefined,
): boolean {
  if (mappedSectionIds.length === 0) return true
  if (!sectionId) return false
  return mappedSectionIds.includes(sectionId)
}
