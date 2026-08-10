import { requireContext } from '@/server/context'
import { ModulePlaceholder } from '@/components/module-placeholder'

export const metadata = { title: "Certificates" }

export default async function Page() {
  await requireContext("certificates.view")

  return (
    <ModulePlaceholder
      title="Certificates"
      icon="Award"
      phase="Phase 5 - Examination"
      summary="Transfer, bonafide and character certificates generated from the student record, with a QR code that verifies the document against this school."
      planned={[
        "Template builder with dynamic variables",
        "Issue against a student record",
        "QR verification endpoint",
        "Issue register with reprints",
        "PDF download and print",
      ]}
      related={[
        { label: "Report Cards", href: "/exams/report-cards", description: "Already generating PDFs" },
        { label: "Results", href: "/exams/results", description: "Published results" },
      ]}
      breadcrumbs={[
        { label: "Examination", href: "/exams" },
        { label: "Certificates" },
      ]}
    />
  )
}
