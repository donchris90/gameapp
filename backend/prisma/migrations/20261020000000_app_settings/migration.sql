-- Settings an admin can change without a release (for now: how often each game shows a full-screen ad).
CREATE TABLE "AppSetting" (
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);
