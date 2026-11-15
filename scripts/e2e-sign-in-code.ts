/**
 * Test helper for the sync e2e tests: prints a valid sign-in code for an
 * email on the reserved .test domain, without sending any email.
 *
 *   npx tsx scripts/e2e-sign-in-code.ts someone@sync.e2e.test
 *
 * Refuses any other domain, so it can't be used to sign in as a real
 * person. Also removes accounts left over from earlier test runs.
 */
import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");

async function main() {
  const email = process.argv[2] ?? "";
  if (!/^[a-z0-9-]+@sync\.e2e\.test$/.test(email)) throw new Error("Only <name>@sync.e2e.test addresses are allowed");

  const { auth } = await import("../src/lib/auth");
  const { prisma } = await import("../src/lib/db");
  try {
    // Accounts from earlier runs (an hour old or more).
    await prisma.user.deleteMany({
      where: { email: { endsWith: "@sync.e2e.test" }, createdAt: { lt: new Date(Date.now() - 60 * 60_000) } },
    });
    const otp = await auth.api.createVerificationOTP({ body: { email, type: "sign-in" } });
    process.stdout.write(otp);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
