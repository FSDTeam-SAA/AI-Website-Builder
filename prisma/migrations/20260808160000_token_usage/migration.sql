-- Token accounting. Running totals on the project, per-run detail on the
-- message that the run produced.
ALTER TABLE "Project"
  ADD COLUMN "totalPromptTokens"     INTEGER          NOT NULL DEFAULT 0,
  ADD COLUMN "totalCompletionTokens" INTEGER          NOT NULL DEFAULT 0,
  ADD COLUMN "totalCostUsd"          DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "Message"
  ADD COLUMN "promptTokens"     INTEGER,
  ADD COLUMN "completionTokens" INTEGER,
  ADD COLUMN "costUsd"          DOUBLE PRECISION,
  ADD COLUMN "usageModelId"     TEXT,
  ADD COLUMN "usageDetail"      JSONB;
