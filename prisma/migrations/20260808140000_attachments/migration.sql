-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "messageId" TEXT,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "data" BYTEA NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Attachment_projectId_createdAt_idx" ON "Attachment"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "Attachment_messageId_idx" ON "Attachment"("messageId");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
