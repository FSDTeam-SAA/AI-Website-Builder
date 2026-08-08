-- CreateEnum
CREATE TYPE "CheckpointKind" AS ENUM ('TURN', 'MANUAL', 'PRE_RESTORE', 'AUTO');

-- CreateTable
CREATE TABLE "Checkpoint" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "CheckpointKind" NOT NULL,
    "label" TEXT NOT NULL,
    "messageId" TEXT,
    "snapshot" BYTEA NOT NULL,
    "filesVersion" INTEGER NOT NULL,
    "fileCount" INTEGER NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Checkpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateBaseline" (
    "templateId" TEXT NOT NULL,
    "manifest" JSONB NOT NULL,
    "fileCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemplateBaseline_pkey" PRIMARY KEY ("templateId")
);

-- CreateIndex
CREATE INDEX "Checkpoint_projectId_createdAt_idx" ON "Checkpoint"("projectId", "createdAt");

-- AddForeignKey
ALTER TABLE "Checkpoint" ADD CONSTRAINT "Checkpoint_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

