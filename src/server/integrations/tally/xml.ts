/**
 * XML helpers for Tally.ERP 9 envelopes.
 * External entity resolution is never enabled — responses are treated as text.
 */

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, '').trim()
}

export function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
}

/** Tally names must never carry markup — strips stray tags left by older connectors. */
export function cleanTallyName(value: string | null | undefined): string | null {
  if (value == null) return null
  const cleaned = decodeXml(value.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim()
  return cleaned.length ? cleaned : null
}

/** Extract first matching tag text (non-greedy, case-insensitive). */
export function xmlTag(body: string, tag: string): string | null {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i')
  const m = body.match(re)
  return m?.[1]?.trim() ?? null
}

export function xmlTags(body: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'gi')
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(body))) {
    if (m[1] != null) out.push(m[1].trim())
  }
  return out
}

export function hasTallyError(body: string): { code: string; message: string } | null {
  const lineError = xmlTag(body, 'LINEERROR')
  if (lineError) return { code: 'LINEERROR', message: lineError }
  const exceptions = xmlTag(body, 'EXCEPTIONS')
  if (exceptions && exceptions !== '0') {
    return { code: 'EXCEPTIONS', message: `Tally reported ${exceptions} exception(s)` }
  }
  return null
}

export function buildExportRequest(id: string, companyName?: string | null): string {
  const staticVars = companyName
    ? `<STATICVARIABLES><SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY></STATICVARIABLES>`
    : ''
  return `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
 <HEADER>
  <VERSION>1</VERSION>
  <TALLYREQUEST>Export</TALLYREQUEST>
  <TYPE>Data</TYPE>
  <ID>${escapeXml(id)}</ID>
 </HEADER>
 <BODY>
  <DESC>
   ${staticVars}
  </DESC>
 </BODY>
</ENVELOPE>`
}

export function buildListCompaniesXml(): string {
  return buildExportRequest('List of Companies')
}

/** Inline-TDL collection export — works on stock Tally.ERP 9 without custom reports. */
export function buildListLedgersXml(companyName: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
 <HEADER>
  <VERSION>1</VERSION>
  <TALLYREQUEST>Export</TALLYREQUEST>
  <TYPE>Collection</TYPE>
  <ID>MCV Ledger List</ID>
 </HEADER>
 <BODY>
  <DESC>
   <STATICVARIABLES>
    <SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>
    <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
   </STATICVARIABLES>
   <TDL>
    <TDLMESSAGE>
     <COLLECTION NAME="MCV Ledger List" ISMODIFY="No">
      <TYPE>Ledger</TYPE>
      <FETCH>Name, Parent, Guid</FETCH>
     </COLLECTION>
    </TDLMESSAGE>
   </TDL>
  </DESC>
 </BODY>
</ENVELOPE>`
}

/**
 * Minimal Receipt voucher import.
 * Amounts are major units (₹) as Tally expects decimal amounts in XML.
 * Structure follows Tally.ERP 9 documented IMPORT DATA / VOUCHERS pattern —
 * validate against a live company before production cut-over.
 */
export function buildReceiptVoucherXml(input: {
  companyName: string
  date: string
  voucherType: string
  narration: string
  partyLedgerName?: string | null
  lines: Array<{ ledgerName: string; amount: number; isDebit: boolean }>
  remoteReference?: string | null
}): string {
  const entries = input.lines
    .map((line) => {
      const amount = line.isDebit ? line.amount : -Math.abs(line.amount)
      return `<ALLLEDGERENTRIES.LIST>
  <LEDGERNAME>${escapeXml(line.ledgerName)}</LEDGERNAME>
  <ISDEEMEDPOSITIVE>${line.isDebit ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>
  <AMOUNT>${amount.toFixed(2)}</AMOUNT>
</ALLLEDGERENTRIES.LIST>`
    })
    .join('\n')

  const party = input.partyLedgerName
    ? `<PARTYLEDGERNAME>${escapeXml(input.partyLedgerName)}</PARTYLEDGERNAME>`
    : ''
  const remote = input.remoteReference
    ? `<REMOTEALTGUID>${escapeXml(input.remoteReference)}</REMOTEALTGUID>`
    : ''

  return `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
 <HEADER>
  <VERSION>1</VERSION>
  <TALLYREQUEST>Import</TALLYREQUEST>
  <TYPE>Data</TYPE>
  <ID>Vouchers</ID>
 </HEADER>
 <BODY>
  <DESC>
   <STATICVARIABLES>
    <SVCURRENTCOMPANY>${escapeXml(input.companyName)}</SVCURRENTCOMPANY>
   </STATICVARIABLES>
  </DESC>
  <DATA>
   <TALLYMESSAGE>
    <VOUCHER VCHTYPE="${escapeXml(input.voucherType)}" ACTION="Create">
     <DATE>${escapeXml(input.date)}</DATE>
     <NARRATION>${escapeXml(input.narration)}</NARRATION>
     <VOUCHERTYPENAME>${escapeXml(input.voucherType)}</VOUCHERTYPENAME>
     ${party}
     ${remote}
     ${entries}
    </VOUCHER>
   </TALLYMESSAGE>
  </DATA>
 </BODY>
</ENVELOPE>`
}

export function buildCreateLedgerXml(input: {
  companyName: string
  name: string
  parent: string
}): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
 <HEADER>
  <VERSION>1</VERSION>
  <TALLYREQUEST>Import</TALLYREQUEST>
  <TYPE>Data</TYPE>
  <ID>All Masters</ID>
 </HEADER>
 <BODY>
  <DESC>
   <STATICVARIABLES>
    <SVCURRENTCOMPANY>${escapeXml(input.companyName)}</SVCURRENTCOMPANY>
   </STATICVARIABLES>
  </DESC>
  <DATA>
   <TALLYMESSAGE>
    <LEDGER NAME="${escapeXml(input.name)}" ACTION="Create">
     <NAME.LIST>
      <NAME>${escapeXml(input.name)}</NAME>
     </NAME.LIST>
     <PARENT>${escapeXml(input.parent)}</PARENT>
     <ISBILLWISEON>No</ISBILLWISEON>
    </LEDGER>
   </TALLYMESSAGE>
  </DATA>
 </BODY>
</ENVELOPE>`
}

function uniqueClean(values: string[]): string[] {
  const out = values.map((v) => cleanTallyName(v)).filter((v): v is string => !!v && v.length < 200)
  return [...new Set(out)]
}

export function parseCompanyNames(body: string): string[] {
  const names = uniqueClean(xmlTags(body, 'COMPANYNAME'))
  if (names.length) return names
  // Some exports wrap name in NAME under COMPANY
  return uniqueClean(xmlTags(body, 'NAME'))
}

export function parseLedgerNames(body: string): Array<{ name: string; parent: string | null; guid: string | null }> {
  const re = /<LEDGER((?:\s[^>]*)?)>([\s\S]*?)<\/LEDGER>/gi
  const rows = new Map<string, { name: string; parent: string | null; guid: string | null }>()
  let m: RegExpExecArray | null
  while ((m = re.exec(body))) {
    const attrs = m[1] ?? ''
    const inner = m[2] ?? ''
    const attrName = attrs.match(/\bNAME="([^"]*)"/i)?.[1] ?? null
    const name = cleanTallyName(attrName) ?? cleanTallyName(xmlTag(inner, 'NAME'))
    if (!name || rows.has(name)) continue
    rows.set(name, {
      name,
      parent: cleanTallyName(xmlTag(inner, 'PARENT')),
      guid: cleanTallyName(xmlTag(inner, 'GUID')),
    })
  }
  if (rows.size === 0) {
    for (const name of uniqueClean(xmlTags(body, 'NAME'))) rows.set(name, { name, parent: null, guid: null })
  }
  return [...rows.values()]
}
