import { requireLabs } from '@/server/modules/labs/access'
import { sectionRecord } from '@/server/modules/labs/sessions'
import { schoolToday } from '@/lib/periods'
import { LabPrintShell } from '../../../print-shell'

export const metadata = { title: 'Print practical record' }

export default async function PrintPracticalRecordPage({ params }: { params: Promise<{ sectionId: string }> }) {
  const { sectionId } = await params
  const ctx = await requireLabs()
  const record = await sectionRecord(ctx, sectionId)

  return (
    <LabPrintShell
      schoolName={ctx.tenant.school?.name ?? ctx.tenant.name}
      title="Practical Record"
      subtitle={`${record.section.label} · ${record.sessions.length} practicals · printed ${schoolToday()}`}
      backHref={`/labs/records?section=${record.section.id}`}
      landscape
    >
      <table className="lab-table">
        <thead>
          <tr>
            <th className="num">Roll</th>
            <th>Student</th>
            {record.sessions.map((_, i) => (
              <th key={i} className="num">
                P{i + 1}
              </th>
            ))}
            <th className="num">Attended</th>
            <th className="num">Records</th>
            <th className="num">Avg</th>
          </tr>
        </thead>
        <tbody>
          {record.students.map((s) => (
            <tr key={s.studentId}>
              <td className="num">{s.rollNumber ?? ''}</td>
              <td>{s.name}</td>
              {s.entries.map((e, i) => (
                <td key={i} className="num">
                  {e ? (e.present ? (typeof e.marks === 'number' ? e.marks : 'P') : 'A') : ''}
                </td>
              ))}
              <td className="num">
                {s.attended}/{record.sessions.length}
              </td>
              <td className="num">{s.recorded}</td>
              <td className="num">{s.averageMarks ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ol className="mt-3 columns-2 text-xs">
        {record.sessions.map((s, i) => (
          <li key={s.id}>
            P{i + 1}: {s.dateIso} · {s.title}
          </li>
        ))}
      </ol>
    </LabPrintShell>
  )
}
