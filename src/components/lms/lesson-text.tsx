import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Renders lesson text written with a small subset of markdown: headings (#, ##),
 * bullet (-) and numbered (1.) lists, **bold**, `code`, fenced ``` blocks and
 * bare links. Built from React nodes, never HTML strings, so whatever an author
 * types cannot inject markup.
 */
export function LessonText({ text, className }: { text: string; className?: string }) {
  return <div className={cn('space-y-3 text-sm leading-relaxed text-ink', className)}>{blocks(text)}</div>
}

function blocks(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  let i = 0
  let key = 0
  while (i < lines.length) {
    const line = lines[i]!
    if (line.trim().startsWith('```')) {
      const code: string[] = []
      i++
      while (i < lines.length && !lines[i]!.trim().startsWith('```')) code.push(lines[i++]!)
      i++
      out.push(
        <pre key={key++} className="overflow-x-auto rounded-lg bg-surface-2 p-3 font-mono text-xs leading-relaxed">
          {code.join('\n')}
        </pre>,
      )
      continue
    }
    const heading = line.match(/^(#{1,3})\s+(.*)$/)
    if (heading) {
      const level = heading[1]!.length
      const cls = level === 1 ? 'text-lg font-semibold' : level === 2 ? 'text-base font-semibold' : 'text-sm font-semibold'
      out.push(
        <p key={key++} className={cn(cls, 'text-ink')} role="heading" aria-level={level + 1}>
          {inline(heading[2]!)}
        </p>,
      )
      i++
      continue
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i]!)) items.push(lines[i++]!.replace(/^\s*[-*]\s+/, ''))
      out.push(
        <ul key={key++} className="list-disc space-y-1 pl-5">
          {items.map((t, j) => <li key={j}>{inline(t)}</li>)}
        </ul>,
      )
      continue
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i]!)) items.push(lines[i++]!.replace(/^\s*\d+[.)]\s+/, ''))
      out.push(
        <ol key={key++} className="list-decimal space-y-1 pl-5">
          {items.map((t, j) => <li key={j}>{inline(t)}</li>)}
        </ol>,
      )
      continue
    }
    if (/^\s*\|/.test(line)) {
      const rows: string[][] = []
      while (i < lines.length && /^\s*\|/.test(lines[i]!)) {
        const cells = lines[i++]!.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells)
      }
      const [head, ...rest] = rows
      out.push(
        <div key={key++} className="overflow-x-auto">
          <table className="min-w-[16rem] border-collapse text-sm">
            {head ? (
              <thead>
                <tr>
                  {head.map((c, j) => (
                    <th key={j} scope="col" className="border-b border-line px-3 py-1.5 text-left font-semibold">
                      {inline(c)}
                    </th>
                  ))}
                </tr>
              </thead>
            ) : null}
            <tbody>
              {rest.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, j) => (
                    <td key={j} className="border-b border-line px-3 py-1.5 font-mono text-[13px]">
                      {inline(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      continue
    }
    if (!line.trim()) {
      i++
      continue
    }
    const para: string[] = []
    while (
      i < lines.length &&
      lines[i]!.trim() &&
      !/^(#{1,3}\s|\s*[-*]\s|\s*\d+[.)]\s|\s*```|\s*\|)/.test(lines[i]!)
    ) {
      para.push(lines[i++]!)
    }
    out.push(<p key={key++}>{inline(para.join(' '))}</p>)
  }
  return out
}

const TOKEN = /(\*\*[^*]+\*\*|`[^`]+`|https?:\/\/[^\s)]+)/g

function inline(text: string): React.ReactNode[] {
  return text.split(TOKEN).map((part, i) => {
    if (!part) return null
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.85em]">{part.slice(1, -1)}</code>
    }
    if (/^https?:\/\//.test(part)) {
      return (
        <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-[var(--brand-600)] underline break-all">
          {part}
        </a>
      )
    }
    return <React.Fragment key={i}>{part}</React.Fragment>
  })
}
