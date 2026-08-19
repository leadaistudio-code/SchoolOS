# Outreach email templates

First-touch email to a principal, director or school owner, in two variants.

```
outreach-plain.html      cold outreach — logo in the signature, one image, two links
outreach-branded.html    opted-in recipients — navy band, full brand, button
outreach.txt             the plain-text part, required alongside either
```

Both carry the brand and both have a footer. They differ in **where** the brand
sits: a signature in the plain one, a masthead in the branded one. Open either
file in a browser to see it.

---

## Every URL here is `www.`, on purpose

The site answers on **`www.mycampusview.com`**. The apex — `mycampusview.com`
with no `www` — is still a Hostinger parked page, checked 19 August 2026:

```
apex   https://mycampusview.com/…            → 32KB "Parked Domain name on Hostinger DNS system"
www    https://www.mycampusview.com/…        → the application
```

That is what made the logo a broken image in the first draft of this template:
the apex served a holding page in place of the PNG, so the `<img>` had nothing
to load. Every URL in these files now points at `www`. If you edit one, keep the
`www`.

**Fix the apex anyway.** Nobody types `www` — a principal who reads your email
and then types `mycampusview.com` into a browser lands on a parking page. In
Hostinger's DNS Zone Editor, point the apex at the same place as `www` (an
ALIAS/ANAME record, or Hostinger's redirect tool). It costs ten minutes and it
is the difference between a lead and a bounce.

Verify rather than trusting this file:

```bash
curl -sS -o /dev/null -w '%{content_type}\n' -L https://www.mycampusview.com/brand/mycampusview-lockup.png
curl -sS -L https://mycampusview.com | grep -o '<title>[^<]*</title>'
```

You want `image/png` from the first. When the second stops saying "Parked
Domain", the apex is fixed and you can drop the `www` throughout.

### The logo file is heavy

`mycampusview-lockup.png` is 228KB for something displayed at 180×32 — it is the
full 2392×422 master. It works, so it is what the template uses. If you send at
volume, export a 360×64 copy to `public/brand/email-lockup.png`, redeploy, and
point the template at that; it will drop to roughly 10KB and load instantly on a
phone.

---

## Do not send cold email through Resend

Resend's [Acceptable Use Policy](https://resend.com/legal/acceptable-use)
requires every recipient to have opted in, and suspends accounts that send cold
campaigns. That is not a technicality to route around: the same account sends
your password resets and your demo-request notifications, so a suspension for
outreach takes **the product's transactional mail down with it**. A school
locked out of its account at 9am is a much worse day than a slow sales pipeline.

Keep the two separate, all the way down:

| | Cold outreach | Transactional |
|---|---|---|
| Tool | a sequencer — Instantly, Smartlead, lemlist, Apollo | Resend |
| Sending domain | a **separate** one, e.g. `mycampusviewhq.com` | `mycampusview.com` |
| Reply-to | a mailbox a person reads | `contact@mycampusview.com` |

The separate domain is the part people skip and regret. Cold outreach collects
spam complaints even when it is done well; if those land on the domain that
sends password resets, school staff stop receiving them, and you will not find
out from a bounce — the mail is simply filed in Junk. Buy a second domain, point
it at the same site, and send outreach only from that.

Whatever tool you use, the templates below are plain HTML and paste into any of
them.

---

## If the logo or the footer goes missing

Both live in the outermost table, one row above the content and one below it,
which makes them the two pieces that disappear together when something rewrites
the HTML. In a browser they always render — open the file and check before
blaming the template.

**Paste into an HTML/code view, never a drag-and-drop editor.** A no-code editor
rebuilds the markup into its own blocks and routinely discards rows it does not
recognise, which is exactly the header band and the footer. In Resend that means
the broadcast's code view; in a sequencer, the `<>` source toggle.

**Copy the whole file**, from `<!doctype html>` on line 1 to `</html>` on the
last. Copying from `<body>` drops the `<style>` block, and copying the visible
middle drops both rows in one go.

**Not Gmail clipping.** That truncates messages over about 102KB and prints
"[Message clipped]"; this template is 13KB. If you do see that notice, the tool
sending it is adding the weight, not this file.

**If the footer renders but reads as blank,** it is the placeholders:
`{{postal_address}}` and `{{unsubscribe_url}}` show as literal text until the
sending tool fills them, and a tool that strips unknown variables leaves empty
lines. Type a real address in rather than leaving the token.

---

## Which variant

**`outreach-plain.html` for anyone who has not asked to hear from you.** The
brand is there, but carried the way a real person's email carries it: a small
logo in the signature, not a banner across the top. One image, two links, one
column. A designed masthead announces itself as bulk mail before it is read, and
filters score image-to-text ratio and link count — a principal who has never
heard of you is exactly the recipient who can afford neither. It reads as though
somebody typed it, which is the whole point.

**`outreach-branded.html` once they have engaged.** A reply, a demo request, a
list that opted in, a follow-up in an existing conversation. Here the brand is
worth the weight, and this is the one to paste into a Resend broadcast.

Send `outreach.txt` as the plain-text part in both cases. A message with no text
part is scored as bulk by most filters, and it is what a smartwatch shows.

---

## Subject lines

Short, specific, and not obviously marketing. Test two at a time on 40–50
recipients each and keep the winner.

1. `One system instead of four`
2. `{{school}} — admissions, records and fees`
3. `How {{school}} handles fee follow-ups`
4. `Twenty minutes, on your own fee structure`

Avoid the words *free*, *offer*, *revolutionary*, *best-in-class*, and anything
in capitals. Do not put the school's name in every subject line you ever send —
it stops reading as personal the second time.

---

## The variables

| In the template | Resend broadcasts | Most sequencers |
|---|---|---|
| `{{first_name}}` | `{{{contact.first_name\|there}}}` | `{{firstName}}` |
| `{{school}}` | a custom contact field | `{{companyName}}` |
| `{{sender_name}}` | type it in | `{{senderName}}` |
| `{{sender_title}}` | type it in | — |
| `{{postal_address}}` | type it in | account setting |
| `{{unsubscribe_url}}` | `{{{RESEND_UNSUBSCRIBE_URL}}}` | inserted automatically |

Give `{{first_name}}` a fallback. `Dear ,` is worse than no personalisation, and
it is the single most common way a cold campaign announces that it is automated.

---

## Before the first send

- **SPF, DKIM and DMARC on the sending domain.** Without all three, Google and
  Microsoft filter bulk mail by default. Your provider prints the records; if
  DNS is with Hostinger they go in hPanel → Domains → DNS Zone Editor.
- **Warm the domain up.** A new domain that sends 500 mails on day one is
  indistinguishable from a compromised one. Start at 10–20 a day and climb over
  three to four weeks.
- **Fill in `{{postal_address}}`.** A physical address is required by CAN-SPAM
  and is scored by filters that never heard of it. `CONTACT.address` in
  [company.ts](../../src/content/site/company.ts) is still empty.
- **Send yourself one first,** and open it on a phone, in Gmail and in Outlook.
  Outlook renders through Word and will square the button's corners; that is
  expected and is the only difference you should see.

---

## What the copy does, and what it will not do

The argument is the same one the [sales deck](../sales-deck/README.md) makes,
compressed to a hundred words: name the cost they already feel — reconciling
four systems, answering the same three questions — then ask for twenty minutes.
One ask, no discount, no urgency.

The only numbers are product facts that can be checked by opening the product:
50 modules working today, one database, eleven roles. There is no school count,
no "trusted by 200 schools", no "30% more admissions", because you cannot yet
support any of those and a director who has been oversold twice will test the
first number you give them. This follows the rule in
[proof.ts](../../src/content/site/proof.ts).

The last line — *if it is not the right fit, we would rather say so on that
call* — is doing real work. Leave it in. It is the sentence that separates this
from every other email in the inbox that morning, and it costs nothing, because
a school that is a bad fit was never going to renew.
