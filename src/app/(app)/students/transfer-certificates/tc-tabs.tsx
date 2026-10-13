import { FileOutput, Printer } from 'lucide-react'
import { LinkTabs } from '@/components/ui/tabs'
import { ACCENT } from '@/components/ui/stat-card'

export function TcTabs({ active }: { active: 'issue' | 'list' }) {
  return (
    <LinkTabs
      label="Transfer certificates"
      items={[
        { label: 'Issue TC', href: '/students/transfer-certificates/new', icon: FileOutput, accent: ACCENT.rose, active: active === 'issue' },
        { label: 'Issued / print TC', href: '/students/transfer-certificates', icon: Printer, accent: ACCENT.indigo, active: active === 'list' },
      ]}
    />
  )
}
