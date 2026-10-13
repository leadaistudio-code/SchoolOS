import { cellText, type RegisterSheet as Register } from '@/server/modules/exams/marks-register'
import { cn } from '@/lib/utils'

const STATUS_SHORT = { OPEN: 'Open', SUBMITTED: 'Submitted', LOCKED: 'Locked' } as const

/** Student × subject marks grid. Same markup on screen and on the printed register. */
export function RegisterTable({ register, print = false }: { register: Register; print?: boolean }) {
  const showSection = !register.sectionName
  return (
    <table className={cn('register-table w-full border-collapse text-left', print ? 'text-[9.5px]' : 'text-sm')}>
      <thead>
        <tr className={print ? 'bg-[#1e3a8a] text-white' : 'bg-surface-2 text-ink'}>
          <th className="reg-th w-10">Roll</th>
          <th className="reg-th min-w-40">Student</th>
          {showSection ? <th className="reg-th">Sec</th> : null}
          {register.subjects.map((s) => (
            <th key={s.sheetId} className="reg-th text-center" title={s.teacher ? `Teacher: ${s.teacher}` : undefined}>
              <span className="block font-semibold">{s.code || s.name}</span>
              <span className={cn('block font-normal', print ? 'text-[8px] text-white/80' : 'text-[11px] text-ink-subtle')}>
                /{s.maxMarks}
                {print ? '' : ` · ${STATUS_SHORT[s.status]}`}
              </span>
            </th>
          ))}
          <th className="reg-th text-right">Total</th>
          <th className="reg-th text-right">%</th>
          <th className="reg-th text-center">Grade</th>
          <th className="reg-th text-center">Result</th>
          <th className="reg-th text-center">Rank</th>
          {print ? null : <th className="reg-th">Status</th>}
        </tr>
      </thead>
      <tbody>
        {register.rows.map((r, i) => (
          <tr key={r.studentId} className={cn(i % 2 ? (print ? 'bg-[#f1f5f9]' : 'bg-surface-2/40') : '', 'align-middle')}>
            <td className="reg-td tnum">{r.rollNumber ?? '—'}</td>
            <td className="reg-td">
              <span className="block font-medium">{r.name}</span>
              <span className={cn('block tnum', print ? 'text-[8px] text-[#64748b]' : 'text-xs text-ink-subtle')}>{r.admissionNo}</span>
            </td>
            {showSection ? <td className="reg-td">{r.sectionName}</td> : null}
            {register.subjects.map((s) => {
              const cell = r.cells[s.sheetId]
              return (
                <td
                  key={s.sheetId}
                  className={cn(
                    'reg-td text-center tnum',
                    cell?.kind === 'absent' && 'font-semibold text-[#b45309]',
                    cell?.kind === 'mark' && cell.fail && 'font-semibold text-[#dc2626]',
                    cell?.kind === 'missing' && (print ? '' : 'bg-[color-mix(in_srgb,var(--danger)_8%,transparent)]'),
                    cell?.kind === 'na' && 'text-[#94a3b8]',
                  )}
                >
                  {cell?.kind === 'missing' ? (print ? '' : <span className="text-[11px] text-[var(--danger)]">missing</span>) : cellText(cell)}
                </td>
              )
            })}
            <td className="reg-td text-right font-semibold tnum">
              {r.entered ? `${r.obtained}/${r.max}` : '—'}
            </td>
            <td className="reg-td text-right tnum">{r.percent !== null ? r.percent.toFixed(1) : '—'}</td>
            <td className="reg-td text-center font-semibold">{r.grade ?? '—'}</td>
            <td className={cn('reg-td text-center font-semibold', r.result === 'FAIL' && 'text-[#dc2626]', r.result === 'PASS' && 'text-[#15803d]')}>
              {r.result === 'PASS' ? 'Pass' : r.result === 'FAIL' ? 'Fail' : '—'}
            </td>
            <td className="reg-td text-center tnum">{r.rank ?? '—'}</td>
            {print ? null : (
              <td className="reg-td">
                {r.complete ? (
                  <span className="rounded-full bg-success-bg px-2 py-0.5 text-xs font-medium text-success">Completed</span>
                ) : (
                  <span className="rounded-full bg-warning-bg px-2 py-0.5 text-xs font-medium text-warning">
                    {r.expected - r.entered} pending
                  </span>
                )}
              </td>
            )}
          </tr>
        ))}
      </tbody>
      <style>{`
        .register-table .reg-th { padding: ${print ? '4px 5px' : '8px 10px'}; border: 1px solid ${print ? '#1e3a8a' : 'var(--border)'}; white-space: nowrap; font-weight: 600; }
        .register-table .reg-td { padding: ${print ? '3px 5px' : '6px 10px'}; border: 1px solid ${print ? '#cbd5e1' : 'var(--border)'}; }
      `}</style>
    </table>
  )
}
