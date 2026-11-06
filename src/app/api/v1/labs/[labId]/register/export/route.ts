import type { NextRequest } from 'next/server'
import * as XLSX from 'xlsx'
import { route } from '@/server/api/handler'
import { csvResponse } from '@/lib/csv'
import { getLab } from '@/server/modules/labs/service'
import { registerRows, type RegisterFilter } from '@/server/modules/labs/stock'
import { HAZARDS, ITEM_CATEGORIES, ITEM_KINDS, labelOf } from '@/lib/labs/types'

const FILTERS: RegisterFilter[] = ['all', 'shortfall', 'low', 'expiry', 'chemicals', 'consumables', 'non-consumables']

/** GET /api/v1/labs/{labId}/register/export?format=csv|xlsx&filter=… */
export const GET = route(
  async (req: NextRequest, ctx, params) => {
    const labId = params.labId!
    const url = new URL(req.url)
    const filter = (FILTERS.find((f) => f === url.searchParams.get('filter')) ?? 'all') as RegisterFilter
    const lab = await getLab(ctx, labId)
    const rows = await registerRows(ctx, labId, filter)

    const headers = [
      'Item', 'Category', 'Type', 'Unit', 'In stock', 'Required', 'Shortfall',
      'Reorder at', 'Expiry', 'Hazards', 'Storage', 'Unit cost (₹)', 'Notes',
    ]
    const data = rows.map((r) => [
      r.name,
      labelOf(ITEM_CATEGORIES, r.category),
      labelOf(ITEM_KINDS, r.kind),
      r.unit,
      r.quantity,
      r.requiredQty,
      r.shortfall,
      r.reorderLevel,
      r.expiresOn ? r.expiresOn.toISOString().slice(0, 10) : '',
      r.hazards.map((h) => labelOf(HAZARDS, h)).join(', '),
      r.storageLocation ?? '',
      r.unitCostMinor / 100,
      r.notes ?? '',
    ])
    const base = `${lab.name} register${filter === 'all' ? '' : ` ${filter}`}`.replace(/[^\w -]+/g, '').trim()

    if (url.searchParams.get('format') === 'xlsx') {
      const sheet = XLSX.utils.aoa_to_sheet([headers, ...data])
      sheet['!cols'] = [{ wch: 36 }, { wch: 16 }, { wch: 15 }, { wch: 8 }, { wch: 9 }, { wch: 16 }, { wch: 10 }, { wch: 10 }, { wch: 11 }, { wch: 22 }, { wch: 20 }, { wch: 12 }, { wch: 30 }]
      const book = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(book, sheet, 'Register')
      const body = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer
      return new Response(new Uint8Array(body), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${base.replace(/\s+/g, '-')}.xlsx"`,
          'Cache-Control': 'no-store',
        },
      })
    }
    return csvResponse(`${base}.csv`, headers, data)
  },
  { permission: 'labs.view' },
)
