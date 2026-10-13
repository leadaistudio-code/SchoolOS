// Proposal cover emails, one per school (HTML + plain text).
// Usage: node docs/email-templates/proposals/build-emails.mjs
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

const SENDER = { name: 'Manmohan Singh', title: 'Growth Manager', email: 'contact@mycampusview.com' }
const VALID_UNTIL = '13 October 2026'

const schools = [
  { file: 'Cosmos-Public-School', name: 'Cosmos Public School', short: 'Cosmos', ref: 'MCV/P/2026-27/101' },
  { file: 'Raj-Modern-Public-School-RMPS', name: 'Raj Modern Public School (RMPS)', short: 'RMPS', ref: 'MCV/P/2026-27/102' },
  { file: 'Ratanjee-Modern-School', name: 'Ratanjee Modern School', short: 'Ratanjee Modern School', ref: 'MCV/P/2026-27/103' },
  { file: 'Stanford-Convent-School', name: 'Stanford Convent School', short: 'Stanford Convent School', ref: 'MCV/P/2026-27/104' },
  { file: 'Green-Valley-Public-School', name: 'Green Valley Public School', short: 'Green Valley', ref: 'MCV/P/2026-27/105', validUntil: '15 October 2026' },
  { file: 'Mir-Public-School', name: 'Mir Public School', short: 'Mir Public School', ref: 'MCV/P/2026-27/106', validUntil: '15 October 2026' },
]

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
const NAVY = '#002046'
const ORANGE = '#f45a1e'

const points = [
  ['Fees &amp; accounts', 'Live dues, receipts, reminders, online payment and Tally export â€” no registers to reconcile.'],
  ['Attendance &amp; academics', 'Registers on the phone with instant parent alerts, timetable, marks and report cards.'],
  ['Parents &amp; communication', 'A parent app for attendance, homework, results and fees, plus WhatsApp notifications.'],
  ['Operations', 'Admissions, transport tracking, library, store, gate passes and CCTV live view.'],
]

const subject = (s) => `Proposal for ${s.name} â€” MyCampusView School ERP`

function html(s) {
  const row = ([h, d], last) => `
                      <tr>
                        <td width="22" valign="top" style="padding:${last ? '0' : '0 0 14px'} 0;font-family:${FONT};font-size:15px;line-height:22px;color:${ORANGE};font-weight:700;">&#10003;</td>
                        <td valign="top" style="padding:${last ? '0' : '0 0 14px'} 0;font-family:${FONT};">
                          <p style="margin:0 0 2px;font-size:15px;line-height:22px;font-weight:600;color:#0a1024;">${h}</p>
                          <p style="margin:0;font-size:14px;line-height:21px;color:#5b6577;">${d}</p>
                        </td>
                      </tr>`

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<title>${subject(s)}</title>
<style>
  @media only screen and (max-width:620px) {
    .mcv-shell { width:100% !important; }
    .mcv-pad   { padding-left:22px !important; padding-right:22px !important; }
  }
  a { text-decoration:none; }
</style>
</head>
<!--
  Subject: ${subject(s)}
  Attach:  MyCampusView-Proposal-${s.file}.pdf  (docs/sales/proposals/)
-->
<body style="margin:0;padding:0;background-color:#f4f5f8;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;opacity:0;color:transparent;height:0;width:0;">
    Our proposal for ${s.short} is attached â€” fees, attendance, academics and parent communication on one platform.
  </div>
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f4f5f8;">
    <tr>
      <td align="center" style="padding:28px 12px;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="600" class="mcv-shell" style="width:600px;max-width:600px;border-collapse:collapse;">

          <tr>
            <td align="left" bgcolor="${NAVY}" style="background-color:${NAVY};padding:22px 36px;border-radius:12px 12px 0 0;">
              <img src="https://www.mycampusview.com/brand/mycampusview-lockup.png" width="190" height="32" alt="MyCampusView"
                   style="display:block;border:0;outline:none;width:190px;height:32px;font-family:${FONT};font-size:21px;font-weight:800;color:#ffffff;">
            </td>
          </tr>

          <tr>
            <td bgcolor="#ffffff" style="background-color:#ffffff;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td class="mcv-pad" style="padding:34px 36px 6px;font-family:${FONT};">
                    <p style="margin:0 0 6px;font-size:12px;line-height:18px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${ORANGE};">Proposal Â· ${s.ref}</p>
                    <h1 style="margin:0 0 20px;font-size:24px;line-height:31px;font-weight:700;color:#0a1024;">A connected digital campus for ${s.short}</h1>
                    <p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#3d4759;">Dear Sir / Madam,</p>
                    <p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#3d4759;">
                      Thank you for the opportunity to share how MyCampusView can support your school. Please find
                      attached our proposal for implementing <strong style="color:#0a1024;">MyCampusView School ERP</strong> at ${s.name}.
                    </p>
                    <p style="margin:0 0 22px;font-size:15px;line-height:24px;color:#3d4759;">
                      It explains how ${s.short} can run admissions, fees, attendance, academics, parent communication
                      and daily operations on one platform â€” with your schoolâ€™s name and logo â€” and how our team
                      will take you live in four to six weeks.
                    </p>
                  </td>
                </tr>

                <tr>
                  <td class="mcv-pad" style="padding:0 36px;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f7f8fb;border:1px solid #e6e9f0;border-radius:10px;">
                      <tr><td style="padding:20px 22px;">
                        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">${points.map((p, i) => row(p, i === points.length - 1)).join('')}
                        </table>
                      </td></tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td class="mcv-pad" style="padding:24px 36px 0;font-family:${FONT};">
                    <p style="margin:0 0 20px;font-size:15px;line-height:24px;color:#3d4759;">
                      The best next step is a short live demonstration for your management and office team,
                      set up with ${s.short}â€™s own classes and fee structure. Please suggest a convenient day and time,
                      or book a slot below.
                    </p>
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td bgcolor="${ORANGE}" style="background-color:${ORANGE};border-radius:8px;">
                          <a href="https://www.mycampusview.com/book-demo"
                             style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:15px;font-weight:600;line-height:20px;color:#ffffff;text-decoration:none;border-radius:8px;">
                            Schedule a live demo
                          </a>
                        </td>
                      </tr>
                    </table>
                    <p style="margin:20px 0 26px;font-size:13px;line-height:20px;color:#6b7385;">
                      The proposal is valid until ${s.validUntil ?? VALID_UNTIL}. Commercial terms will follow in a formal quotation
                      once the scope is confirmed.
                    </p>
                  </td>
                </tr>

                <tr>
                  <td class="mcv-pad" style="padding:0 36px 32px;border-top:1px solid #eceef3;font-family:${FONT};">
                    <p style="margin:22px 0 4px;font-size:15px;line-height:22px;color:#3d4759;">Warm regards,</p>
                    <p style="margin:0 0 2px;font-size:16px;line-height:23px;font-weight:700;color:#0a1024;">${SENDER.name}</p>
                    <p style="margin:0 0 2px;font-size:14px;line-height:21px;color:#5b6577;">${SENDER.title}, MyCampusView</p>
                    <p style="margin:0;font-size:14px;line-height:21px;">
                      <a href="mailto:${SENDER.email}" style="color:${NAVY};font-weight:600;text-decoration:none;">${SENDER.email}</a>
                      <span style="color:#a0a7b4;">&nbsp;Â·&nbsp;</span>
                      <a href="https://www.mycampusview.com" style="color:${NAVY};font-weight:600;text-decoration:none;">www.mycampusview.com</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:18px 36px 4px;font-family:${FONT};font-size:12px;line-height:19px;color:#7b8394;">
              <strong style="color:#4a5468;">MyCampusView</strong> &nbsp;Â·&nbsp; One platform for the whole school
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`
}

function text(s) {
  return `Subject: ${subject(s)}

Dear Sir / Madam,

Thank you for the opportunity to share how MyCampusView can support your school. Please find attached our proposal for implementing MyCampusView School ERP at ${s.name} (ref. ${s.ref}).

It explains how ${s.short} can run admissions, fees, attendance, academics, parent communication and daily operations on one platform â€” with your school's name and logo â€” and how our team will take you live in four to six weeks.

What it covers:
${points.map(([h, d]) => `â€¢ ${h.replace(/&amp;/g, '&')}: ${d}`).join('\n')}

The best next step is a short live demonstration for your management and office team, set up with ${s.short}'s own classes and fee structure. Please suggest a convenient day and time, or book a slot here: https://www.mycampusview.com/book-demo

The proposal is valid until ${s.validUntil ?? VALID_UNTIL}. Commercial terms will follow in a formal quotation once the scope is confirmed.

Warm regards,
${SENDER.name}
${SENDER.title}, MyCampusView
${SENDER.email} Â· www.mycampusview.com
`
}

for (const s of schools) {
  writeFileSync(join(here, `Email-${s.file}.html`), html(s))
  writeFileSync(join(here, `Email-${s.file}.txt`), text(s))
  console.log('wrote', s.file)
}
