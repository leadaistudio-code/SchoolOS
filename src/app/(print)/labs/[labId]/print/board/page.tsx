import { requireLabs } from '@/server/modules/labs/access'
import { emergencyContacts, getLab, templateOf } from '@/server/modules/labs/service'
import { listExperiments, listSessions } from '@/server/modules/labs/sessions'
import { schoolToday } from '@/lib/periods'
import { SimplePrintBar } from '../../../../simple-print-bar'

export const metadata = { title: 'Print lab display board' }

const POSTERS = ['dos', 'rules', 'emergency', 'practicals', 'timetable'] as const
type Poster = (typeof POSTERS)[number]

const DAY = 86_400_000
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default async function PrintBoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ labId: string }>
  searchParams: Promise<{ poster?: string }>
}) {
  const [{ labId }, { poster }] = await Promise.all([params, searchParams])
  const ctx = await requireLabs()
  const lab = await getLab(ctx, labId)
  const template = templateOf(lab)
  const schoolName = ctx.tenant.school?.name ?? ctx.tenant.name
  const show: Poster[] = POSTERS.includes(poster as Poster) ? [poster as Poster] : [...POSTERS]

  const today = schoolToday()
  const todayDate = new Date(`${today}T00:00:00.000Z`)
  const monday = new Date(todayDate.getTime() - ((todayDate.getUTCDay() + 6) % 7) * DAY)
  const weekDates = WEEKDAYS.map((_, i) => new Date(monday.getTime() + i * DAY).toISOString().slice(0, 10))

  const [experiments, sessions] = await Promise.all([
    show.includes('practicals') ? listExperiments(ctx, { labType: lab.type }) : Promise.resolve([]),
    show.includes('timetable')
      ? listSessions(ctx, { labId, status: 'SCHEDULED', from: weekDates[0], to: weekDates[5] }).then(async (s) => [
          ...s,
          ...(await listSessions(ctx, { labId, status: 'COMPLETED', from: weekDates[0], to: weekDates[5] })),
        ])
      : Promise.resolve([]),
  ])
  const contacts = emergencyContacts(lab)
  const classes = [...new Set(experiments.map((e) => e.classNumber).filter((c): c is number => c !== null))].sort((a, b) => a - b)

  return (
    <div className="mx-auto max-w-[210mm] px-6 py-8 print:px-0 print:py-0">
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 12mm; }
          .no-print { display: none !important; }
          body { background: #fff; }
          .poster { break-after: page; border: none !important; margin: 0 !important; }
          .poster:last-child { break-after: auto; }
        }
        .poster { min-height: 270mm; display: flex; flex-direction: column; }
      `}</style>
      <SimplePrintBar backHref={`/labs/${lab.id}/prints`} backLabel="Back" />

      {show.includes('dos') && template ? (
        <Sheet schoolName={schoolName} lab={lab.name} title="Do's and Don'ts">
          <div className="grid flex-1 grid-cols-2 gap-6">
            <div>
              <h3 className="mb-3 border-b-4 border-black pb-1 text-2xl font-bold">DO</h3>
              <ul className="space-y-3 text-lg leading-snug">
                {template.dos.map((d) => (
                  <li key={d}>✔ {d}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-3 border-b-4 border-black pb-1 text-2xl font-bold">DON&apos;T</h3>
              <ul className="space-y-3 text-lg leading-snug">
                {template.donts.map((d) => (
                  <li key={d}>✘ {d}</li>
                ))}
              </ul>
            </div>
          </div>
        </Sheet>
      ) : null}

      {show.includes('rules') && template ? (
        <Sheet schoolName={schoolName} lab={lab.name} title="Rules for Students">
          <ol className="list-decimal space-y-2 pl-7 text-lg leading-snug">
            {template.studentRules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ol>
        </Sheet>
      ) : null}

      {show.includes('emergency') ? (
        <Sheet schoolName={schoolName} lab={lab.name} title="In Case of Emergency">
          {contacts.length ? (
            <table className="w-full border-collapse text-2xl">
              <tbody>
                {contacts.map((c) => (
                  <tr key={`${c.label}-${c.phone}`} className="border-b-2 border-black">
                    <td className="py-3 pr-4">{c.label}</td>
                    <td className="py-3 text-right font-bold tabular-nums">{c.phone}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-lg">Add emergency numbers on the lab&apos;s overview page.</p>
          )}
          {template ? (
            <>
              <h3 className="mt-8 mb-2 text-xl font-bold">Safety provisions in this lab</h3>
              <ul className="list-disc space-y-1 pl-6 text-base">
                {template.safetyProvisions.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </>
          ) : null}
        </Sheet>
      ) : null}

      {show.includes('practicals') ? (
        <Sheet schoolName={schoolName} lab={lab.name} title="List of Practicals">
          {classes.length === 0 ? (
            <p className="text-lg">No practicals in the library yet.</p>
          ) : (
            <div className="columns-2 gap-8 text-sm">
              {classes.map((c) => (
                <div key={c} className="mb-4 break-inside-avoid">
                  <h3 className="mb-1 border-b-2 border-black text-base font-bold">Class {c}</h3>
                  <ol className="list-decimal space-y-0.5 pl-5">
                    {experiments
                      .filter((e) => e.classNumber === c)
                      .map((e) => (
                        <li key={e.id}>{e.title}</li>
                      ))}
                  </ol>
                </div>
              ))}
            </div>
          )}
        </Sheet>
      ) : null}

      {show.includes('timetable') ? (
        <Sheet schoolName={schoolName} lab={lab.name} title={`Lab Timetable · week of ${weekDates[0]}`}>
          <table className="w-full border-collapse text-sm">
            <tbody>
              {WEEKDAYS.map((day, i) => {
                const rows = sessions
                  .filter((s) => s.dateIso === weekDates[i])
                  .sort((a, b) => a.startTime.localeCompare(b.startTime))
                return (
                  <tr key={day} className="border-2 border-black align-top">
                    <th className="w-32 border-r-2 border-black p-2 text-left text-base">
                      {day}
                      <div className="text-xs font-normal">{weekDates[i]}</div>
                    </th>
                    <td className="p-2">
                      {rows.length === 0 ? (
                        <span className="text-neutral-500">No practicals</span>
                      ) : (
                        <ul className="space-y-1">
                          {rows.map((s) => (
                            <li key={s.id}>
                              <b>
                                {s.startTime}–{s.endTime}
                              </b>{' '}
                              {s.sectionLabel}
                              {s.batch ? ` (${s.batch})` : ''} · {s.experiment?.title ?? 'Practical'}
                              {s.teacherLabel ? ` · ${s.teacherLabel}` : ''}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Sheet>
      ) : null}
    </div>
  )
}

function Sheet({ schoolName, lab, title, children }: { schoolName: string; lab: string; title: string; children: React.ReactNode }) {
  return (
    <section className="poster mb-8 border border-neutral-300 p-6 font-serif text-black">
      <header className="mb-6 border-b-4 border-black pb-3 text-center">
        <p className="text-base uppercase tracking-wide">{schoolName}</p>
        <p className="text-sm">{lab}</p>
        <h2 className="mt-2 text-4xl font-bold">{title}</h2>
      </header>
      {children}
    </section>
  )
}
