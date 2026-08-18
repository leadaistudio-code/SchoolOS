"""
The words on the slides, and the speaker notes under them.

Held apart from `build_deck.py` so the copy can be edited by somebody who does
not want to read layout code, and so a claim can be traced: every line here is
drawn from the marketing site or from the application, and the comment above
each slide says where.

Rules this file exists to enforce, taken from `src/content/site/proof.ts`:
no customer counts, no invented percentages, no testimonials, no school names.
The only figures are product facts that can be checked by opening the app.
"""

# Product facts. Recount with `MODULE_COUNTS` in src/content/site/modules.ts
# before changing any of these.
MODULES_AVAILABLE = 50
MODULES_IN_BUILD = 3
MODULES_PLANNED = 8
ROLES = 11

# src/content/site/company.ts → CONTACT
SALES_EMAIL = "contact@mycampusview.com"

TAGLINE = "Explore Today, Excel Tomorrow"


# ---------------------------------------------------------------- the slides

# 1 — Cover. Headline and lead are POSITIONING.promise / .lead verbatim.
COVER = {
    "eyebrow": "School management platform",
    "title": "One operating system\nfor your entire school.",
    "lead": (
        "Admissions, student records, academics, fees, attendance, staff, parent "
        "communication and school operations run on one connected platform — not six "
        "that have to be reconciled."
    ),
    "footer": (
        "Built for private schools, international schools, preschools and multi-campus groups."
    ),
    "notes": (
        "Open on the sentence, not on us. 'One operating system for your entire school' is the "
        "whole argument — everything after this slide is evidence for it.\n\n"
        "Say who we built this for: private schools, international schools, preschools and "
        "multi-campus groups. Large enough that spreadsheets have started to hurt, small enough "
        "that enterprise software would be absurd. If they are outside that, say so now.\n\n"
        "Do not read the sub-line aloud. Let them read it while you ask the first question: "
        "'Before I show you anything — what does your office actually do on a Monday?'"
    ),
}

# 2 — The problem. Every quotation is site copy: /about, /product, /admission-crm.
CHALLENGE = {
    "eyebrow": "The problem",
    "title": "Most schools run something\ncritical on a spreadsheet.",
    "lead": (
        "Fee registers, admission enquiries, transport lists, sometimes attendance. "
        "It works until the person who maintains it is on leave."
    ),
    "points": [
        (
            "Enquiries live in a notebook",
            "A name on a pad, a follow-up nobody owned, a family who visited twice "
            "and was never called back.",
        ),
        (
            "Every system keeps its own student list",
            "Somebody exports a spreadsheet on Friday to make them agree. By Monday "
            "they disagree again.",
        ),
        (
            "Outstanding fees are an exercise, not a screen",
            "Reconciling collection, attendance and results at the end of a term takes "
            "the office most of a week.",
        ),
        (
            "The office answers the same three questions",
            "Was she marked present. What is the homework. How much is left to pay.",
        ),
        (
            "The numbers are always a week old",
            "Reporting is an export somebody took last night, not the position as it "
            "stands this morning.",
        ),
        (
            "Two screens, two answers",
            "Confidence is lost the first time two systems disagree in front of a parent.",
        ),
    ],
    "kicker": (
        "The cost is not the licence fees. It is the hour a week each office spends "
        "reconciling — and the decisions made on figures nobody quite trusts."
    ),
    "notes": (
        "This slide is where you stop presenting and start listening. Read two of the six, "
        "then ask which of them they recognise. Whichever they pick is the module you demo first.\n\n"
        "The line that lands with owners is the last one: the cost is not the licence fee, it is "
        "the reconciliation hour and the mistrust. Nobody budgets for it, so nobody has ever "
        "priced what it costs them.\n\n"
        "Do not argue with their current vendor by name. Describe the shape of the problem and "
        "let them place their own software inside it."
    ),
}

# 3 — Why one platform. From /product 'What integration usually means'.
CONNECTED = {
    "eyebrow": "The argument",
    "title": "Seven integrations,\nor one record.",
    "lead": (
        "Schools usually buy an SIS, an accounting package and a messaging tool, then "
        "spend the year reconciling them."
    ),
    "left_head": "Separate systems, joined afterwards",
    "left": [
        "An admissions tool, a fee package and an attendance app",
        "Each holding its own copy of the student list",
        "A nightly sync that is really a person with a spreadsheet",
        "A correction made in the office that three systems never hear about",
        "Reporting assembled by hand, a week behind the school",
    ],
    "right_head": "MyCampusView",
    "right": [
        "SIS, admission CRM and school ERP on one database",
        "One student record; every module reads it rather than copying it",
        "A child admitted this morning is on this afternoon's register",
        "A payment taken at 11:04 changes the outstanding figure at 11:04",
        "Strength, attendance and collection read live, as they stand",
    ],
    "kicker": (
        "Because there is nothing to synchronise, there is nothing to fall out of sync."
    ),
    "notes": (
        "The distinction to hold on to: integration is not the same as one system. Integrated "
        "products agree on a schedule. One database agrees continuously, because there is only "
        "one copy of the fact.\n\n"
        "The 11:04 line is the one to say slowly. It is the whole difference, expressed as "
        "something an accounts clerk has actually experienced.\n\n"
        "If they push back — 'our vendor says everything is integrated' — ask the diagnostic "
        "question: if you correct a student's name in the fee system, when does the register "
        "show it? The answer is usually 'tomorrow', or 'you have to change it in both'."
    ),
}

# 4 — What it is. Products and their leads are CORE_PRODUCTS in company.ts.
WHAT = {
    "eyebrow": "The product",
    "title": "One database,\nnot seven integrations.",
    "lead": (
        "MyCampusView is one application over one database that runs the whole school. "
        "The record admissions creates is the record fees invoices, the register marks, "
        "and the report card is built from."
    ),
    "products": [
        (
            "CRM",
            "Admissions & enrolment",
            "Enquiries land on the system rather than in a counsellor's notebook, and an "
            "admitted child becomes a student record without being typed a second time.",
        ),
        (
            "SIS",
            "Student Information System",
            "One record per student, holding what the school knows about them — and the "
            "record every other module reads rather than keeping its own copy of.",
        ),
        (
            "ERP",
            "School operations",
            "Fees defined once and collected at the counter, staff and leave, transport with "
            "live tracking, and a dashboard that reads today's figures.",
        ),
    ],
    "kicker": (
        "Everyone signs into the same system and gets a different application. A parent reaches "
        "their own children. A teacher marks their own classes. An accountant sees the fee ledger "
        "and not the medical notes."
    ),
    "notes": (
        "Three products, one record. Say the abbreviations out loud — CRM, SIS, ERP — because "
        "that is how a director has been taught to compare quotes, and it lets them see that "
        "three line items on their shortlist are one line item here.\n\n"
        "The closing paragraph is the answer to 'is it safe to give teachers logins?'. Separation "
        "is enforced when data is read, not by hiding menu items: a link typed by hand returns "
        "nothing rather than someone else's record.\n\n"
        "If the IT person is on the call, offer to walk them through the isolation tests directly."
    ),
}

# 5 — Value proposition. Figures are METRICS in proof.ts; claims are DIFFERENTIATORS.
VALUE = {
    "eyebrow": "What you get",
    "title": "Complete campus visibility.\nAnd the control that comes with it.",
    "lead": (
        "Not a dashboard bolted onto a filing system. The figures are the records, "
        "read at the moment you ask for them."
    ),
    "figures": [
        (str(MODULES_AVAILABLE), "Modules available today",
         f"{MODULES_IN_BUILD} more in build, {MODULES_PLANNED} planned — each labelled as such."),
        ("1", "Database behind all of them",
         "A fee, an absence and a result read the same student record."),
        (str(ROLES), "Roles out of the box",
         "Plus custom roles, permission by permission, per school."),
        ("100%", "Of queries scoped to one school",
         "Enforced in the data layer and covered by tests that fail the build."),
    ],
    "points": [
        (
            "One database, not an integration",
            "There is no nightly sync between an SIS and an ERP, because there are not two systems.",
        ),
        (
            "Built for schools, not adapted from business software",
            "Academic years, sections, terms and guardians are first-class. Nothing is a "
            "repurposed customer or invoice record.",
        ),
        (
            "Reporting from live figures",
            "Strength, attendance, collection and outstanding are read from the records as they "
            "stand, not from an export taken last night.",
        ),
        (
            "Your own domain and branding",
            "The application, its documents and the school website carry your name, logo and "
            "colours on a domain you own.",
        ),
    ],
    "notes": (
        "These four figures are deliberately modest and every one can be checked by opening the "
        "product. We publish no customer counts and no retention rates, because we will not put "
        "a number in front of a school that we cannot stand behind.\n\n"
        "'100% of queries scoped to one school' is the one a group or a trust will care about. "
        "It means a staff member at one campus cannot reach another campus, and that this is "
        "enforced below the screens rather than remembered by each of them.\n\n"
        "If they ask what is NOT built: 3 modules in build, 8 planned, all named on the website. "
        "Volunteering that is what makes the other 50 believable."
    ),
}

# 6 — Platform overview. Verbatim from MODULE_CATEGORIES, available entries only.
PLATFORM = {
    "eyebrow": "The platform",
    "title": "Everything that is built today.",
    "lead": (
        f"{MODULES_AVAILABLE} modules are available now, {MODULES_IN_BUILD} are in build and "
        f"{MODULES_PLANNED} are planned. Only what works today is named here."
    ),
    "categories": [
        ("Academics", [
            "Classes & sections", "Subjects", "Timetable", "Homework", "Classwork",
            "Academic calendar", "Syllabus",
        ]),
        ("Examinations", [
            "Examinations", "Mark entry", "Grading schemes", "Results", "Report cards",
            "Certificates",
        ]),
        ("People", [
            "Student records", "Parents & guardians", "Staff records", "Student attendance",
            "Attendance reports", "Staff attendance", "Leave",
        ]),
        ("Admissions", [
            "Enquiry capture", "Admission pipeline", "Follow-ups & call logs",
            "Conversion analytics", "Online enquiry form", "Front office & visitors",
            "Enrol as a student",
        ]),
        ("Finance", [
            "Fee structures", "Invoices", "Fee collection", "Payments ledger", "Outstanding",
            "Concessions",
        ]),
        ("Communication", [
            "Notices", "Messages", "Email delivery", "Message templates",
        ]),
        ("Operations", [
            "Transport routes & stops", "Buses & drivers", "Live tracking", "Library",
            "Inventory", "Events", "Sports", "School website",
        ]),
        ("Administration", [
            "Administrator dashboard", "Roles & permissions", "Branding", "Audit trail",
            "Custom domain", "Progressive web app", "Reports & analytics",
        ]),
    ],
    "notes": (
        "Do not read this slide. Put it up, let them scan it, and ask which four matter to "
        "their office. Then demo those four properly instead of all fifty badly.\n\n"
        "The sentence that earns trust here is the one about labelling. Our public module page "
        "carries a status on every module — available, in build, or planned — and nothing is "
        "described as available unless the screen exists. A school finds out what is missing in "
        "the first month either way; finding out now costs us some enquiries and saves both "
        "sides an implementation sold on something that did not exist.\n\n"
        "If a module they need is planned, say so plainly and tell them which schools asking for "
        "what is how the build order gets decided."
    ),
}

# 7 — Leadership. Panels listed are the real AdminDashboard composition.
DASHBOARD = {
    "eyebrow": "For the principal and the management",
    "title": "The whole school on one screen,\nbefore your first meeting.",
    "lead": (
        "Ordered by the questions a head of school asks on the way in: how many children do we "
        "have, were they here, has the money arrived, and is anything on fire."
    ),
    "points": [
        "Strength, staff and guardians, with the movement since last month",
        "Attendance today — present, absent, late, and which registers are still unsubmitted",
        "Collected today and this month, against pending and overdue",
        "New enquiries this week and how many are still open",
        "Needs attention: unmarked registers, invoices past due, leave to approve",
    ],
    "shot": "dashboard.png",
    "caption": "Administrator dashboard. Live figures from a demonstration school of 120 students.",
    "notes": (
        "This is the slide a principal buys from. Everything on it is a live query, not a "
        "nightly rollup — the collection figure moves while you are looking at it.\n\n"
        "Point at the 'needs attention' row specifically. It is the difference between a "
        "dashboard that reports and one that hands you today's work: registers nobody submitted, "
        "invoices past their date, leave sitting unapproved.\n\n"
        "Principals and school admins get this. Students and parents get a fundamentally "
        "different page, not a cut-down version of this one — worth saying, because the first "
        "worry is always 'what will parents be able to see?'"
    ),
}

# 8 — Admissions. Stages and sources from src/lib/admissions.ts; exports from lib/reports.ts.
ADMISSIONS = {
    "eyebrow": "Growth",
    "title": "Every enquiry on the system\nfrom the first phone call.",
    "lead": (
        "Admissions is where schools lose the most information and notice it the least. "
        "A school with three hundred enquiries a season and a two-point leak has lost six "
        "admissions, and no report will ever show it."
    ),
    "points": [
        (
            "A pipeline, not a notebook",
            "New, contacted, interested, campus visit, application, documents, approved, "
            "enrolled — moved on a board the whole office can see.",
        ),
        (
            "Follow-ups that have an owner and a date",
            "One queue answering who to contact today and what is already overdue.",
        ),
        (
            "Where enquiries come from",
            "Walk-in, referral, website, call or campaign — recorded at capture, so spend can "
            "be judged against enrolments rather than guessed.",
        ),
        (
            "Conversion by source, by stage and by counsellor",
            "The funnel report shows where enquiries stall and why they were lost, exportable "
            "stage by stage and owner by owner.",
        ),
        (
            "Enrolment in one step",
            "The student record, the enrolment and the guardian accounts are written together — "
            "and the fee structure for that class applies from the same moment.",
        ),
        (
            "A public enquiry form on your own site",
            "Writes straight into the pipeline instead of into somebody's inbox.",
        ),
    ],
    "shot": "reports-adm.png",
    "shot2": "admissions.png",
    "caption": "Admissions funnel report and the enquiry pipeline.",
    "notes": (
        "For an owner, this is the revenue slide. Everything else on the platform saves cost; "
        "admissions is the one that adds fee income, and it is usually the least instrumented "
        "part of the school.\n\n"
        "Two questions worth asking here, in this order: how many enquiries did you take last "
        "season, and how many can you account for by name today? The gap between those answers "
        "is the business case, and they will work it out themselves.\n\n"
        "'Conversion by owner' is the counsellor-performance conversation. Handle it carefully "
        "with the principal in the room — frame it as knowing which sources deserve more spend, "
        "not as monitoring staff."
    ),
}

# 9 — Records and academics. Capabilities from /student-information-system.
RECORDS = {
    "eyebrow": "Records",
    "title": "Six years of a child's school life,\non one record.",
    "lead": (
        "A student record is not a form. It is attendance, marks, fees, documents and "
        "correspondence — and it should still make sense when the child leaves."
    ),
    "columns": [
        ("The student", [
            "Admission details and guardians",
            "Class and section history by year",
            "Siblings as real relationships in the data",
            "Fees raised, paid and outstanding",
            "Transport route and stop",
            "Messages exchanged with the family",
        ]),
        ("The classroom", [
            "Daily and period registers, marked where the class is",
            "Absent, late, half day and approved leave held apart",
            "Homework with due dates, visible to parents the same evening",
            "Classwork, so a returning child can catch up",
            "Timetable and academic calendar",
            "Syllabus by chapter and topic",
        ]),
        ("Assessment", [
            "Examination schedules per class",
            "Marks entered against a known maximum, so an impossible score is refused",
            "Grading schemes applied centrally, not in each teacher's spreadsheet",
            "Results computed, then held until an administrator publishes them",
            "Report cards generated per student or per section",
            "Bonafide, transfer and character certificates",
        ]),
    ],
    "shot": "attendance.png",
    "caption": "The daily register.",
    "notes": (
        "The point of this slide is that these are not six modules that happen to mention a "
        "student. They are six views of one row.\n\n"
        "Two details that reliably land with an academic head: marks are validated against the "
        "paper's maximum at the point of entry, so an impossible score is refused rather than "
        "found at report-card time; and results are computed but withheld until somebody with "
        "the right permission publishes them.\n\n"
        "For attendance, the thing to stress is that absent, late, half day and approved leave "
        "are distinct states, because a school treats them differently and a single "
        "present/absent flag forces the office to keep a second list."
    ),
}

# 10 — Teachers. From the assessments module: bank, builder, generation, evaluation.
TEACHERS = {
    "eyebrow": "For teachers",
    "title": "Give teachers back the evening.",
    "lead": (
        "Registers marked in the classroom, papers built from your own syllabus, marks "
        "entered once. Nothing collected on paper first and typed in later."
    ),
    "points": [
        (
            "A question bank the school keeps",
            "Questions by subject, chapter, type and difficulty, reviewed and approved once "
            "and reusable every year after.",
        ),
        (
            "Papers built section by section",
            "Marks total as questions are placed, with the easy, medium and hard mix shown as "
            "you build. Fourteen test types, from a daily test to a pre-board.",
        ),
        (
            "Drafts generated from your published syllabus",
            "Generated questions arrive as drafts against your own chapters and topics. They "
            "cannot reach a paper until a teacher approves them.",
        ),
        (
            "Set online or print it",
            "Assign to a section with a window, or print the paper. Objective answers mark "
            "themselves; the rest get a marking sheet.",
        ),
        (
            "Per-question analytics after the test",
            "Which questions the class actually failed, before the next lesson is planned.",
        ),
        (
            "Their own classes, and nobody else's",
            "Registers, homework and marks are scoped to what each teacher teaches — enforced "
            "by the server, not by hiding a menu.",
        ),
    ],
    "shot": "paper.png",
    "caption": "The paper builder: 40 of 40 marks placed, 17 questions, difficulty mix shown.",
    "notes": (
        "Teacher adoption is what decides whether school software survives past month three, so "
        "this slide is about time, not features.\n\n"
        "The strongest single line: a question written and approved this year is reusable every "
        "year after. Most schools rebuild the same unit test from scratch annually because it "
        "lives in a personal folder on a personal laptop.\n\n"
        "On generated questions, be precise and be first to raise the limit: they are drafts, "
        "built from the school's own published syllabus rather than from the subject name, and "
        "nothing generated can reach a paper without a teacher approving it. Teachers relax when "
        "they hear the approval step before they think to ask for it. Question generation needs "
        "the AI module on the school's plan."
    ),
}

# 11 — Engagement. Parent list from home/parents.tsx; feedback from the feedback module.
ENGAGEMENT = {
    "eyebrow": "Engagement",
    "title": "The office stops answering\nthe same three questions.",
    "lead": (
        "Was she marked present. What is the homework. How much is left to pay. "
        "Parents can see their own children and nothing else."
    ),
    "left_head": "What a parent opens on their phone",
    "left": [
        "Attendance, day by day",
        "Homework and classwork",
        "Fee balance and receipts",
        "Results and report cards",
        "Notices from the school",
        "Their child's bus, live, with the next stop",
    ],
    "right_head": "360° feedback, run as a cycle",
    "right": [
        "Campaigns to students, parents or staff, on a schedule the school sets",
        "Anonymous to the teacher, and withheld until a minimum number of responses",
        "Confidential concerns routed for review rather than into a public average",
        "Action items with an owner, a priority and a due date",
        "Teacher-to-student feedback with controlled visibility to the child or the parent",
    ],
    "phone": "parent-phone.png",
    "shot": "feedback.png",
    "caption": ("A parent’s own view of their own children, and the feedback cycle: "
                "campaigns, response rate, concerns and action items."),
    "notes": (
        "Parent transparency is the part of this that a school markets. Feedback is the part "
        "that quietly changes the school.\n\n"
        "The design detail that matters to teachers, and you should volunteer it: responses are "
        "anonymous to the teacher and are withheld entirely until a minimum number have come in, "
        "so one aggrieved child cannot become a teacher's rating. Say that before a teacher on "
        "the call has to ask.\n\n"
        "For the principal: the value is not the score, it is the action item — a concern with an "
        "owner and a due date, which is the difference between collecting feedback and acting on "
        "it. Ask what they currently do with the PTM feedback forms they already collect."
    ),
}

# 12 — Money and operations. Fee behaviour from /school-erp and the finance module.
OPERATIONS = {
    "eyebrow": "Money and operations",
    "title": "A payment taken at 11:04 changes\nthe outstanding figure at 11:04.",
    "lead": (
        "Fee structures are defined once per class and produce every invoice, receipt and "
        "outstanding report from the same figures."
    ),
    "columns": [
        ("Fees", [
            "Heads, instalments, due dates and late-fee rules per class",
            "Bulk invoice generation, previewed before it is committed",
            "Counter collection in cash, cheque, card, UPI or transfer",
            "Numbered, branded receipts printed at the counter",
            "Part payments allocated across invoices, oldest first",
            "Sibling, staff and scholarship concessions on the record",
        ]),
        ("Visibility", [
            "Outstanding by class and by family, as of today",
            "Arrears aged from each invoice's due date",
            "Collection against billing, month by month",
            "How families paid, by mode",
            "Every payment with the person who took it",
            "Six reports, each exportable to CSV",
        ]),
        ("The rest of the office", [
            "Staff records, roles and permissions",
            "Geofenced staff check-in, decided on the server",
            "Leave applied for, approved and reconciled to the register",
            "Transport: routes, stops, fleet papers and live tracking",
            "Library, inventory, events, sports and the front desk",
            "Your school website, on your own domain",
        ]),
    ],
    "shot": "reports-coll.png",
    "caption": "Fee collection and arrears. Ageing measured from each invoice's due date.",
    "notes": (
        "Bring the accounts person into this one. They will test it in ten seconds with a "
        "part-payment question, so answer it before they ask: part payments are allocated across "
        "invoices oldest first, and every allocation is conserved to the paisa.\n\n"
        "Concessions are applied to the record, not to the receipt. That sounds like a technical "
        "distinction and it is not — it is why a sibling concession still shows correctly in "
        "outstanding a year later.\n\n"
        "Ask how long it currently takes to answer 'what is outstanding for Class 6, today'. "
        "Most schools answer in days. Then show them the arrears ageing screen."
    ),
}

# 13 — The assistant. Behaviour from src/server/assistant/agent.ts and tools.ts.
ASSISTANT = {
    "eyebrow": "Built in",
    "title": "Ask the school a question.\nGet the number, not a report.",
    "lead": (
        "The fastest way for someone running a school to get a figure they would otherwise "
        "click through four screens to find."
    ),
    "questions": [
        "What fees are pending?",
        "Whose attendance is missing today?",
        "How much did we collect this month?",
        "Which students have attendance below 80%?",
    ],
    "rules": [
        (
            "Every figure comes from your records",
            "Fetched at the moment you ask. Nothing is estimated, and nothing is repeated from "
            "an earlier answer that may since have changed.",
        ),
        (
            "Each answer links to the screen it came from",
            "So the number can be checked rather than trusted.",
        ),
        (
            "It sees only what you may see",
            "Your school, and your own permissions. There is no way to ask it about another school.",
        ),
        (
            "It drafts; you send",
            "It can prepare a fee reminder or a notice for a class. Your approval performs the "
            "send — it never sends anything itself.",
        ),
    ],
    "shot": "assistant.png",
    "caption": "The assistant answering from the demonstration school's own fee records.",
    "notes": (
        "Demo this live if the connection allows. It is the moment that separates the deck from "
        "every other school-ERP deck a director has sat through.\n\n"
        "Lead with the grounding rule, not the novelty. An assistant that guesses a fee balance "
        "is worse than no assistant, because a wrong number looks exactly as authoritative as a "
        "right one and a principal may repeat it to a parent. Ours cannot state a figure that "
        "did not come from a tool call against their records, and every answer carries a link to "
        "the record it came from.\n\n"
        "Then the safety line: it drafts, you send. It has never sent a message on its own.\n\n"
        "Commercially: the assistant is a module on the school's plan and is switched on per "
        "school. Do not promise it inside a starter quote."
    ),
}

# 14 — Impact and implementation. Steps and weeks are JOURNEY in company.ts.
IMPACT = {
    "eyebrow": "For the school as a business",
    "title": "What changes for the people\nwho own the outcome.",
    "impact_head": "The business case",
    "impact": [
        (
            "Fewer enquiries quietly lost",
            "Every enquiry owned, with a follow-up that has a name and a date against it.",
        ),
        (
            "Fee income arrives sooner",
            "Outstanding is a screen, arrears are aged by family, and the follow-up call goes to "
            "the right people rather than the whole class.",
        ),
        (
            "Less manual work, not relocated work",
            "Entered once. No reconciliation between an SIS, an accounting package and a "
            "messaging tool, because there are not three systems.",
        ),
        (
            "Decisions on today's figures",
            "Strength, attendance, collection and results read live, so a board or trustee "
            "meeting is given the position rather than last week's.",
        ),
        (
            "Less key-person risk",
            "The school's operations live in the system rather than in one person's spreadsheet "
            "and their memory of how it works.",
        ),
        (
            "A brand parents recognise",
            "Your name, logo and colours through the application, its receipts and report cards, "
            "and your website, on a domain you own.",
        ),
    ],
    "journey_head": "From first call to live",
    "journey": [
        ("01", "Discovery", "Week 1",
         "Half a day on how your school runs today, usually with the principal and the head of accounts."),
        ("02", "Configuration", "Weeks 1–2",
         "Classes, sections, subjects, fee heads, grading schemes, roles and branding, as your school uses them."),
        ("03", "Data migration", "Weeks 2–3",
         "Students, guardians, fee balances and staff, with totals reconciled against your office before anyone signs in."),
        ("04", "Training", "Weeks 3–4",
         "Separate sessions for the office, for teachers and for your administrator. Recorded, so a new joiner can watch them."),
        ("05", "Launch", "Week 4",
         "Attendance and fees go live at a term boundary. Parent sign-in opens once the office is comfortable."),
        ("06", "Support", "Ongoing",
         "A named contact for the first term. Every release is applied for you; there is nothing for your IT team to install."),
    ],
    "notes": (
        "Left column is why they buy. Right column is why they believe they can survive the "
        "switch — and the second objection is usually the bigger one.\n\n"
        "Most failed school software was not bad software. It was installed, never populated "
        "properly, and abandoned by the third month. Say that, then walk the six steps.\n\n"
        "Two commitments worth making explicitly: migration reports every row that does not fit "
        "rather than quietly dropping it, and go-live is timed to a term boundary wherever "
        "possible so nobody is asked to switch fee systems mid-term.\n\n"
        "The weeks are ranges, not promises. Do not tighten them in the room."
    ),
}

# 15 — Close. Demo expectations from /book-demo and the homepage closing section.
CTA = {
    "title": "Ready to run your school\non one platform?",
    "lead": (
        "Tell us how your school runs today — what is on paper, what is in spreadsheets, what "
        "your current software does badly. The demonstration follows that rather than a script."
    ),
    "involves_head": "What a demonstration involves",
    "involves": [
        "Thirty to forty minutes, on a call, with your screen or ours",
        "Whoever runs admissions, fees or the front office should be there",
        "A written summary afterwards, and a straight note on anything we do not do yet",
        "No mailing list, no weekly chasing, and no pricing pressure on the first call",
    ],
    "kicker": (
        "We will be straightforward about the modules that are not built yet. If MyCampusView is "
        "the wrong fit for your school, we would rather say so on the first call."
    ),
    "notes": (
        "Close on the ask, and make the ask small: a call, forty minutes, with the office staff "
        "present rather than only the director. They will spot in ten minutes what a director "
        "cannot.\n\n"
        "The last line is the close, and it is not a flourish. A director who has been oversold "
        "twice before buys from the vendor who volunteers the gaps. We publish what is not built "
        "on our own feature page; say so.\n\n"
        "Book the next call before you leave the room. Confirm who will be on it and which four "
        "modules they want to see."
    ),
}
