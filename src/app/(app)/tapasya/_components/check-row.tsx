import * as React from 'react'
import { Checkbox } from '@/components/ui/input'

export function CheckRow({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm text-ink">
      <Checkbox className="mt-0.5" {...props} />
      <span>{label}</span>
    </label>
  )
}
