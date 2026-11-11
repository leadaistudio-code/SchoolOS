'use client'

import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function PrintButton({ label = 'Print or save as PDF' }: { label?: string }) {
  return (
    <Button variant="secondary" onClick={() => window.print()}>
      <Printer /> {label}
    </Button>
  )
}
