import { payablesAttachmentRoute } from '@/server/modules/accounting/payables-attachment-route'

const handlers = payablesAttachmentRoute('purchase-voucher')

export const GET = handlers.GET
export const POST = handlers.POST
