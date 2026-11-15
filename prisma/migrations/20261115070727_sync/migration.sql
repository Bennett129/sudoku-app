-- CreateTable
CREATE TABLE "user_settings" (
    "userId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" BIGINT NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "synced_game" (
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "data" JSONB,
    "updatedAt" BIGINT NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "synced_game_pkey" PRIMARY KEY ("userId","gameId")
);

-- CreateTable
CREATE TABLE "solve" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "difficulty" TEXT,
    "seed" BIGINT NOT NULL,
    "elapsed" INTEGER NOT NULL,
    "hintsUsed" INTEGER NOT NULL,
    "completedAt" BIGINT NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "solve_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "synced_game_userId_syncedAt_idx" ON "synced_game"("userId", "syncedAt");

-- CreateIndex
CREATE INDEX "solve_userId_syncedAt_idx" ON "solve"("userId", "syncedAt");

-- CreateIndex
CREATE UNIQUE INDEX "solve_userId_size_seed_completedAt_key" ON "solve"("userId", "size", "seed", "completedAt");

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "synced_game" ADD CONSTRAINT "synced_game_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solve" ADD CONSTRAINT "solve_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
