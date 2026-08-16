# Password reset

Self-service password reset for every school role — teacher, principal,
accountant, librarian, front office, parent, student and school admin. Nobody
raises a ticket and waits, except as a deliberate last resort.

There are three channels, in order of preference. All three end at the same
page, because all three mint the same short-lived reset token.

| Channel | Who it serves | Needs |
| --- | --- | --- |
| **WhatsApp code** (primary) | Everyone, especially parents | Meta Cloud API configured |
| **Email link** | Staff with a working address | `SMTP_URL` configured |
| **Counter password** | Anyone email and WhatsApp cannot reach | Nothing |
| *Support ticket* (fallback) | Automatic when WhatsApp fails | Nothing |

Platform super admins are excluded from all of these — they have no school host
to receive anything on, and remain CLI-only via `npm run reset:password`.

---

## The flow a parent sees

1. On the school's sign-in page they tap **Forgot password**.
2. They enter **the mobile number the school has on record**. Ten digits is
   fine — `9842115933`, `09842115933`, `+91 98421 15933` all normalise to the
   same E.164 value the record holds.
3. They receive a **6-digit code on WhatsApp**, valid for 10 minutes.
4. They enter the code. Five wrong tries kills it and they start again.
5. They choose a new password, twice. The policy is checked, and reusing the
   current password is refused.
6. They land on the sign-in page and sign in. **They are not signed in
   automatically** — so anyone with MFA enabled still passes their second
   factor.
7. Every other device already signed in to that account is signed out.

Staff who prefer email pick the **Email** tab and get a one-hour link instead.
That tab only appears when the school can actually send mail.

---

## What an administrator can do

On **Settings → Users**, each account has:

- **Send reset link** — emails a link (or an invitation, if they have never
  signed in). The service picks which by looking at the account, so the email,
  the landing page and the audit entry can never disagree.
- **Temp password** — generates something like `Tuqe-Vyra-Pown-8342` to read
  down a phone line. Shown once, expires in 24 hours, forces a change at first
  sign-in, and revokes every live session. This is the answer for a parent
  whose email was mistyped at enrolment and whose number is not on WhatsApp.

---

## Setting up WhatsApp (Meta Cloud API)

This is the only part with external prerequisites. Budget a day, mostly waiting
on Meta.

### 1. Meta Business setup

1. Create a **Meta Business account** and complete **business verification**.
2. In **WhatsApp Manager**, create a **WhatsApp Business Account (WABA)**.
3. Add a **phone number** that is not already registered to a personal or
   Business-app WhatsApp. Once used here it cannot be used in the app.
4. Note the **Phone number ID** — this is the id shown in WhatsApp Manager,
   **not** the phone number itself.

### 2. Create the authentication template

Meta will not let you send free-form text to somebody who has not messaged you
in the last 24 hours, which a password reset never has. One-time codes must use
a pre-approved template in the **Authentication** category.

1. WhatsApp Manager → **Message templates** → **Create template**.
2. Category **Authentication**. Name it `password_reset_otp` (or set
   `WHATSAPP_OTP_TEMPLATE` to whatever you name it).
3. Meta generates the body — `{{1}} is your verification code` — with one
   variable. That variable is the code.
4. Meta adds a **copy-code button** by default. Keep it and leave
   `WHATSAPP_OTP_COPY_BUTTON=true`. If you remove the button, set that to
   `false` — sending a button parameter for a template without one, or omitting
   it for a template with one, makes Meta reject the whole message.
5. Submit and wait for approval. Usually minutes, sometimes a day.

### 3. Get a permanent access token

Do **not** use the temporary token on the API Setup page — it expires in 24
hours and reset codes will stop arriving without warning.

1. Business Settings → **System users** → add one with admin access.
2. Assign the WABA to it.
3. **Generate token** with `whatsapp_business_messaging` and
   `whatsapp_business_management`, and choose **never expires**.

### 4. Configure the app

On Railway (or your `.env`):

```bash
WHATSAPP_DRIVER=meta_cloud
WHATSAPP_PHONE_NUMBER_ID=123456789012345
WHATSAPP_ACCESS_TOKEN=EAAG...
WHATSAPP_OTP_TEMPLATE=password_reset_otp
WHATSAPP_OTP_TEMPLATE_LANG=en
WHATSAPP_OTP_COPY_BUTTON=true
DEFAULT_COUNTRY_CODE=+91
```

Also confirm these, because the emailed-link channel and the reset URLs depend
on them:

```bash
APP_ROOT_DOMAIN=yourdomain.com
APP_URL=https://yourdomain.com
```

### 5. Check it end to end

1. Make sure a test user's `phone` is set and that number has WhatsApp.
2. Visit `https://<school>.yourdomain.com/forgot-password`.
3. Enter the number. The code should arrive within seconds.
4. Complete the reset and sign in with the new password.

If nothing arrives, check the server log for `[whatsapp]`. The Cloud API's real
error sits in `error.error_data.details`, which the driver surfaces verbatim —
the outer message is usually generic and unhelpful.

---

## Costs and constraints worth knowing

- **Authentication conversations are billed per message.** Pricing is
  per-country and Meta revises it; check current India rates before assuming a
  budget.
- **WhatsApp OTP is not subject to DLT registration.** That requirement applies
  to Indian SMS, and is the main reason WhatsApp is the easier first channel.
- **The number must be on WhatsApp.** Roughly universal among Indian parents,
  but not guaranteed — hence the counter fallback.
- **Numbers must be on record and correct.** A reset is only as good as the
  admission data behind it. Accounts with no phone can only use email or the
  counter.

---

## Why the design is shaped this way

**The code exchanges for a token rather than a session.** Verifying the OTP
does not sign anyone in; it mints the same `PASSWORD_RESET` token the emailed
link carries. That keeps one path for setting a password, and it means MFA
still stands between a stolen phone and an account.

**Unknown numbers get a challenge anyway.** Telling somebody "that number is
not registered" turns the form into a way of asking whether a particular child
attends the school. An unknown number receives a handle no row backs, and
verification fails exactly as a wrong code does. Throttled requests behave the
same way, for the same reason.

**The code is stored as an HMAC, not in the clear.** Six digits is a small
space, so this is defence in depth — what actually stops guessing is the
five-attempt cap and the ten-minute window.

**The ticket fallback fires automatically.** If WhatsApp is unconfigured or a
send fails — an expired token, an unapproved template, a number not on
WhatsApp — the challenge is retired and a support ticket is raised so a human
picks the person up rather than leaving them waiting for a code that will never
arrive.
