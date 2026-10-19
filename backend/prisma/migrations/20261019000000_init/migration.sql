-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'BANNED');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('SIGNUP_BONUS', 'DAILY_BONUS', 'AD_REWARD', 'COIN_PURCHASE', 'GAME_STAKE', 'GAME_PAYOUT', 'GAME_REFUND', 'HOUSE_FEE', 'SHOP_PURCHASE', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "usernameLower" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "birthDate" DATE NOT NULL,
    "ageConfirmedAt" TIMESTAMP(3) NOT NULL,
    "termsAcceptedAt" TIMESTAMP(3) NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balance" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "walletId" TEXT,
    "type" "LedgerEntryType" NOT NULL,
    "amount" BIGINT NOT NULL,
    "balanceAfter" BIGINT,
    "reference" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_usernameLower_key" ON "User"("usernameLower");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_userId_key" ON "Wallet"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_idempotencyKey_key" ON "LedgerEntry"("idempotencyKey");

-- CreateIndex
CREATE INDEX "LedgerEntry_walletId_createdAt_idx" ON "LedgerEntry"("walletId", "createdAt");

-- CreateIndex
CREATE INDEX "LedgerEntry_type_idx" ON "LedgerEntry"("type");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Safety net beyond Prisma's model: the database itself refuses a negative
-- coin balance, even if application code has a bug.
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_balance_non_negative" CHECK ("balance" >= 0);
