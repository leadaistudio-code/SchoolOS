# AI for Young Builders: implementation record

A free, 15-lesson interactive AI course for Classes 5–8, built on the same engine as
Robotics 101. Students train their own classifier in the browser, then learn how it
decides, test it honestly, and use AI fairly and safely.

Status key: `done` (completed and verified), `built` (implemented, not verified),
`todo`.

## How it fits the platform

- Curriculum is data in `src/lib/lms/ai101/` (module1–4.ts, videos.ts, lab-data.ts,
  ml.ts). `AI_101` is registered next to `ROBOTICS_101` in `src/lib/lms/curricula.ts`;
  lesson slugs (`ai101-…`) and video ids (`a01`–`a14`) are unique across curricula
  (tested).
- Shared pieces were lifted out of Robotics 101 without changing it: the video engine
  (`src/lib/lms/video/`), curriculum types and sync planning
  (`src/lib/lms/curriculum/`), badges, resources and the per-course lesson player
  options (`player`: capstone pathway, project uploads, notes hint). Robotics output
  was regenerated and is byte-identical (docs, captions, narration cache).
- Scripts take `--course ai-young-builders` (default `robotics-101`):
  `scripts/lms-sync.ts`, `scripts/lms-narration.ts`, `scripts/lms-videos.ts`.
  PDFs: `scripts/ai101-resources.ts`.
- The course row is created by the sync when it does not exist (catalogue course,
  `tenantId` null, category AI, BEGINNER, Classes 5–8, `academyPriceMinor` 0,
  published). On a remote database this needs `LMS_SYNC_CONFIRM=create:ai-young-builders`.
- No new dependencies and no schema migration.

## Labs (`src/components/lms/ai/`)

| Lab | Lesson | What it does | Saved as |
| --- | --- | --- | --- |
| Pixel lab | 4 | Paint pixels; decode two secret pictures from their numbers | `pixels:<id>` |
| Classifier lab | 5, 7, 14 | Draw (16×16 ink grid) or camera (12×9 colour grid) examples, k-NN (k = 3), confidence bars, test mode with confusion matrix and rounds | `model:<id>` (drawings only; camera frames stay in memory) |
| Nearest-neighbour lab | 6 | Drop a fruit, k = 1/3/5/7 vote, decision-boundary map | `scatter:<id>` |
| Bias lab | 12 | Leaf-disease checker trained on 12 mango vs 1 neem leaves per label: neem starts at 50% test accuracy and is fixed (≥ 80%, gap ≤ 15) after three batches of neem leaves (tested) | `bias:<id>` |
| Decision tree lab | 8 | Build up to 3 levels of yes/no questions; 10 training animals; test on 5 unusual animals | `tree:<id>` |
| Word score lab | 9 | Score 10 words −2..+2; 8 canteen reviews; the “not” rule is needed for 8/8 (tested) | `words:<id>` |
| Next-word lab | 10 | Bigram model from one of three stories or the student's own text (not saved); chances as bars | result only |
| Study helper (live AI) | 11 | Safe chat with three prompt missions; done after 3 answers | `chat:<id>` (counts only, never the conversation) |

## Study helper safety (`src/server/modules/lms/ai-chat.ts`)

- Runs only in a lesson that contains an `ai-chat` block, for a learner on the course
  or staff previewing it (`lms.view` + course visible to the school). Not available in
  the platform catalogue preview.
- Before the model: personal details (phone, email, address phrases, names/schools,
  passwords, pincodes, 12-digit ID numbers) are blocked; an unsafe-topic list refuses;
  with `AI_DRIVER=openai` the message also goes through `omni-moderation-latest`
  (fails closed).
- The model: platform `assistantModel()`, child-safe system prompt, 80-word answers,
  260 output tokens, last 8 turns only, 400 characters per message.
- After the model: provider refusals, the unsafe-topic list and moderation again.
- Limits: 30 messages per student and 1,500 per school per day (`rateLimit`). Each
  answered message writes an `aiUsageEvent` (`kind: lms.ai-chat`). Conversations are
  not stored.

## Project evidence

The final project (lesson 14) uses the note + link hand-in with optional screenshots
(no robot pathway). `virtualEvidence` now also records each classifier lab in the
lesson: labels, examples per label, tests, accuracy and test rounds, read on the server
from saved lesson state. Teachers see it under Project reviews.

## Status

| Item | Status |
| --- | --- |
| Curriculum: 4 modules, 15 lessons, 242 min, quizzes at 80%, 12-question final | done (tests) |
| Labs and lesson renderer wiring | done (typecheck, tests; browser pass below) |
| Study helper: guardrails, limits, usage events | built (PII/unsafe filters unit-tested; live model reply not exercised locally) |
| 14 narrated videos (Azure `en-IN-NeerjaNeural`), 28:29 total, captions, posters, storyboards in `docs/lms/ai-young-builders/videos/` | done (ffprobe: H.264 + AAC; frames reviewed) |
| 10 PDFs in `public/lms-media/ai-young-builders/resources/`, teacher guide hidden from students | done |
| 6 badges | done (tests) |
| Local sync: course created, second run all 15 unchanged; Robotics dry run 15/15 unchanged | done |
| Production: deploy and create the course | todo (needs the owner's go-ahead) |

## Production runbook

1. Deploy (push to master). Media in `public/lms-media/ai-young-builders/` ships with it.
2. Dry run (read only), `DATABASE_URL` set to production:
   `npx tsx scripts/lms-sync.ts --course ai-young-builders --remote` with
   `LMS_SYNC_CONFIRM=create:ai-young-builders`. Expect “would create it” and 15 new lessons.
3. Apply: same command with `--apply`. Creates the course, 4 modules and 15 lessons in
   one transaction. Touches no other course.
4. Re-run the dry run with `LMS_SYNC_CONFIRM=<new course id>`: every row “unchanged”.
5. Schools see it in the catalogue; assign it to classes as with Robotics 101.
