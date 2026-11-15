import { setDefaultAutoSelectFamilyAttemptTimeout } from "node:net";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Node tries IPv4 and IPv6 in turn ("happy eyeballs"), giving each address
// only 250 ms by default. Waking a suspended Neon compute can take longer
// than that, so Node moves on to IPv6; on networks without IPv6 routing that
// attempt hangs until the OS gives up (~21 s on Windows) and the request
// fails. A longer window lets IPv4 finish; IPv6-only networks still work,
// just after a short delay.
setDefaultAutoSelectFamilyAttemptTimeout(2_000);

// One client per process; reused across dev hot-reloads.
// DATABASE_URL is Neon's pooled connection (PgBouncer); migrations use the
// direct one instead (see prisma.config.ts).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
