-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "matricule" TEXT,
ADD COLUMN     "renewalRequestedAt" TIMESTAMP(3),
ALTER COLUMN "userId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "SiteEvent" (
    "seq" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "SiteEvent_pkey" PRIMARY KEY ("seq")
);

-- CreateIndex
CREATE INDEX "SiteEvent_processedAt_seq_idx" ON "SiteEvent"("processedAt", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "Loan_externalId_key" ON "Loan"("externalId");

-- CreateIndex
CREATE INDEX "Loan_matricule_idx" ON "Loan"("matricule");

