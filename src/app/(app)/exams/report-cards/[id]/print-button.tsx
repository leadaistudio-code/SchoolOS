'use client'

import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function PrintReportCardButton() {
  return <Button variant="secondary" onClick={() => window.print()}><Printer className="size-4" />Print report card</Button>
}
