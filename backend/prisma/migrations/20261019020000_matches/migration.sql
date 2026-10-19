-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('ACTIVE', 'FINISHED');

-- CreateEnum
CREATE TYPE "MatchEndReason" AS ENUM ('NORMAL', 'DRAW', 'FORFEIT', 'TIMEOUT');

-- CreateEnum
CREATE TYPE "PlayerResult" AS ENUM ('WON', 'LOST', 'DRAW');

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "roomId" TEXT,
    "game" "GameType" NOT NULL,
    "stake" BIGINT NOT NULL DEFAULT 0,
    "pot" BIGINT NOT NULL DEFAULT 0,
    "houseFee" BIGINT NOT NULL DEFAULT 0,
    "status" "MatchStatus" NOT NULL DEFAULT 'ACTIVE',
    "endReason" "MatchEndReason",
    "winnerId" TEXT,
    "state" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "turnSeat" INTEGER,
    "turnDeadline" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchPlayer" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seat" INTEGER NOT NULL,
    "stake" BIGINT NOT NULL DEFAULT 0,
    "payout" BIGINT NOT NULL DEFAULT 0,
    "result" "PlayerResult",
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "MatchPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Match_status_turnDeadline_idx" ON "Match"("status", "turnDeadline");

-- CreateIndex
CREATE INDEX "Match_roomId_idx" ON "Match"("roomId");

-- CreateIndex
CREATE INDEX "MatchPlayer_userId_idx" ON "MatchPlayer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchPlayer_matchId_userId_key" ON "MatchPlayer"("matchId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchPlayer_matchId_seat_key" ON "MatchPlayer"("matchId", "seat");

-- AddForeignKey
ALTER TABLE "MatchPlayer" ADD CONSTRAINT "MatchPlayer_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchPlayer" ADD CONSTRAINT "MatchPlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
