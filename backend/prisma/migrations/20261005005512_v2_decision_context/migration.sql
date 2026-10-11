-- CreateTable
CREATE TABLE "DecisionContext" (
    "id" TEXT NOT NULL,
    "situationId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Lagos',
    "reference" JSONB NOT NULL,
    "context" JSONB NOT NULL,
    "resolutions" JSONB NOT NULL DEFAULT '{}',
    "questions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "provider" TEXT NOT NULL DEFAULT '',
    "promptVersion" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DecisionContext_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DecisionContext_situationId_version_idx" ON "DecisionContext"("situationId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "DecisionContext_situationId_version_key" ON "DecisionContext"("situationId", "version");

-- AddForeignKey
ALTER TABLE "DecisionContext" ADD CONSTRAINT "DecisionContext_situationId_fkey" FOREIGN KEY ("situationId") REFERENCES "Situation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
