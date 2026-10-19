-- CreateEnum
CREATE TYPE "GameType" AS ENUM ('TICTACTOE', 'WATER_SORT', 'AYO', 'LUDO');

-- CreateEnum
CREATE TYPE "FriendshipStatus" AS ENUM ('PENDING', 'ACCEPTED');

-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('WAITING', 'IN_PROGRESS');

-- CreateEnum
CREATE TYPE "RoomKind" AS ENUM ('PRIVATE', 'QUICK');

-- AlterTable: friend codes for accounts that already exist get a random 8-character code
ALTER TABLE "User" ADD COLUMN "friendCode" TEXT;
UPDATE "User" SET "friendCode" = UPPER(SUBSTR(MD5(RANDOM()::text || "id"), 1, 8));
ALTER TABLE "User" ALTER COLUMN "friendCode" SET NOT NULL;

-- CreateTable
CREATE TABLE "Friendship" (
    "id" TEXT NOT NULL,
    "userAId" TEXT NOT NULL,
    "userBId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "status" "FriendshipStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "Friendship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Block" (
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Block_pkey" PRIMARY KEY ("blockerId","blockedId")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "game" "GameType" NOT NULL,
    "kind" "RoomKind" NOT NULL DEFAULT 'PRIVATE',
    "hostId" TEXT NOT NULL,
    "stake" BIGINT NOT NULL DEFAULT 0,
    "minPlayers" INTEGER NOT NULL,
    "maxPlayers" INTEGER NOT NULL,
    "status" "RoomStatus" NOT NULL DEFAULT 'WAITING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomMember" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seat" INTEGER NOT NULL,
    "ready" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomInvite" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_friendCode_key" ON "User"("friendCode");

-- CreateIndex
CREATE INDEX "Friendship_userBId_idx" ON "Friendship"("userBId");

-- CreateIndex
CREATE UNIQUE INDEX "Friendship_userAId_userBId_key" ON "Friendship"("userAId", "userBId");

-- CreateIndex
CREATE INDEX "Block_blockedId_idx" ON "Block"("blockedId");

-- CreateIndex
CREATE UNIQUE INDEX "Room_code_key" ON "Room"("code");

-- CreateIndex
CREATE UNIQUE INDEX "RoomMember_userId_key" ON "RoomMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RoomMember_roomId_seat_key" ON "RoomMember"("roomId", "seat");

-- CreateIndex
CREATE INDEX "RoomInvite_toUserId_idx" ON "RoomInvite"("toUserId");

-- CreateIndex
CREATE UNIQUE INDEX "RoomInvite_roomId_toUserId_key" ON "RoomInvite"("roomId", "toUserId");

-- AddForeignKey
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_userAId_fkey" FOREIGN KEY ("userAId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_userBId_fkey" FOREIGN KEY ("userBId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomMember" ADD CONSTRAINT "RoomMember_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomMember" ADD CONSTRAINT "RoomMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomInvite" ADD CONSTRAINT "RoomInvite_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomInvite" ADD CONSTRAINT "RoomInvite_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomInvite" ADD CONSTRAINT "RoomInvite_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
