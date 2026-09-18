-- A tenant must have one deterministic active late-fee policy.
WITH ranked AS (
  SELECT "id",
         ROW_NUMBER() OVER (PARTITION BY "tenantId" ORDER BY "id") AS position
  FROM "FeePenaltyRule"
  WHERE "isActive" = true
)
UPDATE "FeePenaltyRule" rule
SET "isActive" = false
FROM ranked
WHERE rule."id" = ranked."id"
  AND ranked.position > 1;

CREATE UNIQUE INDEX "FeePenaltyRule_one_active_per_tenant_key"
  ON "FeePenaltyRule"("tenantId")
  WHERE "isActive" = true;
