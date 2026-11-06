-- School groups: several schools under one owner.
ALTER TABLE "Tenant" ADD COLUMN "groupId" TEXT;

CREATE TABLE "SchoolGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SchoolGroupOwner" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolGroupOwner_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Tenant_groupId_idx" ON "Tenant"("groupId");
CREATE UNIQUE INDEX "SchoolGroupOwner_groupId_userId_key" ON "SchoolGroupOwner"("groupId", "userId");
CREATE INDEX "SchoolGroupOwner_userId_idx" ON "SchoolGroupOwner"("userId");

ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "SchoolGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SchoolGroupOwner" ADD CONSTRAINT "SchoolGroupOwner_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "SchoolGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolGroupOwner" ADD CONSTRAINT "SchoolGroupOwner_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
