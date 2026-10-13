'use client'

import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function PrintReportCardButton({ label = 'Print / Save as PDF' }: { label?: string }) {
  return <Button variant="secondary" onClick={() => window.print()}><Printer className="size-4" />{label}</Button>
}
