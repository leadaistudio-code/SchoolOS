import {
  type ITallyProvider,
  type TallyCompanyInfo,
  type TallyConnectionResult,
  type TallyLedgerInfo,
  type TallyTransport,
  type TallyVoucherDraft,
  type TallyVoucherResult,
  TALLY_ERROR,
  tallyErrorMessage,
} from './types'
import {
  buildCreateLedgerXml,
  buildListCompaniesXml,
  buildListLedgersXml,
  buildReceiptVoucherXml,
  hasTallyError,
  parseCompanyNames,
  parseLedgerNames,
  stripBom,
  xmlTag,
} from './xml'

/**
 * Tally.ERP 9 provider — XML over HTTP via an injected transport.
 * The transport is either a local connector relay or (self-hosted only) a
 * direct fetch to the school Tally port.
 */
export class TallyErp9Provider implements ITallyProvider {
  readonly kind = 'ERP9' as const

  constructor(private readonly transport: TallyTransport) {}

  async testConnection(companyName?: string | null): Promise<TallyConnectionResult> {
    const started = Date.now()
    try {
      const { status, body, latencyMs } = await this.transport.postXml(
        buildListCompaniesXml(),
        15_000,
      )
      if (status < 200 || status >= 300) {
        return {
          ok: false,
          companies: [],
          companyLoaded: false,
          errorCode: TALLY_ERROR.ENDPOINT_UNREACHABLE,
          errorMessage: tallyErrorMessage(TALLY_ERROR.ENDPOINT_UNREACHABLE),
          latencyMs,
        }
      }
      const text = stripBom(body)
      const companies = parseCompanyNames(text).map((name) => ({ name }))
      const companyLoaded = companies.length > 0
      if (!companyLoaded) {
        return {
          ok: false,
          companies,
          companyLoaded: false,
          errorCode: TALLY_ERROR.COMPANY_NOT_LOADED,
          errorMessage: tallyErrorMessage(TALLY_ERROR.COMPANY_NOT_LOADED),
          latencyMs,
        }
      }
      if (companyName) {
        const found = companies.some(
          (c) => c.name.toLowerCase() === companyName.toLowerCase(),
        )
        if (!found) {
          return {
            ok: false,
            companies,
            companyLoaded: true,
            errorCode: TALLY_ERROR.COMPANY_NOT_FOUND,
            errorMessage: tallyErrorMessage(TALLY_ERROR.COMPANY_NOT_FOUND),
            latencyMs,
          }
        }
      }
      return {
        ok: true,
        companies,
        companyLoaded: true,
        selectedCompany: companyName ?? companies[0]?.name ?? null,
        latencyMs: latencyMs || Date.now() - started,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const code = /timeout/i.test(message) ? TALLY_ERROR.TIMEOUT : TALLY_ERROR.OFFLINE
      return {
        ok: false,
        companies: [],
        companyLoaded: false,
        errorCode: code,
        errorMessage: tallyErrorMessage(code),
        latencyMs: Date.now() - started,
      }
    }
  }

  async listCompanies(): Promise<TallyCompanyInfo[]> {
    const result = await this.testConnection()
    return result.companies
  }

  async listLedgers(companyName: string): Promise<TallyLedgerInfo[]> {
    const { status, body } = await this.transport.postXml(
      buildListLedgersXml(companyName),
      60_000,
    )
    if (status < 200 || status >= 300) {
      throw new Error(tallyErrorMessage(TALLY_ERROR.ENDPOINT_UNREACHABLE))
    }
    const err = hasTallyError(body)
    if (err) throw new Error(err.message)
    return parseLedgerNames(stripBom(body)).map((row) => ({
      name: row.name,
      parent: row.parent,
      isParty: /sundry debtors|sundry creditors/i.test(row.parent ?? ''),
    }))
  }

  async createLedger(input: {
    companyName: string
    name: string
    parent: string
  }) {
    const { status, body } = await this.transport.postXml(buildCreateLedgerXml(input), 30_000)
    if (status < 200 || status >= 300) {
      return { ok: false, errorMessage: tallyErrorMessage(TALLY_ERROR.ENDPOINT_UNREACHABLE) }
    }
    const err = hasTallyError(body)
    if (err) return { ok: false, errorMessage: err.message }
    const created = xmlTag(body, 'CREATED')
    if (created === '0') {
      return { ok: false, errorMessage: 'Tally did not create the ledger' }
    }
    return { ok: true }
  }

  async createVoucher(input: {
    companyName: string
    voucher: TallyVoucherDraft
  }): Promise<TallyVoucherResult> {
    const xml = buildReceiptVoucherXml({
      companyName: input.companyName,
      date: input.voucher.date,
      voucherType: input.voucher.voucherType,
      narration: input.voucher.narration,
      partyLedgerName: input.voucher.partyLedgerName,
      lines: input.voucher.lines,
      remoteReference: input.voucher.remoteReference,
    })
    const { status, body } = await this.transport.postXml(xml, 30_000)
    if (status < 200 || status >= 300) {
      return {
        ok: false,
        errorCode: TALLY_ERROR.ENDPOINT_UNREACHABLE,
        errorMessage: tallyErrorMessage(TALLY_ERROR.ENDPOINT_UNREACHABLE),
        raw: body.slice(0, 2000),
      }
    }
    const err = hasTallyError(body)
    if (err) {
      return {
        ok: false,
        errorCode: TALLY_ERROR.VOUCHER_CREATION_FAILED,
        errorMessage: err.message,
        raw: body.slice(0, 2000),
      }
    }
    const created = xmlTag(body, 'CREATED')
    const voucherNumber =
      xmlTag(body, 'VOUCHERNUMBER') ?? xmlTag(body, 'REMOTEID') ?? created
    return {
      ok: true,
      voucherNumber,
      masterId: xmlTag(body, 'MASTERID'),
      raw: body.slice(0, 2000),
    }
  }
}
