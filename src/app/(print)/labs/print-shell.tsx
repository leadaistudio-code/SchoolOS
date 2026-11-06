import { SimplePrintBar } from '../simple-print-bar'

/** A4 print page with the school's name on top, shared by every lab register. */
export function LabPrintShell({
  schoolName,
  title,
  subtitle,
  backHref,
  landscape,
  children,
}: {
  schoolName: string
  title: string
  subtitle?: string
  backHref: string
  landscape?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={`mx-auto px-6 py-8 print:px-0 print:py-0 ${landscape ? 'max-w-[297mm]' : 'max-w-[210mm]'}`}>
      <style>{`
        @media print {
          @page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 12mm 10mm; }
          .no-print { display: none !important; }
          body { background: #fff; }
          tr { break-inside: avoid; }
        }
        .lab-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .lab-table th, .lab-table td { border: 1px solid #555; padding: 3px 5px; vertical-align: top; }
        .lab-table th { background: #f1f1f1; text-align: left; }
        .lab-table td.num, .lab-table th.num { text-align: right; font-variant-numeric: tabular-nums; }
      `}</style>
      <SimplePrintBar backHref={backHref} backLabel="Back" />
      <article className="font-serif text-black">
        <header className="mb-4 border-b-2 border-black pb-2 text-center">
          <h1 className="text-xl uppercase tracking-wide">{schoolName}</h1>
          <h2 className="mt-1 text-base font-semibold">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-sm">{subtitle}</p> : null}
        </header>
        {children}
        <footer className="mt-10 grid grid-cols-3 gap-6 text-center text-xs">
          <div className="border-t border-black pt-1">Lab assistant</div>
          <div className="border-t border-black pt-1">Teacher in charge</div>
          <div className="border-t border-black pt-1">Principal</div>
        </footer>
      </article>
    </div>
  )
}

export const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ''))
