-- Project type: a full Next.js app, or a plain static HTML/CSS/JS site.
CREATE TYPE "Framework" AS ENUM ('NEXTJS', 'STATIC_HTML');

ALTER TABLE "Project"
  ADD COLUMN "framework" "Framework" NOT NULL DEFAULT 'NEXTJS';
