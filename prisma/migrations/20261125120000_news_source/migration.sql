-- CreateEnum
CREATE TYPE "NewsSource" AS ENUM ('SITE', 'SOFTWARE');

-- AlterTable
ALTER TABLE "News" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "source" "NewsSource" NOT NULL DEFAULT 'SOFTWARE',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "publishedAt" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "News_source_isPublished_publishedAt_idx" ON "News"("source", "isPublished", "publishedAt");

-- CreateIndex
CREATE INDEX "News_createdById_idx" ON "News"("createdById");

-- AddForeignKey
ALTER TABLE "News" ADD CONSTRAINT "News_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Ajouté à la main : la date de modification des actualités existantes reprend leur date de création.
UPDATE "News" SET "updatedAt" = "createdAt";

-- Une actualité publiée a toujours une date de publication (seul un brouillon peut en être dépourvu).
ALTER TABLE "News" ADD CONSTRAINT "News_published_date_check" CHECK (NOT "isPublished" OR "publishedAt" IS NOT NULL);
