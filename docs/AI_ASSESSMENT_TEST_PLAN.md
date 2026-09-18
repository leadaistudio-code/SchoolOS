# AI Assessment — Test Plan

## Must-pass isolation

- [ ] School A teacher cannot read School B assessments / sheets / jobs
- [ ] Teacher scoped to own classes cannot evaluate another teacher’s assignment outside scope
- [ ] Student cannot submit for another student’s attempt
- [ ] Parent sees only linked children feedback

## Functional (Phase 1+)

- [ ] Hub loads with MODULE_AI_ASSIST + assessments.view
- [ ] Wizard reaches existing generate API and creates drafts / paper
- [ ] AnswerSheet create + EvaluationJob QUEUED without blocking HTTP
- [ ] Worker transitions job PROCESSING → REVIEW_REQUIRED (stub) or FAILED
- [ ] Teacher override of AI marks audited
- [ ] Publish still uses existing publishResults permissions

## AI quality

- [ ] Invalid JSON from model rejected (Zod)
- [ ] Off-syllabus topics discarded (existing generate screen)
- [ ] Quality panel never claims 100% certainty

## Regression

- [ ] Question bank CRUD / generate / approve unchanged
- [ ] Assessment assign / online attempt / manual mark unchanged
- [ ] Exam marks / results unchanged
- [ ] Notification worker still processes `notification.send`

## Phase 6

- [ ] Print feedback / insights routes render A4-friendly layout (`no-print` bar)
- [ ] `/assessments/usage` shows month-to-date eval pages and generate units
- [ ] Upload / retry blocked with 402 when `limit.ai_eval_pages_month` exceeded
- [ ] Generate blocked with 402 when `limit.ai_generate_month` exceeded
- [ ] Platform tenant usage shows AI meters; override can raise limits
- [ ] Mobile evaluation queue lists REVIEW_REQUIRED jobs; review Approve writes marks
- [ ] k6 smoke: unauthenticated `/api/v1/evaluation/jobs` is 401/403
- [ ] Unit: `tests/ai-usage-limits.test.ts` passes

## Phase 7

- [ ] `AI_DRIVER=gemini` with Google AI Studio key configures assistant + vision eval
- [ ] Multimodal sheet image reaches Gemini as `inlineData` (unit: `toGeminiContents`)
- [ ] Tool loop still owns execution (AFC disabled); `emit_evaluation` works one-shot
- [ ] Switching back to openai/anthropic needs only env change
