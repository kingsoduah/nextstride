-- CreateTable
CREATE TABLE "RecommendationV2" (
    "id" TEXT NOT NULL,
    "situationId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "contextVersion" INTEGER NOT NULL,
    "analysis" JSONB NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT '',
    "previousId" TEXT,
    "provider" TEXT NOT NULL DEFAULT '',
    "promptVersion" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecommendationV2_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecommendationV2_situationId_version_idx" ON "RecommendationV2"("situationId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "RecommendationV2_situationId_version_key" ON "RecommendationV2"("situationId", "version");

-- AddForeignKey
ALTER TABLE "RecommendationV2" ADD CONSTRAINT "RecommendationV2_situationId_fkey" FOREIGN KEY ("situationId") REFERENCES "Situation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
