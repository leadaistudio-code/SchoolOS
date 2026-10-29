# Growth CRM WhatsApp templates

Submit these in **Meta WhatsApp Manager → Message templates → Create template**.
For all three: **Category: Utility**, **Language: English** (code `en`). The names
must match exactly, because the reminder job sends them by name.

Sample values are what Meta asks for when you add variables.

---

## 1. `mcv_sales_morning_0830_am_plan` (08:30 AM plan)

**Body**

```
Good morning {{1}}! Here is your sales plan for {{2}}.

Follow-ups due today: {{3}}
Overdue follow-ups: {{4}}
Meetings today: {{5}}

Start with: {{6}}

Tap below to see the full list.
```

| Variable | Sample |
| --- | --- |
| {{1}} | Shubham |
| {{2}} | Mon, 26 Oct |
| {{3}} | 5 |
| {{4}} | 2 |
| {{5}} | 1 |
| {{6}} | DPS Noida (Mr Sharma) - Call, 2d overdue |

**Buttons**

1. Quick reply: `Show my list`
2. Visit website, static URL: text `Open Today`, URL `https://app.mycampusview.com/platform/growth/today`

---

## 2. `mcv_sales_wrapup_600_pm_wrapup` (6:00 PM wrap-up)

**Body**

```
Evening wrap-up, {{1}}.

Completed today: {{2}}
Still pending today: {{3}}
Overdue follow-ups: {{4}}
Booked for tomorrow: {{5}}

Most urgent: {{6}}

Please call, reschedule or close these before you end the day.
```

| Variable | Sample |
| --- | --- |
| {{1}} | Santosh |
| {{2}} | 4 |
| {{3}} | 1 |
| {{4}} | 2 |
| {{5}} | 3 |
| {{6}} | Ryan International - Visit, 4:00 pm |

**Buttons:** the same two as the morning template.

---

## 3. `mcv_sales_meeting_soon_30_minutes_before_a_meeting` (30 minutes before a meeting)

**Body**

```
Meeting reminder: {{1}} with {{2}} starts at {{3}} ({{4}}).

Contact: {{5}}

All the best!
```

| Variable | Sample |
| --- | --- |
| {{1}} | Demo |
| {{2}} | Ryan International School |
| {{3}} | 3:00 pm |
| {{4}} | Online |
| {{5}} | Mrs Rao, +919876543210 |

**Buttons**

1. Visit website, static URL: text `Open Today`, URL `https://app.mycampusview.com/platform/growth/today`

---

## How replies work

Any message a salesperson sends to the business number gets their pending list
back. That includes tapping **Show my list**. Their number must be on
**Platform → Reminders**. Tapping the button opens WhatsApp's 24-hour window,
which is what allows the free-text reply.

Until the templates are approved, WhatsApp sends fail and the job retries every
15 minutes inside the send window. Email reminders work without approval.
