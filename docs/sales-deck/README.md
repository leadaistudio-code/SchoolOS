# MyCampusView — school sales deck

`MyCampusView-Sales-Deck.pptx` — 15 slides, 16:9, speaker notes on every slide.
Built for a director, principal or school owner on a first call.

```
MyCampusView-Sales-Deck.pptx   the deliverable
deck_content.py                every word on every slide, and the notes
build_deck.py                  layout; run it to regenerate the .pptx
metrics.py                     text measurement shared by builder and preview
preview_deck.py                renders the deck to preview/*.png without Office
screenshots/                   real captures of the running application
```

Rebuild after editing copy:

```bash
python -m pip install python-pptx pillow
python docs/sales-deck/build_deck.py
python docs/sales-deck/preview_deck.py    # then open preview/slide-*.png
```

`preview_deck.py` exists because there is no PowerPoint or LibreOffice on this
machine. It reads the saved file back and draws it with the same Segoe UI files
PowerPoint uses, so a layout can be checked before anyone opens the deck; it
warns about any text box that overflows or runs off the foot of a slide. The
rendered `preview/slide-*.png` are kept in the repo for the same reason — they
are how you read the deck without Office.

The deck is set in Segoe UI, which ships with Windows and Office on every
platform, so it renders identically on any machine that opens it. Every line
height is written as an exact point value rather than a percentage, so
PowerPoint reflows nothing.

---

## Before you send this to a school

Two things in the deck are placeholders inherited from the codebase, not
decisions:

1. **No website or phone number appears anywhere.** `CONTACT.phone` and
   `CONTACT.address` are empty in
   [company.ts](../../src/content/site/company.ts), and `APP_URL` is still
   `http://lvh.me:3000`. Rather than print a URL that does not resolve, the
   closing slide carries only `contact@mycampusview.com`. Add the live domain
   and a number there once they exist, then rebuild.
2. **Check the address reaches someone.** The closing slide is the one place a
   director is asked to act. `npm run mail:doctor` sends a sample enquiry to
   `contact@mycampusview.com` through whatever mailbox the deployment is
   configured with — run it before the deck goes out.

One inconsistency worth fixing on the site itself, which the deck does **not**
repeat: the homepage admissions section and `/admission-crm` both say the
pipeline, follow-ups and conversion reporting are "in build". They are built —
`/admissions`, `/admissions/followups` and `/admissions/analytics` all render
real screens, and `modules.ts` marks all three `available`. The deck follows the
module catalogue and the application. Update the site copy so a director who
reads the page and then sees the deck is not confused.

---

## The storyline

Five movements, following the same black/paper rhythm the homepage uses as
chapters. The argument narrows from a problem the school already feels, to one
product decision, to proof, to the money.

| Movement | Slides | What it does |
| --- | --- | --- |
| **The claim** | 1 | One sentence: one operating system for the whole school. |
| **The problem, and why it persists** | 2–3 | Name the cost they never budgeted for — reconciliation — then show that integration and one database are not the same thing. |
| **What we built** | 4–6 | Three products, one record; four figures we can stand behind; every module that works today. |
| **Proof, department by department** | 7–13 | The screens themselves, in the order a school meets them: leadership, admissions, records, teachers, parents, money, the assistant. |
| **The ask** | 14–15 | What changes commercially, how the switch actually runs, and one call to action. |

Two decisions worth knowing before you present it:

- **Nothing on the slides is a customer claim.** No school count, no retention
  figure, no testimonial, no "30% more admissions". The four figures on slide 5
  describe the product and can be checked by opening it. This follows the rule in
  [proof.ts](../../src/content/site/proof.ts), and it is a sales asset in its own
  right — a director who has been oversold twice buys from whoever volunteers the
  gaps.
- **Every screenshot is real.** Captured from the running application against the
  seeded demonstration school (120 students), not mocked up. Slide 6 says out
  loud that 3 modules are in build and 8 are planned.

---

## Slide by slide

Speaker notes are already in the `.pptx` — open the notes pane. Summarised here
with what each slide shows and where its screenshot came from.

### 1 · Cover — dark
**One operating system for your entire school.**
The lockup straight on the ground, a violet corner glow, one headline, the
positioning line from `POSITIONING.lead`, and the tagline. Nothing else.
*Say:* who it is for, then ask what their office does on a Monday. Do not read
the slide.

### 2 · The problem — paper
**Most schools run something critical on a spreadsheet.**
Six pains as a 3×2 grid — enquiries in a notebook, every system with its own
student list, outstanding as an exercise, the same three questions, week-old
numbers, two screens disagreeing. Opposite the lead, the line that lands with
owners: *the cost is not the licence fees.*
*Say:* read two, then ask which they recognise. That answer picks your demo.

### 3 · Why one platform — dark
**Seven integrations, or one record.**
Two columns: separate systems joined afterwards versus MyCampusView, the second
on a raised card. Closes on *because there is nothing to synchronise, there is
nothing to fall out of sync.*
*Say:* the 11:04 line, slowly. If they claim their vendor is integrated, ask when
a name corrected in the fee system reaches the register.

### 4 · What it is — paper
**One database, not seven integrations.**
The three products as cards — CRM, SIS, ERP — with the leads from
`CORE_PRODUCTS`. Beneath the headline, who sees what.
*Say:* separation is enforced when data is read, not by hiding menu items.

### 5 · Core value — paper
**Complete campus visibility. And the control that comes with it.**
Four coloured figures — 50 modules, 1 database, 11 roles, 100% of queries scoped
— beside four differentiators on a white card.
*Say:* these are product facts, not commercial ones. Volunteer that 3 are in
build and 8 planned.

### 6 · Platform overview — dark
**Everything that is built today.**
All 50 available modules in eight captioned columns.
*Say:* don't read it. Ask which four matter, and demo those properly.

### 7 · Leadership — paper
**The whole school on one screen, before your first meeting.**
📸 `dashboard.png` — the administrator dashboard: 120 students, 92.5% attendance
today, ₹94,500 collected, fee collection donut, 24 new enquiries, needs-attention
row.
*Say:* point at "needs attention". It hands you today's work, not a report.

### 8 · Admissions & lead CRM — paper
**Every enquiry on the system from the first phone call.**
📸 `reports-adm.png` — the admissions funnel: enquiries, conversion, lost,
follow-ups overdue, stage-by-stage bars, why enquiries were lost.
📸 `admissions.png` — the kanban pipeline from New through Enrolled.
Six points beside them: pipeline, owned follow-ups, source, conversion by source
and counsellor, one-step enrolment, public enquiry form.
*Say:* how many enquiries last season, and how many can you name today? The gap
is the business case.

### 9 · Records & academics — paper
**Six years of a child's school life, on one record.**
📸 `attendance.png` — the daily register, with unmarked sections flagged.
Three columns: the student, the classroom, assessment.
*Say:* marks are validated against the paper's maximum at entry; results are
withheld until someone with the right permission publishes them.

### 10 · Teacher productivity — paper
**Give teachers back the evening.**
📸 `paper.png` — the paper builder: Unit Test I, 40 of 40 marks placed, 17
questions, 7 easy / 9 medium / 1 hard.
Six points beneath: question bank, section-by-section building, drafts generated
from the school's own syllabus, set online or print, per-question analytics,
scoped to their own classes.
*Say:* a question approved this year is reusable every year after. Raise the
approval step on generated questions before a teacher asks.

### 11 · Parents, students, teachers — paper
**The office stops answering the same three questions.**
📸 `parent-phone.png` — a real parent account on a phone: child switcher across
two children, attendance, fees due, homework, latest result.
📸 `feedback.png` — the feedback figures: active campaigns, response rate,
awaiting review, open action items.
*Say:* responses are anonymous to the teacher and withheld until a minimum number
arrive. Say it before a teacher on the call has to ask.

### 12 · Fees & operations — paper
**A payment taken at 11:04 changes the outstanding figure at 11:04.**
📸 `reports-coll.png` — fee collection and arrears: collected, billed,
outstanding, overdue, billed-against-collected, ageing.
Three columns: fees, visibility, the rest of the office.
*Say:* part payments allocate oldest-first; concessions sit on the record, not on
the receipt. Ask how long "outstanding for Class 6, today" currently takes.

### 13 · The assistant — dark
**Ask the school a question. Get the number, not a report.**
📸 `assistant.png` — the panel answering "What fees are pending?" from the
demonstration school's own records, with a link to the outstanding screen.
Four guarantees run as a band: grounded in records, linked to the source, scoped
to your permissions, drafts rather than sends.
*Say:* lead with grounding, not novelty. A wrong number looks exactly as
authoritative as a right one. The assistant is a plan module, switched on per
school — don't promise it inside a starter quote.

### 14 · Business impact & implementation — paper
**What changes for the people who own the outcome.**
Six commercial outcomes on the left; the six-step implementation — discovery,
configuration, migration, training, launch, support — on the right.
*Say:* most failed school software was not bad software; it was never populated
and was abandoned by month three. Migration reports every row that does not fit.
The weeks are ranges, not promises.

### 15 · The ask — dark
**Ready to run your school on one platform?**
What a demonstration involves, the sales address, and the line that closes it:
*if MyCampusView is the wrong fit, we would rather say so on the first call.*
*Say:* book the next call in the room, and confirm which four modules they want
to see.

---

## Where the screenshots came from

All nine were captured from the running application over the Chrome DevTools
Protocol, signed in as `admin@demo.schoolos.dev` (and `parent@demo.schoolos.dev`
for the phone), against the seeded `demo` tenant at 2× device pixel ratio.

To re-capture after a UI change:

```bash
npm run db:up && npm run dev
npm run demo:content -- demo     # syllabus, question bank, paper, feedback cycle
npm run assistant:enable -- demo # only if AI_DRIVER and AI_API_KEY are set
```

Then sign in and screenshot at a 1600×1000 viewport, 2× scale. Crop is handled in
`build_deck.py` — capture the whole window and let the deck crop it, so a layout
change does not need a re-shoot.

Two of the captures needed the demonstration school to look like a working day
rather than a fresh seed: today's registers were marked and a handful of counter
payments recorded, so the dashboard reads 92.5% and ₹94,500 rather than "register
not submitted" and zero. That is demo data in a local database, not a retouched
image — every figure on every screenshot was computed by the application.

**Do not edit the images.** If a screen shows something unflattering, fix the
screen or change the slide.
