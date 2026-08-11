# The school assistant

A principal asks *"what fees are pending?"* — by typing or by speaking — and gets
the real figure, with a link to the screen that holds it. This document is the
design, the threat model, and how to switch it on.

---

## The one design decision

**The model never writes a query.** It chooses from a fixed list of tools in
[`src/server/assistant/tools.ts`](../src/server/assistant/tools.ts) and supplies
validated arguments. Each tool calls the same service function the screens call,
with the **asking user's own `AppContext`**.

Everything else follows from that:

| Property | How it is guaranteed |
| --- | --- |
| A question cannot reach another school's data | Service functions run through the tenant-scoped Prisma client. No tool takes a tenant argument — a test asserts this for every tool. |
| A user cannot learn more than they are permitted | Each service function asserts its own permission, **and** `toolsFor()` hides tools the caller lacks, so the model is never offered one. |
| A figure in an answer is real | Money and dates are formatted server-side from minor units. The model is instructed never to compute or estimate, and every answer carries the link to verify it. |
| Prompt injection cannot exfiltrate or act | There is no SQL surface and no write tool. Text inside a record is data; the worst a malicious note can do is be reported as a note. |
| Nothing is sent to parents by accident | Actions are drafts. See below. |

There is deliberately **no text-to-SQL**. It would be a smaller file and a much
larger blast radius.

## Actions: draft, then approve

`draft_notice` is the only action, and it writes nothing. It returns a draft; the
UI renders it as a pending card; the user clicks **Send it**; that click posts to
`/api/v1/assistant/confirm`, which is the request that writes.

At approval time [`drafts.ts`](../src/server/assistant/drafts.ts) re-checks, from
scratch: the draft exists, it belongs to this school, the approver is the person
it was drafted for, it has not expired (30 minutes), it has not already run, and
the permission is still held. None of that is carried over from the conversation
— a role can be changed between the draft and the click.

Two audit entries are written: `assistant.query` for the question (with which
tools it read), and `assistant.draft.approved` for the approval, alongside the
module's own `notice.create`.

## What leaves the server

Tool results go to the model provider, and for this deployment they **include
student and guardian names for the user's own school** — that was a deliberate
choice, made so answers can say *"Aarav Sharma is unmarked"* rather than *"one
student is unmarked"*. Consequences worth knowing:

- Children's names and admission numbers are transmitted to Anthropic on queries
  that touch student records. Under Indian DPDP and comparable regimes this makes
  the provider a processor — check the agreement before enabling for a customer.
- To make the assistant aggregate-only instead, change the tools that map rows to
  return counts and class names without `name`/`guardian` fields. The change is
  confined to `tools.ts`; nothing else needs to know.
- Voice input is separate and worse in one respect: browser speech recognition in
  Chrome **streams the audio to Google**. The panel says so under the input, and
  the microphone is hidden entirely where the API is unavailable.

## Switching it on

Either provider works. The assistant's behaviour — its tools, its permissions, its
grounding rules, its draft-then-approve flow — is identical; only the wire format
differs, and that lives entirely in
[`providers/`](../src/server/assistant/providers/).

```bash
# OpenAI
AI_DRIVER=openai
AI_API_KEY=sk-...
AI_MODEL=gpt-4.1            # optional; must be a model your key can reach

# or Anthropic
AI_DRIVER=anthropic
AI_API_KEY=sk-ant-...
AI_MODEL=claude-opus-5
AI_EFFORT=medium            # low | medium | high — Anthropic only
```

`AI_BASE_URL` points the OpenAI driver at Azure OpenAI or any OpenAI-compatible
gateway. `AI_MODEL` is optional and defaults per driver, but **set it explicitly**:
which models a key can reach depends on the account, and the default may not be
one of yours. A model your key cannot reach surfaces in the panel as *"the
configured model does not exist for this API key"* rather than a stack trace.

### What differs between the two

| | OpenAI | Anthropic |
| --- | --- | --- |
| API | Chat Completions with function calling | Messages with tool use |
| Schema enforcement | `strict: true` per function | Strict input schema |
| Thinking | not requested | adaptive, at `AI_EFFORT` |
| Prompt caching | automatic, provider-side | explicit breakpoint on the system prompt |
| Parallel tool calls | yes | yes |

Then, per school:

1. **Plan** — the school's plan must include `module.ai_assist`. `ENTERPRISE`
   gets it automatically (it enables every `module.*`); `STARTER` and `PRO` do
   not, so the seeded `demo` and `greenwood` schools need it granted. Either add
   `FEATURE.MODULE_AI_ASSIST` to a plan's `modules` in `prisma/seed.ts`, or grant
   it to one school without reseeding:

   ```bash
   npm run assistant:enable -- demo        # --off to withdraw it
   ```

2. **Role** — the user needs `assistant.use`. School Admin has it (it holds every
   tenant permission), and Principal and Accountant were granted it explicitly.

   **Role grants live in the database**, so adding the permission in code is not
   enough — every existing role is missing it until you push the catalogue:

   ```bash
   npm run rbac:sync          # --dry-run to preview
   ```

   Then sign out and in again: a session carries the rights it was minted with.
   Skipping this is the confusing failure mode — the code is right, the button is
   simply absent for everyone, including the school admin.

## Where it appears

Top bar of the authenticated application, beside global search: a small **Ask**
button, or **⌘K** / **Ctrl-K** from anywhere. The panel docks on the right so an
answer's links can be followed without losing the conversation. It is not on the
marketing site, and it does not exist for a signed-out visitor.

All three gates are server-side, so when any one is missing there is no button at
all rather than one that fails on use: no configured model, no module on the plan,
or no `assistant.use` on the role.

## Cost and abuse control

- 30 questions per user per 5 minutes, on top of the standard API limit. A
  question costs money, so the ceiling counts questions, not requests.
- At most 6 model turns per question. Hitting the cap yields an explicit "ask
  about one class at a time" rather than a truncated answer presented as whole.
- The system prompt and tool list are identical per user, so they are the cached
  prefix (`cache_control: ephemeral`). Repeat questions in a session pay ~0.1×
  for that portion.

## Deliberate limits

- **Read-only, apart from notices.** No tool collects a fee, marks a register or
  edits a record.
- **History is text only.** The browser sends prior turns as plain text; tool
  results are never accepted from the client. Otherwise anything able to reach
  the route could hand the model a fabricated *"outstanding: ₹0"* and have it
  repeated to a principal as fact. Every figure is refetched per question.
- **No memory across sessions.** Each conversation starts empty. A remembered
  figure is a stale figure.
- **`assistant.use` grants no data access.** It only decides whether the
  assistant exists for that user; what they can ask about is their own
  permissions, unchanged.

## Adding a tool

1. Write it in `tools.ts` with a real permission key, a Zod argument schema, and
   a description that says *when* to call it (the trigger, not just the purpose —
   that is what the model reads).
2. Return figures already formatted, plus an `href` to the screen that proves it.
3. Add it to `ALL_TOOLS`. The tests in [`tests/assistant.test.ts`](../tests/assistant.test.ts)
   then enforce the invariants automatically: a real permission, a strict schema,
   no tenant-ish argument.

`json-schema.ts` supports strings, numbers, booleans, enums, arrays and nested
objects. Anything else throws at startup rather than shipping a schema the model
would misread.
