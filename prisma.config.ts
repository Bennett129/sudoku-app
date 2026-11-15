import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

// The Prisma CLI doesn't read .env files itself; Node can.
if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  // The CLI (migrations) needs a direct connection: Neon's pooled URL goes
  // through PgBouncer in transaction mode, which Prisma Migrate can't use.
  // The app itself uses the pooled DATABASE_URL (src/lib/db.ts).
  datasource: {
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
  },
});
