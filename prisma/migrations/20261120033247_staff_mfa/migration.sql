-- CreateTable
CREATE TABLE "StaffMfa" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "secretCipher" TEXT NOT NULL,
    "enabledAt" TIMESTAMP(3),
    "epoch" INTEGER NOT NULL DEFAULT 1,
    "lastUsedStep" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffMfa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffRecoveryCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffRecoveryCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StaffMfa_userId_key" ON "StaffMfa"("userId");

-- CreateIndex
CREATE INDEX "StaffRecoveryCode_userId_idx" ON "StaffRecoveryCode"("userId");

-- AddForeignKey
ALTER TABLE "StaffMfa" ADD CONSTRAINT "StaffMfa_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffRecoveryCode" ADD CONSTRAINT "StaffRecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
