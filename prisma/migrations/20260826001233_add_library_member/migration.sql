-- AlterTable
ALTER TABLE "User" ADD COLUMN     "matricule" TEXT;

-- CreateTable
CREATE TABLE "LibraryMember" (
    "id" TEXT NOT NULL,
    "matricule" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "dateNaissance" TIMESTAMP(3) NOT NULL,
    "email" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'STUDENT',
    "departement" TEXT,
    "inscriptionActive" BOOLEAN NOT NULL DEFAULT true,
    "dateExpiration" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LibraryMember_matricule_key" ON "LibraryMember"("matricule");

-- CreateIndex
CREATE INDEX "LibraryMember_inscriptionActive_idx" ON "LibraryMember"("inscriptionActive");

-- CreateIndex
CREATE UNIQUE INDEX "User_matricule_key" ON "User"("matricule");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_matricule_fkey" FOREIGN KEY ("matricule") REFERENCES "LibraryMember"("matricule") ON DELETE SET NULL ON UPDATE CASCADE;

