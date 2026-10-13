// Builds per-school commercial quotations (HTML + PDF) in the proposal style.
// Usage: node docs/sales/proposals/build-quotations.mjs [file]
import { writeFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const SIGNATORY = { name: 'Manmohan Singh', title: 'Growth Manager' }
const LOGO = 'mycampusview-lockup.png'
const TOTAL = 3

const inr = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`

// Module catalogue: key → [title, items]. Each quotation picks the keys it includes.
const MODULES = {
  admissions: ['Admissions &amp; front office', ['Enquiry pipeline with follow-ups and conversion reports', 'Online admission form that feeds the pipeline', 'Visitor log and appointments', 'Gate passes and student pickup with OTP / QR check']],
  sis: ['Student information', ['One record per child: profile, guardians, documents', 'Branded student and staff ID cards', 'Transfer certificates and year-end promotions', 'Bulk import of existing student data']],
  attendance: ['Attendance &amp; leave', ['Daily and period-wise registers on phone or desktop', 'Instant absence alerts to parents', 'Staff attendance with geofence or biometric devices', 'Leave apply → approve with balances']],
  academics: ['Academics &amp; timetable', ['Automatic timetable generator with locked periods', 'Teacher substitution board with fair allocation', 'Homework, classwork log and syllabus tracking', 'Academic calendar for staff and parents']],
  exams: ['Examinations &amp; report cards', ['Exam schedules, rooms and admit cards', 'Marks entry with review and approval workflow', 'Configurable grading and holistic report cards', 'Question bank, paper builder and QR certificates']],
  fees: ['Fees &amp; collections', ['Fee structures, instalments and concessions', 'Counter, cheque and online collection with receipts', 'Live dues, reminders and late-fee rules', 'Day-end collection report for the accountant']],
  accounts: ['Accounts &amp; Tally', ['Chart of accounts and journal entries', 'Trial balance, profit &amp; loss, balance sheet', 'Expense heads and expense tracking', 'Export of fee and expense vouchers to Tally']],
  communication: ['Communication', ['Notices by class, section or role', 'Parent–teacher messaging inside the app', 'SMS and WhatsApp notifications', 'Daily WhatsApp summary for the principal']],
  parents: ['Parent self-service', ['Parent app: attendance, fees, results, homework', 'Online fee payment and receipt download', 'Two-way WhatsApp assistant for common queries', 'Parent queries routed to the front office']],
  staff: ['Staff &amp; HR', ['Staff records, documents and appraisals', 'Leave balances and approvals', 'Staff attendance reports', 'Role-based logins for every staff member']],
  dashboard: ['Management &amp; control', ['Live dashboard and school health score', 'Standard reports with print / Excel export', 'Custom roles and permission-level access', 'Audit trail on fees, results and permissions']],
}

const EXCLUDABLE = {
  transport: ['Transport', 'Buses, routes, stops, live GPS tracking and transport fees'],
  inventory: ['Inventory management', 'School store, stock, purchases and billing (POS)'],
  cctv: ['CCTV live view', 'Camera viewing for management and parents in the app'],
  library: ['Library', 'Catalogue, issue / return and overdue fines'],
  events: ['Events &amp; sports', 'Event calendar, sports fixtures and results'],
}

const quotations = [
  {
    file: 'Green-Valley-Public-School',
    school: 'Green Valley Public School',
    short: 'Green Valley',
    ref: 'MCV/Q/2026-27/105',
    proposalRef: 'MCV/P/2026-27/105',
    date: '8 October 2026',
    validUntil: '7 November 2026',
    pack: 'Custom',
    setupFee: 20000,
    yearly: 240000,
    monthly: 21000,
    included: ['admissions', 'sis', 'attendance', 'academics', 'exams', 'fees', 'accounts', 'communication', 'parents', 'staff', 'dashboard'],
    excluded: ['transport', 'inventory', 'cctv', 'library', 'events'],
  },
]

const li = (items) => items.map((i) => `<li>${i}</li>`).join('')

const header = (q, title) => `
  <header class="hdr">
    <img src="${LOGO}" alt="MyCampusView" />
    <div class="hdr-meta"><strong>${title}</strong>Quotation ${q.ref} · ${q.date}</div>
  </header>`

const footer = (q, n) => `
  <footer class="pf">
    <span>${q.school} · Quotation ${q.ref}</span>
    <span>Confidential</span>
    <strong>Page ${n} / ${TOTAL}</strong>
  </footer>`

function page(q) {
  const monthlyYear = q.monthly * 12
  const saving = monthlyYear - q.yearly
  const inc = q.included.map((k) => MODULES[k])
  const exc = q.excluded.map((k) => EXCLUDABLE[k])

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>MyCampusView — Quotation ${q.ref} · ${q.school}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=Source+Sans+3:wght@400;600;700&display=swap" rel="stylesheet" />
<style>
  :root {
    --ink: #0a1024; --ink-soft: #3a4254; --ink-faint: #6b7385;
    --wash: #f4f5f8; --rule: #d8dce6;
    --violet: #5b3fd4; --violet-deep: #3d28a8; --violet-soft: #efeaff;
    --mint: #1f9d5c; --mint-soft: #e8f8ef; --lime: #b8e04a; --red: #b42318;
    --on-dark: #f6f5f2; --on-dark-soft: #b0b6c6;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  @page { size: A4; margin: 0; }
  html, body {
    background: #cfcad8; color: var(--ink);
    font-family: "Source Sans 3", "Segoe UI", sans-serif; font-size: 10.5pt; line-height: 1.42;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .page {
    width: 210mm; height: 297mm; margin: 12px auto; background: #fff; overflow: hidden;
    display: flex; flex-direction: column; box-shadow: 0 12px 40px rgba(10,16,36,.18);
    break-after: page; page-break-after: always;
  }
  .page:last-child { break-after: auto; page-break-after: auto; }
  @media print { html, body { background: #fff; } .page { margin: 0; box-shadow: none; } }

  .hdr { background: #000; padding: 11px 12mm; display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
  .hdr img { height: 38px; display: block; }
  .hdr-meta { text-align: right; color: var(--on-dark-soft); font-size: 9.5pt; line-height: 1.3; }
  .hdr-meta strong { display: block; color: var(--on-dark); font-size: 12pt; }
  .pf {
    margin-top: auto; flex-shrink: 0; display: flex; justify-content: space-between; align-items: center;
    padding: 8px 12mm; border-top: 1px solid var(--rule); background: var(--wash); font-size: 9pt; color: var(--ink-faint);
  }
  .pf strong { color: var(--ink); }
  .body { padding: 8mm 12mm 6mm; display: flex; flex-direction: column; gap: 5mm; }

  .eyebrow { font-family: Manrope, sans-serif; font-size: 9pt; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--violet); }
  h1.t { font-family: Manrope, sans-serif; font-size: 20pt; font-weight: 800; letter-spacing: -.02em; line-height: 1.15; margin-top: 2px; }
  .sub { color: var(--ink-faint); font-size: 10.5pt; margin-top: 3px; }
  h3 { font-family: Manrope, sans-serif; font-weight: 800; }

  .meta { display: grid; grid-template-columns: 1.5fr 1fr 1fr 1fr; border: 1px solid var(--rule); border-radius: 10px; overflow: hidden; }
  .meta div { padding: 3mm 4mm; background: var(--wash); }
  .meta div + div { border-left: 1px solid var(--rule); }
  .meta small { display: block; font-size: 8pt; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-faint); }
  .meta span { font-weight: 700; font-size: 10.5pt; }

  .pack {
    border-radius: 14px; color: var(--on-dark); padding: 7mm 8mm;
    background:
      radial-gradient(120% 90% at 100% 0%, rgba(91,63,212,.35), transparent 55%),
      radial-gradient(90% 70% at 0% 100%, rgba(31,157,92,.22), transparent 50%),
      linear-gradient(160deg, #000 0%, #0d1224 55%, #0a1024 100%);
  }
  .pack .tag { font-family: Manrope, sans-serif; font-size: 9pt; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: var(--lime); }
  .pack h2 { font-family: Manrope, sans-serif; font-size: 30pt; font-weight: 800; letter-spacing: -.03em; line-height: 1.05; margin: 2mm 0 2mm; }
  .pack p { color: var(--on-dark-soft); font-size: 11pt; max-width: 150mm; }
  .prices { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; margin-top: 5mm; }
  .price { border-radius: 10px; padding: 4.5mm 5mm; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.16); position: relative; }
  .price.best { background: rgba(184,224,74,.10); border-color: rgba(184,224,74,.55); }
  .price .lbl { font-family: Manrope, sans-serif; font-size: 9pt; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--on-dark-soft); }
  .price .amt { font-family: Manrope, sans-serif; font-size: 26pt; font-weight: 800; color: #fff; letter-spacing: -.02em; line-height: 1.1; margin-top: 1mm; }
  .price .amt i { font-style: normal; font-size: 12pt; font-weight: 700; color: var(--on-dark-soft); }
  .price .note { font-size: 9.5pt; color: var(--on-dark-soft); margin-top: 1.5mm; }
  .price .flag { position: absolute; top: 4mm; right: 4mm; font-size: 8pt; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; background: var(--lime); color: #0a1024; padding: 2px 8px; border-radius: 999px; font-family: Manrope, sans-serif; }

  .pack .setup { display: flex; justify-content: space-between; align-items: baseline; margin-top: 3.5mm; padding: 3mm 5mm; border-radius: 10px; border: 1px dashed rgba(255,255,255,.25); color: var(--on-dark-soft); font-size: 10.5pt; }
  .pack .setup b { font-family: Manrope, sans-serif; font-size: 15pt; color: #fff; }
  table.bill tr.total td small { font-family: "Source Sans 3", sans-serif; font-weight: 400; }
  .sec { font-family: Manrope, sans-serif; font-size: 10pt; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: var(--ink); border-bottom: 2px solid var(--ink); padding-bottom: 1.5mm; margin-bottom: 3mm; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chips span { font-size: 9.6pt; font-weight: 700; padding: 4px 10px; border-radius: 999px; }
  .chips.in span { background: var(--mint-soft); color: #136c3f; border: 1px solid #bfe8d1; }
  .chips.in span::before { content: "✓ "; }
  .chips.out span { background: #f4f4f6; color: var(--ink-faint); border: 1px dashed #c3c8d4; text-decoration: line-through; text-decoration-color: rgba(107,115,133,.5); }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; }
  .box { border: 1px solid var(--rule); border-radius: 10px; padding: 4mm 5mm; background: var(--wash); }
  .box h3 { font-size: 11pt; margin-bottom: 2mm; color: var(--violet-deep); }
  .box ul { list-style: none; display: grid; gap: 1.4mm; }
  .box li { font-size: 10pt; color: var(--ink-soft); padding-left: 14px; position: relative; }
  .box li::before { content: "→"; position: absolute; left: 0; color: var(--violet); font-weight: 800; }
  .box.dark { background: linear-gradient(145deg, #0a1024, #1a1240); border: 0; }
  .box.dark h3 { color: var(--lime); }
  .box.dark li { color: var(--on-dark-soft); }
  .box.dark li::before { color: var(--lime); }

  .mods { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2.6mm; }
  .mod { border: 1px solid var(--rule); border-radius: 10px; overflow: hidden; }
  .mod h3 { font-size: 10.2pt; color: var(--violet-deep); padding: 2mm 3.2mm; background: linear-gradient(90deg, var(--violet-soft), #fff); border-bottom: 1px solid var(--rule); }
  .mod ul { list-style: none; padding: 2.2mm 3.2mm 2.6mm; display: grid; gap: 1.1mm; }
  .mod li { font-size: 9pt; line-height: 1.28; color: var(--ink-soft); padding-left: 12px; position: relative; }
  .mod li::before { content: ""; position: absolute; left: 0; top: 5px; width: 7px; height: 7px; border-radius: 2px; background: var(--mint); }
  .mod.platform { background: var(--ink); border-color: var(--ink); }
  .mod.platform h3 { background: transparent; color: var(--lime); border-bottom-color: rgba(255,255,255,.12); }
  .mod.platform li { color: var(--on-dark-soft); }
  .mod.platform li::before { background: var(--lime); }

  .body.tight { padding-top: 6mm; gap: 3.5mm; }
  .body.compact { padding-top: 6.5mm; gap: 4mm; }
  .body.compact table.bill td { padding: 2.1mm 4mm; }
  .body.compact .box li { font-size: 9.6pt; }
  .body.compact .accept p { padding: 2.4mm 0 .8mm; }
  .body.tight .mods { gap: 2.2mm; }
  .body.tight .mod h3 { padding: 1.6mm 3mm; font-size: 9.8pt; }
  .body.tight .mod ul { padding: 1.8mm 3mm 2mm; gap: .7mm; }
  .body.tight .mod li { font-size: 8.7pt; line-height: 1.24; }
  .excl { display: grid; grid-template-columns: repeat(5, 1fr); gap: 2.4mm; }
  .excl div { border: 1px dashed #c3c8d4; border-radius: 8px; padding: 2.4mm 2.8mm; background: var(--wash); display: flex; flex-direction: column; gap: .8mm; }
  .excl b { font-family: Manrope, sans-serif; font-size: 9.4pt; color: var(--ink); }
  .excl span { font-size: 8.4pt; line-height: 1.25; color: var(--ink-soft); }
  .excl em { margin-top: auto; font-style: normal; font-size: 7.6pt; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; color: var(--ink-faint); }

  table.bill { width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid var(--rule); border-radius: 10px; overflow: hidden; }
  table.bill th { font-family: Manrope, sans-serif; font-size: 9.5pt; text-align: left; padding: 2.8mm 4mm; background: var(--ink); color: #fff; }
  table.bill th.r, table.bill td.r { text-align: right; white-space: nowrap; }
  table.bill td { padding: 2.6mm 4mm; font-size: 10pt; border-top: 1px solid var(--rule); color: var(--ink-soft); vertical-align: top; }
  table.bill td b { color: var(--ink); }
  table.bill td small { display: block; color: var(--ink-faint); font-size: 8.8pt; }
  table.bill tr.total td { background: var(--violet-soft); color: var(--ink); font-weight: 800; font-family: Manrope, sans-serif; }

  .terms ol { columns: 2; column-gap: 7mm; padding-left: 4mm; }
  .terms li { font-size: 8.6pt; color: var(--ink-soft); line-height: 1.32; margin-bottom: 1.4mm; break-inside: avoid; }
  .accept { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
  .accept div { border-top: 2px solid var(--ink); padding-top: 2.5mm; }
  .accept h3 { font-size: 10.5pt; margin-bottom: 1mm; }
  .accept p { font-size: 9.4pt; color: var(--ink-faint); border-bottom: 1px dotted #aab; padding: 3mm 0 1mm; }
  .accept .fill { color: var(--ink); font-weight: 700; }
  .note { font-size: 9pt; color: var(--ink-faint); }
</style>
</head>
<body>

<!-- 1 · summary -->
<section class="page">
  ${header(q, 'Commercial quotation')}
  <div class="body">
    <div class="meta">
      <div><small>Prepared for</small><span>${q.school}</span></div>
      <div><small>Quotation ref</small><span>${q.ref}</span></div>
      <div><small>Date</small><span>${q.date}</span></div>
      <div><small>Valid until</small><span>${q.validUntil}</span></div>
    </div>

    <div class="pack">
      <div class="tag">Your package</div>
      <h2>${q.pack}</h2>
      <p>A package built around what ${q.short} asked for: every core MyCampusView module for the office, accounts, teachers and parents, without the operations modules the school has chosen not to use.</p>
      <div class="prices">
        <div class="price best">
          <span class="flag">Save ${inr(saving)}</span>
          <div class="lbl">Yearly plan</div>
          <div class="amt">${inr(q.yearly)} <i>/ year</i></div>
          <div class="note">Billed once a year in advance · GST extra</div>
        </div>
        <div class="price">
          <div class="lbl">Monthly plan</div>
          <div class="amt">${inr(q.monthly)} <i>/ month</i></div>
          <div class="note">${inr(monthlyYear)} over 12 months · GST extra</div>
        </div>
      </div>
      <div class="setup"><span>One-time onboarding, data migration &amp; training</span><b>${inr(q.setupFee)}</b></div>
    </div>

    <div>
      <div class="sec">Included in ${q.pack}</div>
      <div class="chips in">${inc.map(([h]) => `<span>${h}</span>`).join('')}</div>
    </div>
    <div>
      <div class="sec">Not opted by ${q.short}</div>
      <div class="chips out">${exc.map(([h]) => `<span>${h}</span>`).join('')}</div>
      <p class="note" style="margin-top:2mm">Any of these can be added later on request with a separate quotation; no re-setup is needed.</p>
    </div>

    <div class="two">
      <div class="box"><h3>Included with the subscription</h3><ul>
        <li>Role-based logins for staff, parents and students</li>
        <li>School name, logo and colours on app, receipts and report cards</li>
        <li>All product updates during the subscription</li>
        <li>Support through the in-app help desk and email</li>
      </ul></div>
      <div class="box dark"><h3>Related documents</h3><ul>
        <li>Proposal ${q.proposalRef} — scope and implementation plan</li>
        <li>Page 2 — included modules in detail</li>
        <li>Page 3 — price breakdown, payment and terms</li>
        <li>Questions: contact@mycampusview.com</li>
      </ul></div>
    </div>
  </div>
  ${footer(q, 1)}
</section>

<!-- 2 · scope -->
<section class="page">
  ${header(q, 'Scope of the pack')}
  <div class="body tight">
    <div>
      <div class="eyebrow">${q.pack} · included modules</div>
      <h1 class="t">Everything ${q.short} needs to run the school day</h1>
      <div class="sub">All included modules work from one student record, on the web portals and the Android app.</div>
    </div>
    <div class="mods">
      ${inc.map(([h, items]) => `<div class="mod"><h3>${h}</h3><ul>${li(items)}</ul></div>`).join('')}
      <div class="mod platform"><h3>Platform</h3><ul>${li(['Web portals for every role + Android app', 'Your school’s branding throughout', 'Two-factor sign-in and role-based access', 'Regular backups and data export any time'])}</ul></div>
    </div>
    <div>
      <div class="sec">Modules not included in this quotation</div>
      <div class="excl">
        ${exc.map(([h, d]) => `<div><b>${h}</b><span>${d}</span><em>Not opted</em></div>`).join('')}
      </div>
    </div>
  </div>
  ${footer(q, 2)}
</section>

<!-- 3 · commercial -->
<section class="page">
  ${header(q, 'Price &amp; terms')}
  <div class="body compact">
    <div>
      <div class="eyebrow">Package</div>
      <h1 class="t">${q.pack}</h1>
      <div class="sub">Choose either the yearly or the monthly plan. Amounts in Indian Rupees, GST extra.</div>
    </div>
    <table class="bill">
      <tr><th>Package</th><th class="r">Yearly plan</th><th class="r">Monthly plan</th></tr>
      <tr class="total"><td>${q.pack}<small>All included modules on page 2</small></td><td class="r">${inr(q.yearly)} / year</td><td class="r">${inr(q.monthly)} / month</td></tr>
    </table>
    <p class="note">On the monthly plan the subscription comes to ${inr(monthlyYear)} over 12 months, so the yearly plan saves ${q.short} ${inr(saving)} a year.</p>

    <table class="bill">
      <tr><th>One-time fee</th><th class="r">Amount</th></tr>
      <tr class="total"><td>Onboarding, data migration &amp; training<small>Remote, by the MyCampusView team · payable once, with the first invoice</small></td><td class="r">${inr(q.setupFee)} one-time</td></tr>
    </table>

    <div class="two">
      <div class="box"><h3>Payment terms</h3><ul>
        <li><b>Yearly:</b> 100% of the annual fee in advance, due within 7 days of invoice</li>
        <li><b>Monthly:</b> billed each month in advance, minimum 12 months</li>
        <li>One-time onboarding fee of ${inr(q.setupFee)} with the first invoice</li>
        <li>Onboarding starts once the first invoice is paid</li>
        <li>Please quote ${q.ref} on every payment</li>
      </ul></div>
      <div class="box"><h3>Charged separately, if used</h3><ul>
        <li>SMS and WhatsApp message charges, at actuals</li>
        <li>Payment-gateway fees on online fee payments</li>
        <li>Hardware: biometric devices, printers, cards</li>
        <li>On-site training days and custom development</li>
        <li>Modules not opted, if added later</li>
      </ul></div>
    </div>

    <div class="terms">
      <div class="sec">Terms &amp; conditions</div>
      <ol>
        <li>Prices are in INR and exclude GST, which is charged extra at the applicable rate.</li>
        <li>This quotation is valid until ${q.validUntil}. Prices are fixed for the first 12-month term.</li>
        <li>The subscription covers the modules listed on page 2 only. Modules marked “Not opted” can be added later at a separately quoted price.</li>
        <li>${q.school} owns its data. A complete export is available at any time and on exit.</li>
        <li>The school provides student, staff and fee data and is responsible for its accuracy.</li>
        <li>Support is available Monday to Saturday during business hours (IST), through the in-app help desk and email.</li>
        <li>Access may be paused after written notice if invoices remain unpaid; it resumes once dues are cleared.</li>
        <li>Prepaid periods are non-refundable unless agreed in writing. The signed agreement prevails over this quotation.</li>
      </ol>
    </div>

    <div>
      <div class="eyebrow" style="margin-bottom:2mm">Acceptance — please tick one: ☐ Yearly plan &nbsp; ☐ Monthly plan</div>
      <div class="accept">
        <div><h3>For ${q.school}</h3><p>Name</p><p>Designation</p><p>Signature &amp; school seal</p><p>Date</p></div>
        <div><h3>For MyCampusView</h3><p>Name: <b class="fill">${SIGNATORY.name}</b></p><p>Designation: <b class="fill">${SIGNATORY.title}</b></p><p>Signature</p><p>Date</p></div>
      </div>
    </div>
  </div>
  ${footer(q, 3)}
</section>

</body>
</html>`
}

const chrome = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(existsSync)

const only = process.argv[2]
for (const q of quotations.filter((x) => !only || x.file === only)) {
  const html = join(here, `MyCampusView-Quotation-${q.file}.html`)
  const pdf = join(here, `MyCampusView-Quotation-${q.file}.pdf`)
  writeFileSync(html, page(q))
  if (!chrome) { console.log('wrote', html, '(no Chrome/Edge found for PDF)'); continue }
  execFileSync(chrome, [
    '--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--virtual-time-budget=15000',
    `--print-to-pdf=${pdf}`, pathToFileURL(html).href,
  ], { stdio: 'ignore' })
  console.log('built', pdf)
}
