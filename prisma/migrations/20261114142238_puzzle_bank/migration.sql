-- CreateTable
CREATE TABLE "puzzle" (
    "id" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "difficulty" TEXT NOT NULL,
    "givens" TEXT NOT NULL,
    "solution" TEXT NOT NULL,
    "techniques" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "puzzle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "puzzle_givens_key" ON "puzzle"("givens");

-- CreateIndex
CREATE INDEX "puzzle_size_difficulty_idx" ON "puzzle"("size", "difficulty");
