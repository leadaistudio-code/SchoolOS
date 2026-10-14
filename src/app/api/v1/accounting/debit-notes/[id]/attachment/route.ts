import { payablesAttachmentRoute } from '@/server/modules/accounting/payables-attachment-route'

const handlers = payablesAttachmentRoute('debit-note')

export const GET = handlers.GET
export const POST = handlers.POST
