-- CreateEnum
CREATE TYPE "ReadingListStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "AcquisitionStatus" AS ENUM ('SUBMITTED', 'DEPT_APPROVED', 'DEPT_REJECTED', 'LIBRARY_ACCEPTED', 'LIBRARY_REJECTED', 'ACQUIRED');

-- AlterEnum
ALTER TYPE "StaffRole" ADD VALUE 'DEPARTMENT_MANAGER';

-- DropIndex
DROP INDEX "StaffAssignment_userId_role_key";

-- AlterTable
ALTER TABLE "StaffAssignment" ADD COLUMN     "departmentId" TEXT;

-- CreateTable
CREATE TABLE "ReadingList" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "programId" TEXT,
    "title" VARCHAR(150) NOT NULL,
    "courseCode" VARCHAR(40),
    "description" VARCHAR(1000),
    "academicYear" VARCHAR(9),
    "status" "ReadingListStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReadingList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReadingListItem" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "note" VARCHAR(500),
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReadingListItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcquisitionRequest" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "author" VARCHAR(150) NOT NULL,
    "isbn" VARCHAR(20),
    "publisher" VARCHAR(150),
    "year" INTEGER,
    "justification" VARCHAR(1000) NOT NULL,
    "status" "AcquisitionStatus" NOT NULL DEFAULT 'SUBMITTED',
    "departmentDecidedById" TEXT,
    "departmentDecidedAt" TIMESTAMP(3),
    "departmentNote" VARCHAR(500),
    "libraryDecidedById" TEXT,
    "libraryDecidedAt" TIMESTAMP(3),
    "libraryNote" VARCHAR(500),
    "acquiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcquisitionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReadingList_departmentId_status_idx" ON "ReadingList"("departmentId", "status");

-- CreateIndex
CREATE INDEX "ReadingList_ownerId_idx" ON "ReadingList"("ownerId");

-- CreateIndex
CREATE INDEX "ReadingList_programId_idx" ON "ReadingList"("programId");

-- CreateIndex
CREATE INDEX "ReadingListItem_bookId_idx" ON "ReadingListItem"("bookId");

-- CreateIndex
CREATE UNIQUE INDEX "ReadingListItem_listId_bookId_key" ON "ReadingListItem"("listId", "bookId");

-- CreateIndex
CREATE INDEX "AcquisitionRequest_departmentId_status_idx" ON "AcquisitionRequest"("departmentId", "status");

-- CreateIndex
CREATE INDEX "AcquisitionRequest_requesterId_createdAt_idx" ON "AcquisitionRequest"("requesterId", "createdAt");

-- CreateIndex
CREATE INDEX "AcquisitionRequest_status_idx" ON "AcquisitionRequest"("status");

-- CreateIndex
CREATE INDEX "StaffAssignment_userId_idx" ON "StaffAssignment"("userId");

-- CreateIndex
CREATE INDEX "StaffAssignment_departmentId_idx" ON "StaffAssignment"("departmentId");

-- AddForeignKey
ALTER TABLE "StaffAssignment" ADD CONSTRAINT "StaffAssignment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadingList" ADD CONSTRAINT "ReadingList_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadingList" ADD CONSTRAINT "ReadingList_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadingList" ADD CONSTRAINT "ReadingList_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadingListItem" ADD CONSTRAINT "ReadingListItem_listId_fkey" FOREIGN KEY ("listId") REFERENCES "ReadingList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadingListItem" ADD CONSTRAINT "ReadingListItem_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcquisitionRequest" ADD CONSTRAINT "AcquisitionRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcquisitionRequest" ADD CONSTRAINT "AcquisitionRequest_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcquisitionRequest" ADD CONSTRAINT "AcquisitionRequest_departmentDecidedById_fkey" FOREIGN KEY ("departmentDecidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcquisitionRequest" ADD CONSTRAINT "AcquisitionRequest_libraryDecidedById_fkey" FOREIGN KEY ("libraryDecidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Écrit à la main ------------------------------------------------------------------

-- Règle des affectations : département obligatoire pour DEPARTMENT_MANAGER,
-- interdit pour ADMIN et LIBRARIAN. Comparaison sur le texte du rôle : la
-- nouvelle valeur d'enum n'est pas utilisée dans la transaction qui la crée.
ALTER TABLE "StaffAssignment" ADD CONSTRAINT "StaffAssignment_department_scope_check"
  CHECK ((("role")::text = 'DEPARTMENT_MANAGER') = ("departmentId" IS NOT NULL));

-- Unicité (remplace StaffAssignment_userId_role_key) : un même utilisateur peut
-- gérer plusieurs départements, sans doublon possible.
CREATE UNIQUE INDEX "StaffAssignment_user_role_global_key"
  ON "StaffAssignment"("userId", "role") WHERE "departmentId" IS NULL;
CREATE UNIQUE INDEX "StaffAssignment_user_role_department_key"
  ON "StaffAssignment"("userId", "role", "departmentId") WHERE "departmentId" IS NOT NULL;

-- Bornes des textes et des valeurs (en plus de la validation Zod).
ALTER TABLE "ReadingList" ADD CONSTRAINT "ReadingList_title_length_check" CHECK (char_length(btrim("title")) BETWEEN 1 AND 150);
ALTER TABLE "ReadingListItem" ADD CONSTRAINT "ReadingListItem_position_check" CHECK ("position" >= 0);
ALTER TABLE "AcquisitionRequest" ADD CONSTRAINT "AcquisitionRequest_justification_length_check" CHECK (char_length(btrim("justification")) BETWEEN 10 AND 1000);
