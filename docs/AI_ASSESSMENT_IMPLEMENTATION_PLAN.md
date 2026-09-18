# AI Assessment — Implementation Plan

Incremental delivery. Each phase ships usable value without breaking existing Assessments / Question Bank / Exams.

## Phase 0 — Discovery (done)

- Mapped stack, models, APIs, AI, jobs, storage
- Documented reuse vs gaps in `AI_ASSESSMENT_ARCHITECTURE.md`

## Phase 1 — Foundation (shipped)

**Done:**

1. Docs: `docs/AI_ASSESSMENT_*.md`
2. Nav under Assessments: Academic Intelligence, AI Assessment, AI Evaluation, Learning Insights
3. Hub: `/assessments/intelligence`
4. Guided wizard: `/assessments/ai/new` → existing `/assessments/bank/generate`
5. Prisma: `AnswerSheet`, `EvaluationJob`, `EvaluatedAnswer`, `AiUsageEvent`
6. Worker: `evaluation` queue / `evaluation.process` (stub → REVIEW_REQUIRED)
7. API: `POST /api/v1/evaluation/sheets`, `GET /api/v1/assessments/[id]/quality`
8. Quality panel on paper builder
9. Insights shell + evaluation queue UI

**Exit criteria:** Met for Phase 1.

## Phase 2 — Paper quality + better wizard (shipped)

**Done:**

1. Deterministic quality check extended (difficulty skew, chapter distribution)
2. Wizard: class → section → syllabus/chapters/weightage → type → difficulty mix → generate
3. `generateQuestions` extended with `difficultyMix`, `chapterWeights`, `paperTotalMarks`, `paperInstructions` (multi-pass by difficulty; no fork)
4. Generate form reads wizard URL params and sends mix/weightage
5. Builder Keep / Regenerate / Replace / Edit for AI-origin placements
6. API: `POST /api/v1/assessments/placements/[id]/ai`

## Phase 3 — Answer sheet upload + async pipeline (shipped)

**Done:**

1. Assignment + student picker upload UX (reuses `teacherAssignments` / `assignmentProgress`)
2. Upload → `AnswerSheet` + `EvaluationJob` + worker `evaluation.process` (non-blocking)
3. Worker builds per-question review placeholders → `REVIEW_REQUIRED` + usage events; FAILED on errors
4. Review desk at `/assessments/evaluation/[jobId]` (sheet preview + Approve / Change marks / Flag / Next)
5. Retry API for FAILED / REVIEW_REQUIRED jobs
6. Answer sheet file access (`GET …/sheets/[id]/file` + `readFileForCaller` support)
7. Usage strip (pages / jobs / needs review)

**Exit criteria:** Met for Phase 3 (stub → review desk). Vision OCR landed in Phase 4.

## Phase 4 — Real OCR / vision evaluation (shipped)

**Done:**

1. Multimodal `ModelContentPart` on shared `AI_DRIVER` adapters (OpenAI `image_url` / Anthropic image blocks) — no second AI client
2. `evaluateAnswerSheetWithVision` + `alignVisionAnswers` (`src/server/modules/evaluation/vision.ts`): image OCR/vision; searchable PDF via `unpdf` text; scanned empty PDFs → `SHEET_NOT_READABLE`
3. Rubric prompt + `emit_evaluation` tool; objective vs descriptive guidance; marks capped to max
4. Confidence < 70 (`CONFIDENCE_REVIEW_THRESHOLD`) → `needsReview`; job stays `REVIEW_REQUIRED` until teacher acts
5. Approve / Override → upsert `StudentAnswer.marksAwarded` (never auto-publish)
6. `POST /api/v1/evaluation/jobs/[id]/finalise` → write all marks + `finaliseAttempt`; review desk **Finalise attempt**
7. Tests: `tests/ai-vision-evaluation.test.ts` + multimodal message mapping in `tests/assistant.test.ts`

**Exit criteria:** Met for Phase 4. Marks never publish without existing evaluate/publish flow.

## Phase 5 — Feedback & insights (shipped)

**Done:**

1. Student / parent learning feedback on `/my/results/[id]` — strengths, weak topics, practice note; parents get a simplified summary with question detail collapsed
2. Teacher Learning Insights at `/assessments/insights` — 90-day topic heatmap, chapter averages, papers with gaps, supportive “may need attention” list
3. Remedial CTA on assignment analytics + insights → `/assessments/bank/generate` with weak `chapterIds` + create paper
4. Principal Assistant read tools: `learning_topic_gaps`, `assignment_topic_gaps` (`assessments.view` only)
5. Service: `src/server/modules/ai-assessment/insights.ts` (live rollups; no `StudentTopicPerformance` table yet)
6. Tests: `tests/ai-insights.test.ts` + assistant permission coverage

**Exit criteria:** Met for Phase 5. Still no auto-publish; language stays observational.

## Phase 6 — Reports, usage admin, polish (shipped)

**Done:**

1. Print CSS (browser PDF): `/my/results/[id]/print`, `/assessments/insights/print` — no server PDF engine
2. School AI usage dashboard: `/assessments/usage` (eval pages + generate units vs plan limits)
3. Platform limits: `limit.ai_eval_pages_month`, `limit.ai_generate_month` — enforced on upload/retry/generate; visible in platform tenant usage + entitlement overrides
4. Mobile: AI Evaluation queue + review desk (`mobile/app/(app)/evaluation*`), module `ready: true`
5. Hardening: `tests/ai-usage-limits.test.ts`; k6 smoke probes evaluation API auth; test plan Phase 6 checklist

**Exit criteria:** Met for Phase 6. Caps are soft plan limits (402 on exceed), not hard kill switches for the whole school.

## Phase 7 — Gemini vision adapter (shipped)

**Done:**

1. `AI_DRIVER=gemini` via `@google/genai` (`src/server/assistant/providers/gemini.ts`)
2. Same `ModelAdapter` contract: multimodal `inlineData` parts, tool calling with AFC disabled, stream + one-shot
3. Default model `gemini-2.5-flash` (override with `AI_MODEL`); optional `AI_BASE_URL` for gateways
4. Wired through `assistantConfigured` / `assistantModel` — vision evaluation and Campus Assistant reuse it (no second client)
5. Tests: Gemini content mapping in `tests/assistant.test.ts`; docs: ASSISTANT.md, `.env.example`

**Exit criteria:** Met for Phase 7. Switch driver with env only.

## Non-goals (near term)

- Replacing Exam / Mark / Result report-card path
- Auto-publish AI marks without school setting
- Claiming diagnostic/medical conclusions
- New notification subsystem
- New auth system

## Risk controls

- Soft-delete / status machines only; no destructive schema rewrites
- All new tables carry `tenantId`
- Feature remains behind `MODULE_AI_ASSIST` + existing permissions
- Ship UI shells before expensive AI paths
