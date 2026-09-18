# AI Assessment & Learning Intelligence — Architecture

> Extends MyCampusView. Does **not** replace Question Bank, Curriculum, Assessments, Exams, Auth, RBAC, Notifications, or Tenant isolation.

## Stack (existing)

| Layer | Choice |
|-------|--------|
| App | Next.js 15 App Router + React 19 + Tailwind |
| API | `src/app/api/v1/*` + server modules |
| ORM / DB | Prisma 6 + PostgreSQL |
| Auth / RBAC | Session + `requireContext(permission)` + `src/lib/rbac` |
| Tenancy | `tenantId` on rows + `tenantDb()` Prisma extension |
| AI | `AI_DRIVER` (openai / anthropic / gemini) via `src/server/assistant/providers` |
| Jobs | Postgres `Job` table + `scripts/worker.ts` (not Bull) |
| Files | `STORAGE_DRIVER` local \| s3 via `src/server/files.ts` |
| Entitlement | `FEATURE.MODULE_AI_ASSIST` |

## Existing modules to REUSE

### Question Bank
- Models: `Question`, `QuestionOption`, `QuestionTopic`, `Textbook`, `TextbookPage`
- Service: `src/server/modules/questions/service.ts`, `generate.ts`, `textbooks.ts`
- UI: `/assessments/bank`, `/assessments/bank/generate`
- AI generate already syllabus- or textbook-grounded; drafts require teacher approve

### Syllabus / Curriculum
- Models: `Curriculum` → `Chapter` → `Topic` → `LearningOutcome`
- Service: `src/server/modules/curriculum/service.ts` (`publishedTopics`)
- UI: `/academics/curriculum`

### Assessments (everyday papers — primary integration surface)
- Models: `Assessment`, `AssessmentSection`, `AssessmentQuestion` (snapshots), `AssessmentAssignment`, `AssessmentAttempt`, `StudentAnswer`, `AssessmentType`, `PaperTemplate`
- Flows already live: create → build → approve → assign → attempt → evaluate → publish → analytics
- UI: `/assessments`, `/assessments/[id]`, `/assessments/[id]/assign`, evaluate + analytics, `/my/assessments`
- Print: HTML print route (not server PDF engine)

### Exams (formal report-card path — keep separate)
- `Exam`, `ExamSubject`, `Mark`, `Result`, admit cards
- **No FK** to `Assessment` today. Do not merge blindly; optional future promotion bridge.

### AI
- Shared adapters: OpenAI / Anthropic / Gemini (`AI_DRIVER`)
- Question generation + transform + vision OCR evaluation
- Campus Assistant (Principal AI) — academic insight tools
- Gate: `MODULE_AI_ASSIST` + permissions
- Gemini default model: `gemini-2.5-flash` (strong for sheet images)

### Jobs / notifications / storage
- Extend `Job` queue with new job names (e.g. `evaluation.process`)
- Reuse `notify()` for assign / result / evaluation events
- Reuse `uploadFile()` for answer-sheet images/PDFs

### Analytics (seed)
- `assignmentAnalytics()` — class cohort, per-question, per-topic gaps
- Extend into Learning Insights rather than replacing

## Do NOT rebuild

| Capability | Location |
|------------|----------|
| Question CRUD / bank | assessments/bank |
| Syllabus mapping | academics/curriculum + QuestionTopic |
| Paper builder / approve | assessments/[id] |
| Online attempt | my/assessments + attempts.ts |
| Manual marking | assessments evaluate |
| Topic gap analytics | assignmentAnalytics |
| Auth / RBAC / tenant | context + rbac + tenant-client |
| Notifications | server/notifications + worker |
| AI provider wiring | assistant/providers |

## Gaps this module fills

1. **Guided AI Assessment wizard** — simpler create path on top of generate + Assessment
2. **Paper quality check panel** — indicators before teacher review
3. **Handwritten answer-sheet upload + async AI evaluation** — major new capability
4. **Teacher review UI for AI marks** — suggest / approve / override
5. **Student/parent learning feedback** — richer than score alone
6. **Academic Intelligence hub** — school/class/topic heatmaps + early warning
7. **Remedial assessment** — one-click weak-topic practice paper
8. **Usage / cost tracking** for AI evaluations

## Proposed new components (additive)

### Data (only if no equivalent)

| Entity | Purpose |
|--------|---------|
| `AnswerSheet` | Uploaded scan/PDF linked to attempt or student+assignment |
| `EvaluationJob` | Async OCR/eval job status + retries |
| `EvaluatedAnswer` | AI extraction + suggested marks + confidence + flags |
| `EvaluationReview` | Teacher override audit |
| `StudentTopicPerformance` | Rollup cache for heatmaps (optional; can start with live queries) |
| `AiUsageEvent` | Pages/tokens/cost tracking per tenant |
| `AssessmentQualityReport` | JSON snapshot of quality-check indicators |

### Services
- `src/server/modules/evaluation/` — upload, jobs, vision OCR via shared `AI_DRIVER` (`vision.ts`), approve → `StudentAnswer`, finalise
- Quality / wizard reuse `src/server/modules/assessments/` + bank generate (no separate AI client)
- `src/server/worker/dispatch.ts` — `evaluation.process`

### UI (native MyCampusView)
- `/assessments/intelligence` — Academic Intelligence hub
- `/assessments/ai/new` — guided create wizard
- `/assessments/[id]/quality` — quality panel (or embed in builder)
- `/assessments/evaluation` — AI eval queue + review desk
- `/assessments/insights` — topic heatmaps, gaps, remedial CTAs
- `/assessments/usage` — school AI usage vs plan limits
- `/my/results/[id]` — student/parent learning feedback on released attempts
- Print CSS: `/my/results/[id]/print`, `/assessments/insights/print`
- Mobile: AI Evaluation queue + review (`assessments.evaluate`)

### Principal Assistant (authorized reads)
- `learning_topic_gaps` — school/class 90-day topic gaps + supportive check-in list
- `assignment_topic_gaps` — one assignment’s analytics (requires `assignmentId`)
- Both gated by `assessments.view`; reuse the same services as the screens

### Plan limits
- `limit.ai_eval_pages_month` — answer-sheet pages / month
- `limit.ai_generate_month` — draft questions kept from generate / month
- Enforced via `assertWithinLimit` on upload, retry, and generate; overrideable per tenant on platform

## Integration diagram

```
Curriculum / Topics ──┐
Question Bank ────────┼──► AI Assessment Wizard ──► Assessment (existing)
Textbook pages ───────┘         │
                                ▼
                         Quality check (new)
                                ▼
                    Teacher review (existing builder)
                                ▼
                    Assign / Online / Print (existing)
                                ▼
              AnswerSheet upload (new) ──► EvaluationJob (Job queue)
                                ▼
                    EvaluatedAnswer → Teacher review → publish (existing)
                                ▼
              Topic analytics + Insights + Remedial (extend)
```

## Security principles

- Every AI tool call runs after `requireContext` + row scope
- Tenant isolation via `tenantDb` — never raw cross-tenant queries
- AI never auto-publishes marks by default
- Structured JSON + Zod validation on all AI outputs
- No API keys in the client
- Answer sheets stored under tenant-prefixed storage keys

## Naming

Product surface: **Academic Intelligence** (inside Assessments).

Not a third-party “Acadine clone” — ERP + CRM + Fees + Attendance + Assessment AI.
