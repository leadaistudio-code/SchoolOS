// Builds the 4-page "hook" brochure (HTML + PDF) and publishes the PDF to
// public/downloads so campaign emails can link to it instead of attaching it.
// Usage: node docs/sales/brochure/build-brochure.mjs
import { writeFileSync, existsSync, copyFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..', '..')
const LOGO_LIGHT = '../proposals/mycampusview-lockup.png'
const LOGO_DARK = '../../../public/brand/mycampusview-lockup-dark.png'
const TOTAL = 4

const footer = (n, dark = false) => `
  <footer class="pf${dark ? ' dark' : ''}">
    <span>MyCampusView · School ERP &amp; parent app</span>
    <span>contact@mycampusview.com · www.mycampusview.com</span>
    <strong>${n} / ${TOTAL}</strong>
  </footer>`

const notif = (icon, app, time, title, text, tone = '') => `
  <div class="nt ${tone}">
    <div class="nt-ic">${icon}</div>
    <div class="nt-b">
      <div class="nt-h"><span>${app}</span><span>${time}</span></div>
      <b>${title}</b>
      <p>${text}</p>
    </div>
  </div>`

const day = [
  ['7:50 AM', 'Attendance', 'Paper registers. Then phone calls. Then “Ma’am, he was in the washroom.”', 'Marked on the teacher’s phone in a minute. Parents of absent children get an alert straight away.'],
  ['9:30 AM', 'Fee counter', 'A queue, a receipt book and a cash total that never matches.', 'Parents pay online or at the counter, receipts go out instantly and dues update live.'],
  ['11:00 AM', 'A teacher is absent', 'Staffroom panic and a whiteboard full of arrows.', 'The substitution board suggests a fair cover for every period, in one tap.'],
  ['1:30 PM', '“What’s today’s homework?”', 'The fifteenth call of the day to the front office.', 'Homework, notices and results are already in the parent app, with WhatsApp alerts.'],
  ['4:30 PM', 'Accounts', 'Retyping the day’s receipts into Tally, line by line.', 'Day-end collection report, ledgers and a Tally export, with no retyping.'],
  ['6:00 PM', 'The principal goes home', 'Without knowing today’s numbers until someone sends an Excel file.', 'A one-message WhatsApp summary of the day arrives on its own.'],
]

const test = [
  'Do parents get an alert within minutes when their child is marked absent?',
  'Can parents pay fees online and get the receipt instantly, without calling the office?',
  'Does the principal get a summary of the day on WhatsApp, without asking anyone?',
  'Can your accountant send fee and expense entries to Tally without retyping them?',
  'Does the timetable build itself, and suggest substitutes when a teacher is absent?',
  'Do marks go through a check-and-approve step before report cards are printed?',
  'Is the parent app in your school’s name and logo, rather than the vendor’s?',
  'Can parents see the school bus on a live map?',
  'Can you see who changed a fee, a concession or a mark, and when?',
  'Can you export all of your data, any time, without asking the vendor?',
]

const roles = [
  ['Principal &amp; management', '👑', ['Live dashboard and school health score', 'Daily WhatsApp summary of the school', 'Audit trail on fees, marks and permissions', 'CCTV live view and custom staff roles']],
  ['Accounts &amp; office', '🧾', ['Fee plans, instalments and concessions', 'Counter, cheque and online collection', 'Automatic reminders and late-fee rules', 'Tally export, P&amp;L and balance sheet']],
  ['Teachers', '📚', ['Attendance on the phone in a minute', 'Homework, classwork and syllabus tracking', 'Marks entry with review and approval', 'Question bank and paper builder']],
  ['Parents', '📱', ['Attendance, homework, results and fees', 'Pay fees online, download receipts', 'WhatsApp alerts and a 24×7 assistant', 'Live bus tracking on a map']],
]

const li = (items) => items.map((i) => `<li>${i}</li>`).join('')

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>MyCampusView — Parents track their pizza. Now they can track school.</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=Source+Sans+3:wght@400;600;700&display=swap" rel="stylesheet" />
<style>
  :root {
    --ink: #0a1024; --ink-soft: #3a4254; --ink-faint: #6b7385;
    --wash: #f4f5f8; --rule: #d8dce6;
    --violet: #5b3fd4; --violet-deep: #3d28a8; --violet-soft: #efeaff;
    --mint: #1f9d5c; --mint-soft: #e8f8ef; --lime: #b8e04a; --red: #e23744; --red-soft: #fdecee;
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
    width: 210mm; height: 297mm; margin: 12px auto; background: #fff; overflow: hidden; position: relative;
    display: flex; flex-direction: column; box-shadow: 0 12px 40px rgba(10,16,36,.18);
    break-after: page; page-break-after: always;
  }
  .page:last-child { break-after: auto; page-break-after: auto; }
  @media print { html, body { background: #fff; } .page { margin: 0; box-shadow: none; } }
  .m { font-family: Manrope, sans-serif; }
  .pf {
    margin-top: auto; flex-shrink: 0; display: flex; justify-content: space-between; align-items: center;
    padding: 8px 14mm; border-top: 1px solid var(--rule); background: var(--wash); font-size: 9pt; color: var(--ink-faint);
  }
  .pf strong { color: var(--ink); }
  .pf.dark { background: transparent; border-top-color: rgba(255,255,255,.12); color: var(--on-dark-soft); }
  .pf.dark strong { color: #fff; }
  .eyebrow { font-family: Manrope, sans-serif; font-size: 9pt; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: var(--violet); }
  h2.t { font-family: Manrope, sans-serif; font-size: 25pt; font-weight: 800; letter-spacing: -.025em; line-height: 1.08; margin-top: 2mm; }
  h2.t em { font-style: normal; color: var(--violet); }
  .sub { color: var(--ink-soft); font-size: 11.5pt; margin-top: 2.5mm; max-width: 165mm; }
  .top { display: flex; justify-content: space-between; align-items: center; padding: 9mm 14mm 0; }
  .top img { height: 30px; }
  .top span { font-size: 9pt; font-weight: 700; color: var(--ink-faint); letter-spacing: .06em; text-transform: uppercase; }
  .body { padding: 6mm 14mm 6mm; display: flex; flex-direction: column; gap: 5mm; flex: 1; }

  /* 1 · cover */
  .cover {
    color: var(--on-dark);
    background:
      radial-gradient(90% 60% at 100% 0%, rgba(91,63,212,.55), transparent 60%),
      radial-gradient(70% 50% at 0% 100%, rgba(226,55,68,.28), transparent 60%),
      linear-gradient(165deg, #000 0%, #0d1224 50%, #0a1024 100%);
  }
  .cover .top img { height: 40px; }
  .cover .top span { color: var(--on-dark-soft); }
  .cover .body { padding-top: 14mm; gap: 0; }
  .sticker {
    align-self: flex-start; font-family: Manrope, sans-serif; font-weight: 800; font-size: 9.5pt; letter-spacing: .06em; text-transform: uppercase;
    background: var(--red); color: #fff; padding: 5px 12px; border-radius: 999px; transform: rotate(-2deg);
  }
  .cover h1 {
    font-family: Manrope, sans-serif; font-weight: 800; font-size: 43pt; line-height: 1.02; letter-spacing: -.035em; margin-top: 6mm;
  }
  .cover h1 em { font-style: normal; color: var(--lime); }
  .cover .lede { font-size: 13.5pt; color: var(--on-dark-soft); margin-top: 6mm; max-width: 150mm; line-height: 1.45; }
  .cover .lede b { color: #fff; }
  .stack { margin-top: 10mm; display: grid; gap: 3.2mm; width: 128mm; }
  .stack .nt:nth-child(2) { margin-left: 14mm; }
  .stack .nt:nth-child(3) { margin-left: 6mm; }
  .stack .nt:nth-child(4) { margin-left: 20mm; }
  .nt {
    display: flex; gap: 3.5mm; align-items: flex-start; padding: 3.2mm 4mm; border-radius: 14px;
    background: rgba(255,255,255,.94); color: var(--ink); box-shadow: 0 10px 30px rgba(0,0,0,.35);
  }
  .nt-ic { width: 10mm; height: 10mm; flex-shrink: 0; border-radius: 9px; display: grid; place-items: center; font-size: 15pt; background: var(--violet-soft); }
  .nt.g .nt-ic { background: var(--mint-soft); }
  .nt.r .nt-ic { background: var(--red-soft); }
  .nt.y .nt-ic { background: #fff6d6; }
  .nt-b { flex: 1; min-width: 0; }
  .nt-h { display: flex; justify-content: space-between; font-size: 8pt; font-weight: 700; color: var(--ink-faint); text-transform: uppercase; letter-spacing: .05em; }
  .nt b { display: block; font-family: Manrope, sans-serif; font-size: 10.5pt; margin-top: .4mm; }
  .nt p { font-size: 9.6pt; color: var(--ink-soft); line-height: 1.3; }
  .tease {
    margin-top: auto; display: flex; align-items: center; justify-content: space-between; gap: 6mm;
    border: 1px solid rgba(255,255,255,.18); border-radius: 14px; padding: 5mm 6mm; background: rgba(255,255,255,.05);
  }
  .tease b { font-family: Manrope, sans-serif; font-size: 13pt; color: #fff; display: block; }
  .tease span { font-size: 10.5pt; color: var(--on-dark-soft); }
  .tease .pg { font-family: Manrope, sans-serif; font-weight: 800; font-size: 10pt; color: var(--ink); background: var(--lime); padding: 6px 14px; border-radius: 999px; white-space: nowrap; }
  .cover .pf { margin-top: 7mm; }

  /* 2 · day */
  .tl { display: grid; gap: 2.6mm; }
  .tl-row { display: grid; grid-template-columns: 26mm 1fr 1fr; gap: 3mm; align-items: stretch; }
  .tl-time { font-family: Manrope, sans-serif; font-weight: 800; font-size: 13pt; color: var(--ink); padding-top: 2.4mm; }
  .tl-time small { display: block; font-size: 8.8pt; font-weight: 700; color: var(--violet); letter-spacing: .02em; line-height: 1.2; margin-top: .6mm; }
  .cell { border-radius: 10px; padding: 2.6mm 3.6mm; font-size: 10pt; line-height: 1.32; }
  .cell i { display: block; font-style: normal; font-family: Manrope, sans-serif; font-size: 7.8pt; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; margin-bottom: .6mm; }
  .cell.before { background: var(--red-soft); color: #7a1f27; }
  .cell.before i { color: var(--red); }
  .cell.after { background: var(--mint-soft); color: #134f31; border: 1px solid #bfe8d1; }
  .cell.after i { color: var(--mint); }
  .punch {
    border-radius: 14px; padding: 5mm 6mm; color: var(--on-dark); display: flex; gap: 6mm; align-items: center;
    background: radial-gradient(120% 90% at 100% 0%, rgba(91,63,212,.45), transparent 60%), linear-gradient(160deg, #000, #0d1224);
  }
  .punch b { font-family: Manrope, sans-serif; font-size: 15pt; line-height: 1.2; letter-spacing: -.01em; }
  .punch b em { font-style: normal; color: var(--lime); }
  .punch p { color: var(--on-dark-soft); font-size: 10.2pt; margin-top: 1mm; }
  .punch .big { font-size: 34pt; }

  /* 3 · switch */
  .quiz { border: 2px solid var(--ink); border-radius: 14px; overflow: hidden; }
  .quiz-h { background: var(--ink); color: #fff; padding: 3mm 5mm; display: flex; justify-content: space-between; align-items: baseline; }
  .quiz-h b { font-family: Manrope, sans-serif; font-size: 12pt; }
  .quiz-h span { font-size: 9.5pt; color: var(--on-dark-soft); }
  .quiz ol { list-style: none; counter-reset: q; display: grid; grid-template-columns: 1fr 1fr; }
  .quiz li {
    counter-increment: q; display: grid; grid-template-columns: 7mm 1fr 9mm; gap: 2mm; align-items: center;
    padding: 2.3mm 4mm; font-size: 9.8pt; line-height: 1.28; color: var(--ink-soft); border-top: 1px solid var(--rule);
  }
  .quiz li:nth-child(odd) { border-right: 1px solid var(--rule); }
  .quiz li::before { content: counter(q); font-family: Manrope, sans-serif; font-weight: 800; color: var(--violet); font-size: 11pt; }
  .quiz li .box { width: 5.5mm; height: 5.5mm; border: 2px solid var(--ink-faint); border-radius: 4px; justify-self: end; }
  .score { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; }
  .score div { border-radius: 10px; padding: 3mm 4mm; font-size: 9.8pt; line-height: 1.3; }
  .score b { display: block; font-family: Manrope, sans-serif; font-size: 12pt; margin-bottom: .6mm; }
  .s1 { background: var(--mint-soft); color: #134f31; }
  .s2 { background: #fff6d6; color: #6b4b00; }
  .s3 { background: var(--red-soft); color: #7a1f27; }
  .steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; }
  .step { border: 1px solid var(--rule); border-radius: 12px; padding: 4mm; background: var(--wash); position: relative; }
  .step .n { font-family: Manrope, sans-serif; font-weight: 800; font-size: 22pt; color: var(--violet); line-height: 1; }
  .step b { display: block; font-family: Manrope, sans-serif; font-size: 11pt; margin: 1.6mm 0 1mm; }
  .step p { font-size: 9.6pt; color: var(--ink-soft); line-height: 1.32; }
  .promise { display: flex; flex-wrap: wrap; gap: 2mm; }
  .promise span { font-size: 9.5pt; font-weight: 700; padding: 4px 11px; border-radius: 999px; background: var(--violet-soft); color: var(--violet-deep); }
  .promise span::before { content: "✓ "; }
  h3.sec { font-family: Manrope, sans-serif; font-size: 13pt; font-weight: 800; letter-spacing: -.01em; }
  h3.sec small { font-family: "Source Sans 3", sans-serif; font-weight: 400; font-size: 10.5pt; color: var(--ink-faint); margin-left: 2mm; }

  /* 4 · roles + cta */
  .roles { display: grid; grid-template-columns: 1fr 1fr; gap: 3.5mm; }
  .role { border: 1px solid var(--rule); border-radius: 12px; overflow: hidden; }
  .role h4 { font-family: Manrope, sans-serif; font-size: 11.5pt; padding: 3mm 4mm; background: linear-gradient(90deg, var(--violet-soft), #fff); border-bottom: 1px solid var(--rule); color: var(--violet-deep); display: flex; gap: 2mm; align-items: center; }
  .role ul { list-style: none; padding: 3mm 4mm 3.4mm; display: grid; gap: 1.4mm; }
  .role li { font-size: 10pt; color: var(--ink-soft); padding-left: 14px; position: relative; line-height: 1.3; }
  .role li::before { content: ""; position: absolute; left: 0; top: 5px; width: 7px; height: 7px; border-radius: 2px; background: var(--mint); }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); border: 1px solid var(--rule); border-radius: 12px; overflow: hidden; }
  .stats div { padding: 3.4mm 4mm; background: var(--wash); }
  .stats div + div { border-left: 1px solid var(--rule); }
  .stats b { display: block; font-family: Manrope, sans-serif; font-size: 17pt; color: var(--ink); letter-spacing: -.02em; line-height: 1.1; }
  .stats span { font-size: 9.2pt; color: var(--ink-faint); }
  .cta {
    margin-top: auto; border-radius: 16px; padding: 7mm 8mm; color: var(--on-dark);
    background:
      radial-gradient(100% 90% at 100% 0%, rgba(91,63,212,.55), transparent 60%),
      radial-gradient(70% 60% at 0% 100%, rgba(226,55,68,.3), transparent 60%),
      linear-gradient(160deg, #000, #0d1224);
  }
  .cta .tag { font-family: Manrope, sans-serif; font-size: 9pt; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: var(--lime); }
  .cta h3 { font-family: Manrope, sans-serif; font-size: 22pt; font-weight: 800; letter-spacing: -.02em; line-height: 1.1; margin: 2mm 0 2.5mm; }
  .cta p { color: var(--on-dark-soft); font-size: 11pt; max-width: 150mm; }
  .cta .row { display: grid; grid-template-columns: 1fr 1.15fr 1fr; gap: 3mm; margin-top: 5mm; }
  .cta .pill { border-radius: 12px; padding: 3.4mm 4.5mm; background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.18); min-width: 0; }
  .cta .pill small { display: block; font-size: 8pt; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--on-dark-soft); }
  .cta .pill b { font-family: Manrope, sans-serif; font-size: 11pt; color: #fff; white-space: nowrap; }
  .cta .pill.hot { background: var(--lime); border-color: var(--lime); }
  .cta .pill.hot small { color: #3d4a10; }
  .cta .pill.hot b { color: var(--ink); }
  .fine { font-size: 9pt; color: var(--ink-faint); font-style: italic; text-align: center; }
</style>
</head>
<body>

<!-- 1 · cover -->
<section class="page cover">
  <div class="top"><img src="${LOGO_LIGHT}" alt="MyCampusView" /><span>For principals &amp; school owners</span></div>
  <div class="body">
    <div class="sticker">Warning: may cause parents to say thank you</div>
    <h1>Parents track their<br />pizza live. <em>Why not<br />their child’s school day?</em></h1>
    <p class="lede">MyCampusView puts attendance, fees, homework and results on every parent’s phone, <b>in your school’s own name and logo</b>, and gives your office staff their evenings back.</p>

    <div class="stack">
      ${notif('🎒', 'Your School', '7:52 AM', 'Aarav has reached school', 'Attendance marked by Class 6-B teacher. Have a great day!', 'g')}
      ${notif('💸', 'Your School', '9:41 AM', 'Fee received: ₹12,400', 'Receipt sent to the parent. Nobody stood in a queue.', 'y')}
      ${notif('🏆', 'Your School', '3:15 PM', 'Riya’s report card is out', 'Science: A1. Parents are already forwarding it to the family group.', '')}
      ${notif('📊', 'WhatsApp · Principal', '6:00 PM', 'Today at your school', '96% attendance · fees collected and pending · 2 leave requests to approve', 'r')}
    </div>

    <div class="tease">
      <div><b>Already have an ERP? Good. Turn to page 3.</b><span>Take the 60-second test your current software would rather you skipped.</span></div>
      <span class="pg">Page 3 →</span>
    </div>
  </div>
  ${footer(1, true)}
</section>

<!-- 2 · a day -->
<section class="page">
  <div class="top"><img src="${LOGO_DARK}" alt="MyCampusView" /><span>A normal Tuesday</span></div>
  <div class="body">
    <div>
      <div class="eyebrow">Same school · same staff · less chaos</div>
      <h2 class="t">Your school day, <em>before and after</em> MyCampusView</h2>
      <p class="sub">Nothing on this page needs new staff or new habits. It is the same day, with the running around taken out.</p>
    </div>
    <div class="tl">
      ${day.map(([t, what, before, after]) => `
      <div class="tl-row">
        <div class="tl-time">${t}<small>${what}</small></div>
        <div class="cell before"><i>Before</i>${before}</div>
        <div class="cell after"><i>After</i>${after}</div>
      </div>`).join('')}
      <div class="tl-row">
        <div class="tl-time">Exams<small>Report cards</small></div>
        <div class="cell before"><i>Before</i>Marks in five Excel files, a typo on page 40 and a reprint the night before PTM.</div>
        <div class="cell after"><i>After</i>Marks are entered, checked and approved, and report cards print in your format.</div>
      </div>
    </div>
    <div class="punch">
      <div class="big">🍕</div>
      <div><b>If a food app can tell parents where their dinner is,<br /><em>your school can tell them where their child is.</em></b>
      <p>Parents notice. Fees come in on time, the phone rings less and admissions enquiries hear good things about you.</p></div>
    </div>
  </div>
  ${footer(2)}
</section>

<!-- 3 · switch -->
<section class="page">
  <div class="top"><img src="${LOGO_DARK}" alt="MyCampusView" /><span>Already using an ERP?</span></div>
  <div class="body">
    <div>
      <div class="eyebrow">Perfect. You already know what annoys you.</div>
      <h2 class="t">The 60-second test for <em>your current ERP</em></h2>
      <p class="sub">Tick every question you can honestly answer “yes” to today. Ask your accountant and a parent too; they will not be shy.</p>
    </div>
    <div class="quiz">
      <div class="quiz-h"><b>Does your current system…</b><span>Tick for yes</span></div>
      <ol>${test.map((q) => `<li><span>${q}</span><span class="box"></span></li>`).join('')}</ol>
    </div>
    <div class="score">
      <div class="s1"><b>10 / 10 🏆</b>Honestly, stay where you are. And please send us their number.</div>
      <div class="s2"><b>6 – 9 🤔</b>You are paying for an ERP and still doing the rest by hand, on WhatsApp and in Excel.</div>
      <div class="s3"><b>Under 6 🚨</b>Your staff are working for the software. Let’s talk this week.</div>
    </div>
    <div>
      <h3 class="sec">Switching sounds painful. We made it boring.<small>Live in 4–6 weeks, data included.</small></h3>
    </div>
    <div class="steps">
      <div class="step"><div class="n">01</div><b>Send us what you have</b><p>Exports from your old software, Excel sheets or even registers. Our team moves students, parents, fee plans and pending dues across for you.</p></div>
      <div class="step"><div class="n">02</div><b>We set it up in your name</b><p>Classes, fee structures, report-card format, logo and colours, configured by us and checked with your office.</p></div>
      <div class="step"><div class="n">03</div><b>Your team goes live</b><p>Staff are trained by role, so each person learns only their part. Parents get the app with your school’s name on it.</p></div>
    </div>
    <div class="promise">
      <span>Your data stays yours, with full export any time</span>
      <span>Pending dues and history move with you</span>
      <span>Two-factor sign-in and role-based access</span>
      <span>Regular backups</span>
      <span>Every product update included</span>
    </div>
  </div>
  ${footer(3)}
</section>

<!-- 4 · roles + cta -->
<section class="page">
  <div class="top"><img src="${LOGO_DARK}" alt="MyCampusView" /><span>One app, everyone sorted</span></div>
  <div class="body">
    <div>
      <div class="eyebrow">One login each. One student record for all.</div>
      <h2 class="t">One app. <em>Four very relieved people.</em></h2>
    </div>
    <div class="roles">
      ${roles.map(([h, icon, items]) => `<div class="role"><h4><span>${icon}</span>${h}</h4><ul>${li(items)}</ul></div>`).join('')}
    </div>
    <div class="stats">
      <div><b>140+</b><span>features across 19 modules</span></div>
      <div><b>Web + app</b><span>portals for every role and an Android app</span></div>
      <div><b>Your brand</b><span>on the app, receipts and report cards</span></div>
      <div><b>4–6 weeks</b><span>from “yes” to live, data included</span></div>
    </div>
    <div class="cta">
      <div class="tag">The 15-minute demo</div>
      <h3>Shown with your own classes and fees, not a fake “ABC Public School”.</h3>
      <p>Bring your accountant and your most sceptical teacher. If MyCampusView does not make their day easier, we will happily say so.</p>
      <div class="row">
        <div class="pill hot"><small>Fastest: reply to our email</small><b>Just write “DEMO”</b></div>
        <div class="pill"><small>Email</small><b>contact@mycampusview.com</b></div>
        <div class="pill"><small>Website</small><b>www.mycampusview.com</b></div>
      </div>
    </div>
    <p class="fine">Side effects may include fewer phone calls, shorter fee queues and a principal who leaves on time.</p>
  </div>
  ${footer(4)}
</section>

</body>
</html>`

const htmlPath = join(here, 'MyCampusView-Brochure.html')
const pdfPath = join(here, 'MyCampusView-Brochure.pdf')
writeFileSync(htmlPath, html)

const chrome = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(existsSync)
if (!chrome) {
  console.log('wrote', htmlPath, '(no Chrome/Edge found for PDF)')
} else {
  execFileSync(chrome, [
    '--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--virtual-time-budget=15000',
    `--print-to-pdf=${pdfPath}`, pathToFileURL(htmlPath).href,
  ], { stdio: 'ignore' })
  copyFileSync(pdfPath, join(root, 'public', 'downloads', 'MyCampusView-Brochure.pdf'))
  console.log('built', pdfPath, 'and published to public/downloads')
}
