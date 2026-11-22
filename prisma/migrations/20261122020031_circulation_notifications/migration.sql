-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "renewalRefusedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "dedupeKey" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'site';

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");


-- Index unique PARTIEL (écrit à la main) : une seule réservation active par compte et par livre.
CREATE UNIQUE INDEX "Reservation_active_user_book_key" ON "Reservation"("userId", "bookId") WHERE status IN ('PENDING', 'READY');
