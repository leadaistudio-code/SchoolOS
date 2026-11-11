# Robotics 101 upgrade: implementation checklist

The durable record of the Robotics 101 rebuild. Update the status column as work
lands; nothing is marked done until it has been verified.

Status key: `done` (completed and verified), `built` (implemented, not verified),
`blocked` (waiting on an external dependency), `todo`.

## Architecture decisions (from the audit)

- Extend the existing LMS (`LmsCourse` / `LmsModule` / `LmsLesson`), never fork it.
- `LmsLesson.content` (JSON) holds the structured lesson: introduction, objectives,
  video, interactive blocks, summary, next. Validated by `src/lib/lms/rich.ts`.
- New lesson kind `INTERACTIVE`: rich content plus an optional graded check. When it
  has a check, passing it completes the lesson (same rule as `QUIZ`).
- `LmsLesson.slug` gives every curriculum lesson a stable key, so the content sync is
  idempotent and keeps lesson ids (and therefore progress) intact.
- `LmsLesson.archivedAt` retires a lesson without deleting it: it is hidden from
  learners and excluded from counts, while its progress and attempts are kept.
- `LmsLessonProgress.videoSeconds` and `state` (JSON) persist video resume, notes,
  saved code, checklists, simulator achievements and checkpoint answers.
- `LmsProjectSubmission.fileKeys`, `code` and `pathway` extend project hand-in with
  private photo uploads, pasted code and the physical / virtual pathway.
- Curriculum content is data, in `src/lib/lms/robotics101/` (module1–4.ts, videos.ts),
  synced by `scripts/robotics101-sync.ts`. The sync never deletes rows and never
  touches the course row (title, slug, description, SEO metadata, pricing).
- `LmsLesson.draftContent` holds unpublished edits; "Publish to students" copies it to
  `content` and bumps `contentVersion`.

## Phases

Verified locally on 11 Nov 2026 (dev server, demo school, student and teacher logins).

| Phase | Item | Status |
| --- | --- | --- |
| 1 | Repository audit | done |
| 3 | Schema migrations `20261112090000_lms_interactive_lessons`, `20261112100000_lms_lesson_draft_content` (additive only) | done (applied locally) |
| 3 | Curriculum: 4 modules, 15 lessons, 238 min, mapped onto existing lesson ids | done |
| 3 | Content sync script, idempotent, no deletes (second run: all rows reused, nothing created or archived) | done (local) |
| 5/10 | Rich lesson renderer; three-column desktop layout (outline, lesson, progress/notes/downloads); mobile single column | done |
| 9 | Formative activities: quick check, sort, sequence, match, checklist, missions, truth table, wiring, steps | done |
| 9 | Hotspot activity | todo (not built; kit explorer covers part identification) |
| 6 | Line-following simulator: 6 tracks incl. draw-your-own, decision panel, guided tour, 5 experiments | done |
| 4/5 | IR sensor simulator, motor lab, kit explorer | done |
| 7 | Arduino code lab: levels, fill-the-blank tasks, explanation, hints, download | done |
| 8 | Reference sketches (4) compiled with arduino-cli for Uno | done |
| 5 | Video player: speed, captions, fullscreen, PiP, resume, keyboard, chapters, checkpoints, transcript | done |
| 4 | 14 branded videos (logo top-right, intro, outro), storyboards, scripts, VTT/SRT, posters; ffprobe-verified H.264 1280×720 | done |
| 4 | Video length: 1:27–2:29 each (24:54 total), shorter than the preferred 3–6 min | known gap |
| 4 | Narration audio (needs an en-IN voice provider or a recording); videos are silent with captions | blocked |
| 11 | 12 PDF resources + 4 `.ino` downloads; teacher guide hidden from students | done |
| 12 | Capstone: photo/PDF upload (private), code, video link, physical / teacher-verified / virtual pathways, server-recorded evidence, teacher review | done (form verified in browser; review page verified by typecheck and earlier tests, not with a live submission) |
| 9 | Six badges derived from completed lessons; shown to learners and as a count to teachers | done |
| 13 | Teacher view: per-student progress + badges, lesson-by-lesson table, "needs a nudge" list, teacher resources | done |
| 15 | Admin: edit lesson content JSON with validation, draft vs published, preview (school and catalogue) | built (typecheck + tests; not clicked through in a browser) |
| 14 | Certificates: one per enrollment (`enrollmentId` unique), unchanged | done (existing) |
| 17 | Automated tests: content, videos, robot model, planSync; typecheck clean | done |
| 19 | Production publication runbook (below) | done; not executed |

## Production publication runbook

Nothing below has been run against production. Each step needs the owner's go-ahead.

1. Deploy the code. The videos, posters, captions, PDFs and sketches are in
   `public/lms-media/robotics-101/` (about 40 MB) and ship with the deploy.
2. Migrations run on deploy; both are additive (new nullable or defaulted columns, a
   new enum value, a unique index on `(courseId, slug)` which existing rows satisfy
   because `slug` starts null).
3. Dry run against production (read only):
   `R101_SYNC_CONFIRM=cmwc4bzg20000vjz0na1cuo68 npx tsx scripts/robotics101-sync.ts --remote`
   with `DATABASE_URL` set to the production URL. Check: course id `cmwc4bzg20000vjz0na1cuo68`, reused lesson ids,
   progress rows on any lesson to be archived.
4. Apply: `R101_SYNC_CONFIRM=cmwc4bzg20000vjz0na1cuo68 npx tsx scripts/robotics101-sync.ts --remote --apply`.
   Runs in one transaction; archives (never deletes) retired lessons and keeps their progress.
5. Re-run the dry run: every row should read "reuses", nothing new or archived.
6. Spot-check as a student: a lesson video plays, a knowledge check passes, the course
   page shows badge progress.
