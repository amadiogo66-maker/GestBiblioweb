-- Records already suspended before this feature are deliberately treated as
-- manually suspended, so a future member sync cannot reactivate them.
ALTER TABLE "User" ADD COLUMN "autoSuspendedAt" TIMESTAMP(3);
