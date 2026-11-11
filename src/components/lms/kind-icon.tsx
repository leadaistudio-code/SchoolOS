import { Code2, FileStack, FileText, ListChecks, PlayCircle, Wrench, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const ICONS: Record<string, LucideIcon> = {
  VIDEO: PlayCircle,
  TEXT: FileText,
  DOCUMENT: FileStack,
  CODE: Code2,
  QUIZ: ListChecks,
  PROJECT: Wrench,
}

export function KindIcon({ kind, className }: { kind: string; className?: string }) {
  const Icon = ICONS[kind] ?? FileText
  return <Icon className={cn('size-4 shrink-0', className)} aria-hidden />
}

/** Fills `:course` / `:lesson` / `:id` placeholders in a route template. */
export function fillPath(template: string, values: Record<string, string>) {
  return template.replace(/:(\w+)/g, (_, key: string) => values[key] ?? `:${key}`)
}
