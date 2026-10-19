-- CreateEnum
CREATE TYPE "StorePlatform" AS ENUM ('GOOGLE', 'APPLE');

-- CreateEnum
CREATE TYPE "AdViewStatus" AS ENUM ('PENDING', 'REWARDED', 'EXPIRED');

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" "StorePlatform" NOT NULL,
    "productId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "coins" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyClaim" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "streak" INTEGER NOT NULL,
    "coins" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdView" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "status" "AdViewStatus" NOT NULL DEFAULT 'PENDING',
    "transactionId" TEXT,
    "coins" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rewardedAt" TIMESTAMP(3),

    CONSTRAINT "AdView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Purchase_userId_idx" ON "Purchase"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_platform_transactionId_key" ON "Purchase"("platform", "transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyClaim_userId_day_key" ON "DailyClaim"("userId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "AdView_nonce_key" ON "AdView"("nonce");

-- CreateIndex
CREATE UNIQUE INDEX "AdView_transactionId_key" ON "AdView"("transactionId");

-- CreateIndex
CREATE INDEX "AdView_userId_day_idx" ON "AdView"("userId", "day");

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyClaim" ADD CONSTRAINT "DailyClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdView" ADD CONSTRAINT "AdView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
