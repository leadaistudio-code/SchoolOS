'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Line = { title: string; description: string; qty: string; amount: string }

const EMPTY: Line = { title: '', description: '', qty: '1', amount: '' }

export function InvoiceLinesEditor({
  initial = [{ title: 'One-time onboarding fee', description: '', qty: '1', amount: '15000' }],
}: {
  initial?: Line[]
}) {
  const [lines, setLines] = useState<Line[]>(initial.length ? initial : [EMPTY])

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">Line items (₹)</span>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setLines((prev) => [...prev, { ...EMPTY }])}
        >
          Add line
        </Button>
      </div>
      <div className="space-y-2">
        {lines.map((line, i) => (
          <div key={i} className="grid gap-2 rounded-[var(--radius-sm)] border border-line p-3 sm:grid-cols-12">
            <label className="space-y-1 sm:col-span-4">
              <span className="text-xs text-ink-muted">Title</span>
              <Input
                name="lineTitle"
                required
                value={line.title}
                onChange={(e) =>
                  setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, title: e.target.value } : l)))
                }
              />
            </label>
            <label className="space-y-1 sm:col-span-4">
              <span className="text-xs text-ink-muted">Description</span>
              <Input
                name="lineDescription"
                value={line.description}
                onChange={(e) =>
                  setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, description: e.target.value } : l)))
                }
              />
            </label>
            <label className="space-y-1 sm:col-span-1">
              <span className="text-xs text-ink-muted">Qty</span>
              <Input
                name="lineQty"
                type="number"
                min={1}
                value={line.qty}
                onChange={(e) =>
                  setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, qty: e.target.value } : l)))
                }
              />
            </label>
            <label className="space-y-1 sm:col-span-2">
              <span className="text-xs text-ink-muted">Amount ₹</span>
              <Input
                name="lineAmount"
                type="number"
                min={0}
                step="1"
                required
                value={line.amount}
                onChange={(e) =>
                  setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, amount: e.target.value } : l)))
                }
              />
            </label>
            <div className="flex items-end sm:col-span-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={lines.length <= 1}
                onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
              >
                Remove
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
