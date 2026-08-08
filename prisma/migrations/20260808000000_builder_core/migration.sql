-- CreateEnum
CREATE TYPE "SandboxStatus" AS ENUM ('NONE', 'CREATING', 'RUNNING', 'EXPIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "PublishStatus" AS ENUM ('NONE', 'BUILDING', 'LIVE', 'EXPORT_FAILED', 'REVIVE_ONLY');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETE', 'ERROR', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('CHAT', 'TARGETED_EDIT', 'FIX_ERROR');

-- CreateEnum
CREATE TYPE "EditKind" AS ENUM ('TEXT', 'STYLE', 'ATTRIBUTE', 'AI', 'REVERT');

-- CreateEnum
CREATE TYPE "AgentEventType" AS ENUM ('STATUS', 'THINKING', 'TOOL_CALL', 'TOOL_RESULT', 'FILE_WRITE', 'TERMINAL', 'ERROR', 'DONE');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "depsHash" TEXT,
ADD COLUMN     "files" JSONB,
ADD COLUMN     "filesVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "modelId" TEXT,
ADD COLUMN     "publishBlobPrefix" TEXT,
ADD COLUMN     "publishStatus" "PublishStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "publishedFilesVersion" INTEGER,
ADD COLUMN     "sandboxBootedAt" TIMESTAMP(3),
ADD COLUMN     "sandboxClaimedAt" TIMESTAMP(3),
ADD COLUMN     "sandboxError" TEXT,
ADD COLUMN     "sandboxExpiresAt" TIMESTAMP(3),
ADD COLUMN     "sandboxId" TEXT,
ADD COLUMN     "sandboxStatus" "SandboxStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "sandboxUrl" TEXT,
ADD COLUMN     "shareSlug" TEXT,
ADD COLUMN     "viewCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "kind" "MessageKind" NOT NULL DEFAULT 'CHAT',
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "runId" TEXT,
ADD COLUMN     "status" "MessageStatus" NOT NULL DEFAULT 'COMPLETE';

-- AlterTable
ALTER TABLE "Fragment" ADD COLUMN     "filesVersion" INTEGER;

-- CreateTable
CREATE TABLE "Edit" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "EditKind" NOT NULL,
    "filePath" TEXT NOT NULL,
    "oldString" TEXT,
    "newString" TEXT,
    "locator" JSONB,
    "fromVersion" INTEGER NOT NULL,
    "toVersion" INTEGER NOT NULL,
    "revertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Edit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentEvent" (
    "seq" SERIAL NOT NULL,
    "projectId" TEXT NOT NULL,
    "messageId" TEXT,
    "type" "AgentEventType" NOT NULL,
    "label" TEXT NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentEvent_pkey" PRIMARY KEY ("seq")
);

-- CreateTable
CREATE TABLE "PublishAttempt" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" "PublishStatus" NOT NULL,
    "log" TEXT,
    "fileCount" INTEGER,
    "bytes" INTEGER,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublishAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorageObject" (
    "key" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "gzipped" BYTEA NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorageObject_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "Edit_projectId_createdAt_idx" ON "Edit"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentEvent_projectId_seq_idx" ON "AgentEvent"("projectId", "seq");

-- CreateIndex
CREATE INDEX "PublishAttempt_projectId_createdAt_idx" ON "PublishAttempt"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Project_shareSlug_key" ON "Project"("shareSlug");

-- CreateIndex
CREATE INDEX "Project_userId_updatedAt_idx" ON "Project"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "Project_sandboxStatus_sandboxExpiresAt_idx" ON "Project"("sandboxStatus", "sandboxExpiresAt");

-- CreateIndex
CREATE INDEX "Message_projectId_createdAt_idx" ON "Message"("projectId", "createdAt");

-- AddForeignKey
ALTER TABLE "Edit" ADD CONSTRAINT "Edit_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentEvent" ADD CONSTRAINT "AgentEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishAttempt" ADD CONSTRAINT "PublishAttempt_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Backfill
-- ---------------------------------------------------------------------------
-- Fragment.files is a per-run delta, not a snapshot, so the newest fragment is
-- the best reconstruction available for pre-existing projects. Those sandboxes
-- are long expired anyway, so the tree is only ever re-uploaded, never trusted
-- as authoritative history.
UPDATE "Project" p
SET "files" = f."files",
    "filesVersion" = 1
FROM (
  SELECT DISTINCT ON (m."projectId") m."projectId" AS pid, fr."files" AS files
  FROM "Fragment" fr
  JOIN "Message" m ON m."id" = fr."messageId"
  ORDER BY m."projectId", fr."createdAt" DESC
) f
WHERE p."id" = f.pid;

-- Every sandbox created before this migration is dead.
UPDATE "Project" SET "sandboxStatus" = 'EXPIRED' WHERE "files" IS NOT NULL;
