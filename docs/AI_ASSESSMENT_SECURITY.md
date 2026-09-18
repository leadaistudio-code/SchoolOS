# AI Assessment — Security

## Threat model (high level)

| Threat | Control |
|--------|---------|
| Cross-tenant data leak | `tenantDb()` + `tenantId` on all new rows |
| Unauthorized AI tools | Tools call services that `require` permissions + `assertClassSubjectAccess` / student scope |
| Auto-publish wrong marks | Default: teacher approval required; school setting later |
| Prompt injection | No raw SQL from model; Zod-validated JSON only; system prompts do not include secrets |
| Answer-sheet IDOR | Sheet tied to assignment/attempt; access via teaching scope |
| Key exposure | `AI_API_KEY` server-only |
| Job abuse | Rate limits on mutation bucket; usage caps later |
| Student cheats online exam | Existing attempt APIs already bind user ↔ assignment |

## Authorization path

```
User session → role permissions → tenant match → row scope → AI/service → DB
```

Principal Assistant academic tools must use the same path (never “run as admin” for school data).

## Data classification

| Data | Sensitivity | Notes |
|------|-------------|-------|
| Answer sheet images | High | Tenant storage prefix; ACL via files API |
| AI transcripts / extracts | High | Stored on `EvaluatedAnswer`; purge with sheet |
| Usage/cost metrics | Medium | Aggregates only in school admin |

## Defaults

- AI suggests marks; teacher Approve / Override writes `StudentAnswer` only after review
- Confidence below 70 → `needsReview`; job stays `REVIEW_REQUIRED` until desk actions
- Finalise totals the attempt; publish remains the existing evaluate/publish path (never auto)
- Learning insights / assistant tools speak in observations (“topic scored low”), never diagnoses
- Monthly AI eval pages / generate units gated by plan limits (`assertWithinLimit` → 402)
- No cross-school analytics without platform role
